-- =============================================================================
-- Migration: Addendum C2 — finish function EXECUTE-grant hardening
--
-- Clears the residual `anon`/`authenticated`-executable SECURITY DEFINER advisor
-- WARNs that the post-deploy advisor pass flagged after Phase 0.1-C, for functions
-- that have no legitimate RPC caller. Verified 2026-06-01 (read-only):
--   - no frontend rpc() call to any function below;
--   - NO current RLS policy references is_admin() / get_my_role() (the profiles
--     policies that used them were dropped in Epic 5, 20260310000002);
--   - storage_obj_in_caller_tenant IS invoked by the storage.objects RLS SELECT
--     policies, which evaluate as the authenticated caller → authenticated keeps it.
--
-- Idempotent (REVOKE of an absent privilege is a no-op). Reversible — see
-- docs/Project_Docs/DECISIONS.md (2026-06-01).
-- =============================================================================

-- Trigger-only functions: nothing should invoke them via /rest/v1/rpc. Triggers
-- fire irrespective of EXECUTE grants, so revoking RPC reachability is safe.
revoke execute on function public.notify_onboard_employee() from anon, authenticated, public;
revoke execute on function public.training_adjustments_event_trigger() from anon, authenticated, public;
revoke execute on function public.training_records_event_trigger() from anon, authenticated, public;

-- Storage tenant-scope helper: invoked by the resumes / compliance-documents
-- storage.objects RLS SELECT policies as the authenticated caller, so authenticated
-- MUST retain EXECUTE. anon has no read policy that uses it → revoke anon only.
revoke execute on function public.storage_obj_in_caller_tenant(text, text) from anon;

-- Legacy role helpers: no RLS policy and no frontend RPC calls them (verified).
-- With no external caller, revoke from anon, authenticated, PUBLIC — internal
-- SECURITY DEFINER callers (if any) execute as the function owner and are
-- unaffected. Re-grant in rollback if a future caller needs them.
revoke execute on function public.get_my_role() from anon, authenticated, public;
revoke execute on function public.is_admin() from anon, authenticated, public;
