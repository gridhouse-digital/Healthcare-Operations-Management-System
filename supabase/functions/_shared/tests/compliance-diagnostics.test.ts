import { assertEquals } from "jsr:@std/assert";
import {
  diagnoseComplianceConfig,
  type DiagnosticsInput,
} from "../compliance-diagnostics.ts";

function healthy(over: Partial<DiagnosticsInput> = {}): DiagnosticsInput {
  return {
    activeRuleCount: 2,
    courseCount: 3,
    ruleCourseMappingGaps: [],
    activeGroupEnrollmentCount: 5,
    missingAnchorCount: 0,
    lastSyncCompleted: true,
    ...over,
  };
}

function codes(input: DiagnosticsInput): string[] {
  return diagnoseComplianceConfig(input).map((f) => f.code).sort();
}

Deno.test("fully-configured tenant → no findings", () => {
  assertEquals(diagnoseComplianceConfig(healthy()), []);
});

Deno.test("surfaces missing active compliance rules", () => {
  assertEquals(codes(healthy({ activeRuleCount: 0 })).includes("no_active_compliance_rules"), true);
});

Deno.test("surfaces missing training courses", () => {
  assertEquals(codes(healthy({ courseCount: 0 })).includes("no_training_courses"), true);
});

Deno.test("surfaces rule→course mapping gaps with context", () => {
  const findings = diagnoseComplianceConfig(
    healthy({ ruleCourseMappingGaps: [{ ruleId: "r1", courseId: "c99" }] }),
  );
  const gap = findings.find((f) => f.code === "rule_missing_course_mapping");
  assertEquals(gap?.context, { ruleId: "r1", courseId: "c99" });
});

Deno.test("surfaces missing group enrollments", () => {
  assertEquals(codes(healthy({ activeGroupEnrollmentCount: 0 })).includes("no_group_enrollments"), true);
});

Deno.test("surfaces missing anchors with count", () => {
  const findings = diagnoseComplianceConfig(healthy({ missingAnchorCount: 3 }));
  const anchor = findings.find((f) => f.code === "missing_anchor");
  assertEquals(anchor?.context, { count: 3 });
});

Deno.test("surfaces training sync not run", () => {
  assertEquals(codes(healthy({ lastSyncCompleted: false })).includes("training_sync_not_run"), true);
});

Deno.test("diagnostics are deterministic / read-only (pure)", () => {
  const input = healthy({ activeRuleCount: 0, courseCount: 0 });
  assertEquals(diagnoseComplianceConfig(input), diagnoseComplianceConfig(input));
});

Deno.test("a completely empty config surfaces all relevant gaps at once", () => {
  const c = codes(healthy({
    activeRuleCount: 0,
    courseCount: 0,
    activeGroupEnrollmentCount: 0,
    missingAnchorCount: 0,
    lastSyncCompleted: false,
  }));
  assertEquals(c.includes("no_active_compliance_rules"), true);
  assertEquals(c.includes("no_training_courses"), true);
  assertEquals(c.includes("no_group_enrollments"), true);
  assertEquals(c.includes("training_sync_not_run"), true);
});
