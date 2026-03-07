-- Migration: add wp_user_id to people table
-- Story 3.1 — process-hire EF
--
-- wp_user_id is set after WordPress user creation.
-- Null = not yet onboarded to WP.
-- Stored as integer (WP user IDs are integers).

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS wp_user_id integer;

COMMENT ON COLUMN public.people.wp_user_id IS
  'WordPress user ID after onboarding. NULL = not yet created in WP.';
