// =============================================================================
// _shared/conversion.ts — Phase 1, P1
//
// The internal applicant→employee conversion authority's CORE (no HTTP, no
// provisioning). This is the single place that writes a `people` employee row
// during conversion. External WordPress/LearnDash provisioning is a SEPARATE
// idempotent step (onboard-employee) — see DECISIONS.md 2026-05-30 Q4.
//
// Guarantees:
//   - hired_at  = accepted offer.start_date  (Q1; missing ⇒ fail)
//   - job_title = accepted offer.position_title (Q3; missing ⇒ fail)
//   - idempotent on (tenant_id, email_normalized): a second run creates no new
//     row and never overwrites an existing hired_at (Q1/Q4/NFR-3)
//   - fail-safe identity reconciliation via _shared/identity.ts: an ambiguous
//     or conflicting match records an unresolved identity collision and does
//     NOT link/create (Q5)
//   - lifecycle status is NOT computed here — the resolver is the sole writer
//     of employee_status, invoked after the row is written (Q2)
//
// tenant_id is taken ONLY from the server-trusted offer/applicant records, never
// from a request body or header.
// =============================================================================

import { findEmployeeMatch, normalizeEmail } from "./identity.ts";

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export class ConversionError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ConversionError";
    this.code = code;
    this.status = status;
  }
}

export interface ConversionResult {
  outcome: "converted" | "collision";
  personId?: string;
  /** the tenant the conversion ran under (server-trusted; for downstream logging) */
  tenantId?: string;
  /** present when outcome === 'collision' */
  collisionId?: string;
  reasonCode?: string;
  /** true when an existing row was updated rather than inserted */
  reused?: boolean;
  status?: string;
}

/**
 * Resolve the accepted offer to convert for an applicant. Accepts an explicit
 * offer id (UI path) or selects the applicant's accepted offer (trigger path).
 * Throws actionable ConversionErrors for the failure modes Q1/Q3 require.
 */
export async function loadAcceptedOffer(
  admin: AdminClient,
  params: { applicantId: string; offerId?: string },
): Promise<{ id: string; start_date: string | null; position_title: string | null; status: string }> {
  let query = admin
    .from("offers")
    .select("id, start_date, position_title, status, applicant_id");

  if (params.offerId) {
    query = query.eq("id", params.offerId);
  } else {
    query = query.eq("applicant_id", params.applicantId).eq("status", "Accepted");
  }

  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new ConversionError(
      "OFFER_NOT_FOUND",
      `No accepted offer found for applicant ${params.applicantId}`,
    );
  }
  if (data.status !== "Accepted") {
    throw new ConversionError(
      "OFFER_NOT_ACCEPTED",
      `Offer ${data.id} is not Accepted (status: ${data.status})`,
    );
  }
  return data;
}

/**
 * Internal conversion. Pure of HTTP/provisioning; takes a service-role admin
 * client so it can run from the webhook (cron) path and from authorized UI.
 */
export async function convertApplicantToEmployee(
  admin: AdminClient,
  params: { applicantId: string; offerId?: string; actorId?: string | null },
): Promise<ConversionResult> {
  const { applicantId } = params;

  // 1. Trusted applicant record → tenant_id (never from body/header).
  const { data: applicant, error: appErr } = await admin
    .from("applicants")
    .select("id, tenant_id, first_name, last_name, email, phone")
    .eq("id", applicantId)
    .maybeSingle();

  if (appErr) throw appErr;
  if (!applicant) {
    throw new ConversionError("APPLICANT_NOT_FOUND", `Applicant not found: ${applicantId}`);
  }
  const tenantId = applicant.tenant_id as string | null;
  if (!tenantId) {
    throw new ConversionError(
      "APPLICANT_NO_TENANT",
      `Applicant ${applicantId} has no tenant_id; cannot convert`,
    );
  }

  // 2. Accepted offer → authoritative hired_at + job_title (Q1, Q3).
  const offer = await loadAcceptedOffer(admin, { applicantId, offerId: params.offerId });
  if (!offer.start_date) {
    throw new ConversionError(
      "OFFER_MISSING_START_DATE",
      `Accepted offer ${offer.id} has no start_date; cannot set hired_at`,
    );
  }
  if (!offer.position_title) {
    throw new ConversionError(
      "OFFER_MISSING_POSITION_TITLE",
      `Accepted offer ${offer.id} has no position_title; cannot set job_title`,
    );
  }

  const normalizedEmail = normalizeEmail(applicant.email);

  // 3. Fail-safe identity reconciliation (Q5).
  const match = await findEmployeeMatch({
    client: admin,
    tenantId,
    applicantId,
    email: normalizedEmail,
  });

  if (match.outcome === "collision") {
    // Record the unresolved collision; do NOT link/create/mutate any people row.
    const { data: collision, error: colErr } = await admin
      .from("identity_collisions")
      .upsert(
        [{
          tenant_id: tenantId,
          source: "convert-applicant",
          applicant_id: applicantId,
          normalized_email: match.normalizedEmail,
          candidate_ids: match.candidateIds,
          reason_code: match.reason,
          resolution_status: "unresolved",
          detail: { offer_id: offer.id },
        }],
        { onConflict: "tenant_id,applicant_id,normalized_email", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (colErr) throw colErr;

    return {
      outcome: "collision",
      tenantId,
      collisionId: collision?.id,
      reasonCode: match.reason,
    };
  }

  // 4. Build the conversion payload. NOTE: hired_at is set ONLY on insert or on
  //    an existing row whose hired_at is null — never overwritten (Q1/NFR-3).
  const baseFields = {
    tenant_id: tenantId,
    first_name: applicant.first_name,
    last_name: applicant.last_name,
    email: normalizedEmail,
    phone: applicant.phone ?? null,
    job_title: offer.position_title,
    type: "employee" as const,
    applicant_id: applicantId,
  };

  let personId: string;
  let reused = false;

  if (match.outcome === "matched") {
    // Existing employee row → update profile + link, but DO NOT touch hired_at.
    reused = true;
    personId = match.employee.id;
    const update: Record<string, unknown> = {
      ...baseFields,
      employee_id: match.employee.employee_id ?? `EMP-${Date.now().toString().slice(-6)}`,
      updated_at: new Date().toISOString(),
    };
    // Set hired_at only if it is currently null (preserve existing valid value).
    if (!match.employee.hired_at) {
      update.hired_at = offer.start_date;
    }
    const { error } = await admin
      .from("people")
      .update(update)
      .eq("id", personId)
      .eq("type", "employee");
    if (error) throw error;
  } else {
    // outcome === 'none' → insert, idempotent on (tenant_id, email_normalized).
    // ON CONFLICT DO NOTHING then re-select handles the webhook↔UI race (ORD-5):
    // the loser inserts nothing; both converge to the same single row.
    const { error: insErr } = await admin
      .from("people")
      .upsert(
        [{
          ...baseFields,
          hired_at: offer.start_date,
          employee_id: `EMP-${Date.now().toString().slice(-6)}`,
        }],
        { onConflict: "tenant_id,email_normalized", ignoreDuplicates: true },
      );
    if (insErr) throw insErr;

    // Re-select the canonical row (whether we inserted it or a concurrent run did).
    const { data: row, error: selErr } = await admin
      .from("people")
      .select("id, hired_at, applicant_id")
      .eq("tenant_id", tenantId)
      .eq("email_normalized", normalizedEmail)
      .eq("type", "employee")
      .maybeSingle();
    if (selErr) throw selErr;

    let canonical = row as { id: string; hired_at: string | null; applicant_id: string | null } | null;

    // Defensive fallback (latent CV-1): the upsert above is ON CONFLICT DO
    // NOTHING. If a NON-employee `people` row already exists on this
    // (tenant_id, email_normalized) — which no current code path creates, but
    // which the DB schema permits (type defaults to 'candidate') — the insert
    // is suppressed and the type='employee' re-select misses it. Rather than
    // fail, adopt that row and flip it to 'employee'. This converges to ONE row
    // (no duplicate) and is a no-op on all current data.
    if (!canonical) {
      const { data: anyRow, error: anySelErr } = await admin
        .from("people")
        .select("id, hired_at, applicant_id, type")
        .eq("tenant_id", tenantId)
        .eq("email_normalized", normalizedEmail)
        .maybeSingle();
      if (anySelErr) throw anySelErr;
      if (!anyRow) {
        throw new ConversionError("CONVERSION_ROW_MISSING", "Converted employee row not found after upsert");
      }
      reused = true;
      const flip: Record<string, unknown> = {
        ...baseFields, // includes type:'employee', applicant_id, job_title, names
        updated_at: new Date().toISOString(),
      };
      // Preserve an existing valid hired_at; only set it when currently null.
      if (!anyRow.hired_at) flip.hired_at = offer.start_date;
      const { error: flipErr } = await admin
        .from("people")
        .update(flip)
        .eq("id", anyRow.id);
      if (flipErr) throw flipErr;
      personId = anyRow.id;
      return { outcome: "converted", tenantId, personId, reused };
    }

    personId = canonical.id;
    // If a concurrent run created the row first, ensure the applicant link is set
    // (without overwriting hired_at).
    if (row.applicant_id !== applicantId) {
      reused = true;
      const { error: linkErr } = await admin
        .from("people")
        .update({ applicant_id: applicantId, updated_at: new Date().toISOString() })
        .eq("id", personId)
        .is("applicant_id", null);
      if (linkErr) throw linkErr;
    }
  }

  // 5. Mark the applicant Hired (idempotent — safe to repeat). Non-fatal to the
  // conversion itself, but a failure here is a real inconsistency — make it
  // LOUD: log it durably to integration_log (no silent failure, CLAUDE.md).
  const { error: statusErr } = await admin
    .from("applicants")
    .update({ status: "Hired", updated_at: new Date().toISOString() })
    .eq("id", applicantId)
    .neq("status", "Hired");
  if (statusErr) {
    console.error(`Failed to mark applicant ${applicantId} Hired: ${statusErr.message}`);
    await admin.from("integration_log").upsert(
      [{
        tenant_id: tenantId,
        source: "convert-applicant",
        idempotency_key: `applicant-hired:${applicantId}`,
        status: "failed",
        payload: { error: statusErr.message, person_id: personId, step: "mark_applicant_hired" },
        completed_at: new Date().toISOString(),
      }],
      { onConflict: "tenant_id,source,idempotency_key" },
    ).then(undefined, () => {/* logging must not mask the conversion success */});
  }

  return { outcome: "converted", tenantId, personId, reused };
}

/**
 * Durable provisioning-failure logging (CV-2 / CLAUDE.md "no silent failures").
 *
 * EXTERNAL provisioning (onboard-employee) is a SEPARATE retryable step invoked
 * by the convert-applicant authority AFTER the internal conversion has already
 * succeeded and been persisted. A provisioning failure therefore must NOT roll
 * back the conversion or throw to the caller — but it also must NOT be swallowed
 * as a bare console.error. This records a durable `failed` integration_log row so
 * the failure is visible and the provisioning can be retried independently.
 *
 * Idempotency key `provisioning:<applicantId>` means repeated failures update the
 * single open row rather than piling up. Best-effort — never throws (logging must
 * not mask the successful conversion). Lives here (not in index.ts) so it is unit
 * testable without booting the Deno.serve handler.
 */
export async function logProvisioningFailure(
  admin: AdminClient,
  tenantId: string | undefined,
  applicantId: string,
  personId: string,
  detail: unknown,
): Promise<void> {
  if (!tenantId) return;
  try {
    await admin.from("integration_log").upsert(
      [{
        tenant_id: tenantId,
        source: "convert-applicant",
        idempotency_key: `provisioning:${applicantId}`,
        status: "failed",
        payload: { person_id: personId, step: "onboard_employee_provisioning", detail },
        completed_at: new Date().toISOString(),
      }],
      { onConflict: "tenant_id,source,idempotency_key" },
    );
  } catch (_e) {
    // logging must not mask the (successful) conversion
  }
}
