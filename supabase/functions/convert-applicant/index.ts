import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleCors, withCors } from "../_shared/cors.ts";
import { errorResponse, handleError } from "../_shared/error-response.ts";
import { cronOrTenantGuard } from "../_shared/cron-or-tenant-guard.ts";
import { TenantGuardError } from "../_shared/tenant-guard.ts";
import { logAudit } from "../_shared/audit-logger.ts";
import {
  convertApplicantToEmployee,
  ConversionError,
} from "../_shared/conversion.ts";
import { writeEmployeeStatus } from "../_shared/employee-status-resolver.ts";

// =============================================================================
// convert-applicant — THE canonical server-side applicant→employee conversion
// authority (Phase 1, Q4). It owns INTERNAL conversion (the people row + status)
// and then triggers EXTERNAL provisioning (onboard-employee) as a SEPARATE,
// idempotent step with independent failure/retry. A provisioning failure does
// NOT roll back the internal conversion (internal truth is preserved).
//
// Invoked by:
//   - the on_offer_accepted DB webhook (service-role JWT → mode "cron"),
//     body: { record: <offer row> }
//   - authorized UI actions (user JWT), body: { applicant_id, offer_id? }
//
// tenant_guard contract: cronOrTenantGuard FIRST. tenant_id is derived from the
// server-trusted applicant/offer records — NEVER from the request body/headers.
// =============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface ConvertRequest {
  applicant_id?: string;
  offer_id?: string;
  // webhook path: the accepted offer row
  record?: { id?: string; applicant_id?: string; status?: string };
  // when true, skip provisioning (internal conversion only)
  skip_provisioning?: boolean;
}

/**
 * Durable provisioning-failure logging (CV-2 / CLAUDE.md "no silent failures").
 * The internal conversion already succeeded and is preserved; provisioning is a
 * separate retryable step, so its failure is recorded to integration_log rather
 * than failing the conversion response. Best-effort — never throws.
 */
async function logProvisioningFailure(
  // deno-lint-ignore no-explicit-any
  admin: any,
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

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    // 1. Auth FIRST (cron service-role OR authenticated user).
    const auth = cronOrTenantGuard(req);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const body = (await req.json().catch(() => ({}))) as ConvertRequest;

    // 2. Resolve applicant_id / offer_id from the trusted inputs.
    // Webhook path: the accepted offer row arrives as { record }.
    let applicantId = body.applicant_id;
    let offerId = body.offer_id;

    if (body.record) {
      // Ignore an Accepted-status gate miss the way onboard-employee did.
      if (body.record.status && body.record.status !== "Accepted") {
        return withCors(
          new Response(
            JSON.stringify({ message: "Ignored: Status not Accepted" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
          req,
        );
      }
      applicantId = body.record.applicant_id ?? applicantId;
      offerId = body.record.id ?? offerId;
    }

    if (!applicantId) {
      return withCors(
        errorResponse("MISSING_APPLICANT_ID", "applicant_id (or record.applicant_id) is required", 400),
        req,
      );
    }

    // 3. Defense-in-depth: a user-mode caller must belong to the applicant's
    //    tenant. The applicant's tenant_id is the trusted source; we verify the
    //    caller matches it before doing work. (cron mode = full trust.)
    if (auth.mode === "user") {
      const { data: applicantTenant } = await admin
        .from("applicants")
        .select("tenant_id")
        .eq("id", applicantId)
        .maybeSingle();
      if (!applicantTenant) {
        return withCors(errorResponse("APPLICANT_NOT_FOUND", "Applicant not found", 404), req);
      }
      if (applicantTenant.tenant_id !== auth.tenantId) {
        return withCors(
          errorResponse("TENANT_MISMATCH", "Caller tenant does not match applicant tenant", 403),
          req,
        );
      }
    }

    const actorId = auth.mode === "user" ? auth.userId : null;

    // 4. INTERNAL conversion (single-writer authority).
    const result = await convertApplicantToEmployee(admin, {
      applicantId,
      offerId,
      actorId,
    });

    if (result.outcome === "collision") {
      // Fail-safe: an unresolved identity collision was recorded. No conversion,
      // no provisioning. Surface it for manual HR review (200 — handled, not an
      // error condition the caller can fix by retrying).
      void logAudit({
        actorId: actorId ?? undefined,
        action: "conversion.identity_collision",
        tableName: "identity_collisions",
        recordId: result.collisionId,
        after: { applicant_id: applicantId, reason_code: result.reasonCode },
      });
      return withCors(
        new Response(
          JSON.stringify({
            message: "Identity collision recorded for manual review",
            outcome: "collision",
            collision_id: result.collisionId,
            reason_code: result.reasonCode,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
        req,
      );
    }

    const personId = result.personId!;

    // 5. Resolve + persist lifecycle status (resolver is the SOLE writer).
    const status = await writeEmployeeStatus(admin, personId);

    void logAudit({
      actorId: actorId ?? undefined,
      action: result.reused ? "conversion.reused" : "conversion.created",
      tableName: "people",
      recordId: personId,
      after: { applicant_id: applicantId, employee_status: status.status, reason: status.reasonCode },
    });

    // 6. EXTERNAL provisioning — SEPARATE idempotent step (Q4). Invoke
    //    onboard-employee. A provisioning failure does NOT undo the internal
    //    conversion; it is logged and surfaced, retryable independently.
    let provisioning: { ok: boolean; detail?: unknown } = { ok: true };
    if (!body.skip_provisioning) {
      try {
        const provRes = await fetch(`${SUPABASE_URL}/functions/v1/onboard-employee`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Pass the service-role key so onboard-employee's guard accepts it.
            "Authorization": `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({
            record: { applicant_id: applicantId, status: "Accepted" },
            person_id: personId,
          }),
        });
        const provBody = await provRes.json().catch(() => ({}));
        provisioning = provRes.ok ? { ok: true, detail: provBody } : { ok: false, detail: provBody };
        if (!provRes.ok) {
          console.error(`onboard-employee provisioning failed: ${JSON.stringify(provBody)}`);
          await logProvisioningFailure(admin, result.tenantId, applicantId, personId, provBody);
        }
      } catch (provErr) {
        const msg = provErr instanceof Error ? provErr.message : String(provErr);
        console.error(`onboard-employee invocation error: ${msg}`);
        provisioning = { ok: false, detail: { error: msg } };
        await logProvisioningFailure(admin, result.tenantId, applicantId, personId, { error: msg });
      }
    }

    return withCors(
      new Response(
        JSON.stringify({
          message: "Conversion successful",
          outcome: "converted",
          person_id: personId,
          reused: result.reused ?? false,
          employee_status: status.status,
          status_reason: status.reasonCode,
          provisioning,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
      req,
    );
  } catch (err) {
    if (err instanceof ConversionError) {
      return withCors(errorResponse(err.code, err.message, err.status), req);
    }
    if (err instanceof TenantGuardError) {
      return withCors(errorResponse(err.code, err.message, err.status), req);
    }
    return withCors(handleError(err), req);
  }
});
