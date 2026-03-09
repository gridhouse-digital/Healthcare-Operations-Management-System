-- =============================================================================
-- Migration: Epic 5 Story 5.1 — Drop legacy tables without tenant_id
--
-- These tables predate the multi-tenant architecture (Epic 1).
-- `employees` is replaced by `people` (type='employee').
-- `applicants_archive`, `offers_archive`, `profile_change_requests` are empty.
-- `settings` is replaced by `tenant_settings`.
-- =============================================================================

-- Drop tables in dependency order (no FKs reference these from other tables)
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS applicants_archive CASCADE;
DROP TABLE IF EXISTS offers_archive CASCADE;
DROP TABLE IF EXISTS profile_change_requests CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
