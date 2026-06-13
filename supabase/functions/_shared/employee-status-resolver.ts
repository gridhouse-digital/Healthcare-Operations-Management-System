// =============================================================================
// _shared/employee-status-resolver.ts — Phase 1, P1
//
// THE single authority that decides people.employee_status. Pure + idempotent:
// same inputs → same output, no I/O. The accompanying writer (writeEmployeeStatus)
// is the ONLY code path that persists employee_status; conversion never inlines
// status computation. See DECISIONS.md 2026-05-30 Q2.
//
// FAIL-CLOSED (Q2): when obligations are incomplete, missing, mis-configured, or
// not safely evaluable, the resolver returns `Onboarding` with a machine-readable
// reason code. It NEVER guesses `Active`.
//
// Lifecycle ≠ compliance: an established `Active` employee whose credential later
// expires STAYS `Active` (compliance is tracked by the separate compliance_state).
// The resolver never reverts Active→Onboarding, and never reverses `Terminated`.
// =============================================================================

export type EmployeeStatus = "Onboarding" | "Active" | "Terminated";

export type StatusReasonCode =
  | "onboarding_complete"
  | "mandatory_course_incomplete"
  | "configuration_incomplete"
  | "awaiting_training_sync"
  | "terminated"
  | "remains_active"; // established Active employee; compliance handled separately

/** A single onboarding training row as the resolver evaluates it. */
export interface ComplianceViewRow {
  /** Effective onboarding status for one mandatory course. */
  effective_status: string; // 'completed' | 'in_progress' | 'not_started' | ...
}

export interface RawTrainingRow {
  status: string; // 'completed' | ...
}

export interface StatusResolverInput {
  /**
   * Rows from v_onboarding_gate (requirement-driven: one row per gating
   * course, missing records surface as 'not_started'), or `null` when the
   * view is missing / not materialized (forces the raw fallback).
   */
  complianceView: ComplianceViewRow[] | null;
  /** Raw training_records rows — used only when complianceView is null. */
  rawTrainingRecords: RawTrainingRow[];
  /** people.hired_at (set from accepted offer.start_date). Presence ≠ Active. */
  hiredAt: string | null;
  /**
   * Whether onboarding obligations are CONFIGURED and the person is actively
   * enrolled in the tenant's designated onboarding group
   * (tenant_settings.onboarding_group_id). When false — setting unset or not
   * enrolled — onboarding is not safely evaluable → fail closed.
   */
  hasActiveTrainingGroups: boolean;
  /** HR-controlled terminal flag. Wins over everything. */
  isTerminated: boolean;
  /**
   * The employee's CURRENT persisted status, if any. Lets the resolver honor
   * "an established Active employee stays Active" (Q2) — compliance failures do
   * not revert lifecycle.
   */
  currentStatus?: EmployeeStatus | null;
}

export interface StatusResolverResult {
  status: EmployeeStatus;
  reasonCode: StatusReasonCode;
}

/**
 * Pure, idempotent, FAIL-CLOSED lifecycle-status resolver.
 * Implements exactly the Q2 matrix in the Phase 1 handoff. Must not be relaxed.
 */
export function resolveEmployeeStatus(
  input: StatusResolverInput,
): StatusResolverResult {
  // 1. Terminated is HR-controlled and absolute. Never auto-reversed.
  if (input.isTerminated) {
    return { status: "Terminated", reasonCode: "terminated" };
  }

  // 2. Established Active employee stays Active. Ongoing compliance failures are
  //    represented by the SEPARATE compliance_state, not by reverting lifecycle.
  if (input.currentStatus === "Active") {
    return { status: "Active", reasonCode: "remains_active" };
  }

  // 3. Onboarding obligations must be CONFIGURED to be safely evaluable.
  //    No active group / rule / anchor → fail closed to Onboarding.
  if (!input.hasActiveTrainingGroups) {
    return {
      status: "Onboarding",
      reasonCode: "configuration_incomplete",
    };
  }

  // 4. Evaluate completion against the onboarding view, or the raw fallback when
  //    the view is missing/not materialized.
  if (input.complianceView !== null) {
    const rows = input.complianceView;
    // Empty view with active groups configured = not yet evaluable (sync not run
    // / instances not generated). Fail closed.
    if (rows.length === 0) {
      return { status: "Onboarding", reasonCode: "awaiting_training_sync" };
    }
    const allComplete = rows.every((r) => r.effective_status === "completed");
    return allComplete
      ? { status: "Active", reasonCode: "onboarding_complete" }
      : { status: "Onboarding", reasonCode: "mandatory_course_incomplete" };
  }

  // View missing → raw fallback.
  const raw = input.rawTrainingRecords;
  if (raw.length === 0) {
    // No raw evidence either → not safely evaluable. Fail closed.
    return { status: "Onboarding", reasonCode: "awaiting_training_sync" };
  }
  const allCompleteRaw = raw.every((r) => r.status === "completed");
  return allCompleteRaw
    ? { status: "Active", reasonCode: "onboarding_complete" }
    : { status: "Onboarding", reasonCode: "mandatory_course_incomplete" };
}

// =============================================================================
// I/O side — the ONLY writer of people.employee_status.
//
// Kept separate from the pure resolver above so the decision logic stays
// trivially testable. This gathers inputs from the DB, resolves, and persists.
// Re-invoke after conversion and after relevant training/group writes (Q2/AC-7).
// =============================================================================

// deno-lint-ignore no-explicit-any
type AdminClient = any;

/**
 * Reads the resolver inputs for one person from the DB.
 *
 * Onboarding-completion-gate rewiring (2026-06-12 handoff §5a):
 *   - The tenant's designated onboarding group (tenant_settings.onboarding_group_id)
 *     is the source of truth. Unset → not safely evaluable → fail closed.
 *   - hasActiveTrainingGroups = active enrollment IN THE DESIGNATED GROUP,
 *     not "any active enrollment".
 *   - complianceView = the person's rows from v_onboarding_gate — requirement-
 *     driven, one row per gating course whether or not a record exists, so a
 *     never-started course can no longer vanish from the completeness check.
 *   - The raw training_records fallback survives ONLY for the view-missing
 *     path (42P01/PGRST205), semantics unchanged.
 */
export async function gatherStatusInput(
  admin: AdminClient,
  personId: string,
): Promise<StatusResolverInput> {
  // current persisted status + termination signal (+ tenant for the gate setting)
  const { data: person } = await admin
    .from("people")
    .select("employee_status, hired_at, tenant_id")
    .eq("id", personId)
    .maybeSingle();

  const currentStatus = (person?.employee_status ?? null) as
    | EmployeeStatus
    | null;
  const isTerminated = currentStatus === "Terminated";
  const tenantId = (person?.tenant_id ?? null) as string | null;

  // Designated onboarding group. Unset / unreadable → null → fail closed
  // (configuration_incomplete). Never guess Active.
  let onboardingGroupId: string | null = null;
  if (tenantId) {
    const { data: settings } = await admin
      .from("tenant_settings")
      .select("onboarding_group_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    onboardingGroupId = (settings?.onboarding_group_id ?? null) as
      | string
      | null;
  }

  // Onboarding is safely evaluable ONLY when the person is actively enrolled
  // in the tenant's designated onboarding group.
  let hasActiveTrainingGroups = false;
  if (onboardingGroupId) {
    const { data: enrollments } = await admin
      .from("employee_group_enrollments")
      .select("id")
      .eq("person_id", personId)
      .eq("group_id", onboardingGroupId)
      .eq("active", true)
      .limit(1);
    hasActiveTrainingGroups = (enrollments?.length ?? 0) > 0;
  }

  // Requirement-driven gate view, with raw fallback when missing.
  const viewRes = await admin
    .from("v_onboarding_gate")
    .select("effective_status")
    .eq("person_id", personId);

  const viewMissing = viewRes.error &&
    (
      viewRes.error.code === "42P01" ||
      viewRes.error.code === "PGRST205" ||
      /relation .* does not exist/i.test(viewRes.error.message || "") ||
      /schema cache/i.test(viewRes.error.message || "")
    );

  let complianceView: ComplianceViewRow[] | null;
  let rawTrainingRecords: RawTrainingRow[] = [];

  if (viewMissing) {
    complianceView = null;
    const { data: raw } = await admin
      .from("training_records")
      .select("status")
      .eq("person_id", personId);
    rawTrainingRecords = (raw ?? []) as RawTrainingRow[];
  } else if (viewRes.error) {
    throw viewRes.error;
  } else {
    complianceView = (viewRes.data ?? []) as ComplianceViewRow[];
  }

  return {
    complianceView,
    rawTrainingRecords,
    hiredAt: (person?.hired_at ?? null) as string | null,
    hasActiveTrainingGroups,
    isTerminated,
    currentStatus,
  };
}

/**
 * The sole writer of people.employee_status. Gathers inputs, resolves (pure),
 * and persists ONLY when the value changed (idempotent — no-op write avoided so
 * the audit trail does not accrue identical rows). Returns the resolved result.
 */
export async function writeEmployeeStatus(
  admin: AdminClient,
  personId: string,
): Promise<StatusResolverResult> {
  const input = await gatherStatusInput(admin, personId);
  const result = resolveEmployeeStatus(input);

  if (input.currentStatus !== result.status) {
    const { error } = await admin
      .from("people")
      .update({ employee_status: result.status, updated_at: new Date().toISOString() })
      .eq("id", personId);
    if (error) throw error;
  }

  return result;
}
