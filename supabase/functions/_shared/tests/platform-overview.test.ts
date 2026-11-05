import { assertEquals } from "jsr:@std/assert";
import {
  decidePlatformAccess,
  summarizeAgency,
  summarizeTotals,
  SYNC_SOURCES,
  type RawAgencyCounts,
  type SourceCounts,
} from "../platform-overview.ts";

function source(over: Partial<SourceCounts> = {}): SourceCounts {
  return { source: "jazzhr", active: true, lastSuccessAt: "2026-11-01T10:00:00Z", failedLastWindow: 0, everRan: true, ...over };
}

function raw(over: Partial<RawAgencyCounts> = {}): RawAgencyCounts {
  return {
    id: "tenant-1",
    name: "Agency",
    employees: 10,
    employeesActive: 8,
    employeesOnboarding: 2,
    applicants: 5,
    teamUsers: 3,
    trainingRecords: 4,
    trainingCompleted: 3,
    trainingInProgress: 1,
    trainingNotStarted: 0,
    recurringTotal: 2,
    recurringOverdue: 0,
    sources: [source()],
    ...over,
  };
}

const idle = (name: SourceCounts["source"]) =>
  source({ source: name, active: false, lastSuccessAt: null, everRan: false });

// ── Access: the JWT claim alone must never be enough ─────────────────────────

const allowedInput = {
  claimedRole: "platform_admin",
  verifiedUserId: "user-1",
  claimedUserId: "user-1",
  activePlatformAdminRows: 1,
};

Deno.test("verified user with an active platform_admin row is allowed", () => {
  assertEquals(decidePlatformAccess(allowedInput), "allowed");
});

for (const role of ["tenant_admin", "hr_admin", ""]) {
  Deno.test(`role "${role}" is forbidden even with a platform_admin row`, () => {
    assertEquals(decidePlatformAccess({ ...allowedInput, claimedRole: role }), "forbidden");
  });
}

Deno.test("forged claim: token that fails verification is unauthenticated", () => {
  assertEquals(decidePlatformAccess({ ...allowedInput, verifiedUserId: null }), "unauthenticated");
});

Deno.test("token whose verified user differs from the claim is unauthenticated", () => {
  assertEquals(decidePlatformAccess({ ...allowedInput, verifiedUserId: "user-2" }), "unauthenticated");
});

Deno.test("claim without an active platform_admin row is forbidden", () => {
  assertEquals(decidePlatformAccess({ ...allowedInput, activePlatformAdminRows: 0 }), "forbidden");
});

// ── Status: not connected and no data must never read as healthy ─────────────

Deno.test("connected agency with no problems is ok", () => {
  assertEquals(summarizeAgency(raw()).status, "ok");
});

Deno.test("empty agency is no_data, not zero and not healthy", () => {
  const agency = summarizeAgency(raw({
    employees: 0, employeesActive: 0, employeesOnboarding: 0, applicants: 0,
    trainingRecords: 0, trainingCompleted: 0, trainingInProgress: 0, recurringTotal: 0,
    sources: SYNC_SOURCES.map(idle),
  }));
  assertEquals(agency.status, "no_data");
  assertEquals(agency.training, null);
  assertEquals(agency.lastSyncAt, null);
});

Deno.test("agency with staff but no connector is not_connected", () => {
  assertEquals(summarizeAgency(raw({ sources: [idle("jazzhr")] })).status, "not_connected");
});

Deno.test("a source that ran counts as connected even if not listed active", () => {
  const agency = summarizeAgency(raw({ sources: [source({ source: "learndash", active: false })] }));
  assertEquals(agency.status, "ok");
  assertEquals(agency.connections.map((item) => item.source), ["learndash"]);
});

Deno.test("failed sync needs attention", () => {
  const agency = summarizeAgency(raw({ sources: [source({ failedLastWindow: 3 })] }));
  assertEquals(agency.status, "attention");
  assertEquals(agency.failedSyncs, 3);
});

Deno.test("overdue training needs attention", () => {
  assertEquals(summarizeAgency(raw({ recurringOverdue: 1 })).status, "attention");
});

// ── Figures ──────────────────────────────────────────────────────────────────

Deno.test("training is null when nothing is tracked, so 0 overdue is never claimed", () => {
  assertEquals(summarizeAgency(raw({ trainingRecords: 0, recurringTotal: 0 })).training, null);
});

Deno.test("completed percent is null when only recurring rows exist", () => {
  assertEquals(summarizeAgency(raw({ trainingRecords: 0, trainingCompleted: 0 })).training?.completedPct, null);
});

Deno.test("completed percent rounds", () => {
  assertEquals(summarizeAgency(raw()).training?.completedPct, 75);
});

Deno.test("last sync is the newest success across sources", () => {
  const agency = summarizeAgency(raw({
    sources: [source(), source({ source: "wordpress", lastSuccessAt: "2026-11-03T10:00:00Z" })],
  }));
  assertEquals(agency.lastSyncAt, "2026-11-03T10:00:00Z");
});

Deno.test("totals add up and untracked agencies add nothing", () => {
  const totals = summarizeTotals([
    summarizeAgency(raw({ recurringOverdue: 2 })),
    summarizeAgency(raw({ employees: 1, employeesOnboarding: 0, trainingRecords: 0, recurringTotal: 0, recurringOverdue: 9 })),
  ], 4);
  assertEquals(totals, {
    agencies: 2,
    needingAttention: 2,
    employees: 11,
    employeesOnboarding: 2,
    recurringOverdue: 2,
    failedSyncs: 0,
    openAccessRequests: 4,
  });
});

Deno.test("summary carries no personal or payload fields", () => {
  const keys = Object.keys(summarizeAgency(raw()));
  assertEquals(keys.filter((key) => /email|first_name|last_name|payload/i.test(key)), []);
});
