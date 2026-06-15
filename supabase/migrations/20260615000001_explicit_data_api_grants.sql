-- =============================================================================
-- Migration: Explicit Data API grants (durable replacement for the temporary
-- supabase/config.toml `api.auto_expose_new_tables = true` flag).
--
-- Context (DECISIONS.md 2026-06-15): Supabase removes `auto_expose_new_tables`
-- on 2026-10-30 (the new cloud default no longer auto-grants migration-created
-- public objects to the Data API roles). PR #20 set the flag = true as a
-- temporary CI/local unblock. This migration makes the grants EXPLICIT so fresh
-- databases (CI / new envs) and future Supabase defaults are deterministic and
-- match production exactly.
--
-- Model: this app uses the standard Supabase posture — broad GRANT to the Data
-- API roles + RLS as the isolation guard. Verified 2026-06-15 that production
-- already grants ALL on every public table to anon/authenticated/service_role,
-- with matching ALTER DEFAULT PRIVILEGES for future objects. These grants are
-- REACHABILITY only; tenant isolation remains enforced by RLS (covered by the
-- rls-isolation CI gate). This migration changes nothing on prod (idempotent
-- no-op there) and restores the same grants on a fresh DB without the flag.
-- =============================================================================

-- Existing public objects ----------------------------------------------------
grant all     on all tables    in schema public to anon, authenticated, service_role;
grant all     on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

-- Future public objects (created by the migration-runner role) ---------------
alter default privileges in schema public grant all     on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all     on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Preserve function hardening from earlier migrations ------------------------
-- The broad function EXECUTE grant above restores Supabase's default Data API
-- reachability, but it must not reopen sensitive/internal RPCs that prior
-- migrations explicitly removed from public-facing roles. Re-apply those
-- exceptions as the final operation in this migration.
revoke execute on function public.pgp_sym_decrypt_text(text, text) from anon;
revoke execute on function public.pgp_sym_encrypt_text(text, text) from anon, authenticated;

do $$
declare
  r record;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'audit\_%' escape '\'
  loop
    execute format(
      'revoke execute on function public.%I(%s) from anon, authenticated, public',
      r.proname, r.args
    );
  end loop;
end $$;

revoke execute on function public.notify_onboard_employee() from anon, authenticated, public;
revoke execute on function public.training_adjustments_event_trigger() from anon, authenticated, public;
revoke execute on function public.training_records_event_trigger() from anon, authenticated, public;
revoke execute on function public.storage_obj_in_caller_tenant(text, text) from anon;
revoke execute on function public.get_my_role() from anon, authenticated, public;
revoke execute on function public.is_admin() from anon, authenticated, public;
