// =============================================================================
// _shared/identity.ts — Tenant-scoped identity reconciliation (Phase 1, P2)
//
// Single authority for email normalization and applicant→employee matching.
// Extracted from src/services/employeeService.ts so the server-side conversion
// authority (convert-applicant) and sync paths (sync-wp-users) share ONE
// implementation. See DECISIONS.md 2026-05-30 Q5.
//
// Reconciliation precedence (Q5 — tenant-scoped, FAIL-SAFE, never guesses):
//   1. Every query is scoped by tenant_id (cross-tenant matching is forbidden).
//   2. An exact applicant_id linkage WINS (even if an email also matches a
//      different employee row).
//   3. Else exactly ONE normalized-email match within the tenant auto-links.
//   4. Else zero matches → caller may create a new employee.
//   5. Else (≥2 email matches, OR applicant_id points to row A while the email
//      matches a different row B) → an UNRESOLVED IDENTITY COLLISION is
//      reported. The reconciler NEVER auto-merges, never tie-breaks, never
//      "most-recent wins". Guessing is forbidden.
//
// Normalization is trim(lowercase(email)) ONLY — no provider-specific
// transforms (e.g. Gmail dot-stripping). This matches the DB generated column
// people.email_normalized (20260528000002_normalized_email_uniqueness.sql) and
// the application/test layers, so the three agree byte-for-byte.
// =============================================================================

/**
 * Minimal structural surface of a Supabase client this module depends on.
 * Declared locally so the module is unit-testable with a hand-rolled fake and
 * does not couple to a concrete client construction. Both the real
 * jsr:@supabase/supabase-js@2 client and test fakes satisfy this shape.
 */
export interface IdentityQueryClient {
  from(table: string): IdentityQueryBuilder;
}

export interface IdentityQueryBuilder {
  // deno-lint-ignore no-explicit-any
  select(columns?: string): any;
}

/** A person/employee row as seen by reconciliation (only fields we read). */
export interface MatchableEmployee {
  id: string;
  tenant_id: string;
  email: string;
  applicant_id?: string | null;
  [key: string]: unknown;
}

export type IdentityMatchReason =
  | "multiple_email_matches"
  | "applicant_email_conflict";

/**
 * Result of reconciliation. A discriminated union so callers MUST handle the
 * collision case explicitly — there is no silent fall-through to a guess.
 */
export type IdentityMatchResult =
  | { outcome: "matched"; employee: MatchableEmployee }
  | { outcome: "none" }
  | {
    outcome: "collision";
    reason: IdentityMatchReason;
    /** Candidate employee row ids implicated in the collision. */
    candidateIds: string[];
    normalizedEmail: string;
    applicantId: string;
  };

/**
 * Canonical email normalization: trim + lowercase. Nothing else.
 * Identical in DB uniqueness, reconciliation, and tests (Q5).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Tenant-scoped, fail-safe applicant→employee reconciliation.
 *
 * Scopes BOTH queries by tenant_id, so a row in another tenant can never
 * match (ID-5: cross-tenant non-match). Returns a discriminated result; the
 * caller decides whether to link, create, or record a collision.
 *
 * This function performs NO writes. It is the read-side matcher only.
 */
export async function findEmployeeMatch(params: {
  client: IdentityQueryClient;
  tenantId: string;
  applicantId: string;
  email: string;
}): Promise<IdentityMatchResult> {
  const { client, tenantId, applicantId } = params;
  const normalizedEmail = normalizeEmail(params.email);

  const [byApplicantRes, byEmailRes] = await Promise.all([
    client
      .from("people")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("type", "employee")
      .eq("applicant_id", applicantId)
      .maybeSingle(),
    client
      .from("people")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("type", "employee")
      .eq("email_normalized", normalizedEmail)
      .limit(10),
  ]);

  if (byApplicantRes.error) throw byApplicantRes.error;
  if (byEmailRes.error) throw byEmailRes.error;

  const byApplicant = (byApplicantRes.data as MatchableEmployee | null) ?? null;

  // Email matches scoped to the tenant; defensively re-filter on the
  // normalized value so a caller passing a non-normalized column can't widen.
  const emailMatches = ((byEmailRes.data as MatchableEmployee[] | null) ?? [])
    .filter((row) => normalizeEmail(row.email) === normalizedEmail);

  // (2) Exact applicant_id linkage wins outright (ID-1).
  if (byApplicant) {
    // ...unless the email points at a DIFFERENT employee row — conflicting
    // evidence (ID-3 second clause). Do not guess which is right.
    const conflicting = emailMatches.filter((row) => row.id !== byApplicant.id);
    if (conflicting.length > 0) {
      return {
        outcome: "collision",
        reason: "applicant_email_conflict",
        candidateIds: dedupeIds([byApplicant.id, ...conflicting.map((r) => r.id)]),
        normalizedEmail,
        applicantId,
      };
    }
    return { outcome: "matched", employee: byApplicant };
  }

  // (4) No applicant_id link, no email match → caller may create (ID-2 / ID-4
  //     zero-match branch).
  if (emailMatches.length === 0) {
    return { outcome: "none" };
  }

  // (3) Exactly one normalized-email match → auto-link (ID-2, ID-4).
  if (emailMatches.length === 1) {
    return { outcome: "matched", employee: emailMatches[0] };
  }

  // (5) ≥2 email matches → ambiguous. Record a collision; never tie-break (ID-3).
  return {
    outcome: "collision",
    reason: "multiple_email_matches",
    candidateIds: dedupeIds(emailMatches.map((r) => r.id)),
    normalizedEmail,
    applicantId,
  };
}

function dedupeIds(ids: string[]): string[] {
  return [...new Set(ids)];
}
