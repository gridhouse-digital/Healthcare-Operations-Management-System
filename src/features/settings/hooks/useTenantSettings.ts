import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { TenantSettings, ConnectorTestResult, LdGroupMapping } from "../types/tenant-settings";

const QK = { settings: ["tenant-settings"] as const };

// ---------------------------------------------------------------------------
// Fetch settings
// ---------------------------------------------------------------------------

async function fetchSettings(): Promise<TenantSettings> {
  const { data, error } = await supabase
    .from("tenant_settings")
    .select(
      "tenant_id, wp_site_url, bamboohr_subdomain, active_connectors, ld_group_mappings, profile_source"
      // Encrypted key columns are NOT selected — never sent to frontend
    )
    .single();

  if (error) throw error;

  return {
    tenant_id: data.tenant_id as string,
    wp_site_url: (data.wp_site_url as string | null) ?? null,
    bamboohr_subdomain: (data.bamboohr_subdomain as string | null) ?? null,
    // Indicate whether keys are configured without exposing them
    bamboohr_key_configured: !!(data as Record<string, unknown>)["bamboohr_api_key_encrypted"],
    jazzhr_key_configured: !!(data as Record<string, unknown>)["jazzhr_api_key_encrypted"],
    wp_key_configured: !!(data.wp_site_url),
    jotform_key_configured: !!(data as Record<string, unknown>)["jotform_api_key_encrypted"],
    active_connectors: ((data.active_connectors as string[] | null) ?? []) as TenantSettings["active_connectors"],
    ld_group_mappings: (data.ld_group_mappings as LdGroupMapping[] | null) ?? [],
    profile_source: (data.profile_source as "bamboohr" | "jazzhr" | null) ?? null,
  } satisfies TenantSettings;
}

export function useTenantSettings() {
  return useQuery({
    queryKey: QK.settings,
    queryFn: fetchSettings,
  });
}

// ---------------------------------------------------------------------------
// Test connector
// ---------------------------------------------------------------------------

async function testConnector(payload: {
  source: "bamboohr" | "jazzhr";
  subdomain?: string;
  apiKey: string;
}): Promise<ConnectorTestResult> {
  const { data, error } = await supabase.functions.invoke("test-connector", {
    body: payload,
  });

  // Check both transport error and body error (per CLAUDE.md pattern)
  if (error) return { ok: false, error: error.message };
  if ((data as { error?: { message: string } } | null)?.error) {
    return { ok: false, error: (data as { error: { message: string } }).error.message };
  }
  return { ok: true };
}

export function useTestConnector() {
  return useMutation({ mutationFn: testConnector });
}

// ---------------------------------------------------------------------------
// Save BambooHR connector
// ---------------------------------------------------------------------------

interface SaveBambooHRPayload {
  subdomain: string;
  apiKey: string;
}

async function saveBambooHR(payload: SaveBambooHRPayload): Promise<void> {
  const { data, error } = await supabase.functions.invoke("save-connector", {
    body: { source: "bamboohr", ...payload },
  });
  if (error) throw error;
  if ((data as { error?: { message: string } } | null)?.error) {
    throw new Error((data as { error: { message: string } }).error.message);
  }
}

export function useSaveBambooHR() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveBambooHR,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: QK.settings }); },
  });
}

// ---------------------------------------------------------------------------
// Save JazzHR connector
// ---------------------------------------------------------------------------

async function saveJazzHR(payload: { apiKey: string }): Promise<void> {
  const { data, error } = await supabase.functions.invoke("save-connector", {
    body: { source: "jazzhr", ...payload },
  });
  if (error) throw error;
  if ((data as { error?: { message: string } } | null)?.error) {
    throw new Error((data as { error: { message: string } }).error.message);
  }
}

export function useSaveJazzHR() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveJazzHR,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: QK.settings }); },
  });
}

// ---------------------------------------------------------------------------
// Save WordPress connector
// ---------------------------------------------------------------------------

interface SaveWordPressPayload {
  wpSiteUrl: string;
  wpUsername: string;
  wpAppPassword: string;
}

async function saveWordPress(payload: SaveWordPressPayload): Promise<void> {
  const { data, error } = await supabase.functions.invoke("save-connector", {
    body: { source: "wordpress", ...payload },
  });
  if (error) throw error;
  if ((data as { error?: { message: string } } | null)?.error) {
    throw new Error((data as { error: { message: string } }).error.message);
  }
}

export function useSaveWordPress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveWordPress,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: QK.settings }); },
  });
}

// ---------------------------------------------------------------------------
// Save JotForm connector
// ---------------------------------------------------------------------------

async function saveJotForm(payload: { apiKey: string }): Promise<void> {
  const { data, error } = await supabase.functions.invoke("save-connector", {
    body: { source: "jotform", ...payload },
  });
  if (error) throw error;
  if ((data as { error?: { message: string } } | null)?.error) {
    throw new Error((data as { error: { message: string } }).error.message);
  }
}

export function useSaveJotForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveJotForm,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: QK.settings }); },
  });
}
