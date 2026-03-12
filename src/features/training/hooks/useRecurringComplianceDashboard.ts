import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  RecurringComplianceDashboardData,
  RecurringComplianceEmployeeRow,
  RecurringComplianceInstance,
  RecurringComplianceRuleOption,
  RecurringComplianceStatus,
  RecurringComplianceSummary,
} from "../types/recurring-compliance";

function isMissingSchema(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = String((error as { message?: string } | null)?.message ?? "");
  return code === "42P01" ||
    code === "PGRST205" ||
    /relation .* does not exist/i.test(message) ||
    /schema cache/i.test(message);
}

function emptySummary(): RecurringComplianceSummary {
  return {
    not_yet_due: 0,
    due_soon: 0,
    due: 0,
    overdue: 0,
    completed: 0,
  };
}

function statusRank(status: RecurringComplianceStatus): number {
  switch (status) {
    case "overdue":
      return 0;
    case "due":
      return 1;
    case "due_soon":
      return 2;
    case "not_yet_due":
      return 3;
    case "completed":
      return 4;
  }
}

async function fetchRecurringComplianceDashboard(): Promise<RecurringComplianceDashboardData> {
  const [{ data: people, error: peopleErr }, { data: instances, error: instancesErr }, { data: anchors, error: anchorsErr }, { data: rules, error: rulesErr }] =
    await Promise.all([
      supabase
        .from("people")
        .select("id, first_name, last_name, email, job_title")
        .eq("type", "employee")
        .order("last_name"),
      supabase
        .from("v_recurring_compliance_status")
        .select("*")
        .order("due_at"),
      supabase
        .from("employee_group_enrollments")
        .select("id, person_id, group_id, anchor_date")
        .eq("active", true),
      supabase
        .from("training_compliance_rules")
        .select("id, rule_name, group_id, course_id")
        .eq("active", true)
        .order("rule_name"),
    ]);

  if (peopleErr) throw peopleErr;

  const missingSchemaError = instancesErr ?? anchorsErr ?? rulesErr;
  if (missingSchemaError && isMissingSchema(missingSchemaError)) {
    return {
      schemaReady: false,
      rows: [],
      summary: emptySummary(),
      ruleOptions: [],
    };
  }

  if (instancesErr) throw instancesErr;
  if (anchorsErr) throw anchorsErr;
  if (rulesErr) throw rulesErr;

  const peopleById = new Map(
    (people ?? []).map((person) => [
      person.id as string,
      {
        employee_name: `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim() || person.email,
        email: person.email as string,
        job_title: (person.job_title as string | null) ?? null,
      },
    ]),
  );

  const anchorsByPersonGroup = new Map<string, string>();
  for (const anchor of (anchors ?? []) as Array<{ person_id: string; group_id: string; anchor_date: string }>) {
    anchorsByPersonGroup.set(`${anchor.person_id}:${anchor.group_id}`, anchor.anchor_date);
  }

  const normalizedRules = (rules ?? []) as Array<{
    id: string;
    rule_name: string;
    group_id: string;
    course_id: string;
  }>;
  const ruleNameCounts = new Map<string, number>();
  for (const rule of normalizedRules) {
    ruleNameCounts.set(rule.rule_name, (ruleNameCounts.get(rule.rule_name) ?? 0) + 1);
  }

  const ruleLabelById = new Map<string, string>();
  const ruleOptions: RecurringComplianceRuleOption[] = normalizedRules.map((rule) => {
    const label = (ruleNameCounts.get(rule.rule_name) ?? 0) > 1
      ? `${rule.rule_name} (Group ${rule.group_id})`
      : rule.rule_name;
    ruleLabelById.set(rule.id, label);
    return {
      rule_id: rule.id,
      label,
    };
  });

  const currentByPersonRule = new Map<string, RecurringComplianceInstance>();
  for (const instance of (instances ?? []) as RecurringComplianceInstance[]) {
    const key = `${instance.person_id}:${instance.rule_id}`;
    const existing = currentByPersonRule.get(key);
    if (!existing || instance.cycle_number > existing.cycle_number) {
      currentByPersonRule.set(key, instance);
    }
  }

  const rows: RecurringComplianceEmployeeRow[] = [];
  const summary = emptySummary();

  for (const instance of currentByPersonRule.values()) {
    const person = peopleById.get(instance.person_id);
    if (!person) continue;

    const row: RecurringComplianceEmployeeRow = {
      person_id: instance.person_id,
      employee_name: person.employee_name,
      email: person.email,
      job_title: person.job_title,
      rule_id: instance.rule_id,
      rule_name: instance.rule_name,
      rule_label: ruleLabelById.get(instance.rule_id) ?? instance.rule_name,
      group_id: instance.group_id,
      anchor_date: anchorsByPersonGroup.get(`${instance.person_id}:${instance.group_id}`) ?? null,
      due_at: instance.due_at,
      completed_at: instance.completed_at,
      completion_source: instance.completion_source,
      completion_note: instance.completion_note,
      status: instance.compliance_status,
      cycle_number: instance.cycle_number,
      reminder_suppressed: instance.reminder_suppressed,
    };

    rows.push(row);
    summary[row.status] += 1;
  }

  rows.sort((a, b) => {
    const statusDelta = statusRank(a.status) - statusRank(b.status);
    if (statusDelta !== 0) return statusDelta;
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
  });

  return {
    schemaReady: true,
    rows,
    summary,
    ruleOptions,
  };
}

export function useRecurringComplianceDashboard() {
  return useQuery({
    queryKey: ["recurring-compliance-dashboard"],
    queryFn: fetchRecurringComplianceDashboard,
    staleTime: 60_000,
  });
}
