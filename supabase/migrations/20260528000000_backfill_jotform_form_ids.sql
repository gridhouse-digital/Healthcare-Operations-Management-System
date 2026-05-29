-- Backfill JotForm form IDs for Prolific Homecare from legacy single-tenant settings seed.
-- Epic 5 moved columns to tenant_settings but did not migrate values.

UPDATE tenant_settings
SET
  jotform_form_id_application = COALESCE(jotform_form_id_application, '241904161216448'),
  jotform_form_id_emergency = COALESCE(jotform_form_id_emergency, '241904172937460'),
  jotform_form_id_i9 = COALESCE(jotform_form_id_i9, '241904132956457'),
  jotform_form_id_vaccination = COALESCE(jotform_form_id_vaccination, '241903896305461'),
  jotform_form_id_licenses = COALESCE(jotform_form_id_licenses, '241904101484449'),
  jotform_form_id_background = COALESCE(jotform_form_id_background, '241903864179465')
WHERE tenant_id = '11111111-1111-1111-1111-111111111111';
