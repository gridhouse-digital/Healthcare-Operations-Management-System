// =============================================================================
// Onboarding Completion Gate — gatherStatusInput rewiring tests (handoff §7.1)
//
// The pure resolver (resolveEmployeeStatus) is FROZEN — its Q2 matrix is
// covered in employee-status-resolver.test.ts and must not change. These tests
// cover the §5a rewiring of WHAT FEEDS it:
//   - tenant_settings.onboarding_group_id unset → fail closed
//   - not actively enrolled in the designated group → fail closed
//   - complianceView comes from v_onboarding_gate (requirement-driven), so a
//     gating course with NO training record surfaces as not_started instead of
//     vanishing — the fail-open is structurally closed
//   - raw training_records fallback survives ONLY the view-missing path
//   - named Karimah regression: 8 mapped, 1 recurring-excluded, 2 completed
//     → Onboarding (was falsely Active under the record-driven view)
// =============================================================================

import { assertEquals } from "jsr:@std/assert";
import {
  gatherStatusInput,
  resolveEmployeeStatus,
} from "../employee-status-resolver.ts";

const PERSON_ID = "person-1";
const TENANT_ID = "tenant-1";
const GATE_GROUP = "1428";

interface MockResult {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}

interface MockConfig {
  person?: MockResult;
  settings?: MockResult;
  enrollments?: MockResult;
  gate?: MockResult;
  raw?: MockResult;
}

/**
 * Minimal chainable supabase-client stub: every query method returns the
 * builder; awaiting the builder (or maybeSingle()) resolves to the configured
 * result for that table. Also records which tables were queried.
 */
function mockAdmin(config: MockConfig, queried: string[] = []) {
  const resultFor = (table: string): MockResult => {
    switch (table) {
      case "people":
        return config.person ?? { data: null, error: null };
      case "tenant_settings":
        return config.settings ?? { data: null, error: null };
      case "employee_group_enrollments":
        return config.enrollments ?? { data: [], error: null };
      case "v_onboarding_gate":
        return config.gate ?? { data: [], error: null };
      case "training_records":
        return config.raw ?? { data: [], error: null };
      default:
        throw new Error(`unexpected table in gatherStatusInput: ${table}`);
    }
  };

  return {
    from(table: string) {
      queried.push(table);
      const result = resultFor(table);
      // deno-lint-ignore no-explicit-any
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve(result),
        // deno-lint-ignore no-explicit-any
        then: (resolve: any, reject: any) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    },
  };
}

const personRow = (over: Record<string, unknown> = {}) => ({
  data: {
    employee_status: null,
    hired_at: "2026-06-01",
    tenant_id: TENANT_ID,
    ...over,
  },
  error: null,
});

const settingsRow = (groupId: string | null) => ({
  data: { onboarding_group_id: groupId },
  error: null,
});

const gateRows = (statuses: string[]) => ({
  data: statuses.map((s) => ({ effective_status: s })),
  error: null,
});

const activeEnrollment = { data: [{ id: "enr-1" }], error: null };

// ---------------------------------------------------------------------------
// Fail-closed configuration paths
// ---------------------------------------------------------------------------

Deno.test("gate: onboarding_group_id unset → fail closed (configuration_incomplete)", async () => {
  const admin = mockAdmin({
    person: personRow(),
    settings: settingsRow(null),
    // even with gate rows claiming completion, unset setting = not evaluable
    gate: gateRows(["completed"]),
  });
  const input = await gatherStatusInput(admin, PERSON_ID);
  assertEquals(input.hasActiveTrainingGroups, false);
  assertEquals(resolveEmployeeStatus(input), {
    status: "Onboarding",
    reasonCode: "configuration_incomplete",
  });
});

Deno.test("gate: no tenant_settings row at all → fail closed", async () => {
  const admin = mockAdmin({
    person: personRow(),
    settings: { data: null, error: null },
    gate: gateRows(["completed"]),
  });
  const input = await gatherStatusInput(admin, PERSON_ID);
  assertEquals(resolveEmployeeStatus(input).status, "Onboarding");
  assertEquals(resolveEmployeeStatus(input).reasonCode, "configuration_incomplete");
});

Deno.test("gate: not actively enrolled in the DESIGNATED group → fail closed", async () => {
  const admin = mockAdmin({
    person: personRow(),
    settings: settingsRow(GATE_GROUP),
    enrollments: { data: [], error: null }, // no active enrollment in 1428
    gate: gateRows([]),
  });
  const input = await gatherStatusInput(admin, PERSON_ID);
  assertEquals(input.hasActiveTrainingGroups, false);
  assertEquals(resolveEmployeeStatus(input), {
    status: "Onboarding",
    reasonCode: "configuration_incomplete",
  });
});

Deno.test("gate: enrolled but zero gate rows yet → awaiting_training_sync (fail closed)", async () => {
  const admin = mockAdmin({
    person: personRow(),
    settings: settingsRow(GATE_GROUP),
    enrollments: activeEnrollment,
    gate: gateRows([]),
  });
  const input = await gatherStatusInput(admin, PERSON_ID);
  assertEquals(input.hasActiveTrainingGroups, true);
  assertEquals(input.complianceView, []);
  assertEquals(resolveEmployeeStatus(input), {
    status: "Onboarding",
    reasonCode: "awaiting_training_sync",
  });
});

// ---------------------------------------------------------------------------
// The structural fix: missing records surface as not_started rows
// ---------------------------------------------------------------------------

Deno.test("gate: gating course with NO record → not_started row → Onboarding (mandatory_course_incomplete)", async () => {
  const admin = mockAdmin({
    person: personRow(),
    settings: settingsRow(GATE_GROUP),
    enrollments: activeEnrollment,
    // v_onboarding_gate emits the record-less course as not_started
    gate: gateRows(["completed", "not_started"]),
  });
  const input = await gatherStatusInput(admin, PERSON_ID);
  assertEquals(resolveEmployeeStatus(input), {
    status: "Onboarding",
    reasonCode: "mandatory_course_incomplete",
  });
});

Deno.test("gate: ALL gating courses complete → Active (onboarding_complete)", async () => {
  const admin = mockAdmin({
    person: personRow(),
    settings: settingsRow(GATE_GROUP),
    enrollments: activeEnrollment,
    gate: gateRows(["completed", "completed", "completed"]),
  });
  const input = await gatherStatusInput(admin, PERSON_ID);
  assertEquals(resolveEmployeeStatus(input), {
    status: "Active",
    reasonCode: "onboarding_complete",
  });
});

// ---------------------------------------------------------------------------
// Named regression (handoff §7.3): Karimah Moss — group 1428 maps 8 courses,
// course 1472 is recurring-tracked (excluded by the VIEW, so 7 gate rows),
// 2 completed, 5 not_started (no training_records rows existed for them).
// Under the record-driven view she resolved Active; the gate must hold her
// in Onboarding.
// ---------------------------------------------------------------------------

Deno.test("Karimah regression: 8 mapped, 1 recurring-excluded, 2 completed → Onboarding", async () => {
  const karimahGateRows = [
    "completed", // Ns-MODULE 1
    "completed", // Ns-MODULE 2
    "not_started", // auto-enrolled, never started → NO training_records row,
    "not_started", // but the requirement-driven view still emits the row
    "not_started",
    "not_started",
    "not_started",
    // course 1472 (ANNUAL EMPLOYEE REVIEW, recurring) excluded by the view
  ];
  assertEquals(karimahGateRows.length, 8 - 1);

  const admin = mockAdmin({
    person: personRow(),
    settings: settingsRow(GATE_GROUP),
    enrollments: activeEnrollment,
    gate: gateRows(karimahGateRows),
  });
  const input = await gatherStatusInput(admin, PERSON_ID);
  assertEquals(resolveEmployeeStatus(input), {
    status: "Onboarding",
    reasonCode: "mandatory_course_incomplete",
  });
});

// ---------------------------------------------------------------------------
// Frozen invariants still hold through the new wiring
// ---------------------------------------------------------------------------

Deno.test("gate: Terminated absolute — wins even with incomplete gate rows", async () => {
  const admin = mockAdmin({
    person: personRow({ employee_status: "Terminated" }),
    settings: settingsRow(GATE_GROUP),
    enrollments: activeEnrollment,
    gate: gateRows(["not_started"]),
  });
  const input = await gatherStatusInput(admin, PERSON_ID);
  assertEquals(resolveEmployeeStatus(input), {
    status: "Terminated",
    reasonCode: "terminated",
  });
});

Deno.test("gate: established Active stays Active (resolver never reverts lifecycle)", async () => {
  const admin = mockAdmin({
    person: personRow({ employee_status: "Active" }),
    settings: settingsRow(GATE_GROUP),
    enrollments: activeEnrollment,
    gate: gateRows(["not_started", "not_started"]),
  });
  const input = await gatherStatusInput(admin, PERSON_ID);
  assertEquals(resolveEmployeeStatus(input), {
    status: "Active",
    reasonCode: "remains_active",
  });
});

// ---------------------------------------------------------------------------
// View-missing fallback — semantics unchanged (raw training_records ONLY here)
// ---------------------------------------------------------------------------

Deno.test("gate: view missing (42P01) → raw training_records fallback, semantics unchanged", async () => {
  const admin = mockAdmin({
    person: personRow(),
    settings: settingsRow(GATE_GROUP),
    enrollments: activeEnrollment,
    gate: { data: null, error: { code: "42P01", message: "relation does not exist" } },
    raw: { data: [{ status: "completed" }, { status: "completed" }], error: null },
  });
  const input = await gatherStatusInput(admin, PERSON_ID);
  assertEquals(input.complianceView, null);
  assertEquals(resolveEmployeeStatus(input), {
    status: "Active",
    reasonCode: "onboarding_complete",
  });
});

Deno.test("gate: view missing (PGRST205) + incomplete raw → Onboarding", async () => {
  const admin = mockAdmin({
    person: personRow(),
    settings: settingsRow(GATE_GROUP),
    enrollments: activeEnrollment,
    gate: { data: null, error: { code: "PGRST205", message: "schema cache" } },
    raw: { data: [{ status: "completed" }, { status: "not_started" }], error: null },
  });
  const input = await gatherStatusInput(admin, PERSON_ID);
  assertEquals(resolveEmployeeStatus(input), {
    status: "Onboarding",
    reasonCode: "mandatory_course_incomplete",
  });
});

Deno.test("gate: gatherStatusInput reads v_onboarding_gate, not the record-driven view", async () => {
  const queried: string[] = [];
  const admin = mockAdmin(
    {
      person: personRow(),
      settings: settingsRow(GATE_GROUP),
      enrollments: activeEnrollment,
      gate: gateRows(["completed"]),
    },
    queried,
  );
  await gatherStatusInput(admin, PERSON_ID);
  assertEquals(queried.includes("v_onboarding_gate"), true);
  assertEquals(queried.includes("v_onboarding_training_compliance"), false);
});
