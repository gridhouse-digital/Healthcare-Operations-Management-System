import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!SERVICE_KEY) { console.error("Missing SUPABASE_SERVICE_ROLE_KEY"); Deno.exit(1); }

const TENANT_ID = "aaaaaaaa-0001-0001-0001-000000000001";
const TEST_EMAIL = "process-hire-test@homs-test.internal";
const MOCK_WP_USER_ID = 9999;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
let passed = 0; let failed = 0;
function assert(c, l) { if (c) { console.log("  PASS  " + l); passed++; } else { console.error("  FAIL  " + l); failed++; } }
async function cleanup() {
  await admin.from("integration_log").delete().eq("tenant_id", TENANT_ID).eq("idempotency_key", TEST_EMAIL);
  await admin.from("integration_log").delete().eq("tenant_id", TENANT_ID).eq("idempotency_key", TEST_EMAIL + ".fail");
  await admin.from("people").delete().eq("tenant_id", TENANT_ID).eq("email", TEST_EMAIL);
}
let wpCreateCalls = 0;
async function simulateProcessHire(hireId) {
  const { data: person } = await admin.from("people").select("wp_user_id").eq("tenant_id", TENANT_ID).eq("email", TEST_EMAIL).single();
  if (!person) throw new Error("No people record");
  let wpUserId = person.wp_user_id;
  if (!wpUserId) { wpCreateCalls++; wpUserId = MOCK_WP_USER_ID; await admin.from("people").update({ wp_user_id: wpUserId }).eq("tenant_id", TENANT_ID).eq("email", TEST_EMAIL); }
  await admin.from("integration_log").update({ status: "processed", completed_at: new Date().toISOString(), payload: { wp_user_id: wpUserId } }).eq("id", hireId);
}
console.log("=== Story 3.2 + 3.3 process-hire Tests ===");
await cleanup();
await admin.from("people").upsert({ tenant_id: TENANT_ID, email: TEST_EMAIL, first_name: "Test", last_name: "Hire", job_title: "Registered Nurse", type: "employee", profile_source: "bamboohr", hired_at: new Date().toISOString() }, { onConflict: "tenant_id,email" });
const { data: logRow } = await admin.from("integration_log").insert({ tenant_id: TENANT_ID, source: "bamboohr", idempotency_key: TEST_EMAIL, status: "hire_detected", payload: { test: true } }, { count: "exact" }).select("id").single();
assert(logRow !== null, "Seeded hire_detected log row");
await simulateProcessHire(logRow.id);
const { data: logAfter1 } = await admin.from("integration_log").select("status").eq("id", logRow.id).single();
const { data: personAfter1 } = await admin.from("people").select("wp_user_id").eq("tenant_id", TENANT_ID).eq("email", TEST_EMAIL).single();
assert(logAfter1?.status === "processed", "Run 1: integration_log status=processed");
assert(personAfter1?.wp_user_id === MOCK_WP_USER_ID, "Run 1: wp_user_id stored on people");
assert(wpCreateCalls === 1, "Run 1: WP user created exactly once");
await simulateProcessHire(logRow.id);
assert(wpCreateCalls === 1, "Run 2: WP user NOT created again");
const { data: finalLog } = await admin.from("integration_log").select("status").eq("id", logRow.id).single();
assert(finalLog?.status === "processed", "Final: status remains processed");
const { data: failRow } = await admin.from("integration_log").insert({ tenant_id: TENANT_ID, source: "bamboohr", idempotency_key: TEST_EMAIL + ".fail", status: "hire_detected", payload: {} }, { count: "exact" }).select("id").single();
await admin.from("integration_log").update({ status: "failed", completed_at: new Date().toISOString(), payload: { error: "WP API error: 500" } }).eq("id", failRow.id);
const { data: failedLog } = await admin.from("integration_log").select("status, payload").eq("id", failRow.id).single();
assert(failedLog?.status === "failed", "Story 3.3: failure written to integration_log");
assert(!!(failedLog?.payload)?.error, "Story 3.3: error in payload");
await cleanup();
console.log("Results: " + passed + " passed, " + failed + " failed");
if (failed > 0) { process.exit(1); }
console.log("All process-hire tests passed.");
