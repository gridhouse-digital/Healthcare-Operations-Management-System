// =============================================================================
// _shared/compliance-diagnostics.ts — Phase 1, P3 (READ-SIDE ONLY)
//
// Diagnostics + configuration validation for the recurring-compliance engine.
// Answers "why is this compliance view empty / not evaluable?" by surfacing
// missing GROUP, RULE, group→course MAPPING, ANCHOR, and SYNC conditions.
//
// HARD BOUNDARY: this module is READ-ONLY. It performs NO writes and does NOT
// change recurring-compliance engine behavior. The engine shipped in Epic 5
// Stories 5.11–5.17 and is explicitly out of scope for modification (a finding
// is not a fix). See the Phase 1 handoff Out-of-Scope and AC-10.
// =============================================================================

export type DiagnosticCode =
  | "no_active_compliance_rules"
  | "no_training_courses"
  | "rule_missing_course_mapping"
  | "no_group_enrollments"
  | "missing_anchor"
  | "training_sync_not_run";

export interface DiagnosticFinding {
  code: DiagnosticCode;
  message: string;
  /** Optional identifiers to help an admin locate the gap. */
  context?: Record<string, unknown>;
}

/**
 * Inputs gathered read-only from the DB (see gatherDiagnosticsInput). All counts
 * are tenant-scoped. `ruleCourseMappingGaps` lists rules whose (tenant, course_id)
 * has no matching training_courses row.
 */
export interface DiagnosticsInput {
  activeRuleCount: number;
  courseCount: number;
  /** rule ids whose course_id is not present in training_courses */
  ruleCourseMappingGaps: Array<{ ruleId: string; courseId: string }>;
  activeGroupEnrollmentCount: number;
  /** group enrollments (active) that have no anchor_date set */
  missingAnchorCount: number;
  /** whether a successful WordPress/LearnDash sync run is on record */
  lastSyncCompleted: boolean;
}

/**
 * Pure config validator. Deterministic: same inputs → same findings. Emits a
 * fail-closed set of findings explaining why recurring compliance may be empty.
 * An empty array means "no configuration gaps detected".
 */
export function diagnoseComplianceConfig(
  input: DiagnosticsInput,
): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];

  if (input.activeRuleCount === 0) {
    findings.push({
      code: "no_active_compliance_rules",
      message:
        "No active training_compliance_rules for this tenant — recurring compliance cannot generate cycles.",
    });
  }

  if (input.courseCount === 0) {
    findings.push({
      code: "no_training_courses",
      message:
        "No training_courses synced for this tenant — rules cannot map to a LearnDash course until a course sync runs.",
    });
  }

  for (const gap of input.ruleCourseMappingGaps) {
    findings.push({
      code: "rule_missing_course_mapping",
      message:
        `Compliance rule references course_id '${gap.courseId}' which has no training_courses row — group→course mapping is incomplete.`,
      context: { ruleId: gap.ruleId, courseId: gap.courseId },
    });
  }

  if (input.activeGroupEnrollmentCount === 0) {
    findings.push({
      code: "no_group_enrollments",
      message:
        "No active employee_group_enrollments — recurring compliance is anchored on group enrollment, so no cycles will be created.",
    });
  }

  if (input.missingAnchorCount > 0) {
    findings.push({
      code: "missing_anchor",
      message:
        `${input.missingAnchorCount} active group enrollment(s) have no anchor_date — due dates cannot be calculated.`,
      context: { count: input.missingAnchorCount },
    });
  }

  if (!input.lastSyncCompleted) {
    findings.push({
      code: "training_sync_not_run",
      message:
        "No completed WordPress/LearnDash sync run on record — compliance evidence may be stale or absent until a sync completes.",
    });
  }

  return findings;
}

// deno-lint-ignore no-explicit-any
type AdminClient = any;

/**
 * Read-only gatherer. Issues SELECT-only queries scoped by tenant_id and
 * assembles a DiagnosticsInput. No writes, no engine mutation.
 */
export async function gatherDiagnosticsInput(
  admin: AdminClient,
  tenantId: string,
): Promise<DiagnosticsInput> {
  const [rulesRes, coursesRes, enrollRes, syncRes] = await Promise.all([
    admin
      .from("training_compliance_rules")
      .select("id, course_id")
      .eq("tenant_id", tenantId)
      .eq("active", true),
    admin
      .from("training_courses")
      .select("course_id")
      .eq("tenant_id", tenantId),
    admin
      .from("employee_group_enrollments")
      .select("id, anchor_date")
      .eq("tenant_id", tenantId)
      .eq("active", true),
    admin
      .from("integration_log")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("source", "wordpress")
      .eq("status", "completed")
      .limit(1),
  ]);

  const rules = (rulesRes.data ?? []) as Array<{ id: string; course_id: string }>;
  const courses = (coursesRes.data ?? []) as Array<{ course_id: string }>;
  const enrollments = (enrollRes.data ?? []) as Array<{ id: string; anchor_date: string | null }>;
  const syncRuns = (syncRes.data ?? []) as Array<{ id: string }>;

  const courseIds = new Set(courses.map((c) => c.course_id));
  const ruleCourseMappingGaps = rules
    .filter((r) => !courseIds.has(r.course_id))
    .map((r) => ({ ruleId: r.id, courseId: r.course_id }));

  return {
    activeRuleCount: rules.length,
    courseCount: courses.length,
    ruleCourseMappingGaps,
    activeGroupEnrollmentCount: enrollments.length,
    missingAnchorCount: enrollments.filter((e) => !e.anchor_date).length,
    lastSyncCompleted: syncRuns.length > 0,
  };
}
