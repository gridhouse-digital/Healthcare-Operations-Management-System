import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  TenantSettings,
  ConnectorTestResult,
  LdGroupMapping,
  OfferLetterTenantSettings,
} from "../types/tenant-settings";

const QK = {
  settings: ["tenant-settings"] as const,
  offerLetterSettings: ["tenant-settings", "offer-letter"] as const,
};
const BASE_SETTINGS_SELECT =
  "tenant_id, wp_site_url, logo_light, bamboohr_subdomain, bamboohr_key_configured, jazzhr_key_configured, wp_key_configured, jotform_key_configured, jotform_form_id_application, active_connectors, ld_group_mappings, profile_source";
const OFFER_SETTINGS_SELECT =
  "offer_company_name, offer_signatory_name, offer_signatory_title, offer_letter_template";

type TenantSettingsRow = Record<string, unknown>;

function isMissingOfferSettingsSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message, details, hint } = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };
  const text = typeof message === "string" ? message : "";
  const detailsText = typeof details === "string" ? details : "";
  const hintText = typeof hint === "string" ? hint : "";
  const combinedText = `${text} ${detailsText} ${hintText}`;
  const mentionsOfferColumn =
    combinedText.includes("offer_company_name") ||
    combinedText.includes("offer_signatory_name") ||
    combinedText.includes("offer_signatory_title") ||
    combinedText.includes("offer_letter_template");

  return (
    mentionsOfferColumn &&
    (code === "PGRST204" ||
      code === "42703" ||
      combinedText.includes("schema cache") ||
      combinedText.includes("Could not find") ||
      combinedText.includes("column"))
  );
}

async function loadSettings(select: string): Promise<TenantSettingsRow> {
  const { data, error } = await supabase
    .from("tenant_settings")
    .select(select)
    .single();

  if (error) throw error;
  return data as unknown as TenantSettingsRow;
}

// ---------------------------------------------------------------------------
// Fetch settings
// ---------------------------------------------------------------------------

async function fetchSettings(): Promise<TenantSettings> {
  const data = await loadSettings(BASE_SETTINGS_SELECT);

  return {
    tenant_id: data.tenant_id as string,
    wp_site_url: (data.wp_site_url as string | null) ?? null,
    logo_light: (data.logo_light as string | null) ?? null,
    bamboohr_subdomain: (data.bamboohr_subdomain as string | null) ?? null,
    bamboohr_key_configured: Boolean(data.bamboohr_key_configured),
    jazzhr_key_configured: Boolean(data.jazzhr_key_configured),
    wp_key_configured: Boolean(data.wp_key_configured),
    jotform_key_configured: Boolean(data.jotform_key_configured),
    jotform_form_id_application: (data.jotform_form_id_application as string | null) ?? null,
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

export type OfferLetterSettingsQueryResult =
  | (OfferLetterTenantSettings & { migrationRequired: false })
  | (OfferLetterTenantSettings & { migrationRequired: true });

async function fetchOfferLetterSettings(): Promise<OfferLetterSettingsQueryResult> {
  try {
    const data = await loadSettings(OFFER_SETTINGS_SELECT);
    return {
      offer_company_name: (data.offer_company_name as string | null) ?? null,
      offer_signatory_name: (data.offer_signatory_name as string | null) ?? null,
      offer_signatory_title: (data.offer_signatory_title as string | null) ?? null,
      offer_letter_template: (data.offer_letter_template as string | null) ?? null,
      migrationRequired: false,
    };
  } catch (error) {
    if (!isMissingOfferSettingsSchema(error)) throw error;
    return {
      offer_company_name: null,
      offer_signatory_name: null,
      offer_signatory_title: null,
      offer_letter_template: null,
      migrationRequired: true,
    };
  }
}

export function useOfferLetterSettings(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: QK.offerLetterSettings,
    queryFn: fetchOfferLetterSettings,
    enabled: options?.enabled ?? true,
  });
}

// ---------------------------------------------------------------------------
// Save offer-letter settings
// ---------------------------------------------------------------------------

export interface SaveOfferLetterSettingsPayload {
  offer_company_name: string;
  offer_signatory_name: string;
  offer_signatory_title: string;
  offer_letter_template: string;
}

async function saveOfferLetterSettings(payload: SaveOfferLetterSettingsPayload): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const tenantId = session?.user?.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) throw new Error("Missing tenant context");

  const { error } = await supabase
    .from("tenant_settings")
    .update({
      offer_company_name: payload.offer_company_name.trim() || null,
      offer_signatory_name: payload.offer_signatory_name.trim() || null,
      offer_signatory_title: payload.offer_signatory_title.trim() || null,
      offer_letter_template: payload.offer_letter_template.trim() || null,
    })
    .eq("tenant_id", tenantId);

  if (error) throw error;
}

export function useSaveOfferLetterSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveOfferLetterSettings,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: QK.offerLetterSettings }); },
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

async function saveJotForm(payload: { apiKey?: string; formIdApplication?: string }): Promise<void> {
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
