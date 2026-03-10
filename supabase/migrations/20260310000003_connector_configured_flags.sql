-- Epic 1.3 follow-up: expose safe connector status flags without returning secrets.
-- These are derived from existing tenant_settings fields so they cannot drift.

alter table public.tenant_settings
  add column if not exists bamboohr_key_configured boolean
    generated always as (
      bamboohr_subdomain is not null
      and btrim(bamboohr_subdomain) <> ''
      and bamboohr_api_key_encrypted is not null
      and btrim(bamboohr_api_key_encrypted) <> ''
    ) stored,
  add column if not exists jazzhr_key_configured boolean
    generated always as (
      jazzhr_api_key_encrypted is not null
      and btrim(jazzhr_api_key_encrypted) <> ''
    ) stored,
  add column if not exists wp_key_configured boolean
    generated always as (
      wp_site_url is not null
      and btrim(wp_site_url) <> ''
      and wp_username_encrypted is not null
      and btrim(wp_username_encrypted) <> ''
      and wp_app_password_encrypted is not null
      and btrim(wp_app_password_encrypted) <> ''
    ) stored,
  add column if not exists jotform_key_configured boolean
    generated always as (
      jotform_api_key_encrypted is not null
      and btrim(jotform_api_key_encrypted) <> ''
    ) stored;
