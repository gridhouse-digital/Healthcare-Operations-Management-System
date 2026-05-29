-- =============================================================================
-- Migration: Story 5.11 / 5.12 re-entry supersession hardening
--
-- Supports:
--   - explicit group-reentry anchor source
--   - explicit superseded recurring instances
--   - active recurring status view that hides prior-series rows after re-entry
--   - audit view exposing active vs historical/superseded recurring rows
-- =============================================================================

alter table public.employee_group_enrollments
  drop constraint if exists employee_group_enrollments_anchor_source_check;

alter table public.employee_group_enrollments
  add constraint employee_group_enrollments_anchor_source_check
  check (anchor_source in (
    'process_hire',
    'backfill',
    'hired_at_fallback',
    'manual',
    'training_record',
    'job_title_legacy',
    'group_reentry'
  ));

comment on column public.employee_group_enrollments.anchor_source is
  'Source of the anchor: process_hire, backfill, hired_at_fallback, manual, training_record, job_title_legacy, or group_reentry when a user returns to a previously removed LearnDash group.';

alter table public.employee_compliance_instances
  drop constraint if exists employee_compliance_instances_status_override_check;

alter table public.employee_compliance_instances
  add constraint employee_compliance_instances_status_override_check
  check (status_override in ('open', 'completed', 'reopened', 'superseded'));

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
),
active_primary_group as (
  select
    p.tenant_id,
    p.id as person_id,
    p.primary_compliance_group_id,
    exists (
      select 1
      from public.employee_group_enrollments primary_ege
      where primary_ege.tenant_id = p.tenant_id
        and primary_ege.person_id = p.id
        and primary_ege.group_id = p.primary_compliance_group_id
        and primary_ege.active = true
    ) as primary_group_is_active
  from public.people p
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
left join active_primary_group apg
  on apg.tenant_id = eci.tenant_id
 and apg.person_id = eci.person_id
where eci.status_override is distinct from 'superseded'
  and (
    eci.group_enrollment_id is null
    or (
      ege.active = true
      and eci.cycle_start_at >= ege.anchor_date
      and (
        apg.primary_compliance_group_id is null
        or apg.primary_group_is_active = false
        or ege.group_id = apg.primary_compliance_group_id
      )
    )
  );

comment on view public.v_recurring_compliance_status is
  'Derived recurring compliance status per employee cycle. Shows only active-group current-series obligations, hiding superseded rows and pre-reentry historical cycles while preserving them in base tables.';

create or replace view public.v_recurring_compliance_audit as
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
),
active_primary_group as (
  select
    p.tenant_id,
    p.id as person_id,
    p.primary_compliance_group_id,
    exists (
      select 1
      from public.employee_group_enrollments primary_ege
      where primary_ege.tenant_id = p.tenant_id
        and primary_ege.person_id = p.id
        and primary_ege.group_id = p.primary_compliance_group_id
        and primary_ege.active = true
    ) as primary_group_is_active
  from public.people p
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
  ege.group_id as enrollment_group_id,
  ege.anchor_date as current_anchor_date,
  ege.active as enrollment_active,
  rd.max_reminder_days,
  case
    when eci.completed_at is not null or eci.status_override = 'completed' then 'completed'
    when eci.due_at < current_date then 'overdue'
    when eci.due_at = current_date then 'due'
    when current_date >= (eci.due_at - rd.max_reminder_days) then 'due_soon'
    else 'not_yet_due'
  end as compliance_status,
  case
    when eci.status_override = 'superseded' then 'superseded'
    when eci.group_enrollment_id is null then 'active'
    when ege.active = false then 'inactive_group'
    when eci.cycle_start_at < ege.anchor_date then 'historical_series'
    when apg.primary_compliance_group_id is not null
      and apg.primary_group_is_active = true
      and ege.group_id <> apg.primary_compliance_group_id then 'primary_group_filtered'
    else 'active'
  end as visibility_state
from public.employee_compliance_instances eci
join public.training_compliance_rules tcr
  on tcr.id = eci.rule_id
join reminder_days rd
  on rd.instance_id = eci.id
left join public.employee_group_enrollments ege
  on ege.id = eci.group_enrollment_id
left join active_primary_group apg
  on apg.tenant_id = eci.tenant_id
 and apg.person_id = eci.person_id;

comment on view public.v_recurring_compliance_audit is
  'Audit view for recurring compliance. Includes active rows plus superseded, inactive-group, and pre-reentry historical cycles.';
