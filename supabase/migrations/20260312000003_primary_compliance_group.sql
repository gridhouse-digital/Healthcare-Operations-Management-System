-- =============================================================================
-- Migration: Primary Compliance Group
--
-- Adds an HR-owned primary compliance group on people so intentional
-- multi-group users can keep LearnDash access across groups without inheriting
-- every group's onboarding/recurring obligations.
-- =============================================================================

alter table public.people
  add column if not exists primary_compliance_group_id text;

comment on column public.people.primary_compliance_group_id is
  'Optional HR-owned override. When set to an active LearnDash group, onboarding and recurring compliance views prefer that group over other active group memberships.';

create index if not exists people_primary_compliance_group_idx
  on public.people (tenant_id, primary_compliance_group_id)
  where primary_compliance_group_id is not null;

create or replace view public.v_active_training_compliance as
with selected_active_groups as (
  select distinct
    ege.tenant_id,
    ege.person_id,
    ege.group_id
  from public.employee_group_enrollments ege
  join public.people p
    on p.tenant_id = ege.tenant_id
   and p.id = ege.person_id
  where ege.active = true
    and (
      p.primary_compliance_group_id is null
      or not exists (
        select 1
        from public.employee_group_enrollments primary_ege
        where primary_ege.tenant_id = ege.tenant_id
          and primary_ege.person_id = ege.person_id
          and primary_ege.group_id = p.primary_compliance_group_id
          and primary_ege.active = true
      )
      or ege.group_id = p.primary_compliance_group_id
    )
),
active_group_courses as (
  select distinct
    sag.tenant_id,
    sag.person_id,
    lgc.course_id
  from selected_active_groups sag
  join public.learndash_group_courses lgc
    on lgc.tenant_id = sag.tenant_id
   and lgc.group_id = sag.group_id
   and lgc.active = true
),
people_with_group_context as (
  select distinct
    tenant_id,
    person_id
  from active_group_courses
)
select vtc.*
from public.v_training_compliance vtc
where not exists (
  select 1
  from people_with_group_context pwgc
  where pwgc.tenant_id = vtc.tenant_id
    and pwgc.person_id = vtc.person_id
)
or exists (
  select 1
  from active_group_courses agc
  where agc.tenant_id = vtc.tenant_id
    and agc.person_id = vtc.person_id
    and agc.course_id = vtc.course_id
);

comment on view public.v_active_training_compliance is
  'Active training compliance view. When people.primary_compliance_group_id points to an active group, that group becomes the sole active compliance context. Otherwise all active groups count.';

create or replace view public.v_recurring_compliance_status as
with reminder_days as (
  select
    eci.id as instance_id,
    coalesce(
      (
        select max((value)::integer)
        from jsonb_array_elements_text(
          coalesce(eci.policy_snapshot -> 'reminder_days', '[]'::jsonb)
        ) value
      ),
      (
        select max(day_value)
        from unnest(coalesce(tcr.reminder_days, array[]::integer[])) day_value
      ),
      0
    ) as max_reminder_days
  from public.employee_compliance_instances eci
  join public.training_compliance_rules tcr
    on tcr.id = eci.rule_id
)
select
  eci.id as instance_id,
  eci.tenant_id,
  eci.person_id,
  eci.rule_id,
  coalesce(eci.policy_snapshot ->> 'rule_name', tcr.rule_name) as rule_name,
  coalesce(eci.policy_snapshot ->> 'rule_type', tcr.rule_type) as rule_type,
  coalesce(eci.policy_snapshot ->> 'rule_template', tcr.rule_template) as rule_template,
  coalesce(eci.policy_snapshot ->> 'course_id', tcr.course_id) as course_id,
  coalesce(eci.policy_snapshot ->> 'group_id', tcr.group_id) as group_id,
  eci.group_enrollment_id,
  eci.cycle_number,
  eci.cycle_start_at,
  eci.due_at,
  eci.completed_at,
  eci.completion_source,
  eci.completion_course_id,
  eci.completion_note,
  eci.reminder_suppressed,
  eci.status_override,
  eci.policy_snapshot,
  rd.max_reminder_days,
  case
    when eci.completed_at is not null or eci.status_override = 'completed' then 'completed'
    when eci.due_at < now() then 'overdue'
    when eci.due_at::date = current_date then 'due'
    when now() >= (eci.due_at - make_interval(days => rd.max_reminder_days)) then 'due_soon'
    else 'not_yet_due'
  end as compliance_status
from public.employee_compliance_instances eci
join public.training_compliance_rules tcr
  on tcr.id = eci.rule_id
join reminder_days rd
  on rd.instance_id = eci.id
left join public.employee_group_enrollments ege
  on ege.id = eci.group_enrollment_id
left join public.people p
  on p.tenant_id = eci.tenant_id
 and p.id = eci.person_id
where eci.group_enrollment_id is null
   or (
     ege.active = true
     and (
       p.primary_compliance_group_id is null
       or not exists (
         select 1
         from public.employee_group_enrollments primary_ege
         where primary_ege.tenant_id = eci.tenant_id
           and primary_ege.person_id = eci.person_id
           and primary_ege.group_id = p.primary_compliance_group_id
           and primary_ege.active = true
       )
       or ege.group_id = p.primary_compliance_group_id
     )
   );

comment on view public.v_recurring_compliance_status is
  'Derived recurring compliance status per employee cycle. Prefers people.primary_compliance_group_id when that group is active; otherwise falls back to all active groups.';
