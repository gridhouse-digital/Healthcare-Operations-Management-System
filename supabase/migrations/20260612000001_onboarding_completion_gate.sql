-- =============================================================================
-- Migration: Onboarding Completion Gate (requirement-driven, tenant-configured)
--
-- Handoff: docs/bmad/working-notes/2026-06-07-onboarding-completion-gate-handoff.md
-- Rollback block: docs/Project_Docs/DECISIONS.md (2026-06-12 entry)
--
-- PROBLEM (P1, verified live): v_onboarding_training_compliance is RECORD-driven
-- (built FROM training_records), so a mandatory course with no synced record
-- simply vanishes from the resolver's completeness check — fail-open `Active`.
--
-- FIX (owner decisions LOCKED 2026-06-11, single-group ruling re-confirmed
-- 2026-06-12): each tenant designates ONE official onboarding LearnDash group
-- in settings; a NEW requirement-driven view emits one row per
-- (person x gating course) WHETHER OR NOT a training record exists, so a
-- missing record surfaces as effective_status = 'not_started'.
-- v_onboarding_training_compliance is NOT modified — the gate joins to it for
-- effective (Layer A/B merged) status.
-- =============================================================================

-- 1) Tenant setting: designated onboarding group (LearnDash group id; text matches
--    learndash_group_courses.group_id / employee_group_enrollments.group_id)
alter table public.tenant_settings
  add column if not exists onboarding_group_id text;

comment on column public.tenant_settings.onboarding_group_id is
  'LearnDash group id designated as the official onboarding group. Source of truth for onboarding assignment and the onboarding completion gate. NULL = gate not configured (resolver fails closed).';

-- 2) NEW requirement-driven gate view (alongside, not replacing, the
--    record-driven view). security_invoker per the Phase 0.1 SECURITY DEFINER
--    ruling: the querying user's RLS on the underlying tables applies, so the
--    view returns only the caller's tenant rows.
create or replace view public.v_onboarding_gate as
select
  ts.tenant_id,
  ege.person_id,
  lgc.course_id,
  tc.course_name,
  coalesce(votc.effective_status, 'not_started') as effective_status,
  votc.effective_completed_at,
  (votc.training_record_id is not null)          as has_record
from public.tenant_settings ts
join public.employee_group_enrollments ege
  on ege.tenant_id = ts.tenant_id
 and ege.group_id  = ts.onboarding_group_id
 and ege.active
join public.learndash_group_courses lgc
  on lgc.tenant_id = ts.tenant_id
 and lgc.group_id  = ts.onboarding_group_id
 and lgc.active
join public.training_courses tc
  on tc.tenant_id = ts.tenant_id
 and tc.course_id = lgc.course_id
 and tc.active
left join public.v_onboarding_training_compliance votc
  on votc.tenant_id = ts.tenant_id
 and votc.person_id = ege.person_id
 and votc.course_id = lgc.course_id
where ts.onboarding_group_id is not null
  and not exists (                          -- recurring courses belong to the recurring subsystem
    select 1 from public.training_compliance_rules tcr
    where tcr.tenant_id = ts.tenant_id
      and tcr.course_id = lgc.course_id
      and tcr.group_id  = ts.onboarding_group_id
      and tcr.active
      and tcr.compliance_track = 'recurring'
  );

alter view public.v_onboarding_gate set (security_invoker = on);

comment on view public.v_onboarding_gate is
  'Requirement-driven onboarding completion gate. One row per (person x active course mapped to the tenant''s designated onboarding group), whether or not a training record exists — a missing record surfaces as effective_status = ''not_started'' (fail-closed). Recurring-tracked courses are excluded (owned by the recurring compliance subsystem). Effective status comes from v_onboarding_training_compliance, so Layer B overrides still apply.';
