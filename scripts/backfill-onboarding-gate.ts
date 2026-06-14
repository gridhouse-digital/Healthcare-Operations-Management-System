// =============================================================================
// One-time corrective backfill — Onboarding Completion Gate (handoff §6).
//
// Resolver rule 2 ("established Active stays Active") means falsely-Active
// rows will NOT self-heal after the gate ships. This script resets ONLY the
// Active employees who fail the requirement-driven gate, then re-resolves
// them through writeEmployeeStatus — the resolver stays the ONLY status
// writer; this script NEVER writes a status value directly.
//
// PRE-REQS (owner-controlled — do not run before all three):
//   1. Gate migration applied (v_onboarding_gate + tenant_settings.onboarding_group_id).
//   2. The onboarding group exists in WP and has synced into HOMS
//      (learndash_group_courses rows present).
//   3. The owner selected it in Settings → LearnDash (onboarding_group_id set).
//
// GRANDFATHERING (owner-approved, handoff §6.3): Active employees with ZERO
// gate rows (not enrolled in the designated group — e.g. employees complete
// against their current role group during the WP restructure window) are NOT
// touched. Only Active employees WITH ≥1 incomplete gating course are reset.
//
// USAGE (from prolific-hr-app/):
//   # Step 1 — identify only (READ-ONLY, default). Paste this output in the PR.
//   deno run --allow-env --allow-net scripts/backfill-onboarding-gate.ts
//
//   # Step 2 — reset-then-resolve the identified people (requires --apply).
//   deno run --allow-env --allow-net scripts/backfill-onboarding-gate.ts --apply
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TENANT_ID (all required).
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { writeEmployeeStatus } from "../supabase/functions/_shared/employee-status-resolver.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TENANT_ID = Deno.env.get("TENANT_ID") ?? "";

if (!SUPABASE_URL || !SERVICE_KEY || !TENANT_ID) {
  console.error(
    "Missing env. Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TENANT_ID",
  );
  Deno.exit(1);
}

const APPLY = Deno.args.includes("--apply");

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

interface GateRow {
  person_id: string;
  course_id: string;
  course_name: string | null;
  effective_status: string;
  has_record: boolean;
}

// ---------------------------------------------------------------------------
// Pre-flight: the gate must be configured, otherwise EVERY Active employee
// has zero rows and the identify step is vacuously empty (misleading).
// ---------------------------------------------------------------------------
const { data: settings, error: settingsErr } = await admin
  .from("tenant_settings")
  .select("onboarding_group_id")
  .eq("tenant_id", TENANT_ID)
  .maybeSingle();
if (settingsErr) {
  console.error(`tenant_settings read failed: ${settingsErr.message}`);
  Deno.exit(1);
}
if (!settings?.onboarding_group_id) {
  console.error(
    "tenant_settings.onboarding_group_id is NOT set for this tenant. " +
      "Configure the Onboarding Group in Settings → LearnDash first (handoff §6 pre-req).",
  );
  Deno.exit(1);
}
console.log(`Designated onboarding group: ${settings.onboarding_group_id}\n`);

// ---------------------------------------------------------------------------
// Step 1 — IDENTIFY (read-only): Active employees with ≥1 gating course not
// completed, via v_onboarding_gate. Service role bypasses RLS, so every query
// is explicitly tenant-scoped.
// ---------------------------------------------------------------------------
const { data: gateRows, error: gateErr } = await admin
  .from("v_onboarding_gate")
  .select("person_id, course_id, course_name, effective_status, has_record")
  .eq("tenant_id", TENANT_ID);
if (gateErr) {
  console.error(`v_onboarding_gate read failed: ${gateErr.message}`);
  Deno.exit(1);
}

const byPerson = new Map<string, GateRow[]>();
for (const row of (gateRows ?? []) as GateRow[]) {
  const list = byPerson.get(row.person_id) ?? [];
  list.push(row);
  byPerson.set(row.person_id, list);
}

const { data: activePeople, error: peopleErr } = await admin
  .from("people")
  .select("id, first_name, last_name, email, employee_status")
  .eq("tenant_id", TENANT_ID)
  .eq("employee_status", "Active");
if (peopleErr) {
  console.error(`people read failed: ${peopleErr.message}`);
  Deno.exit(1);
}

interface ResetCandidate {
  id: string;
  name: string;
  email: string;
  gating: number;
  completed: number;
  incomplete: number;
}

const candidates: ResetCandidate[] = [];
const grandfathered: string[] = [];

for (const p of activePeople ?? []) {
  const rows = byPerson.get(p.id as string) ?? [];
  const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || (p.email as string);
  if (rows.length === 0) {
    // Not enrolled in the designated group → grandfathered (§6.3). Untouched.
    grandfathered.push(name);
    continue;
  }
  const completed = rows.filter((r) => r.effective_status === "completed").length;
  if (completed < rows.length) {
    candidates.push({
      id: p.id as string,
      name,
      email: p.email as string,
      gating: rows.length,
      completed,
      incomplete: rows.length - completed,
    });
  }
}

console.log("=== Step 1: identify (read-only) ===");
console.log(`Active employees checked: ${activePeople?.length ?? 0}`);
console.log(
  `Grandfathered (no gate rows — not enrolled in designated group): ${grandfathered.length}` +
    (grandfathered.length ? ` → ${grandfathered.join(", ")}` : ""),
);
console.log(`Reset candidates (≥1 incomplete gating course): ${candidates.length}`);
for (const c of candidates) {
  console.log(
    `  - ${c.name} <${c.email}> — ${c.completed}/${c.gating} gating courses complete (${c.incomplete} incomplete)`,
  );
}

if (!APPLY) {
  console.log(
    "\nRead-only run complete. Re-run with --apply to reset-then-resolve the candidates above.",
  );
  Deno.exit(0);
}

// ---------------------------------------------------------------------------
// Step 2 — RESET-THEN-RESOLVE (only the candidates). Status is cleared and
// then re-resolved through writeEmployeeStatus (the sole status writer) —
// never set directly to a value by this script.
// ---------------------------------------------------------------------------
console.log("\n=== Step 2: reset-then-resolve (--apply) ===");
let failures = 0;
for (const c of candidates) {
  const { error: resetErr } = await admin
    .from("people")
    .update({ employee_status: null, updated_at: new Date().toISOString() })
    .eq("tenant_id", TENANT_ID)
    .eq("id", c.id);
  if (resetErr) {
    console.error(`  FAIL reset ${c.name}: ${resetErr.message}`);
    failures++;
    continue;
  }
  try {
    const result = await writeEmployeeStatus(admin, c.id);
    console.log(`  ${c.name} → ${result.status} (${result.reasonCode})`);
  } catch (e) {
    console.error(
      `  FAIL resolve ${c.name}: ${e instanceof Error ? e.message : String(e)}`,
    );
    failures++;
  }
}

// ---------------------------------------------------------------------------
// Step 4 (§6.4) — verify audit_log rows exist for the status changes
// (produced by the existing people audit trigger).
// ---------------------------------------------------------------------------
console.log("\n=== Verify: audit_log rows for the status changes ===");
for (const c of candidates) {
  const { data: auditRows, error: auditErr } = await admin
    .from("audit_log")
    .select("id, action, created_at")
    .eq("tenant_id", TENANT_ID)
    .eq("table_name", "people")
    .eq("record_id", c.id)
    .order("created_at", { ascending: false })
    .limit(3);
  if (auditErr) {
    console.error(`  audit check failed for ${c.name}: ${auditErr.message}`);
    failures++;
    continue;
  }
  const ok = (auditRows?.length ?? 0) > 0;
  console.log(`  ${ok ? "OK " : "MISSING"} audit trail for ${c.name}`);
  if (!ok) failures++;
}

if (failures > 0) {
  console.error(`\nCompleted with ${failures} failure(s).`);
  Deno.exit(1);
}
console.log("\nBackfill complete.");
