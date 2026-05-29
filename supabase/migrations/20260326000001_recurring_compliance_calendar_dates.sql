-- =============================================================================
-- Migration: Recurring Compliance Calendar-Date Hardening
--
-- Converts recurring compliance business dates from timestamptz to date so
-- anchor and due dates remain stable across timezones.
-- =============================================================================

drop view if exists public.v_recurring_compliance_status;

alter table public.employee_group_enrollments
  alter column anchor_date type date
  using ((anchor_date at time zone 'UTC')::date);

comment on column public.employee_group_enrollments.anchor_date is
  'Calendar anchor date for recurring compliance. Stored as DATE to avoid timezone drift.';

alter table public.employee_compliance_instances
  alter column cycle_start_at type date
  using ((cycle_start_at at time zone 'UTC')::date),
  alter column due_at type date
  using ((due_at at time zone 'UTC')::date);

comment on column public.employee_compliance_instances.cycle_start_at is
  'Cycle start calendar date for the recurring compliance series.';

comment on column public.employee_compliance_instances.due_at is
  'Cycle due calendar date for recurring compliance.';

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
    when eci.due_at < current_date then 'overdue'
    when eci.due_at = current_date then 'due'
    when current_date >= (eci.due_at - rd.max_reminder_days) then 'due_soon'
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
  'Derived recurring compliance status per employee cycle. Calendar dates use DATE semantics to avoid timezone drift.';
