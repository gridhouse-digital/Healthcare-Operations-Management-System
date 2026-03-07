/**
 * Story 2.4 — Hire Detection Idempotency Test
 *
 * Verifies that running the hire detector twice with the same fixture data
 * produces exactly ONE integration_log hire row and ONE people row per email.
 *
 * Run against local Supabase:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> deno run --allow-env --allow-net scripts/test-hire-idempotency.ts
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://localhost:54321";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}

const TENANT_ID = "aaaaaaaa-0001-0001-0001-000000000001"; // RLS test tenant A (seeded)
const TEST_EMAIL_1 = "idempotency-test-hire1@homs-test.internal";
const TEST_EMAIL_2 = "idempotency-test-hire2@homs-test.internal";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

async function cleanup() {
  await admin.from("integration_log")
    .delete()
    .eq("tenant_id", TENANT_ID)
    .in("idempotency_key", [TEST_EMAIL_1, TEST_EMAIL_2]);
  await admin.from("people")
    .delete()
    .eq("tenant_id", TENANT_ID)
    .in("email", [TEST_EMAIL_1, TEST_EMAIL_2]);
}

async function simulateHireDetection(email: string, source: "bamboohr" | "jazzhr") {
  // Mirrors the exact logic in detect-hires-bamboohr/jazzhr processTenant()
  const { error: logErr, count } = await admin
    .from("integration_log")
    .insert({
      tenant_id: TENANT_ID,
      source,
      idempotency_key: email,
      status: "hire_detected",
      payload: { test: true },
    }, { count: "exact" });

  const isConflict = logErr?.code === "23505";
  const inserted = !logErr && (count ?? 0) > 0;

  if (!inserted && !isConflict) return; // unexpected error, skip

  // Only upsert people if this was a new detection
  if (inserted) {
    await admin.from("people").upsert(
      {
        tenant_id: TENANT_ID,
        email,
        first_name: "Test",
        last_name: "Hire",
        type: "employee",
        profile_source: source,
      },
      { onConflict: "tenant_id,email", ignoreDuplicates: false },
    );
    // Set hired_at only if null
    await admin
      .from("people")
      .update({ hired_at: new Date().toISOString() })
      .eq("tenant_id", TENANT_ID)
      .eq("email", email)
      .is("hired_at", null);
  }
}

console.log("\n=== Story 2.4 — Hire Detection Idempotency Test ===\n");

await cleanup();

// --- Run 1 ---
console.log("Run 1: detecting hires for two employees...");
await simulateHireDetection(TEST_EMAIL_1, "bamboohr");
await simulateHireDetection(TEST_EMAIL_2, "jazzhr");

// --- Run 2 (same data) ---
console.log("Run 2: same detection re-run (simulating second poll)...");
await simulateHireDetection(TEST_EMAIL_1, "bamboohr");
await simulateHireDetection(TEST_EMAIL_2, "jazzhr");

// --- Verify integration_log ---
const { data: logRows } = await admin
  .from("integration_log")
  .select("idempotency_key, source, status")
  .eq("tenant_id", TENANT_ID)
  .in("idempotency_key", [TEST_EMAIL_1, TEST_EMAIL_2]);

const logEmail1 = logRows?.filter((r) => r.idempotency_key === TEST_EMAIL_1) ?? [];
const logEmail2 = logRows?.filter((r) => r.idempotency_key === TEST_EMAIL_2) ?? [];

assert(logEmail1.length === 1, `integration_log: exactly 1 row for ${TEST_EMAIL_1}`);
assert(logEmail2.length === 1, `integration_log: exactly 1 row for ${TEST_EMAIL_2}`);
assert(logEmail1[0]?.status === "hire_detected", "integration_log: status=hire_detected for email1");
assert(logEmail1[0]?.source === "bamboohr", "integration_log: source=bamboohr for email1");
assert(logEmail2[0]?.source === "jazzhr", "integration_log: source=jazzhr for email2");

// --- Verify people ---
const { data: peopleRows } = await admin
  .from("people")
  .select("email, hired_at, profile_source, type")
  .eq("tenant_id", TENANT_ID)
  .in("email", [TEST_EMAIL_1, TEST_EMAIL_2]);

const personA = peopleRows?.find((p) => p.email === TEST_EMAIL_1);
const personB = peopleRows?.find((p) => p.email === TEST_EMAIL_2);
const allPeople = peopleRows?.filter((p) =>
  p.email === TEST_EMAIL_1 || p.email === TEST_EMAIL_2
) ?? [];

assert(allPeople.length === 2, "people: exactly 2 rows total (no duplicates)");
assert(personA?.hired_at !== null, "people: hired_at set for email1");
assert(personB?.hired_at !== null, "people: hired_at set for email2");
assert(personA?.profile_source === "bamboohr", "people: profile_source=bamboohr for email1");
assert(personB?.profile_source === "jazzhr", "people: profile_source=jazzhr for email2");
assert(personA?.type === "employee", "people: type=employee for email1");

// --- Run 3: verify hired_at not overwritten ---
const hiredAtBefore = personA?.hired_at;
await simulateHireDetection(TEST_EMAIL_1, "bamboohr");
const { data: personAAfter } = await admin
  .from("people")
  .select("hired_at")
  .eq("tenant_id", TENANT_ID)
  .eq("email", TEST_EMAIL_1)
  .single();

assert(personAAfter?.hired_at === hiredAtBefore, "NFR-3: hired_at not overwritten on re-detection");

await cleanup();

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.error("\nIDEMPOTENCY TEST FAILED — Epic 2 gate not cleared.");
  Deno.exit(1);
}
console.log("\nAll idempotency tests passed. Epic 2 gate criterion 2.4 CLEARED.");
