/**
 * RLS Integration Test Suite — Phase 0 deliverable.
 *
 * Source of truth: docs/architecture/homs-platform-expansion-implementation-spec.md §10.
 *
 * Proves tenant isolation: data written under Tenant A is invisible to a
 * Tenant B authenticated session, and to an unauthenticated session.
 *
 * Approach (spec §10, Option B): two real test tenants, each with an
 * authenticated user whose JWT app_metadata.tenant_id differs. Rows are seeded
 * under each tenant via a service-role client; assertions are made through
 * RLS-active clients.
 *
 * Test matrix (spec §10):
 *   - A inserts employee (people),   B queries people                  → 0 rows
 *   - A inserts applicant,           B queries applicants              → 0 rows
 *   - A inserts training record,     B queries training_records        → 0 rows
 *   - A inserts offer,               B queries offers                  → 0 rows
 *   - A inserts compliance instance, B queries compliance instances    → 0 rows
 *   - A inserts audit log,           B queries audit_log               → 0 rows
 *   - Anonymous (no JWT) queries any table                             → 0 rows
 *
 * Plus the reciprocal direction (B's data invisible to A) and a positive
 * control (each tenant CAN see its own row) so a globally-broken RLS policy
 * that hides everything cannot pass as a false green.
 *
 * RUN: requires a running Supabase (local `supabase start`, or a disposable
 * staging project — never production). See README.md. The suite SKIPS cleanly
 * when connection env vars are absent.
 */

import { assertEquals } from "jsr:@std/assert";
import {
  type Harness,
  loadEnv,
  setupHarness,
  SKIP_MESSAGE,
} from "./_harness.ts";
import { type SeededIds, seedTenant } from "./_seed.ts";

const env = loadEnv();

// ---------------------------------------------------------------------------
// Shared state — provisioned once, reused across the matrix.
// ---------------------------------------------------------------------------

let h: Harness | undefined;
let seedA: SeededIds | undefined;
let seedB: SeededIds | undefined;

async function ensureSetup(): Promise<{
  h: Harness;
  seedA: SeededIds;
  seedB: SeededIds;
}> {
  if (!env) throw new Error("ensureSetup called without env");
  if (!h) {
    h = await setupHarness(env);
    seedA = await seedTenant(
      h.admin, h.tenantA.tenantId, h.tenantA.userId, h.runId, "a",
    );
    seedB = await seedTenant(
      h.admin, h.tenantB.tenantId, h.tenantB.userId, h.runId, "b",
    );
  }
  return { h: h!, seedA: seedA!, seedB: seedB! };
}

/** Count rows visible to `client` in `table` filtered by `idColumn = id`. */
async function visibleCount(
  client: Harness["anon"],
  table: string,
  idColumn: string,
  id: string,
): Promise<number> {
  const { data, error } = await client
    .from(table)
    .select(idColumn)
    .eq(idColumn, id);
  // RLS denial surfaces as zero rows, not an error. A real error (bad column,
  // missing table) should fail the test loudly.
  if (error) throw new Error(`${table} query error: ${error.message}`);
  return data?.length ?? 0;
}

const wrap = { sanitizeOps: false, sanitizeResources: false };

// ---------------------------------------------------------------------------
// Cross-tenant isolation — Tenant A's rows must be invisible to Tenant B.
// ---------------------------------------------------------------------------

const CASES: ReadonlyArray<{ table: string; idOf: (s: SeededIds) => string }> = [
  { table: "people", idOf: (s) => s.personId },
  { table: "applicants", idOf: (s) => s.applicantId },
  { table: "offers", idOf: (s) => s.offerId },
  { table: "training_records", idOf: (s) => s.trainingRecordId },
  { table: "employee_compliance_instances", idOf: (s) => s.complianceInstanceId },
  { table: "audit_log", idOf: (s) => s.auditLogId },
];

for (const { table, idOf } of CASES) {
  Deno.test({
    name: `RLS: Tenant B cannot see Tenant A's ${table} row`,
    ignore: !env,
    ...wrap,
    fn: async () => {
      const { h, seedA } = await ensureSetup();
      const count = await visibleCount(
        h.tenantB.client, table, "id", idOf(seedA),
      );
      assertEquals(count, 0, `${table}: Tenant B leaked Tenant A's row`);
    },
  });

  Deno.test({
    name: `RLS: Tenant A cannot see Tenant B's ${table} row`,
    ignore: !env,
    ...wrap,
    fn: async () => {
      const { h, seedB } = await ensureSetup();
      const count = await visibleCount(
        h.tenantA.client, table, "id", idOf(seedB),
      );
      assertEquals(count, 0, `${table}: Tenant A leaked Tenant B's row`);
    },
  });

  Deno.test({
    name: `RLS: anonymous (no JWT) cannot see any ${table} row`,
    ignore: !env,
    ...wrap,
    fn: async () => {
      const { h, seedA, seedB } = await ensureSetup();
      const a = await visibleCount(h.anon, table, "id", idOf(seedA));
      const b = await visibleCount(h.anon, table, "id", idOf(seedB));
      assertEquals(a, 0, `${table}: anon leaked Tenant A's row`);
      assertEquals(b, 0, `${table}: anon leaked Tenant B's row`);
    },
  });

  // Positive control: a tenant CAN read its own row. Guards against a policy
  // that denies everything (which would make the isolation tests vacuously
  // pass). audit_log is readable by its owning tenant per its select policy.
  Deno.test({
    name: `RLS positive control: Tenant A can see its own ${table} row`,
    ignore: !env,
    ...wrap,
    fn: async () => {
      const { h, seedA } = await ensureSetup();
      const count = await visibleCount(
        h.tenantA.client, table, "id", idOf(seedA),
      );
      assertEquals(count, 1, `${table}: Tenant A could not read its own row`);
    },
  });
}

// ---------------------------------------------------------------------------
// Teardown — runs after the matrix. Removes every row/user this suite created.
// ---------------------------------------------------------------------------

Deno.test({
  name: "RLS: teardown (remove test tenants, users, and seeded rows)",
  ignore: !env,
  ...wrap,
  fn: async () => {
    if (h) {
      await h.teardown();
      h = undefined;
      seedA = undefined;
      seedB = undefined;
    }
  },
});

// ---------------------------------------------------------------------------
// Visibility: emit the skip reason once when env is absent.
// ---------------------------------------------------------------------------

if (!env) {
  Deno.test("RLS suite skipped (no database connection configured)", () => {
    console.warn(`\n${SKIP_MESSAGE}\n`);
  });
}
