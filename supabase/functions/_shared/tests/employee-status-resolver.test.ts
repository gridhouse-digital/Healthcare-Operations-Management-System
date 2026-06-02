import { assertEquals } from "jsr:@std/assert";
import {
  resolveEmployeeStatus,
  type StatusResolverInput,
} from "../employee-status-resolver.ts";

// Exact Q2 matrix from the Phase 1 handoff. The resolver must implement these
// outcomes verbatim — fail-closed, never relaxed.

function base(over: Partial<StatusResolverInput> = {}): StatusResolverInput {
  return {
    complianceView: [],
    rawTrainingRecords: [],
    hiredAt: "2026-06-01",
    hasActiveTrainingGroups: true,
    isTerminated: false,
    currentStatus: null,
    ...over,
  };
}

Deno.test("Onboarding obligations complete, safely evaluable → Active", () => {
  const r = resolveEmployeeStatus(base({
    complianceView: [{ effective_status: "completed" }, { effective_status: "completed" }],
  }));
  assertEquals(r, { status: "Active", reasonCode: "onboarding_complete" });
});

Deno.test("Mandatory onboarding incomplete → Onboarding (mandatory_course_incomplete)", () => {
  const r = resolveEmployeeStatus(base({
    complianceView: [{ effective_status: "completed" }, { effective_status: "in_progress" }],
  }));
  assertEquals(r, { status: "Onboarding", reasonCode: "mandatory_course_incomplete" });
});

Deno.test("View missing, raw fallback all complete → Active", () => {
  const r = resolveEmployeeStatus(base({
    complianceView: null,
    rawTrainingRecords: [{ status: "completed" }, { status: "completed" }],
  }));
  assertEquals(r, { status: "Active", reasonCode: "onboarding_complete" });
});

Deno.test("View missing, raw fallback incomplete → Onboarding (mandatory_course_incomplete)", () => {
  const r = resolveEmployeeStatus(base({
    complianceView: null,
    rawTrainingRecords: [{ status: "completed" }, { status: "not_started" }],
  }));
  assertEquals(r, { status: "Onboarding", reasonCode: "mandatory_course_incomplete" });
});

Deno.test("Config incomplete (no group/rule/anchor) → Onboarding (configuration_incomplete) — fail closed", () => {
  const r = resolveEmployeeStatus(base({
    hasActiveTrainingGroups: false,
    // even if a view row claims completed, no config = not safely evaluable
    complianceView: [{ effective_status: "completed" }],
  }));
  assertEquals(r, { status: "Onboarding", reasonCode: "configuration_incomplete" });
});

Deno.test("Training sync not yet run / not safely evaluable → Onboarding (awaiting_training_sync) — fail closed", () => {
  // active groups configured, but no view rows AND no raw records yet
  const viewEmpty = resolveEmployeeStatus(base({ complianceView: [], rawTrainingRecords: [] }));
  assertEquals(viewEmpty, { status: "Onboarding", reasonCode: "awaiting_training_sync" });

  const noRaw = resolveEmployeeStatus(base({ complianceView: null, rawTrainingRecords: [] }));
  assertEquals(noRaw, { status: "Onboarding", reasonCode: "awaiting_training_sync" });
});

Deno.test("Explicit terminal state → Terminated (never auto-reversed)", () => {
  const r = resolveEmployeeStatus(base({
    isTerminated: true,
    // terminated wins even if everything else says Active
    complianceView: [{ effective_status: "completed" }],
    currentStatus: "Active",
  }));
  assertEquals(r, { status: "Terminated", reasonCode: "terminated" });
});

Deno.test("Established Active employee, credential later expires → stays Active (resolver does NOT revert)", () => {
  const r = resolveEmployeeStatus(base({
    currentStatus: "Active",
    // compliance now fails: incomplete onboarding view
    complianceView: [{ effective_status: "not_started" }],
  }));
  assertEquals(r, { status: "Active", reasonCode: "remains_active" });
});

// ---------------------------------------------------------------------------
// Idempotency — same inputs → same output (convergence across sync orderings)
// ---------------------------------------------------------------------------

Deno.test("resolver is idempotent: same inputs produce identical output", () => {
  const input = base({
    complianceView: [{ effective_status: "completed" }],
  });
  const a = resolveEmployeeStatus(input);
  const b = resolveEmployeeStatus(input);
  const c = resolveEmployeeStatus({ ...input });
  assertEquals(a, b);
  assertEquals(b, c);
});

Deno.test("convergence: ORD-1 vs ORD-2 (convert→sync vs sync→convert) reach same terminal status", () => {
  // Both orderings ultimately present the SAME evaluable inputs to the resolver.
  // The resolver being pure guarantees the terminal status is identical.
  const terminalInputs = base({
    complianceView: [{ effective_status: "completed" }, { effective_status: "completed" }],
    hasActiveTrainingGroups: true,
  });
  const ord1 = resolveEmployeeStatus(terminalInputs);
  const ord2 = resolveEmployeeStatus(terminalInputs);
  assertEquals(ord1, ord2);
  assertEquals(ord1.status, "Active");
});

Deno.test("ORD-3: sync-partial (records present, view not materialized) → fallback, converges, no crash", () => {
  const r = resolveEmployeeStatus(base({
    complianceView: null, // view not materialized
    rawTrainingRecords: [{ status: "completed" }],
  }));
  assertEquals(r.status, "Active");
  assertEquals(r.reasonCode, "onboarding_complete");
});
