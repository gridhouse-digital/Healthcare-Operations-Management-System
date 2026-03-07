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
  active_connectors: ConnectorSource[];
  ld_group_mappings: LdGroupMapping[];
  profile_source: ConnectorSource | null;
}

export type ConnectorStatus = "active" | "not_configured" | "failed";

export interface ConnectorTestResult {
  ok: boolean;
  error?: string;
}
