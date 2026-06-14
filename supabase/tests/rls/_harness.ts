/**
 * RLS test harness (Phase 0 deliverable — implementation spec §10).
 *
 * Provides:
 *   - env loading + validation (URL, anon key, service-role key)
 *   - service-role admin client (bypasses RLS — used for setup/teardown only)
 *   - creation of two isolated test tenants, each with one authenticated user
 *     whose JWT carries `app_metadata.tenant_id` + `role`
 *   - per-tenant anon clients authenticated AS that tenant's user (RLS active)
 *   - an anonymous (no-JWT) client for the unauthenticated-access assertions
 *   - full teardown of everything this harness created
 *
 * This file is TEST-ONLY infrastructure. It does not import or modify any
 * application/business logic. It exercises the live database's RLS policies
 * exactly as a real client would.
 *
 * REQUIRES a running Supabase project (local `supabase start`, or a disposable
 * remote/staging project — NEVER production). All test data is namespaced with
 * a unique run id and removed in teardown.
 */

import {
  createClient,
  type SupabaseClient,
  type User,
} from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

export interface RlsEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

/**
 * Reads connection details from the environment. Returns null (rather than
 * throwing) when the required vars are absent, so the test file can SKIP
 * gracefully on machines/CI that have not provisioned a database.
 */
export function loadEnv(): RlsEnv | null {
  const url =
    Deno.env.get("SUPABASE_URL") ?? Deno.env.get("RLS_TEST_SUPABASE_URL");
  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("RLS_TEST_SUPABASE_ANON_KEY");
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("RLS_TEST_SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !anonKey || !serviceRoleKey) return null;
  return { url, anonKey, serviceRoleKey };
}

export const SKIP_MESSAGE =
  "RLS tests skipped: set SUPABASE_URL, SUPABASE_ANON_KEY and " +
  "SUPABASE_SERVICE_ROLE_KEY (pointing at a local or disposable Supabase " +
  "project — never production). See supabase/tests/rls/README.md.";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestTenant {
  /** tenants.id */
  tenantId: string;
  /** auth.users.id of this tenant's test user */
  userId: string;
  email: string;
  password: string;
  /** Supabase client authenticated AS this tenant's user — RLS is ACTIVE. */
  client: SupabaseClient;
}

export interface Harness {
  admin: SupabaseClient;
  /** No JWT at all — represents an unauthenticated caller. RLS active. */
  anon: SupabaseClient;
  tenantA: TestTenant;
  tenantB: TestTenant;
  runId: string;
  teardown: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function adminClient(env: RlsEnv): SupabaseClient {
  return createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createTenant(
  admin: SupabaseClient,
  env: RlsEnv,
  runId: string,
  label: string,
): Promise<TestTenant> {
  // 1. tenant row (service-role bypasses RLS)
  const slug = `rls-test-${label}-${runId}`;
  const { data: tenant, error: tenantErr } = await admin
    .from("tenants")
    .insert({ name: `RLS Test ${label} ${runId}`, slug })
    .select("id")
    .single();
  if (tenantErr || !tenant) {
    throw new Error(`createTenant(${label}): ${tenantErr?.message}`);
  }
  const tenantId = tenant.id as string;

  // 2. auth user with tenant_id + role baked into app_metadata (the ONLY
  //    place tenant_id is ever trusted from — mirrors tenant-guard.ts).
  const email = `rls-test-${label}-${runId}@example.test`;
  const password = `Pw-${runId}-${label}-9!`;
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { tenant_id: tenantId, role: "hr_admin" },
  });
  if (userErr || !created.user) {
    throw new Error(`createTenant(${label}) user: ${userErr?.message}`);
  }
  const user: User = created.user;

  // 3. a client signed in as this user — its requests carry the user JWT, so
  //    RLS policies evaluate against this tenant_id.
  const client = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) {
    throw new Error(`createTenant(${label}) signIn: ${signInErr.message}`);
  }

  return { tenantId, userId: user.id, email, password, client };
}

/**
 * Provisions two isolated tenants (A and B), each with an authenticated user,
 * plus an anonymous client. Returns a Harness with a teardown() that removes
 * everything created here.
 */
export async function setupHarness(env: RlsEnv): Promise<Harness> {
  const runId = crypto.randomUUID().slice(0, 8);
  const admin = adminClient(env);
  const anon = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tenantA = await createTenant(admin, env, runId, "a");
  const tenantB = await createTenant(admin, env, runId, "b");

  const teardown = async () => {
    // Children first (FKs), then tenants, then users. Service role bypasses RLS.
    for (const t of [tenantA, tenantB]) {
      // Phase 0.1 leak tables (ai_logs.tenant_id is legacy TEXT — eq() coerces).
      await admin.from("ai_logs").delete().eq("tenant_id", t.tenantId);
      await admin.from("ai_cache").delete().eq("tenant_id", t.tenantId);
      await admin.from("audit_log").delete().eq("tenant_id", t.tenantId);
      await admin.from("employee_compliance_instances")
        .delete().eq("tenant_id", t.tenantId);
      await admin.from("training_compliance_rules")
        .delete().eq("tenant_id", t.tenantId);
      // Onboarding-gate chain (migration 20260613000001 — seeded for the
      // v_onboarding_gate per-department assertions). Children of people/tenants.
      await admin.from("employee_group_enrollments")
        .delete().eq("tenant_id", t.tenantId);
      await admin.from("learndash_group_courses")
        .delete().eq("tenant_id", t.tenantId);
      await admin.from("tenant_settings").delete().eq("tenant_id", t.tenantId);
      await admin.from("training_courses").delete().eq("tenant_id", t.tenantId);
      await admin.from("training_records").delete().eq("tenant_id", t.tenantId);
      await admin.from("offers").delete().eq("tenant_id", t.tenantId);
      await admin.from("applicants").delete().eq("tenant_id", t.tenantId);
      await admin.from("people").delete().eq("tenant_id", t.tenantId);
    }
    await admin.from("tenants").delete().eq("id", tenantA.tenantId);
    await admin.from("tenants").delete().eq("id", tenantB.tenantId);
    await admin.auth.admin.deleteUser(tenantA.userId);
    await admin.auth.admin.deleteUser(tenantB.userId);
    await tenantA.client.auth.signOut();
    await tenantB.client.auth.signOut();
  };

  return { admin, anon, tenantA, tenantB, runId, teardown };
}
