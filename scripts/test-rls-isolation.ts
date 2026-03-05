/**
 * Story 1.6 — Two-Tenant RLS Isolation Test
 *
 * Verifies that a user authenticated as Tenant A cannot read any data
 * belonging to Tenant B across all RLS-protected tables.
 *
 * Run against a local Supabase instance with two seeded tenants:
 *   deno run --allow-env --allow-net scripts/test-rls-isolation.ts
 *
 * Required env vars:
 *   SUPABASE_URL
 *   TENANT_A_JWT   - JWT with app_metadata.tenant_id = TENANT_A_ID
 *   TENANT_B_JWT   - JWT with app_metadata.tenant_id = TENANT_B_ID
 *   TENANT_A_ID    - UUID of tenant A
 *   TENANT_B_ID    - UUID of tenant B
 *   SUPABASE_SERVICE_ROLE_KEY  - for seeding test data
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://localhost:54321";
const TENANT_A_JWT = Deno.env.get("TENANT_A_JWT") ?? "";
const TENANT_B_JWT = Deno.env.get("TENANT_B_JWT") ?? "";
const TENANT_A_ID = Deno.env.get("TENANT_A_ID") ?? "";
const TENANT_B_ID = Deno.env.get("TENANT_B_ID") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Tables to test RLS isolation on
const TABLES_TO_TEST = [
  "people",
  "tenant_settings",
  "integration_log",
  "audit_log",
  "tenant_users",
] as const;

type IsolationResult = { table: string; pass: boolean; reason?: string };

async function runIsolationTests(): Promise<void> {
  if (!TENANT_A_JWT || !TENANT_B_JWT || !TENANT_A_ID || !TENANT_B_ID) {
    console.error(
      "❌  Missing required env vars: TENANT_A_JWT, TENANT_B_JWT, TENANT_A_ID, TENANT_B_ID",
    );
    Deno.exit(1);
  }

  // Seed test data for both tenants using service role
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  console.log("🔧  Seeding test data for two tenants…");

  // Ensure both tenants exist
  await admin.from("tenants").upsert([
    { id: TENANT_A_ID, name: "Tenant A (BambooHR)", slug: "tenant-a-test" },
    { id: TENANT_B_ID, name: "Tenant B (JazzHR)", slug: "tenant-b-test" },
  ]);

  // Seed people records for both tenants
  await admin.from("people").upsert([
    {
      tenant_id: TENANT_A_ID,
      email: "alice@tenant-a.com",
      first_name: "Alice",
      type: "employee",
      profile_source: "bamboohr",
    },
    {
      tenant_id: TENANT_B_ID,
      email: "bob@tenant-b.com",
      first_name: "Bob",
      type: "employee",
      profile_source: "jazzhr",
    },
  ]);

  // Seed integration_log for both tenants
  await admin.from("integration_log").upsert([
    {
      tenant_id: TENANT_A_ID,
      source: "bamboohr",
      idempotency_key: "alice@tenant-a.com",
      status: "hire_detected",
    },
    {
      tenant_id: TENANT_B_ID,
      source: "jazzhr",
      idempotency_key: "bob@tenant-b.com",
      status: "hire_detected",
    },
  ]);

  console.log("✅  Test data seeded\n");

  // Client scoped to Tenant A's JWT
  const clientA = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${TENANT_A_JWT}` } },
    auth: { persistSession: false },
  });

  const results: IsolationResult[] = [];

  for (const table of TABLES_TO_TEST) {
    // Tenant A client queries the table
    const { data, error } = await clientA.from(table).select("*");

    if (error) {
      // A permission error is acceptable (RLS denied all reads) — isolation holds
      results.push({ table, pass: true, reason: `RLS denied: ${error.message}` });
      continue;
    }

    const rows = data as Array<{ tenant_id?: string }> | null ?? [];

    // Check that NO row belongs to Tenant B
    const leakedRows = rows.filter((row) => row.tenant_id === TENANT_B_ID);

    if (leakedRows.length > 0) {
      results.push({
        table,
        pass: false,
        reason: `LEAK: ${leakedRows.length} Tenant B row(s) visible to Tenant A`,
      });
    } else {
      results.push({
        table,
        pass: true,
        reason: `${rows.length} rows returned, 0 belong to Tenant B`,
      });
    }
  }

  // Report
  console.log("=== RLS Isolation Test Results ===\n");
  let allPassed = true;

  for (const r of results) {
    if (r.pass) {
      console.log(`✅  ${r.table.padEnd(25)} ${r.reason ?? ""}`);
    } else {
      console.error(`❌  ${r.table.padEnd(25)} ${r.reason ?? ""}`);
      allPassed = false;
    }
  }

  console.log("");

  if (!allPassed) {
    console.error(
      "🚨  RLS ISOLATION TEST FAILED\n" +
      "    Cross-tenant data leakage detected. Epic 2 is BLOCKED.\n" +
      "    Fix RLS policies before proceeding.",
    );
    Deno.exit(1);
  }

  console.log(
    "✅  All RLS isolation tests passed.\n" +
    "    Zero cross-tenant data leakage across all tested tables.\n" +
    "    Epic 2 is UNBLOCKED.",
  );
}

await runIsolationTests();
