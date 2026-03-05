/**
 * seed-rls-test-tenants.ts
 *
 * One-shot helper for Story 1.6 RLS isolation test.
 * Creates two test tenants + auth users, then prints the env var exports
 * needed to run scripts/test-rls-isolation.ts.
 *
 * Usage:
 *   SUPABASE_ANON_KEY=<anon> SUPABASE_SERVICE_ROLE_KEY=<service> \
 *     deno run --allow-env --allow-net scripts/seed-rls-test-tenants.ts
 *
 * Then copy the printed `export ...` lines into your shell and run:
 *   deno run --allow-env --allow-net scripts/test-rls-isolation.ts
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://localhost:54321";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!ANON_KEY || !SERVICE_KEY) {
  console.error(
    "Missing SUPABASE_ANON_KEY and/or SUPABASE_SERVICE_ROLE_KEY.\n" +
    "Run: npx supabase status   (in prolific-hr-app/) to get the local keys.",
  );
  Deno.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TENANT_A_ID = "aaaaaaaa-0001-0001-0001-000000000001";
const TENANT_B_ID = "bbbbbbbb-0002-0002-0002-000000000002";
const TENANT_A_EMAIL = "rls-test-tenant-a@prolific-test.internal";
const TENANT_B_EMAIL = "rls-test-tenant-b@prolific-test.internal";
const TEST_PASSWORD = "RlsTestPass!2026";

console.log("Seeding tenants...");

const { error: tenantErr } = await admin.from("tenants").upsert([
  { id: TENANT_A_ID, name: "RLS Test Tenant A", slug: "rls-test-tenant-a" },
  { id: TENANT_B_ID, name: "RLS Test Tenant B", slug: "rls-test-tenant-b" },
], { onConflict: "id" });

if (tenantErr) {
  console.error("Failed to upsert tenants:", tenantErr.message);
  Deno.exit(1);
}

async function upsertAuthUser(email: string, tenantId: string): Promise<string> {
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users.find((u) => u.email === email);

  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      app_metadata: { tenant_id: tenantId, role: "hr_admin" },
    });
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    app_metadata: { tenant_id: tenantId, role: "hr_admin" },
  });

  if (error || !data.user) {
    console.error("Failed to create user", email, error?.message);
    Deno.exit(1);
  }

  return data.user.id;
}

console.log("Creating auth users...");
const userAId = await upsertAuthUser(TENANT_A_EMAIL, TENANT_A_ID);
const userBId = await upsertAuthUser(TENANT_B_EMAIL, TENANT_B_ID);

await admin.from("tenant_users").upsert([
  { user_id: userAId, tenant_id: TENANT_A_ID, role: "hr_admin", status: "active" },
  { user_id: userBId, tenant_id: TENANT_B_ID, role: "hr_admin", status: "active" },
], { onConflict: "user_id,tenant_id" });

console.log("Signing in to mint JWTs...");

const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: sessionA, error: signInAErr } = await anonClient.auth.signInWithPassword({
  email: TENANT_A_EMAIL,
  password: TEST_PASSWORD,
});

if (signInAErr || !sessionA.session) {
  console.error("Sign-in failed for Tenant A:", signInAErr?.message);
  Deno.exit(1);
}

const { data: sessionB, error: signInBErr } = await anonClient.auth.signInWithPassword({
  email: TENANT_B_EMAIL,
  password: TEST_PASSWORD,
});

if (signInBErr || !sessionB.session) {
  console.error("Sign-in failed for Tenant B:", signInBErr?.message);
  Deno.exit(1);
}

console.log("\nDone. Copy these exports into your shell, then run the isolation test:\n");
console.log(`export SUPABASE_URL="${SUPABASE_URL}"`);
console.log(`export SUPABASE_ANON_KEY="${ANON_KEY}"`);
console.log(`export SUPABASE_SERVICE_ROLE_KEY="${SERVICE_KEY}"`);
console.log(`export TENANT_A_ID="${TENANT_A_ID}"`);
console.log(`export TENANT_B_ID="${TENANT_B_ID}"`);
console.log(`export TENANT_A_JWT="${sessionA.session.access_token}"`);
console.log(`export TENANT_B_JWT="${sessionB.session.access_token}"`);
console.log(`\n# Then run:`);
console.log(`# deno run --allow-env --allow-net scripts/test-rls-isolation.ts`);
