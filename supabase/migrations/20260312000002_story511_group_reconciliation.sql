-- =============================================================================
-- Migration: Story 5.11 / 5.12 Group Reconciliation
--
-- Adds tenant-scoped LearnDash group -> course mappings so the HR app can:
--   - determine which training courses are active for a person's current groups
--   - hide stale courses from removed groups without deleting historical records
--   - suppress recurring compliance rows tied to inactive group enrollments
-- =============================================================================

create table if not exists public.learndash_group_courses (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references public.tenants(id),
  group_id      text        not null,
  course_id     text        not null,
  course_name   text,
  active        boolean     not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, group_id, course_id)
);

comment on table public.learndash_group_courses is
  'Tenant-scoped LearnDash group to course mapping synced from WordPress. Used to derive active training from current group assignments.';

alter table public.learndash_group_courses enable row level security;

create policy "learndash_group_courses_select_own" on public.learndash_group_courses
  for select
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

create index if not exists learndash_group_courses_tenant_group_idx
  on public.learndash_group_courses (tenant_id, group_id, active);

create index if not exists learndash_group_courses_tenant_course_idx
  on public.learndash_group_courses (tenant_id, course_id, active);

create trigger audit_learndash_group_courses_trigger
  after insert or update on public.learndash_group_courses
  for each row execute function public.audit_recurring_compliance_table();

create or replace view public.v_active_training_compliance as
with active_group_courses as (
  select distinct
    ege.tenant_id,
    ege.person_id,
    lgc.course_id
  from public.employee_group_enrollments ege
  join public.learndash_group_courses lgc
    on lgc.tenant_id = ege.tenant_id
   and lgc.group_id = ege.group_id
   and lgc.active = true
  where ege.active = true
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
  'Active training compliance view. If current LearnDash group-course mappings exist for a person, only courses in active group context are shown. Otherwise falls back to legacy full training view.';

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
where eci.group_enrollment_id is null
   or ege.active = true;

comment on view public.v_recurring_compliance_status is
  'Derived recurring compliance status per employee cycle. Hides cycles tied to inactive group enrollments while preserving history in the base table.';

create or replace view public.v_onboarding_training_compliance as
select vatc.*
from public.v_active_training_compliance vatc
where not exists (
  select 1
  from public.training_compliance_rules tcr
  join public.employee_group_enrollments ege
    on ege.tenant_id = vatc.tenant_id
   and ege.person_id = vatc.person_id
   and ege.group_id = tcr.group_id
   and ege.active = true
  where tcr.tenant_id = vatc.tenant_id
    and tcr.course_id = vatc.course_id
    and tcr.active = true
    and tcr.compliance_track = 'recurring'
);

comment on view public.v_onboarding_training_compliance is
  'Onboarding-safe training compliance view. Filters to active LearnDash group context when available and excludes recurring compliance courses.';
