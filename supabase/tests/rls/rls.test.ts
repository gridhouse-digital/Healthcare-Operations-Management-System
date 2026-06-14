/**
 * RLS Integration Test Suite — Phase 0 deliverable, extended in Phase 0.1
 * (rebased onto reconciled main / full prod schema).
 *
 * Source of truth: docs/architecture/homs-platform-expansion-implementation-spec.md §10
 * and docs/bmad/working-notes/2026-05-30-phase-0.1-rls-legacy-policy-remediation-handoff.md.
 *
 * Proves tenant isolation: data written under Tenant A is invisible to a
 * Tenant B authenticated session, and to an unauthenticated session — for
 * tenant-scoped TABLES, PHI-class STORAGE objects, and the recurring/training
 * compliance VIEWS; and proves the hardened functions are no longer callable
 * by anon/authenticated.
 *
 * Approach (spec §10, Option B): two real test tenants, each with an
 * authenticated user whose JWT app_metadata.tenant_id differs. Rows/objects are
 * seeded under each tenant via a service-role client (setup, RLS bypassed);
 * assertions are made through RLS-active clients.
 *
 * Coverage:
 *   TABLES (cross-tenant DENY + reciprocal + anon + positive control):
 *     people, applicants, offers, training_records,
 *     employee_compliance_instances, audit_log,
 *     ai_cache (input_hash-keyed)        [Phase 0.1 — migration 20260530000000]
 *     ai_logs  (id-keyed, legacy text tenant_id)  [Phase 0.1]
 *   OFFERS anon secure_token backdoor closed       [Phase 0.1]
 *   STORAGE resumes + compliance-documents (PHI)    [Phase 0.1]
 *   VIEWS  v_training_compliance, v_active_training_compliance,
 *          v_onboarding_training_compliance, v_recurring_compliance_status,
 *          v_recurring_compliance_audit              [Phase 0.1 — migration 20260530000001]
 *   FUNCTION GRANTS: anon/authenticated cannot RPC the revoked functions;
 *          service_role still can                    [Phase 0.1 — migration 20260530000002]
 *
 * RUN: requires a running Supabase (local `supabase start`, or a disposable
 * preview/staging project — never production). See README.md. The suite SKIPS
 * cleanly when connection env vars are absent.
 */

import { assertEquals } from "jsr:@std/assert";
import {
  type Harness,
  loadEnv,
  setupHarness,
  SKIP_MESSAGE,
} from "./_harness.ts";
import { type SeededIds, seedTenant } from "./_seed.ts";
import { findEmployeeMatch } from "../../functions/_shared/identity.ts";

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

/** Count rows visible to `client` in `relation` filtered by `col = id`. */
async function visibleCount(
  client: Harness["anon"],
  relation: string,
  col: string,
  id: string,
): Promise<number> {
  const { data, error } = await client.from(relation).select(col).eq(col, id);
  // RLS denial surfaces as zero rows, not an error. A real error (bad column,
  // missing relation) should fail the test loudly.
  if (error) throw new Error(`${relation} query error: ${error.message}`);
  return data?.length ?? 0;
}

/** True if `client` can download `path` from `bucket` (probes object bytes). */
async function canDownload(
  client: Harness["anon"],
  bucket: string,
  path: string,
): Promise<boolean> {
  const { data, error } = await client.storage.from(bucket).download(path);
  if (error || !data) return false;
  const buf = await data.arrayBuffer();
  return buf.byteLength > 0;
}

const wrap = { sanitizeOps: false, sanitizeResources: false };

// ===========================================================================
// 1. Cross-tenant isolation — id-keyed tables.
// ===========================================================================

const CASES: ReadonlyArray<{ table: string; idOf: (s: SeededIds) => string }> = [
  { table: "people", idOf: (s) => s.personId },
  { table: "applicants", idOf: (s) => s.applicantId },
  { table: "offers", idOf: (s) => s.offerId },
  { table: "training_records", idOf: (s) => s.trainingRecordId },
  { table: "employee_compliance_instances", idOf: (s) => s.complianceInstanceId },
  { table: "audit_log", idOf: (s) => s.auditLogId },
  // Phase 0.1: ai_logs is id-keyed (uuid PK) with a legacy text tenant_id.
  { table: "ai_logs", idOf: (s) => s.aiLogId },
];

for (const { table, idOf } of CASES) {
  Deno.test({
    name: `RLS: Tenant B cannot see Tenant A's ${table} row`,
    ignore: !env,
    ...wrap,
    fn: async () => {
      const { h, seedA } = await ensureSetup();
      assertEquals(
        await visibleCount(h.tenantB.client, table, "id", idOf(seedA)),
        0, `${table}: Tenant B leaked Tenant A's row`,
      );
    },
  });

  Deno.test({
    name: `RLS: Tenant A cannot see Tenant B's ${table} row`,
    ignore: !env,
    ...wrap,
    fn: async () => {
      const { h, seedB } = await ensureSetup();
      assertEquals(
        await visibleCount(h.tenantA.client, table, "id", idOf(seedB)),
        0, `${table}: Tenant A leaked Tenant B's row`,
      );
    },
  });

  Deno.test({
    name: `RLS: anonymous (no JWT) cannot see any ${table} row`,
    ignore: !env,
    ...wrap,
    fn: async () => {
      const { h, seedA, seedB } = await ensureSetup();
      assertEquals(await visibleCount(h.anon, table, "id", idOf(seedA)), 0,
        `${table}: anon leaked Tenant A's row`);
      assertEquals(await visibleCount(h.anon, table, "id", idOf(seedB)), 0,
        `${table}: anon leaked Tenant B's row`);
    },
  });

  Deno.test({
    name: `RLS positive control: Tenant A can see its own ${table} row`,
    ignore: !env,
    ...wrap,
    fn: async () => {
      const { h, seedA } = await ensureSetup();
      assertEquals(
        await visibleCount(h.tenantA.client, table, "id", idOf(seedA)),
        1, `${table}: Tenant A could not read its own row`,
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Phase 1 ID-5: cross-tenant identity reconciliation must NOT match across
// tenants. findEmployeeMatch is scoped by tenant_id; under an RLS-active client
// the other tenant's row is invisible, so the SAME normalized email in another
// tenant yields `none` (never a match, never a collision pointing at B's row).
// This is the merge-gate cross-tenant assertion required by the Phase 1 handoff.
// ---------------------------------------------------------------------------

Deno.test({
  name: "Phase1 ID-5: findEmployeeMatch does NOT match the same email across tenants (RLS-scoped)",
  ignore: !env,
  ...wrap,
  fn: async () => {
    const { h, seedB } = await ensureSetup();

    // applicant_id is a uuid column — a syntactically-valid but non-existent
    // UUID lets us exercise the email branch without an applicant_id match
    // (a non-uuid string would be rejected by Postgres as 22P02).
    const ABSENT_APPLICANT_ID = "00000000-0000-0000-0000-0000000000ff";

    // Tenant B's seeded employee email (created by seedTenant).
    const sharedEmail = `person-b-${h.runId}@example.test`;

    // (1) PURE cross-tenant non-match: Tenant A has NO row with this email.
    //     Reconciling as Tenant A must yield `none` — B's row is RLS-invisible,
    //     so no match and no collision pointing at B. This is the core ID-5 claim.
    const crossOnly = await findEmployeeMatch({
      client: h.tenantA.client,
      tenantId: h.tenantA.tenantId,
      applicantId: ABSENT_APPLICANT_ID,
      email: sharedEmail,
    });
    assertEquals(
      crossOnly.outcome,
      "none",
      "Tenant A must NOT match (or collide on) Tenant B's same-email row",
    );

    // (2) Positive control: give Tenant A its OWN row with the SAME normalized
    //     email. Reconciling as Tenant A now matches A's row only — never B's.
    await h.admin.from("people").insert({
      tenant_id: h.tenantA.tenantId,
      email: sharedEmail,
      first_name: "Shared",
      last_name: "EmailA",
      type: "employee",
    });

    const asA = await findEmployeeMatch({
      client: h.tenantA.client,
      tenantId: h.tenantA.tenantId,
      applicantId: ABSENT_APPLICANT_ID,
      email: sharedEmail,
    });
    assertEquals(asA.outcome, "matched", "Tenant A should match its OWN same-email row");
    if (asA.outcome === "matched") {
      assertEquals(asA.employee.tenant_id, h.tenantA.tenantId);
      assertEquals(
        asA.employee.id !== seedB.personId,
        true,
        "Tenant A's match must not be Tenant B's row",
      );
    }

    // Cleanup the extra row we inserted for this assertion.
    await h.admin
      .from("people")
      .delete()
      .eq("tenant_id", h.tenantA.tenantId)
      .eq("email", sharedEmail);
  },
});

// ---------------------------------------------------------------------------
// Phase 1 (Q5): identity_collisions is a NEW tenant-scoped table (migration
// 20260601000002). Prove its RLS isolates rows by tenant — Tenant B cannot read
// Tenant A's collision-ledger entries, anon sees none, and the owning tenant
// sees its own. Mirrors the id-keyed matrix above for the new table; seeded via
// the service-role client (RLS bypassed) and asserted through RLS-active clients.
// ---------------------------------------------------------------------------

Deno.test({
  name: "Phase1: identity_collisions is tenant-isolated (B cannot see A; anon none; A sees own)",
  ignore: !env,
  ...wrap,
  fn: async () => {
    const { h } = await ensureSetup();

    const mkRow = (tenantId: string, tag: string) => ({
      tenant_id: tenantId,
      source: "convert-applicant",
      normalized_email: `collision-${tag}-${h.runId}@example.test`,
      reason_code: "multiple_email_matches",
      candidate_ids: [],
      resolution_status: "unresolved",
    });

    const { data: rowA, error: errA } = await h.admin
      .from("identity_collisions").insert(mkRow(h.tenantA.tenantId, "a"))
      .select("id").single();
    if (errA) throw new Error(`seed A collision failed: ${errA.message}`);
    const { data: rowB, error: errB } = await h.admin
      .from("identity_collisions").insert(mkRow(h.tenantB.tenantId, "b"))
      .select("id").single();
    if (errB) throw new Error(`seed B collision failed: ${errB.message}`);

    const idA = rowA!.id as string;
    const idB = rowB!.id as string;

    try {
      // cross-tenant DENY (both directions)
      assertEquals(await visibleCount(h.tenantB.client, "identity_collisions", "id", idA), 0,
        "identity_collisions: Tenant B leaked Tenant A's row");
      assertEquals(await visibleCount(h.tenantA.client, "identity_collisions", "id", idB), 0,
        "identity_collisions: Tenant A leaked Tenant B's row");
      // anon sees nothing
      assertEquals(await visibleCount(h.anon, "identity_collisions", "id", idA), 0,
        "identity_collisions: anon leaked a row");
      // positive control: the owning tenant reads its own row
      assertEquals(await visibleCount(h.tenantA.client, "identity_collisions", "id", idA), 1,
        "identity_collisions: Tenant A could not read its own row");
    } finally {
      await h.admin.from("identity_collisions").delete().in("id", [idA, idB]);
    }
  },
});

// ===========================================================================
// 2. ai_cache — PK is input_hash (text), so the id-keyed matrix above does not
//    cover it. Legacy "Authenticated users can read cache" USING(true) dropped
//    by migration 20260530000000.
// ===========================================================================

Deno.test({
  name: "RLS: Tenant B cannot see Tenant A's ai_cache row",
  ignore: !env, ...wrap,
  fn: async () => {
    const { h, seedA } = await ensureSetup();
    assertEquals(
      await visibleCount(h.tenantB.client, "ai_cache", "input_hash", seedA.aiCacheHash),
      0, "ai_cache: Tenant B leaked Tenant A's row");
  },
});

Deno.test({
  name: "RLS: Tenant A cannot see Tenant B's ai_cache row",
  ignore: !env, ...wrap,
  fn: async () => {
    const { h, seedB } = await ensureSetup();
    assertEquals(
      await visibleCount(h.tenantA.client, "ai_cache", "input_hash", seedB.aiCacheHash),
      0, "ai_cache: Tenant A leaked Tenant B's row");
  },
});

Deno.test({
  name: "RLS: anonymous (no JWT) cannot see any ai_cache row",
  ignore: !env, ...wrap,
  fn: async () => {
    const { h, seedA, seedB } = await ensureSetup();
    assertEquals(await visibleCount(h.anon, "ai_cache", "input_hash", seedA.aiCacheHash), 0,
      "ai_cache: anon leaked Tenant A's row");
    assertEquals(await visibleCount(h.anon, "ai_cache", "input_hash", seedB.aiCacheHash), 0,
      "ai_cache: anon leaked Tenant B's row");
  },
});

Deno.test({
  name: "RLS positive control: Tenant A can see its own ai_cache row",
  ignore: !env, ...wrap,
  fn: async () => {
    const { h, seedA } = await ensureSetup();
    assertEquals(
      await visibleCount(h.tenantA.client, "ai_cache", "input_hash", seedA.aiCacheHash),
      1, "ai_cache: Tenant A could not read its own row");
  },
});

// ===========================================================================
// 3. offers anon secure_token backdoor (dropped by migration 20260530000000).
//    The legacy USING (secure_token IS NOT NULL) returned EVERY offer to any
//    unauthenticated caller. anon must now read 0 offers, even with a valid token.
// ===========================================================================

Deno.test({
  name: "RLS: anon blanket select of offers returns no rows (secure_token backdoor closed)",
  ignore: !env, ...wrap,
  fn: async () => {
    const { h } = await ensureSetup();
    const { data, error } = await h.anon.from("offers").select("id");
    if (error) throw new Error(`offers anon select error: ${error.message}`);
    assertEquals(data?.length ?? 0, 0,
      "anon could read offers without authentication — secure_token policy is a backdoor");
  },
});

Deno.test({
  name: "RLS: anon presenting a valid token still cannot read the offer",
  ignore: !env, ...wrap,
  fn: async () => {
    const { h, seedA } = await ensureSetup();
    const { data, error } = await h.anon
      .from("offers").select("id").eq("secure_token", seedA.offerSecureToken);
    if (error) throw new Error(`offers anon token select error: ${error.message}`);
    assertEquals(data?.length ?? 0, 0,
      "anon read an offer via secure_token — the anon SELECT backdoor is still open");
  },
});

// ===========================================================================
// 4. STORAGE (PHI) — cross-tenant object-DOWNLOAD deny on resumes +
//    compliance-documents, plus per-tenant positive control. Migration
//    20260530000000 replaced bare `TO authenticated` reads with tenant-scoped reads.
// ===========================================================================

const STORAGE_CASES: ReadonlyArray<{
  bucket: string;
  pathOf: (s: SeededIds) => string;
}> = [
  { bucket: "resumes", pathOf: (s) => s.resumeObjectPath },
  { bucket: "compliance-documents", pathOf: (s) => s.complianceObjectPath },
];

for (const { bucket, pathOf } of STORAGE_CASES) {
  Deno.test({
    name: `RLS storage: Tenant A cannot download Tenant B's ${bucket} object`,
    ignore: !env, ...wrap,
    fn: async () => {
      const { h, seedB } = await ensureSetup();
      assertEquals(await canDownload(h.tenantA.client, bucket, pathOf(seedB)), false,
        `${bucket}: Tenant A downloaded Tenant B's object (PHI leak)`);
    },
  });

  Deno.test({
    name: `RLS storage: Tenant B cannot download Tenant A's ${bucket} object`,
    ignore: !env, ...wrap,
    fn: async () => {
      const { h, seedA } = await ensureSetup();
      assertEquals(await canDownload(h.tenantB.client, bucket, pathOf(seedA)), false,
        `${bucket}: Tenant B downloaded Tenant A's object (PHI leak)`);
    },
  });

  Deno.test({
    name: `RLS storage: anon cannot download any ${bucket} object`,
    ignore: !env, ...wrap,
    fn: async () => {
      const { h, seedA, seedB } = await ensureSetup();
      assertEquals(await canDownload(h.anon, bucket, pathOf(seedA)), false,
        `${bucket}: anon downloaded Tenant A's object`);
      assertEquals(await canDownload(h.anon, bucket, pathOf(seedB)), false,
        `${bucket}: anon downloaded Tenant B's object`);
    },
  });

  Deno.test({
    name: `RLS storage positive control: Tenant A can download its own ${bucket} object`,
    ignore: !env, ...wrap,
    fn: async () => {
      const { h, seedA } = await ensureSetup();
      assertEquals(await canDownload(h.tenantA.client, bucket, pathOf(seedA)), true,
        `${bucket}: Tenant A could not download its own object`);
    },
  });
}

// ===========================================================================
// 5. VIEWS (migration 20260530000001 → security_invoker). With invoker
//    semantics, the querying user's RLS on the underlying tables applies, so a
//    tenant only sees its own rows through the view. Keyed on person_id (the
//    seed produces >=1 view row per tenant person). Cross-tenant must be 0;
//    own-tenant must be >=1 (positive control — proves dashboards still work).
// ===========================================================================

const VIEWS: ReadonlyArray<string> = [
  "v_training_compliance",
  "v_active_training_compliance",
  "v_onboarding_training_compliance",
  "v_recurring_compliance_status",
  "v_recurring_compliance_audit",
  // Onboarding completion gate (migration 20260612000001, security_invoker).
  "v_onboarding_gate",
];

for (const view of VIEWS) {
  Deno.test({
    name: `RLS view: Tenant B cannot see Tenant A's rows via ${view}`,
    ignore: !env, ...wrap,
    fn: async () => {
      const { h, seedA } = await ensureSetup();
      assertEquals(
        await visibleCount(h.tenantB.client, view, "person_id", seedA.personId),
        0, `${view}: Tenant B saw Tenant A's rows (SECURITY DEFINER view leak)`);
    },
  });

  Deno.test({
    name: `RLS view: anonymous (no JWT) cannot see any rows via ${view}`,
    ignore: !env, ...wrap,
    fn: async () => {
      const { h, seedA, seedB } = await ensureSetup();
      assertEquals(await visibleCount(h.anon, view, "person_id", seedA.personId), 0,
        `${view}: anon saw Tenant A's rows`);
      assertEquals(await visibleCount(h.anon, view, "person_id", seedB.personId), 0,
        `${view}: anon saw Tenant B's rows`);
    },
  });

  // Dashboard-safety positive control: the owning tenant STILL reads its own
  // rows through the view after the security_invoker flip. >=1 (a view may emit
  // multiple rows per person).
  Deno.test({
    name: `RLS view dashboard-safety: Tenant A still sees its own rows via ${view}`,
    ignore: !env, ...wrap,
    fn: async () => {
      const { h, seedA } = await ensureSetup();
      const { data, error } = await h.tenantA.client
        .from(view).select("person_id").eq("person_id", seedA.personId);
      if (error) throw new Error(`${view} own-tenant read error: ${error.message}`);
      if ((data?.length ?? 0) < 1) {
        throw new Error(`${view}: Tenant A lost access to its own dashboard rows`);
      }
    },
  });
}

// ===========================================================================
// 5b. v_onboarding_gate CONTRACT (revision §8.2): two department onboarding
//     groups are flagged, each with its own courses and one recurring course.
//     A person enrolled only in Department A sees A's non-recurring courses
//     only, never Department B's; a person enrolled in B sees B's courses.
//     Missing records still surface as not_started.
// ===========================================================================

Deno.test({
  name: "GATE contract: two departments gate by enrolled onboarding group only",
  ignore: !env, ...wrap,
  fn: async () => {
    const { h, seedA } = await ensureSetup();

    const { data: rowsAData, error: errorA } = await h.tenantA.client
      .from("v_onboarding_gate")
      .select("course_id, effective_status, has_record")
      .eq("person_id", seedA.personId)
      .order("course_id");
    if (errorA) throw new Error(`v_onboarding_gate A read error: ${errorA.message}`);

    const rowsA = (rowsAData ?? []) as Array<{
      course_id: string;
      effective_status: string;
      has_record: boolean;
    }>;
    assertEquals(
      rowsA.map((r) => r.course_id),
      seedA.gateCourseIdsA.slice(0, 2),
      "person in Department A must see only A's non-recurring courses",
    );
    for (const courseId of seedA.gateCourseIdsB) {
      assertEquals(
        rowsA.some((r) => r.course_id === courseId),
        false,
        `person in Department A must never see Department B course ${courseId}`,
      );
    }

    const completedA = rowsA.filter((r) => r.effective_status === "completed");
    const notStartedA = rowsA.filter((r) => r.effective_status === "not_started");
    assertEquals(completedA.length, 1, "exactly one Department A gate course is completed");
    assertEquals(notStartedA.length, 1,
      "Department A course with NO training record must surface as not_started");
    for (const r of notStartedA) {
      assertEquals(r.has_record, false,
        `${r.course_id}: not_started row must come from a MISSING record`);
    }
    for (const r of completedA) {
      assertEquals(r.has_record, true,
        `${r.course_id}: completed row must be backed by a training record`);
    }

    const { data: rowsBData, error: errorB } = await h.tenantA.client
      .from("v_onboarding_gate")
      .select("course_id, effective_status, has_record")
      .eq("person_id", seedA.gatePersonBId)
      .order("course_id");
    if (errorB) throw new Error(`v_onboarding_gate B read error: ${errorB.message}`);

    const rowsB = (rowsBData ?? []) as Array<{ course_id: string }>;
    assertEquals(
      rowsB.map((r) => r.course_id),
      seedA.gateCourseIdsB.slice(0, 2),
      "person in Department B must see only B's non-recurring courses",
    );
    for (const courseId of seedA.gateCourseIdsA) {
      assertEquals(
        rowsB.some((r) => r.course_id === courseId),
        false,
        `person in Department B must never see Department A course ${courseId}`,
      );
    }
  },
});

// ===========================================================================
// 6. FUNCTION GRANTS (migration 20260530000002). The revoked functions must no
//    longer be callable by anon/authenticated via RPC (PostgREST returns an
//    error — permission denied or not-in-schema-cache). service_role retains
//    EXECUTE on the pgcrypto wrappers.
// ===========================================================================

async function rpcErrors(
  client: Harness["anon"],
  fn: string,
  args: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await client.rpc(fn, args);
  return error !== null && error !== undefined;
}

Deno.test({
  name: "GRANTS: anon cannot RPC pgp_sym_decrypt_text",
  ignore: !env, ...wrap,
  fn: async () => {
    const { h } = await ensureSetup();
    assertEquals(
      await rpcErrors(h.anon, "pgp_sym_decrypt_text", { ciphertext: "x", passphrase: "y" }),
      true, "anon could still RPC pgp_sym_decrypt_text");
  },
});

Deno.test({
  name: "GRANTS: anon + authenticated cannot RPC pgp_sym_encrypt_text",
  ignore: !env, ...wrap,
  fn: async () => {
    const { h } = await ensureSetup();
    assertEquals(
      await rpcErrors(h.anon, "pgp_sym_encrypt_text", { plaintext: "x", passphrase: "y" }),
      true, "anon could still RPC pgp_sym_encrypt_text");
    assertEquals(
      await rpcErrors(h.tenantA.client, "pgp_sym_encrypt_text", { plaintext: "x", passphrase: "y" }),
      true, "authenticated could still RPC pgp_sym_encrypt_text");
  },
});

Deno.test({
  name: "GRANTS: anon + authenticated cannot RPC audit trigger functions",
  ignore: !env, ...wrap,
  fn: async () => {
    const { h } = await ensureSetup();
    assertEquals(await rpcErrors(h.anon, "audit_people", {}), true,
      "anon could still RPC audit_people");
    assertEquals(await rpcErrors(h.tenantA.client, "audit_offers", {}), true,
      "authenticated could still RPC audit_offers");
  },
});

Deno.test({
  name: "GRANTS positive control: service_role can still RPC pgp_sym_encrypt_text",
  ignore: !env, ...wrap,
  fn: async () => {
    const { h } = await ensureSetup();
    const { error } = await h.admin.rpc("pgp_sym_encrypt_text", {
      plaintext: "rls-test", passphrase: "rls-test",
    });
    if (error) {
      throw new Error(`service_role lost EXECUTE on pgp_sym_encrypt_text: ${error.message}`);
    }
  },
});

// ===========================================================================
// Teardown — remove storage objects (the harness handles tables/users/tenants).
// ===========================================================================

Deno.test({
  name: "RLS: teardown (remove storage objects, then tenants, users, and seeded rows)",
  ignore: !env, ...wrap,
  fn: async () => {
    if (h) {
      if (seedA && seedB) {
        await h.admin.storage.from("resumes")
          .remove([seedA.resumeObjectPath, seedB.resumeObjectPath]);
        await h.admin.storage.from("compliance-documents")
          .remove([seedA.complianceObjectPath, seedB.complianceObjectPath]);
      }
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
