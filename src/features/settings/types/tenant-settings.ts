// FR-16, FR-17, FR-22 — Tenant settings types
// verbatimModuleSyntax: all type-only imports must use import type

export type ConnectorSource = "bamboohr" | "jazzhr" | "wordpress" | "jotform";

export interface LdGroupMapping {
  job_title: string;
  group_id: string;
}

// Shape returned from DB (no encrypted fields exposed to frontend)
export interface TenantSettings {
  tenant_id: string;
  wp_site_url: string | null;
  bamboohr_subdomain: string | null;
  // API keys are NEVER returned — only a masked indicator is shown
  bamboohr_key_configured: boolean;
  jazzhr_key_configured: boolean;
  wp_key_configured: boolean;
  jotform_key_configured: boolean;
  jotform_form_id_application: string | null;
  active_connectors: ConnectorSource[];
  ld_group_mappings: LdGroupMapping[];
  profile_source: ConnectorSource | null;
  /**
   * LearnDash group designated as the official onboarding group — the source
   * of truth for the onboarding completion gate. NULL = gate not configured
   * (status resolver fails closed to Onboarding). Optional: only the
   * onboarding-group settings hook fetches it (with a pre-migration guard).
   */
  onboarding_group_id?: string | null;
}

/** Option for the Settings "Onboarding Group" select. */
export interface OnboardingGroupOption {
  group_id: string;
  /** Human label from ld_group_mappings job_title; falls back to the id. */
  label: string;
}

export type ConnectorStatus = "active" | "not_configured" | "failed";

export interface ConnectorTestResult {
  ok: boolean;
  error?: string;
}
