// =============================================================================
// Onboarding Completion Gate — gatherStatusInput rewiring tests (revision §8.1)
//
// The pure resolver (resolveEmployeeStatus) is FROZEN — its Q2 matrix is
// covered in employee-status-resolver.test.ts and must not change. These tests
// cover the §5a rewiring of WHAT FEEDS it:
//   - no ld_group_mappings entries flagged is_onboarding=true → fail closed
//   - not actively enrolled in any onboarding-flagged group → fail closed
//   - complianceView comes from v_onboarding_gate (requirement-driven), so a
//     gating course with NO training record surfaces as not_started instead of
//     vanishing — the fail-open is structurally closed
//   - raw training_records fallback survives ONLY the view-missing path
//   - named Karimah regression: group 1428 non-recurring courses gate her;
//     the recurring Module 6 course is absent from the gate rows
// =============================================================================

import { assertEquals } from "jsr:@std/assert";
import {
  gatherStatusInput,
  resolveEmployeeStatus,
} from "../employee-status-resolver.ts";

const PERSON_ID = "person-1";
const TENANT_ID = "tenant-1";
const GATE_GROUP_A = "54";
const GATE_GROUP_B = "1428";

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

interface QueryFilter {
  table: string;
  method: "eq" | "in";
  column: string;
  value: unknown;
}

/**
 * Minimal chainable supabase-client stub: every query method returns the
 * builder; awaiting the builder (or maybeSingle()) resolves to the configured
 * result for that table. Also records which tables were queried.
 */
function mockAdmin(
  config: MockConfig,
  queried: string[] = [],
  filters: QueryFilter[] = [],
) {
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
        eq: (column: string, value: unknown) => {
          filters.push({ table, method: "eq", column, value });
          return builder;
        },
        in: (column: string, value: unknown) => {
          filters.push({ table, method: "in", column, value });
          return builder;
        },
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

const settingsRow = (
  mappings: Array<{ group_id: string; is_onboarding?: boolean }> | null,
) => ({
  data: { ld_group_mappings: mappings },
  error: null,
});

const onboardingSettings = (groupIds: string[] = [GATE_GROUP_B]) =>
  settingsRow(groupIds.map((group_id) => ({ group_id, is_onboarding: true })));

const gateRows = (statuses: string[]) => ({
  data: statuses.map((s) => ({ effective_status: s })),
  error: null,
});

const activeEnrollment = { data: [{ id: "enr-1" }], error: null };

// ---------------------------------------------------------------------------
// Fail-closed configuration paths
// ---------------------------------------------------------------------------

Deno.test("gate: no onboarding-flagged group → fail closed (configuration_incomplete)", async () => {
  const admin = mockAdmin({
    person: personRow(),
    settings: settingsRow([{ group_id: GATE_GROUP_B }]),
    // even with gate rows claiming completion, no flagged group = not evaluable
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

Deno.test("gate: not actively enrolled in any onboarding group → fail closed", async () => {
  const admin = mockAdmin({
    person: personRow(),
    settings: onboardingSettings([GATE_GROUP_A, GATE_GROUP_B]),
    enrollments: { data: [], error: null }, // no active enrollment in either onboarding group
    gate: gateRows([]),
  });
  const input = await gatherStatusInput(admin, PERSON_ID);
  assertEquals(input.hasActiveTrainingGroups, false);
  assertEquals(resolveEmployeeStatus(input), {
    status: "Onboarding",
    reasonCode: "configuration_incomplete",
  });
});

Deno.test("gate: multiple onboarding departments are checked as a set", async () => {
  const filters: QueryFilter[] = [];
  const admin = mockAdmin(
    {
      person: personRow(),
      settings: onboardingSettings([GATE_GROUP_A, GATE_GROUP_B]),
      enrollments: activeEnrollment,
      gate: gateRows(["completed"]),
    },
    [],
    filters,
  );
  const input = await gatherStatusInput(admin, PERSON_ID);
  assertEquals(input.hasActiveTrainingGroups, true);
  assertEquals(resolveEmployeeStatus(input), {
    status: "Active",
    reasonCode: "onboarding_complete",
  });

  const groupFilter = filters.find((f) =>
    f.table === "employee_group_enrollments" &&
    f.method === "in" &&
    f.column === "group_id"
  );
  assertEquals(groupFilter?.value, [GATE_GROUP_A, GATE_GROUP_B]);
});

Deno.test("gate: enrolled but zero gate rows yet → awaiting_training_sync (fail closed)", async () => {
  const admin = mockAdmin({
    person: personRow(),
    settings: onboardingSettings([GATE_GROUP_B]),
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
    settings: onboardingSettings([GATE_GROUP_B]),
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
    settings: onboardingSettings([GATE_GROUP_B]),
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
// Named regression: Karimah Moss — group 1428's non-recurring courses gate her.
// The recurring Module 6 Annual Review is absent from the VIEW rows because the
// recurring subsystem owns it. Under the record-driven view the missing rows
// vanished; the gate must hold her in Onboarding after reset-then-resolve.
// ---------------------------------------------------------------------------

Deno.test("Karimah regression: 1428 non-recurring rows present, recurring Module 6 absent → Onboarding", async () => {
  const karimahGateRows = [
    "completed", // Ns-MODULE 1
    "completed", // Ns-MODULE 2
    "not_started", // auto-enrolled, never started → NO training_records row,
    "not_started", // but the requirement-driven view still emits the row
    "not_started",
    "not_started",
    // course 1472 (ANNUAL EMPLOYEE REVIEW, recurring) excluded by the view
  ];
  assertEquals(karimahGateRows.length, 6);

  const admin = mockAdmin({
    person: personRow(),
    settings: onboardingSettings([GATE_GROUP_B]),
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
    settings: onboardingSettings([GATE_GROUP_B]),
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
    settings: onboardingSettings([GATE_GROUP_B]),
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
    settings: onboardingSettings([GATE_GROUP_B]),
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
    settings: onboardingSettings([GATE_GROUP_B]),
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
      settings: onboardingSettings([GATE_GROUP_B]),
      enrollments: activeEnrollment,
      gate: gateRows(["completed"]),
    },
    queried,
  );
  await gatherStatusInput(admin, PERSON_ID);
  assertEquals(queried.includes("v_onboarding_gate"), true);
  assertEquals(queried.includes("v_onboarding_training_compliance"), false);
});
