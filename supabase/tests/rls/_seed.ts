/**
 * Seed helpers for the RLS test suite.
 *
 * Each function inserts exactly ONE row for a target table under a given
 * tenant, using the service-role client (bypasses RLS — this is setup, not
 * the thing under test). The cross-tenant SELECT assertions in rls.test.ts
 * then verify the *other* tenant cannot see these rows.
 *
 * Phase 0.1 (rebased onto reconciled main): extends the Phase 0 seed with the
 * cross-tenant leak objects remediated by migration 20260530000000 — ai_cache,
 * ai_logs, the offers secure_token path, and the PHI-class storage buckets —
 * while RETAINING the recurring-compliance chain (training_courses →
 * training_compliance_rules → employee_compliance_instances) which exists on
 * reconciled main and underlies the SECURITY DEFINER views remediated by
 * migration 20260530000001.
 *
 * Test-only. No application logic is imported or modified.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface SeededIds {
  personId: string;
  applicantId: string;
  offerId: string;
  trainingRecordId: string;
  complianceInstanceId: string;
  auditLogId: string;
  /** ai_cache PK is input_hash (text) — not an `id` column. [Phase 0.1] */
  aiCacheHash: string;
  /** ai_logs.id (uuid). [Phase 0.1] */
  aiLogId: string;
  /** offers.secure_token — probes the anon secure-token read path. [Phase 0.1] */
  offerSecureToken: string;
  /**
   * Object key in the `resumes` bucket, namespaced under the seeded applicant
   * id so the tenant-scoping storage policy (which joins the first path segment
   * back to applicants.tenant_id) can be exercised. [Phase 0.1]
   */
  resumeObjectPath: string;
  /**
   * Object key in the `compliance-documents` bucket, namespaced under the
   * seeded person id so the storage policy can join back to people.tenant_id.
   * [Phase 0.1]
   */
  complianceObjectPath: string;
}

async function insertOne(
  admin: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await admin
    .from(table)
    .insert(row)
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`seed ${table}: ${error?.message ?? "no row returned"}`);
  }
  return data.id as string;
}

/**
 * Seeds one row in each target object for `tenantId`.
 * `runId`/`label` keep emails and course ids unique across tenants and runs.
 */
export async function seedTenant(
  admin: SupabaseClient,
  tenantId: string,
  actorId: string,
  runId: string,
  label: string,
): Promise<SeededIds> {
  // people — required parent for training_records + compliance instances
  const personId = await insertOne(admin, "people", {
    tenant_id: tenantId,
    email: `person-${label}-${runId}@example.test`,
    first_name: "Test",
    last_name: `Person-${label}`,
    type: "employee",
  });

  // applicants
  const applicantId = await insertOne(admin, "applicants", {
    tenant_id: tenantId,
    first_name: "Test",
    last_name: `Applicant-${label}`,
    email: `applicant-${label}-${runId}@example.test`,
    status: "New",
    source: "jotform",
  });

  // offers (FK → applicants)
  const offerId = await insertOne(admin, "offers", {
    tenant_id: tenantId,
    applicant_id: applicantId,
    status: "Draft",
    position_title: "Caregiver",
    start_date: "2026-06-01",
    salary: 50000,
  });

  // training_records (FK → people)
  const courseId = `course-${label}-${runId}`;
  const trainingRecordId = await insertOne(admin, "training_records", {
    tenant_id: tenantId,
    person_id: personId,
    course_id: courseId,
    course_name: "HIPAA Basics",
    status: "completed",
    completion_pct: 100,
  });

  // employee_compliance_instances has a chain of NOT NULL FKs:
  //   training_courses (tenant_id, course_id)  ←  training_compliance_rules
  //   training_compliance_rules.id             ←  employee_compliance_instances.rule_id
  // These tables EXIST on reconciled main (Epic 5.9 recurring-compliance) and
  // are the underlying tables for v_recurring_compliance_* — seeded so the
  // view-isolation assertions (migration 20260530000001) have real rows.
  await insertOne(admin, "training_courses", {
    tenant_id: tenantId,
    course_id: courseId,
    course_name: "HIPAA Basics",
    active: true,
  });
  const ruleId = await insertOne(admin, "training_compliance_rules", {
    tenant_id: tenantId,
    rule_name: `Annual ${label}`,
    rule_type: "annual_recurring",
    compliance_track: "recurring",
    course_id: courseId,
    group_id: `group-${label}-${runId}`,
    anchor_type: "hire_date",
  });
  const complianceInstanceId = await insertOne(
    admin,
    "employee_compliance_instances",
    {
      tenant_id: tenantId,
      person_id: personId,
      rule_id: ruleId,
      cycle_number: 1,
      cycle_start_at: "2026-01-01T00:00:00Z",
      due_at: "2027-01-01T00:00:00Z",
      policy_snapshot: { seeded_by: "rls-test" },
    },
  );

  // audit_log — insert directly (triggers may also produce rows; we assert on
  // this explicit one via record_id).
  const auditLogId = await insertOne(admin, "audit_log", {
    tenant_id: tenantId,
    actor_id: actorId,
    action: "INSERT",
    table_name: "people",
    record_id: personId,
    after: { seeded_by: "rls-test", label },
  });

  // ---- Phase 0.1 leak objects (remediated by 20260530000000) ----

  // offers.secure_token is server-generated; fetch it for the anon
  // secure-token read-path probe.
  const { data: offerRow, error: offerErr } = await admin
    .from("offers")
    .select("secure_token")
    .eq("id", offerId)
    .single();
  if (offerErr || !offerRow?.secure_token) {
    throw new Error(`seed offers.secure_token: ${offerErr?.message ?? "missing"}`);
  }
  const offerSecureToken = offerRow.secure_token as string;

  // ai_cache — PK is input_hash (text). tenant_id is uuid NOT NULL.
  const aiCacheHash = `cache-${label}-${runId}`;
  const { error: cacheErr } = await admin.from("ai_cache").insert({
    tenant_id: tenantId,
    input_hash: aiCacheHash,
    output: { seeded_by: "rls-test", label },
    model: "rls-test",
    ttl_seconds: 86400,
  });
  if (cacheErr) throw new Error(`seed ai_cache: ${cacheErr.message}`);

  // ai_logs — tenant_id is TEXT on this table (legacy). Store the uuid as text.
  const aiLogId = await insertOne(admin, "ai_logs", {
    tenant_id: tenantId,
    user_id: actorId,
    feature: `rls-test-${label}`,
    model: "rls-test",
    tokens_in: 1,
    tokens_out: 1,
    success: true,
  });

  // Storage: upload one PHI-class object to each bucket, namespaced so the
  // tenant-scoping policy can join the first path segment back to its owning
  // tenant. resumes/{applicantId}/... mirrors file-manager.ts; compliance docs
  // are keyed under {personId}/... (no production writer exists yet).
  const resumeObjectPath = `${applicantId}/resume-${runId}.txt`;
  const { error: resumeUpErr } = await admin.storage
    .from("resumes")
    .upload(resumeObjectPath, new Blob([`resume ${label} ${runId}`]), {
      contentType: "text/plain",
      upsert: true,
    });
  if (resumeUpErr) throw new Error(`seed resumes object: ${resumeUpErr.message}`);

  const complianceObjectPath = `${personId}/i9-${runId}.txt`;
  const { error: compUpErr } = await admin.storage
    .from("compliance-documents")
    .upload(complianceObjectPath, new Blob([`i9 ${label} ${runId}`]), {
      contentType: "text/plain",
      upsert: true,
    });
  if (compUpErr) {
    throw new Error(`seed compliance-documents object: ${compUpErr.message}`);
  }

  return {
    personId,
    applicantId,
    offerId,
    trainingRecordId,
    complianceInstanceId,
    auditLogId,
    aiCacheHash,
    aiLogId,
    offerSecureToken,
    resumeObjectPath,
    complianceObjectPath,
  };
}
