import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { LdGroupMapping, OnboardingGroupOption } from "../types/tenant-settings";

const QK = {
  mappings: ["ld-group-mappings"] as const,
  onboardingGroup: ["onboarding-group-setting"] as const,
};

function isMissingSchema(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = String((error as { message?: string } | null)?.message ?? "");
  return code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    /relation .* does not exist/i.test(message) ||
    /column .* does not exist/i.test(message) ||
    /schema cache/i.test(message);
}

// ---------------------------------------------------------------------------
// Fetch mappings
// ---------------------------------------------------------------------------

async function fetchMappings(): Promise<LdGroupMapping[]> {
  const { data, error } = await supabase
    .from("tenant_settings")
    .select("ld_group_mappings")
    .single();

  if (error) throw error;
  return (data?.ld_group_mappings as LdGroupMapping[] | null) ?? [];
}

export function useLdGroupMappings() {
  return useQuery({
    queryKey: QK.mappings,
    queryFn: fetchMappings,
  });
}

// ---------------------------------------------------------------------------
// Save entire mappings array (add / edit / delete all handled server-side)
// ---------------------------------------------------------------------------

async function saveMappings(mappings: LdGroupMapping[]): Promise<void> {
  const { data, error } = await supabase.functions.invoke("save-ld-mappings", {
    body: { mappings },
  });
  if (error) throw error;
  if ((data as { error?: { message: string } } | null)?.error) {
    throw new Error((data as { error: { message: string } }).error.message);
  }
}

export function useSaveLdMappings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveMappings,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: QK.mappings }); },
  });
}

// ---------------------------------------------------------------------------
// Onboarding completion gate — designated onboarding group (handoff §5b).
// Options = union of ld_group_mappings[].{group_id, job_title} and distinct
// learndash_group_courses.group_id (label fallback = the id).
// ---------------------------------------------------------------------------

export interface OnboardingGroupSetting {
  /** False until the gate migration has been applied to this environment. */
  schemaReady: boolean;
  groupId: string | null;
  options: OnboardingGroupOption[];
}

async function fetchOnboardingGroupSetting(): Promise<OnboardingGroupSetting> {
  const [settingsRes, syncedGroupsRes] = await Promise.all([
    supabase
      .from("tenant_settings")
      .select("ld_group_mappings, onboarding_group_id")
      .single(),
    supabase
      .from("learndash_group_courses")
      .select("group_id")
      .eq("active", true),
  ]);

  if (settingsRes.error) {
    if (isMissingSchema(settingsRes.error)) {
      return { schemaReady: false, groupId: null, options: [] };
    }
    throw settingsRes.error;
  }

  const mappings =
    (settingsRes.data?.ld_group_mappings as LdGroupMapping[] | null) ?? [];
  const labelByGroupId = new Map<string, string>();
  for (const m of mappings) {
    if (m.group_id && !labelByGroupId.has(m.group_id)) {
      labelByGroupId.set(m.group_id, m.job_title);
    }
  }
  // Synced group-course mappings may reference groups with no job-title
  // mapping yet (e.g. a universal New-Hires group) — label falls back to id.
  if (!syncedGroupsRes.error) {
    for (const row of syncedGroupsRes.data ?? []) {
      const id = (row as { group_id: string }).group_id;
      if (id && !labelByGroupId.has(id)) labelByGroupId.set(id, id);
    }
  }

  const options = [...labelByGroupId.entries()]
    .map(([group_id, label]) => ({ group_id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    schemaReady: true,
    groupId:
      (settingsRes.data?.onboarding_group_id as string | null) ?? null,
    options,
  };
}

export function useOnboardingGroupSetting() {
  return useQuery({
    queryKey: QK.onboardingGroup,
    queryFn: fetchOnboardingGroupSetting,
  });
}

async function saveOnboardingGroup(groupId: string | null): Promise<void> {
  // The save EF persists mappings + gate setting atomically and requires the
  // mappings array — send the currently stored one unchanged.
  const current = await fetchMappings();
  const { data, error } = await supabase.functions.invoke("save-ld-mappings", {
    body: { mappings: current, onboarding_group_id: groupId },
  });
  if (error) throw error;
  if ((data as { error?: { message: string } } | null)?.error) {
    throw new Error((data as { error: { message: string } }).error.message);
  }
}

export function useSaveOnboardingGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveOnboardingGroup,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QK.onboardingGroup });
      void qc.invalidateQueries({ queryKey: QK.mappings });
    },
  });
}
