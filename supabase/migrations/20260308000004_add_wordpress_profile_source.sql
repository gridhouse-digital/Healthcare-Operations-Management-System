-- =============================================================================
-- Migration: Add 'wordpress' to people.profile_source CHECK constraint
--
-- The original constraint only allowed 'bamboohr' and 'jazzhr'.
-- sync-wp-users EF needs to set profile_source = 'wordpress' on insert.
-- =============================================================================

ALTER TABLE people DROP CONSTRAINT IF EXISTS people_profile_source_check;
ALTER TABLE people ADD CONSTRAINT people_profile_source_check
  CHECK (profile_source = ANY (ARRAY['bamboohr'::text, 'jazzhr'::text, 'wordpress'::text]));
