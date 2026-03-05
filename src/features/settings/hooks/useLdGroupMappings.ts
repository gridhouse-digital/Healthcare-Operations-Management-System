import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { LdGroupMapping } from "../types/tenant-settings";

const QK = { mappings: ["ld-group-mappings"] as const };

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
