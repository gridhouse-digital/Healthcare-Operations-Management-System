import { assertEquals } from "jsr:@std/assert";
import {
  decidePlatformAccess,
  sortByAttention,
  summarizeAgency,
  summarizeTotals,
  SYNC_ERROR_FILTER,
  SYNC_SOURCES,
  type RawAgencyCounts,
  type SourceCounts,
} from "../platform-overview.ts";

const NOW = new Date("2026-11-02T10:00:00Z");
const summarize = (input: RawAgencyCounts) => summarizeAgency(input, NOW);

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
  assertEquals(summarize(raw()).status, "ok");
});

Deno.test("empty agency is no_data, not zero and not healthy", () => {
  const agency = summarize(raw({
    employees: 0, employeesActive: 0, employeesOnboarding: 0, applicants: 0,
    trainingRecords: 0, trainingCompleted: 0, trainingInProgress: 0, recurringTotal: 0,
    sources: SYNC_SOURCES.map(idle),
  }));
  assertEquals(agency.status, "no_data");
  assertEquals(agency.training, null);
  assertEquals(agency.lastSyncAt, null);
});

Deno.test("connector saved but never synced is no_data, not healthy", () => {
  const agency = summarize(raw({
    employees: 0, employeesActive: 0, employeesOnboarding: 0, applicants: 0,
    trainingRecords: 0, trainingCompleted: 0, recurringTotal: 0,
    sources: [source({ lastSuccessAt: null, everRan: false })],
  }));
  assertEquals(agency.status, "no_data");
});

Deno.test("agency with staff but no connector is not_connected", () => {
  assertEquals(summarize(raw({ sources: [idle("jazzhr")] })).status, "not_connected");
});

Deno.test("a source that ran counts as connected even if not listed active", () => {
  const agency = summarize(raw({ sources: [source({ source: "learndash", active: false })] }));
  assertEquals(agency.status, "ok");
  assertEquals(agency.connections.map((item) => item.source), ["learndash"]);
});

Deno.test("failed sync needs attention", () => {
  const agency = summarize(raw({ sources: [source({ failedLastWindow: 3 })] }));
  assertEquals(agency.status, "attention");
  assertEquals(agency.failedSyncs, 3);
});

Deno.test("overdue training outranks a missing connection", () => {
  const agency = summarize(raw({ recurringOverdue: 2, sources: [idle("jazzhr")] }));
  assertEquals(agency.status, "attention");
  assertEquals(summarizeTotals([agency], 0).needingAttention, 1);
});

Deno.test("sync error filter covers partial failures and per-record errors", () => {
  for (const term of ["failed", "partial_failure", "completed_with_errors", "error_count.gt.0"]) {
    assertEquals(SYNC_ERROR_FILTER.includes(term), true, term);
  }
});

Deno.test("overdue training needs attention", () => {
  assertEquals(summarize(raw({ recurringOverdue: 1 })).status, "attention");
});

// ── Figures ──────────────────────────────────────────────────────────────────

Deno.test("training is null when nothing is tracked, so 0 overdue is never claimed", () => {
  assertEquals(summarize(raw({ trainingRecords: 0, recurringTotal: 0 })).training, null);
});

Deno.test("completed percent is null when only recurring rows exist", () => {
  assertEquals(summarize(raw({ trainingRecords: 0, trainingCompleted: 0 })).training?.completedPct, null);
});

Deno.test("completed percent rounds", () => {
  assertEquals(summarize(raw({ trainingRecords: 3, trainingCompleted: 2 })).training?.completedPct, 67);
});

Deno.test("last sync is the newest success across sources", () => {
  const agency = summarize(raw({
    sources: [source({ source: "wordpress", lastSuccessAt: "2026-11-03T10:00:00Z" }), source()],
  }));
  assertEquals(agency.lastSyncAt, "2026-11-03T10:00:00Z");
});

Deno.test("totals add up and untracked agencies add nothing", () => {
  const totals = summarizeTotals([
    summarize(raw({ recurringOverdue: 2 })),
    summarize(raw({ employees: 1, employeesOnboarding: 0, trainingRecords: 0, recurringTotal: 0, recurringOverdue: 9 })),
  ], 4);
  assertEquals(totals, {
    agencies: 2,
    needingAttention: 2,
    suspended: 0,
    employees: 11,
    employeesOnboarding: 2,
    recurringOverdue: 2,
    failedSyncs: 0,
    openAccessRequests: 4,
  });
});

Deno.test("a connector with no success for 48 hours is stale and needs attention", () => {
  const agency = summarize(raw({ sources: [source({ lastSuccessAt: "2026-10-30T09:59:00Z" })] }));
  assertEquals(agency.connections[0].stale, true);
  assertEquals(agency.status, "attention");
  assertEquals(agency.attentionReasons, ["1 stale sync"]);
});

Deno.test("a connector inside 48 hours is not stale", () => {
  const agency = summarize(raw({ sources: [source({ lastSuccessAt: "2026-10-31T10:01:00Z" })] }));
  assertEquals(agency.connections[0].stale, false);
  assertEquals(agency.status, "ok");
});

Deno.test("a connector that has never succeeded is not called stale", () => {
  assertEquals(summarize(raw({ sources: [source({ lastSuccessAt: null })] })).connections[0].stale, false);
});

Deno.test("reasons explain the status, most urgent first", () => {
  const agency = summarize(raw({ recurringOverdue: 6, sources: [source({ failedLastWindow: 1 })] }));
  assertEquals(agency.attentionReasons, ["6 overdue renewals", "1 sync error"]);
});

Deno.test("a healthy agency has no reasons", () => {
  assertEquals(summarize(raw()).attentionReasons, []);
});

Deno.test("agencies needing attention sort first and ties keep their order", () => {
  const a = summarize(raw({ id: "a" }));
  const b = summarize(raw({ id: "b", recurringOverdue: 1 }));
  const c = summarize(raw({ id: "c" }));
  assertEquals(sortByAttention([a, b, c]).map((agency) => agency.id), ["b", "a", "c"]);
});

Deno.test("a suspended agency shows as suspended with no attention reasons", () => {
  const agency = summarize(raw({
    tenantStatus: "suspended",
    statusReason: "Unpaid invoices",
    statusChangedAt: "2026-11-01T00:00:00Z",
    recurringOverdue: 3,
    sources: [source({ lastSuccessAt: "2026-01-01T00:00:00Z" })],
  }));
  assertEquals(agency.status, "suspended");
  assertEquals(agency.attentionReasons, []);
  assertEquals(agency.suspension, { reason: "Unpaid invoices", since: "2026-11-01T00:00:00Z" });
  assertEquals(summarizeTotals([agency], 0).suspended, 1);
  assertEquals(summarizeTotals([agency], 0).needingAttention, 0);
});

Deno.test("an active agency has no suspension", () => {
  assertEquals(summarize(raw()).suspension, null);
});

Deno.test("suspended agencies sort last", () => {
  const off = summarize(raw({ id: "off", tenantStatus: "suspended" }));
  const ok = summarize(raw({ id: "ok" }));
  const urgent = summarize(raw({ id: "urgent", recurringOverdue: 1 }));
  assertEquals(sortByAttention([off, ok, urgent]).map((agency) => agency.id), ["urgent", "ok", "off"]);
});

Deno.test("failed syncs add up across agencies", () => {
  const totals = summarizeTotals([
    summarize(raw({ sources: [source({ failedLastWindow: 2 })] })),
    summarize(raw({ sources: [source({ failedLastWindow: 1 })] })),
  ], 0);
  assertEquals(totals.failedSyncs, 3);
});

Deno.test("overdue total is unknown when no agency tracks training", () => {
  const untracked = summarize(raw({ trainingRecords: 0, recurringTotal: 0 }));
  assertEquals(summarizeTotals([untracked], 0).recurringOverdue, null);
});

Deno.test("overdue total stays zero when tracked agencies have none overdue", () => {
  assertEquals(summarizeTotals([summarize(raw())], 0).recurringOverdue, 0);
});

function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => [key, ...allKeys(child)]);
  }
  return [];
}

Deno.test("summary carries no personal or payload fields at any depth", () => {
  const sensitive = { ...source(), email: "a@example.test", payload: { first_name: "A" } };
  const keys = allKeys(summarize(raw({ sources: [sensitive] })));
  assertEquals(keys.filter((key) => /email|first_name|last_name|payload/i.test(key)), []);
});
