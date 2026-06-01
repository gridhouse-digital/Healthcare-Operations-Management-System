-- =============================================================================
-- Migration: Phase 0.1 (B) — SECURITY DEFINER views → security_invoker
--
-- Brief: docs/bmad/working-notes/2026-05-30-phase-0.1-rls-legacy-policy-remediation-handoff.md
--        (expanded scope item B)
--
-- PROBLEM (Supabase advisor ERROR `security_definer_view`, lint 0010):
--   Five reporting views are defined SECURITY DEFINER (the Postgres default for
--   views). A SECURITY DEFINER view runs with the *view owner's* privileges and
--   bypasses the *querying user's* RLS, so a query against any of these views
--   returns rows ACROSS tenants — a cross-tenant leak vector:
--     v_training_compliance            (base: training_records + training_adjustments)
--     v_active_training_compliance     (← v_training_compliance + group tables)
--     v_onboarding_training_compliance (← v_active_training_compliance)
--     v_recurring_compliance_status    (employee_compliance_instances + rules + people)
--     v_recurring_compliance_audit     (employee_compliance_instances + rules + people)
--
-- FIX: set `security_invoker = on` (Postgres 15+) on all five. The view then runs
--   with the QUERYING user's privileges, so the existing own-tenant RLS on every
--   underlying table applies and the view returns only the caller's tenant rows.
--
-- DASHBOARD-SAFETY (verified precondition — see DECISIONS.md): every underlying
--   table has an own-tenant SELECT/ALL policy keyed on
--     tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
--   (training_records, training_adjustments, people, employee_compliance_instances,
--    employee_group_enrollments, training_compliance_rules, learndash_group_courses),
--   so a legitimate tenant user STILL reads its own compliance dashboards after the
--   flip. ALL FIVE are flipped (incl. the nested view chain) so RLS propagates
--   consistently rather than a DEFINER inner view re-opening the leak.
--
-- Idempotent: re-running simply re-asserts the reloption. Each ALTER is guarded by
--   an existence check. Independently reversible — see the ROLLBACK block in
--   docs/Project_Docs/DECISIONS.md (set security_invoker = off on the five views).
-- =============================================================================

do $$
declare
  v text;
  target_views text[] := array[
    'v_training_compliance',
    'v_active_training_compliance',
    'v_onboarding_training_compliance',
    'v_recurring_compliance_status',
    'v_recurring_compliance_audit'
  ];
begin
  foreach v in array target_views loop
    if exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v and c.relkind = 'v'
    ) then
      execute format('alter view public.%I set (security_invoker = on)', v);
    else
      raise warning 'phase01 (B): expected view public.% not found — skipped', v;
    end if;
  end loop;
end $$;
