import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  TrainingComplianceRule,
  TrainingComplianceRuleDraft,
  TrainingComplianceRulesData,
  TrainingCourseOption,
  TrainingGroupOption,
} from "../types/training-compliance-rules";

const QUERY_KEY = ["training-compliance-rules"] as const;

function isMissingSchema(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = String((error as { message?: string } | null)?.message ?? "");
  return code === "42P01" ||
    code === "PGRST205" ||
    /relation .* does not exist/i.test(message) ||
    /schema cache/i.test(message);
}

async function fetchTrainingComplianceRules(): Promise<TrainingComplianceRulesData> {
  const [{ data: settings, error: settingsErr }, { data: courses, error: coursesErr }, { data: rules, error: rulesErr }, { data: rawTrainingCourses, error: rawTrainingCoursesErr }] =
    await Promise.all([
      supabase
        .from("tenant_settings")
        .select("ld_group_mappings")
        .single(),
      supabase
        .from("training_courses")
        .select("course_id, course_name")
        .eq("active", true)
        .order("course_name"),
      supabase
        .from("training_compliance_rules")
        .select("*")
        .order("rule_name"),
      supabase
        .from("training_records")
        .select("course_id, course_name")
        .not("course_id", "is", null)
        .order("course_name"),
    ]);

  if (settingsErr) throw settingsErr;

  const missingSchemaError = coursesErr ?? rulesErr;
  if (missingSchemaError && isMissingSchema(missingSchemaError)) {
    return {
      schemaReady: false,
      rules: [],
      courses: [],
      groups: [],
    };
  }

  if (coursesErr) throw coursesErr;
  if (rulesErr) throw rulesErr;
  if (rawTrainingCoursesErr) throw rawTrainingCoursesErr;

  const groupOptions = new Map<string, TrainingGroupOption>();
  const rawMappings = ((settings?.ld_group_mappings as Array<{ job_title?: string; group_id?: string }> | null) ?? []);
  for (const mapping of rawMappings) {
    const groupId = (mapping.group_id ?? "").trim();
    if (!groupId || groupOptions.has(groupId)) continue;
    const roleLabel = (mapping.job_title ?? "").trim();
    groupOptions.set(groupId, {
      group_id: groupId,
      label: roleLabel ? `${roleLabel} · ${groupId}` : groupId,
    });
  }

  const courseMap = new Map<string, string | null>();
  const normalizedCoursesSource = ((courses ?? []) as TrainingCourseOption[]).length > 0
    ? (courses ?? []) as TrainingCourseOption[]
    : Array.from(
        new Map(
          ((rawTrainingCourses ?? []) as TrainingCourseOption[])
            .filter((course) => Boolean(course.course_id))
            .map((course) => [
              course.course_id,
              {
                course_id: course.course_id,
                course_name: course.course_name,
              } satisfies TrainingCourseOption,
            ]),
        ).values(),
      );

  const normalizedCourses = normalizedCoursesSource.map((course) => {
    courseMap.set(course.course_id, course.course_name);
    return course;
  }).sort((a, b) => (a.course_name ?? a.course_id).localeCompare(b.course_name ?? b.course_id));

  const normalizedRules = ((rules ?? []) as TrainingComplianceRule[]).map((rule) => ({
    ...rule,
    reminder_days: [...(rule.reminder_days ?? [])].sort((a, b) => b - a),
    course_name: courseMap.get(rule.course_id) ?? null,
  }));

  return {
    schemaReady: true,
    rules: normalizedRules,
    courses: normalizedCourses,
    groups: Array.from(groupOptions.values()).sort((a, b) => a.label.localeCompare(b.label)),
  };
}

async function saveRule(rule: TrainingComplianceRuleDraft): Promise<void> {
  const { data: tenantRow, error: tenantErr } = await supabase
    .from("tenant_settings")
    .select("tenant_id")
    .single();

  if (tenantErr) throw tenantErr;

  const tenantId = tenantRow.tenant_id as string;

  const { data: existingCourse, error: existingCourseErr } = await supabase
    .from("training_courses")
    .select("course_id")
    .eq("tenant_id", tenantId)
    .eq("course_id", rule.course_id)
    .maybeSingle();

  if (existingCourseErr && !isMissingSchema(existingCourseErr)) {
    throw existingCourseErr;
  }

  if (!existingCourse) {
    const { data: fallbackCourse, error: fallbackCourseErr } = await supabase
      .from("training_records")
      .select("course_id, course_name")
      .eq("course_id", rule.course_id)
      .not("course_name", "is", null)
      .limit(1)
      .maybeSingle();

    if (fallbackCourseErr) throw fallbackCourseErr;

    const { error: createCourseErr } = await supabase
      .from("training_courses")
      .upsert({
        tenant_id: tenantId,
        course_id: rule.course_id,
        course_name: (fallbackCourse?.course_name as string | null) ?? rule.course_id,
        active: true,
        wp_meta: { source: "rule_settings_fallback" },
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "tenant_id,course_id",
        ignoreDuplicates: false,
      });

    if (createCourseErr) throw createCourseErr;
  }

  const payload = {
    tenant_id: tenantId,
    rule_name: rule.rule_name,
    rule_type: rule.rule_type,
    rule_template: rule.rule_template,
    compliance_track: rule.compliance_track,
    applies_to_type: rule.applies_to_type,
    course_id: rule.course_id,
    group_id: rule.group_id,
    anchor_type: rule.anchor_type,
    initial_due_offset_months: rule.initial_due_offset_months,
    recurrence_interval_months: rule.recurrence_interval_months,
    reminder_days: [...rule.reminder_days].sort((a, b) => b - a),
    notify_employee: rule.notify_employee,
    notify_admin: rule.notify_admin,
    accept_learndash_completion: rule.accept_learndash_completion,
    allow_manual_completion: rule.allow_manual_completion,
    allow_early_completion: rule.allow_early_completion,
    active: rule.active,
    updated_at: new Date().toISOString(),
  };

  if (rule.id) {
    const { error } = await supabase
      .from("training_compliance_rules")
      .update(payload)
      .eq("id", rule.id);

    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("training_compliance_rules")
    .insert(payload);

  if (error) throw error;
}

export function useTrainingComplianceRules() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchTrainingComplianceRules,
    staleTime: 60_000,
  });
}

export function useSaveTrainingComplianceRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveRule,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["recurring-compliance-dashboard"] });
    },
  });
}
