-- =============================================================================
-- Migration: Epic 5 Story 5.4 — Add JotForm form IDs + Brevo key to tenant_settings
--
-- The legacy `settings` table (key-value) has been dropped. These columns move
-- JotForm form IDs and Brevo API key into per-tenant columnar storage.
-- =============================================================================

-- JotForm form IDs (per-tenant)
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS jotform_form_id_application TEXT,
  ADD COLUMN IF NOT EXISTS jotform_form_id_emergency TEXT,
  ADD COLUMN IF NOT EXISTS jotform_form_id_i9 TEXT,
  ADD COLUMN IF NOT EXISTS jotform_form_id_vaccination TEXT,
  ADD COLUMN IF NOT EXISTS jotform_form_id_licenses TEXT,
  ADD COLUMN IF NOT EXISTS jotform_form_id_background TEXT;

-- Brevo email API key (encrypted like other keys)
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS brevo_api_key_encrypted TEXT;

-- Logo URL for emails
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS logo_light TEXT;

-- Update profile_source CHECK to include 'wordpress' and 'jotform'
ALTER TABLE tenant_settings DROP CONSTRAINT IF EXISTS tenant_settings_profile_source_check;
ALTER TABLE tenant_settings ADD CONSTRAINT tenant_settings_profile_source_check
  CHECK (profile_source IS NULL OR profile_source = ANY (ARRAY['bamboohr'::text, 'jazzhr'::text, 'wordpress'::text]));
