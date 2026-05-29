/**
 * Seed helpers for the RLS test suite.
 *
 * Each function inserts exactly ONE row for a target table under a given
 * tenant, using the service-role client (bypasses RLS — this is setup, not
 * the thing under test). The cross-tenant SELECT assertions in rls.test.ts
 * then verify the *other* tenant cannot see these rows.
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
 * Seeds one row in each of the six target tables for `tenantId`.
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

  return {
    personId,
    applicantId,
    offerId,
    trainingRecordId,
    complianceInstanceId,
    auditLogId,
  };
}
