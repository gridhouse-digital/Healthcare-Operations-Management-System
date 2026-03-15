-- =============================================================================
-- Migration: Fix auth user creation after Epic 5 profiles removal
-- Reason: Legacy trigger still inserts into public.profiles, which was dropped.
-- =============================================================================

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

