-- =============================================================================
-- Migration: Epic 5.9 Recurring Compliance Enhancement (Story 5.9.1)
--
-- Adds a recurring compliance model on top of the existing training ledger:
--   - training_courses: tenant-scoped synced course catalog
--   - training_compliance_rules: tenant-defined recurring compliance rules
--   - employee_group_enrollments: canonical anchor source for due dates
--   - employee_compliance_instances: one row per employee/rule/cycle
--   - compliance_notification_log: deduplicated reminder history
--   - employee_compliance_instance_actions: append-only manual admin actions
--   - v_recurring_compliance_status: current derived cycle status
--   - v_onboarding_training_compliance: onboarding-safe training view
-- =============================================================================

-- ---------------------------------------------------------------------------
-- training_courses
-- ---------------------------------------------------------------------------

create table if not exists public.training_courses (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references public.tenants(id),
  course_id     text        not null,
  course_name   text,
  active        boolean     not null default true,
  wp_meta       jsonb       not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, course_id)
);

comment on table public.training_courses is
  'Tenant-scoped LearnDash course catalog used for stable internal course references and settings UI.';

alter table public.training_courses enable row level security;

create policy "training_courses_select_own" on public.training_courses
  for select
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

-- ---------------------------------------------------------------------------
-- training_compliance_rules
-- ---------------------------------------------------------------------------

create table if not exists public.training_compliance_rules (
  id                           uuid        primary key default gen_random_uuid(),
  tenant_id                    uuid        not null references public.tenants(id),
  rule_name                    text        not null,
  rule_type                    text        not null check (
                                  rule_type in ('annual_recurring', 'interval_recurring', 'assignment_specific')
                                ),
  rule_template                text        check (
                                  rule_template in (
                                    'annual_employee_review',
                                    'annual_in_service',
                                    'fire_safety',
                                    'cpr_first_aid',
                                    'medication_administration',
                                    'client_specific_training'
                                  )
                                ),
  compliance_track             text        not null check (
                                  compliance_track in ('recurring', 'assignment')
                                ),
  applies_to_type              text        not null default 'group_members' check (
                                  applies_to_type in ('group_members', 'job_roles', 'manual_assignment')
                                ),
  course_id                    text        not null,
  group_id                     text        not null,
  anchor_type                  text        not null check (
                                  anchor_type in ('group_enrollment', 'hire_date', 'manual')
                                ),
  initial_due_offset_months    integer     not null default 12,
  recurrence_interval_months   integer     not null default 12,
  reminder_days                integer[]   not null default '{60,30}',
  notify_employee              boolean     not null default true,
  notify_admin                 boolean     not null default true,
  accept_learndash_completion  boolean     not null default true,
  allow_manual_completion      boolean     not null default true,
  allow_early_completion       boolean     not null default true,
  active                       boolean     not null default true,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  constraint training_compliance_rules_course_fk
    foreign key (tenant_id, course_id)
    references public.training_courses (tenant_id, course_id),
  unique (tenant_id, course_id, group_id)
);

comment on table public.training_compliance_rules is
  'Tenant-defined recurring compliance rules keyed to LearnDash course_id and group_id.';

alter table public.training_compliance_rules enable row level security;

create policy "training_compliance_rules_select_own" on public.training_compliance_rules
  for select
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

create policy "training_compliance_rules_insert_own" on public.training_compliance_rules
  for insert
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

create policy "training_compliance_rules_update_own" on public.training_compliance_rules
  for update
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

-- ---------------------------------------------------------------------------
-- employee_group_enrollments
-- ---------------------------------------------------------------------------

create table if not exists public.employee_group_enrollments (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references public.tenants(id),
  person_id     uuid        not null references public.people(id),
  group_id      text        not null,
  enrolled_at   timestamptz not null,
  anchor_date   timestamptz not null,
  anchor_source text        not null check (
                 anchor_source in ('process_hire', 'backfill', 'hired_at_fallback', 'manual')
               ),
  active        boolean     not null default true,
  ended_at      timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, person_id, group_id)
);

comment on table public.employee_group_enrollments is
  'Canonical group-enrollment anchor rows used to calculate recurring compliance due dates.';

alter table public.employee_group_enrollments enable row level security;

create policy "employee_group_enrollments_select_own" on public.employee_group_enrollments
  for select
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

create policy "employee_group_enrollments_insert_own" on public.employee_group_enrollments
  for insert
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

create policy "employee_group_enrollments_update_own" on public.employee_group_enrollments
  for update
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

-- ---------------------------------------------------------------------------
-- employee_compliance_instances
-- ---------------------------------------------------------------------------

create table if not exists public.employee_compliance_instances (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null references public.tenants(id),
  person_id            uuid        not null references public.people(id),
  rule_id              uuid        not null references public.training_compliance_rules(id),
  group_enrollment_id  uuid        references public.employee_group_enrollments(id),
  cycle_number         integer     not null,
  cycle_start_at       timestamptz not null,
  due_at               timestamptz not null,
  completed_at         timestamptz,
  completion_source    text        check (
                         completion_source in ('learndash', 'hr_attestation')
                       ),
  completion_course_id text,
  completion_note      text,
  reminder_suppressed  boolean     not null default false,
  status_override      text        check (
                         status_override in ('open', 'completed', 'reopened')
                       ),
  policy_snapshot      jsonb       not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (tenant_id, person_id, rule_id, cycle_number)
);

comment on table public.employee_compliance_instances is
  'Recurring compliance cycle ledger. One row per employee, rule, and cycle number.';

alter table public.employee_compliance_instances enable row level security;

create policy "employee_compliance_instances_select_own" on public.employee_compliance_instances
  for select
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

-- ---------------------------------------------------------------------------
-- compliance_notification_log
-- ---------------------------------------------------------------------------

create table if not exists public.compliance_notification_log (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references public.tenants(id),
  instance_id       uuid        not null references public.employee_compliance_instances(id),
  recipient_type    text        not null check (
                     recipient_type in ('employee', 'admin')
                   ),
  notification_type text        not null check (
                     notification_type in ('due_60', 'due_30', 'due_today', 'overdue')
                   ),
  sent_at           timestamptz not null default now(),
  payload           jsonb       not null default '{}'::jsonb,
  unique (tenant_id, instance_id, recipient_type, notification_type)
);

comment on table public.compliance_notification_log is
  'Deduplicated reminder send history for recurring compliance notifications.';

alter table public.compliance_notification_log enable row level security;

create policy "compliance_notification_log_select_own" on public.compliance_notification_log
  for select
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

create policy "compliance_notification_log_insert_own" on public.compliance_notification_log
  for insert
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

-- ---------------------------------------------------------------------------
-- employee_compliance_instance_actions
-- ---------------------------------------------------------------------------

create table if not exists public.employee_compliance_instance_actions (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id),
  instance_id uuid        not null references public.employee_compliance_instances(id),
  action_type text        not null check (
               action_type in (
                 'override_anchor',
                 'manual_complete',
                 'reopen_cycle',
                 'suppress_reminders',
                 'start_new_series'
               )
             ),
  actor_id    uuid        not null references auth.users(id),
  payload     jsonb       not null default '{}'::jsonb,
  reason      text        not null,
  created_at  timestamptz not null default now()
);

comment on table public.employee_compliance_instance_actions is
  'Append-only audit trail for manual recurring compliance actions.';

alter table public.employee_compliance_instance_actions enable row level security;

create policy "employee_compliance_instance_actions_select_own" on public.employee_compliance_instance_actions
  for select
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

create policy "employee_compliance_instance_actions_insert_own" on public.employee_compliance_instance_actions
  for insert
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists training_courses_tenant_active_idx
  on public.training_courses (tenant_id, active, course_name);

create index if not exists training_compliance_rules_tenant_active_idx
  on public.training_compliance_rules (tenant_id, active, compliance_track);

create index if not exists employee_group_enrollments_tenant_person_idx
  on public.employee_group_enrollments (tenant_id, person_id, active);

create index if not exists employee_compliance_instances_due_idx
  on public.employee_compliance_instances (tenant_id, due_at, completed_at);

create index if not exists employee_compliance_instances_person_idx
  on public.employee_compliance_instances (tenant_id, person_id, rule_id);

create index if not exists compliance_notification_log_instance_idx
  on public.compliance_notification_log (tenant_id, instance_id, sent_at desc);

create index if not exists employee_compliance_instance_actions_instance_idx
  on public.employee_compliance_instance_actions (tenant_id, instance_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Audit trigger helper
-- ---------------------------------------------------------------------------

create or replace function public.audit_recurring_compliance_table()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (
    tenant_id, actor_id, action, table_name, record_id, before, after
  ) values (
    coalesce(new.tenant_id, old.tenant_id),
    nullif(auth.jwt() ->> 'sub', '')::uuid,
    tg_op,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

create trigger audit_training_courses_trigger
  after insert or update on public.training_courses
  for each row execute function public.audit_recurring_compliance_table();

create trigger audit_training_compliance_rules_trigger
  after insert or update on public.training_compliance_rules
  for each row execute function public.audit_recurring_compliance_table();

create trigger audit_employee_group_enrollments_trigger
  after insert or update on public.employee_group_enrollments
  for each row execute function public.audit_recurring_compliance_table();

create trigger audit_employee_compliance_instances_trigger
  after insert or update on public.employee_compliance_instances
  for each row execute function public.audit_recurring_compliance_table();

create trigger audit_compliance_notification_log_trigger
  after insert on public.compliance_notification_log
  for each row execute function public.audit_recurring_compliance_table();

create trigger audit_employee_compliance_instance_actions_trigger
  after insert on public.employee_compliance_instance_actions
  for each row execute function public.audit_recurring_compliance_table();

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

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
  on rd.instance_id = eci.id;

comment on view public.v_recurring_compliance_status is
  'Derived recurring compliance status per employee cycle. Uses policy_snapshot reminder windows where available.';

create or replace view public.v_onboarding_training_compliance as
select vtc.*
from public.v_training_compliance vtc
where not exists (
  select 1
  from public.training_compliance_rules tcr
  join public.employee_group_enrollments ege
    on ege.tenant_id = vtc.tenant_id
   and ege.person_id = vtc.person_id
   and ege.group_id = tcr.group_id
   and ege.active = true
  where tcr.tenant_id = vtc.tenant_id
    and tcr.course_id = vtc.course_id
    and tcr.active = true
    and tcr.compliance_track = 'recurring'
);

comment on view public.v_onboarding_training_compliance is
  'Onboarding-safe training compliance view. Excludes recurring compliance courses for employees in matching active LearnDash group context.';
