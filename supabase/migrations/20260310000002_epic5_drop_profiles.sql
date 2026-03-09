-- =============================================================================
-- Migration: Epic 5 Story 5.8
-- Deprecate profiles table in favor of tenant_users + auth metadata
-- =============================================================================

drop table if exists public.profiles cascade;
