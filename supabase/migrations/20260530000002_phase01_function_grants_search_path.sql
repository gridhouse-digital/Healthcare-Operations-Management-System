-- =============================================================================
-- Migration: Phase 0.1 (C) — function EXECUTE-grant + search_path hardening
--
-- Brief: docs/bmad/working-notes/2026-05-30-phase-0.1-rls-legacy-policy-remediation-handoff.md
--        (expanded scope item C)
--
-- Addresses three Supabase security advisors (all WARN):
--   1. anon/authenticated can execute the pgcrypto text wrappers via /rest/v1/rpc
--      (lints 0028/0029). Decryption/encryption must never be reachable by anon
--      (and encryption not by ordinary signed-in users). service_role keeps both
--      (the Edge Functions that legitimately (de)crypt run as service_role).
--   2. The audit TRIGGER functions are EXECUTE-able by anon/authenticated/PUBLIC
--      via /rest/v1/rpc (lints 0028/0029). They are trigger-only — nothing should
--      invoke them as an RPC. Triggers fire irrespective of EXECUTE grants, so
--      revoking RPC executability does not affect auditing.
--   3. ~17 SECURITY DEFINER functions have a role-mutable search_path
--      (lint 0011) — a search-path-injection hardening gap. Pin a fixed
--      search_path so name resolution cannot be hijacked by a caller's role
--      setting.
--
-- search_path choice = `public, pg_catalog`: this equals the effective resolution
--   path these functions already rely on (their bodies reference public tables +
--   pg_catalog builtins unqualified), so behavior is UNCHANGED while the value is
--   now FIXED (clears lint 0011). NB: pgp_sym_decrypt_text/encrypt_text already
--   carry an explicit search_path and are intentionally NOT re-set here. A
--   stricter `search_path = ''` (fully-qualified bodies) is a future follow-up.
--
-- >>> custom_access_token_hook is the Auth access-token hook (gates every login)
--     and respond_to_offer is the candidate offer-response RPC — both MUST be
--     smoke-tested on the preview branch (login succeeds; offer response works)
--     before this migration is deployed. See the VALIDATION GATE in the handback.
--
-- Idempotent: ALTER ... SET search_path and REVOKE are naturally repeatable;
--   functions are discovered by name so exact signatures need not be hard-coded.
-- Independently reversible — see the ROLLBACK block in docs/Project_Docs/DECISIONS.md
--   (RESET search_path + re-GRANT EXECUTE to the original roles).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. pgcrypto text wrappers — revoke RPC reachability from public-facing roles.
--    Confirmed today: pgp_sym_decrypt_text  anon=EXECUTE (authenticated already
--    lacks it); pgp_sym_encrypt_text anon=EXECUTE, authenticated=EXECUTE.
--    service_role retains EXECUTE on both (used by the encryption Edge Functions).
-- -----------------------------------------------------------------------------
revoke execute on function public.pgp_sym_decrypt_text(text, text) from anon;
revoke execute on function public.pgp_sym_encrypt_text(text, text) from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Audit trigger functions — revoke EXECUTE from anon, authenticated, PUBLIC
--    (covers both default-PUBLIC and any explicit role grants). Trigger-only.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  audit_fns text[] := array[
    'audit_people', 'audit_offers', 'audit_ai_cache',
    'audit_tenant_settings', 'audit_tenant_users',
    'audit_training_records', 'audit_training_adjustments',
    'audit_training_events', 'audit_recurring_compliance_table'
  ];
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(audit_fns)
  loop
    execute format(
      'revoke execute on function public.%I(%s) from anon, authenticated, public',
      r.proname, r.args
    );
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Pin a fixed search_path on the flagged SECURITY DEFINER functions.
--    Discovered by name so overloads/signatures are handled automatically.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  sp_fns text[] := array[
    'update_updated_at_column',
    'set_tenant_access_requests_updated_at',
    'is_admin',
    'get_my_role',
    'training_adjustments_event_trigger',
    'training_records_event_trigger',
    'audit_people', 'audit_offers', 'audit_ai_cache',
    'audit_tenant_settings', 'audit_tenant_users',
    'audit_training_records', 'audit_training_adjustments',
    'audit_training_events', 'audit_recurring_compliance_table',
    'respond_to_offer',
    'custom_access_token_hook'
  ];
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(sp_fns)
  loop
    execute format(
      'alter function public.%I(%s) set search_path = public, pg_catalog',
      r.proname, r.args
    );
  end loop;
end $$;
