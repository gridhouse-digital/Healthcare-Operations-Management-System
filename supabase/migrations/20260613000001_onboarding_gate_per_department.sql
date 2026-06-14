-- =============================================================================
-- Migration: Onboarding Gate Per Department
--
-- Handoff: docs/bmad/working-notes/2026-06-13-onboarding-gate-per-department-revision.md
-- Rollback block: docs/Project_Docs/DECISIONS.md (2026-06-13 entry)
--
-- Corrects the 2026-06-12 single-group model before activation. Onboarding is
-- per department: tenant_settings.ld_group_mappings entries flagged
-- is_onboarding=true define the LearnDash groups that can gate onboarding.
-- Recurring-tracked courses stay owned by the recurring compliance subsystem.
-- =============================================================================

-- First replace the view so it no longer depends on tenant_settings.
-- onboarding_group_id; then the obsolete column can be dropped without CASCADE.
create or replace view public.v_onboarding_gate as
with onboarding_groups as (
  select ts.tenant_id, (g->>'group_id') as group_id
  from public.tenant_settings ts,
       lateral jsonb_array_elements(coalesce(ts.ld_group_mappings, '[]'::jsonb)) as g
  where coalesce((g->>'is_onboarding')::boolean, false) = true
)
select
  og.tenant_id,
  ege.person_id,
  lgc.course_id,
  tc.course_name,
  coalesce(votc.effective_status, 'not_started') as effective_status,
  votc.effective_completed_at,
  (votc.training_record_id is not null)          as has_record
from onboarding_groups og
join public.employee_group_enrollments ege
  on ege.tenant_id = og.tenant_id and ege.group_id = og.group_id and ege.active
join public.learndash_group_courses lgc
  on lgc.tenant_id = og.tenant_id and lgc.group_id = og.group_id and lgc.active
join public.training_courses tc
  on tc.tenant_id = og.tenant_id and tc.course_id = lgc.course_id and tc.active
left join public.v_onboarding_training_compliance votc
  on votc.tenant_id = og.tenant_id
 and votc.person_id = ege.person_id
 and votc.course_id = lgc.course_id
where not exists (
  select 1 from public.training_compliance_rules tcr
  where tcr.tenant_id = og.tenant_id
    and tcr.course_id = lgc.course_id
    and tcr.group_id  = og.group_id
    and tcr.active
    and tcr.compliance_track = 'recurring'
);

alter view public.v_onboarding_gate set (security_invoker = on);

comment on view public.v_onboarding_gate is
  'Requirement-driven per-department onboarding completion gate. Onboarding groups are tenant_settings.ld_group_mappings entries with is_onboarding=true. One row per (person x active non-recurring course in an onboarding group the person is actively enrolled in), whether or not a training record exists; missing records surface as effective_status = ''not_started''. Recurring-tracked courses are excluded and remain owned by the recurring compliance subsystem.';

alter table public.tenant_settings
  drop column if exists onboarding_group_id;
