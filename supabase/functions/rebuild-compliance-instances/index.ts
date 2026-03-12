import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleError } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";
import { cronOrTenantGuard } from "../_shared/cron-or-tenant-guard.ts";

interface ComplianceRule {
  id: string;
  tenant_id: string;
  rule_name: string;
  rule_type: string;
  rule_template: string | null;
  course_id: string;
  group_id: string;
  anchor_type: string;
  initial_due_offset_months: number;
  recurrence_interval_months: number;
  reminder_days: number[] | null;
  allow_early_completion: boolean;
  accept_learndash_completion: boolean;
  allow_manual_completion: boolean;
  active: boolean;
}

interface GroupEnrollment {
  id: string;
  tenant_id: string;
  person_id: string;
  group_id: string;
  anchor_date: string;
  active: boolean;
}

interface ExistingInstance {
  id: string;
  tenant_id: string;
  person_id: string;
  rule_id: string;
  cycle_number: number;
  completed_at: string | null;
  completion_source: string | null;
}

interface TrainingCompletion {
  person_id: string;
  course_id: string;
  completed_at: string | null;
  status: string | null;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function addMonths(isoDate: string, months: number): string {
  const date = new Date(isoDate);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

function buildPolicySnapshot(rule: ComplianceRule) {
  return {
    rule_name: rule.rule_name,
    rule_type: rule.rule_type,
    rule_template: rule.rule_template,
    course_id: rule.course_id,
    group_id: rule.group_id,
    anchor_type: rule.anchor_type,
    initial_due_offset_months: rule.initial_due_offset_months,
    recurrence_interval_months: rule.recurrence_interval_months,
    reminder_days: rule.reminder_days ?? [],
    allow_early_completion: rule.allow_early_completion,
    accept_learndash_completion: rule.accept_learndash_completion,
    allow_manual_completion: rule.allow_manual_completion,
  };
}

function findCompletionCycleNumber(
  cycles: Array<{ cycleNumber: number; cycleStartAt: string }>,
  completedAt: string,
): number | null {
  const completionTime = new Date(completedAt).getTime();
  let matched: number | null = null;

  for (const cycle of cycles) {
    if (new Date(cycle.cycleStartAt).getTime() <= completionTime) {
      matched = cycle.cycleNumber;
    }
  }

  return matched;
}

async function rebuildTenant(
  admin: any,
  tenantId: string,
): Promise<{ inserted: number; updated: number; skipped: number; errors: number }> {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  const [{ data: rules, error: rulesErr }, { data: enrollments, error: enrollmentsErr }, { data: instances, error: instancesErr }, { data: completions, error: completionsErr }] =
    await Promise.all([
      admin
        .from("training_compliance_rules")
        .select(`
          id,
          tenant_id,
          rule_name,
          rule_type,
          rule_template,
          course_id,
          group_id,
          anchor_type,
          initial_due_offset_months,
          recurrence_interval_months,
          reminder_days,
          allow_early_completion,
          accept_learndash_completion,
          allow_manual_completion,
          active
        `)
        .eq("tenant_id", tenantId)
        .eq("active", true),
      admin
        .from("employee_group_enrollments")
        .select("id, tenant_id, person_id, group_id, anchor_date, active")
        .eq("tenant_id", tenantId)
        .eq("active", true),
      admin
        .from("employee_compliance_instances")
        .select("id, tenant_id, person_id, rule_id, cycle_number, completed_at, completion_source")
        .eq("tenant_id", tenantId),
      admin
        .from("training_records")
        .select("person_id, course_id, completed_at, status")
        .eq("tenant_id", tenantId)
        .eq("status", "completed"),
    ]);

  if (rulesErr) throw rulesErr;
  if (enrollmentsErr) throw enrollmentsErr;
  if (instancesErr) throw instancesErr;
  if (completionsErr) throw completionsErr;

  const activeRules = (rules ?? []) as ComplianceRule[];
  const activeEnrollments = (enrollments ?? []) as GroupEnrollment[];
  const existingInstances = (instances ?? []) as ExistingInstance[];
  const trainingCompletions = (completions ?? []) as TrainingCompletion[];

  const instancesByKey = new Map<string, ExistingInstance>();
  for (const instance of existingInstances) {
    instancesByKey.set(
      `${instance.person_id}:${instance.rule_id}:${instance.cycle_number}`,
      instance,
    );
  }

  const completionByPersonCourse = new Map<string, TrainingCompletion>();
  for (const completion of trainingCompletions) {
    completionByPersonCourse.set(
      `${completion.person_id}:${completion.course_id}`,
      completion,
    );
  }

  const now = new Date();

  for (const rule of activeRules) {
    const matchingEnrollments = activeEnrollments.filter(
      (enrollment) => enrollment.group_id === rule.group_id,
    );

    for (const enrollment of matchingEnrollments) {
      try {
        const cycles: Array<{
          cycleNumber: number;
          cycleStartAt: string;
          dueAt: string;
          groupEnrollmentId: string;
        }> = [];

        let cycleNumber = 1;
        let cycleStartAt = enrollment.anchor_date;

        while (new Date(cycleStartAt) <= now) {
          const dueAt = addMonths(
            enrollment.anchor_date,
            rule.initial_due_offset_months + ((cycleNumber - 1) * rule.recurrence_interval_months),
          );

          cycles.push({
            cycleNumber,
            cycleStartAt,
            dueAt,
            groupEnrollmentId: enrollment.id,
          });

          cycleNumber++;
          cycleStartAt = addMonths(
            enrollment.anchor_date,
            (cycleNumber - 1) * rule.recurrence_interval_months,
          );
        }

        if (cycles.length === 0) {
          skipped++;
          continue;
        }

        const completion = completionByPersonCourse.get(
          `${enrollment.person_id}:${rule.course_id}`,
        );
        const completionCycleNumber =
          rule.accept_learndash_completion && completion?.completed_at
            ? findCompletionCycleNumber(cycles, completion.completed_at)
            : null;

        for (const cycle of cycles) {
          const key = `${enrollment.person_id}:${rule.id}:${cycle.cycleNumber}`;
          const existing = instancesByKey.get(key);
          const shouldAutocomplete =
            completionCycleNumber === cycle.cycleNumber && completion?.completed_at;

          if (!existing) {
            const { error } = await admin
              .from("employee_compliance_instances")
              .insert({
                tenant_id: tenantId,
                person_id: enrollment.person_id,
                rule_id: rule.id,
                group_enrollment_id: cycle.groupEnrollmentId,
                cycle_number: cycle.cycleNumber,
                cycle_start_at: cycle.cycleStartAt,
                due_at: cycle.dueAt,
                completed_at: shouldAutocomplete ? completion!.completed_at : null,
                completion_source: shouldAutocomplete ? "learndash" : null,
                completion_course_id: shouldAutocomplete ? rule.course_id : null,
                policy_snapshot: buildPolicySnapshot(rule),
              });

            if (error) {
              errors++;
            } else {
              inserted++;
            }
            continue;
          }

          if (!existing.completed_at && shouldAutocomplete) {
            const { error } = await admin
              .from("employee_compliance_instances")
              .update({
                completed_at: completion!.completed_at,
                completion_source: "learndash",
                completion_course_id: rule.course_id,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);

            if (error) {
              errors++;
            } else {
              updated++;
            }
          } else {
            skipped++;
          }
        }
      } catch {
        errors++;
      }
    }
  }

  return { inserted, updated, skipped, errors };
}

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const ctx = cronOrTenantGuard(req);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    let tenantIds: string[] = [];

    if (ctx.mode === "user") {
      tenantIds = [ctx.tenantId];
    } else {
      const { data: tenants, error: tenantsErr } = await admin
        .from("tenant_settings")
        .select("tenant_id");

      if (tenantsErr) throw tenantsErr;
      tenantIds = (tenants ?? []).map((row) => row.tenant_id as string);
    }

    const summary = [];
    for (const tenantId of tenantIds) {
      const result = await rebuildTenant(admin, tenantId);
      summary.push({ tenant_id: tenantId, ...result });
    }

    void logAudit({
      tenantId: ctx.mode === "user" ? ctx.tenantId : undefined,
      actorId: undefined,
      action: "recurring_compliance.rebuild_instances",
      tableName: "employee_compliance_instances",
      recordId: undefined,
      after: { tenants_processed: summary.length, summary },
    });

    return withCors(
      new Response(
        JSON.stringify({ ok: true, tenants: summary.length, summary }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
      req,
    );
  } catch (err) {
    return withCors(handleError(err), req);
  }
});
