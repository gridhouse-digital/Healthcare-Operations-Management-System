-- Migration: Add JotForm API key column to tenant_settings
-- Part of connector settings cleanup — stores per-tenant JotForm key encrypted via pgcrypto.

alter table public.tenant_settings
  add column if not exists jotform_api_key_encrypted text;

comment on column public.tenant_settings.jotform_api_key_encrypted is
  'Encrypted with pgcrypto. Decrypted ONLY inside Edge Functions. Never transmitted to frontend.';
