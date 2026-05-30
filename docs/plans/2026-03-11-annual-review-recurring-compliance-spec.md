> [!NOTE]
> **PROVENANCE / HISTORICAL BASELINE**
> This file is a canonical copy of the original planning spec drafted on 2026-03-11.
> It represents the design baseline for the recurring compliance subsystem subsequently
> implemented and shipped under **Stories 5.11 through 5.17** of Epic 5
> (the "Epic 5.9" label was a placeholder; the work was renumbered before implementation).
> For active runtime architecture, refer to `prolific-hr-app/docs/Project_Docs/DECISIONS.md`
> and `prolific-hr-app/docs/Project_Docs/SCHEMA.md`.
>
> **Shipped artifacts that realize this design:**
> - Migration: `supabase/migrations/20260311000007_epic59_recurring_compliance_schema.sql`
> - Hardening migration (re-entry/supersession): `supabase/migrations/20260528000001_story511_story512_reentry_supersession.sql` (adds `v_recurring_compliance_audit`)
> - Edge Functions: `rebuild-compliance-instances`, `backfill-recurring-compliance-anchors`, `manage-recurring-compliance-instance`
> - Frontend: `src/features/settings/components/TrainingComplianceRulesPage.tsx`, `src/features/training/components/RecurringComplianceDashboard.tsx`
>
> Rescued into the canonical tree by the 2026-05-29 documentation audit. The original
> remains in the parent workspace local mirror per owner instruction.

---

# Annual Review Recurring Compliance - Implementation Spec

> Date: 2026-03-11
> Status: Draft for implementation planning
> Scope: Prolific HR app recurring annual compliance enhancement

## Goal

Implement annual recurring compliance for tenant-configured LearnDash courses that remain inside existing LearnDash groups, while keeping:

- LearnDash as the source of course content, group membership, and raw course progress
- Supabase and the HR app as the source of compliance rules, due dates, reminders, and admin reporting

## Core Decisions

1. The Annual Review course is identified by tenant-configured `course_id`, not by course title.
2. Recurring compliance is modeled separately from onboarding progress.
3. The default anchor is the employee's LearnDash group enrollment date for the configured group.
4. Fallback anchor order is:
   - group enrollment date
   - `people.hired_at`
   - manual admin override
5. Recurring cycles are anniversary-based. Early completion does not move the next due date.
6. The system must support two completion sources:
   - LearnDash completion when a fresh completion timestamp exists
   - HR admin attestation when LearnDash cannot reliably produce a new yearly completion
7. Historical compliance must remain auditable even if rule settings change later, so each cycle stores a policy snapshot.

## Non-Goals

- Replacing LearnDash as the training content platform
- Rewriting the raw training ledger (`training_records`, `training_adjustments`, `training_events`)
- Building WordPress reset automation in phase 1

## Existing System Constraints

- `sync-training` currently writes raw per-course state into `training_records`.
- `training_records.enrolled_at` is populated from LearnDash course `date_started`. This is course activity, not a trustworthy group-enrollment anchor.
- The current training UI and onboarding checks aggregate all courses together. The annual-review course must be removed from onboarding business views, not from the raw sync layer.

## Data Model

Keep existing:

- `training_records`
- `training_adjustments`
- `training_events`
- `v_training_compliance`

Add:

### 1. `training_courses`

Tenant-scoped course catalog for stable internal references and settings UI.

```sql
create table public.training_courses (
  tenant_id uuid not null references public.tenants(id),
  course_id text not null,
  course_name text,
  active boolean not null default true,
  wp_meta jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, course_id)
);
```

### 2. `training_compliance_rules`

Tenant-owned compliance rules. One row marks a course as annual recurring for a specific LearnDash group context.

```sql
create table public.training_compliance_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  course_id text not null,
  group_id text not null,
  rule_type text not null check (rule_type in ('annual_review', 'recurring_compliance')),
  compliance_track text not null check (compliance_track in ('recurring')),
  anchor_type text not null check (anchor_type in ('group_enrollment', 'hire_date', 'manual')),
  initial_due_offset_months integer not null default 12,
  recurrence_interval_months integer not null default 12,
  reminder_days integer[] not null default '{60,30}',
  allow_early_completion boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, course_id, group_id, rule_type)
);
```

### 3. `employee_group_enrollments`

Canonical anchor source for compliance scheduling.

```sql
create table public.employee_group_enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  person_id uuid not null references public.people(id),
  group_id text not null,
  enrolled_at timestamptz not null,
  anchor_date timestamptz not null,
  anchor_source text not null check (
    anchor_source in ('process_hire', 'backfill', 'hired_at_fallback', 'manual')
  ),
  active boolean not null default true,
  ended_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 4. `employee_compliance_instances`

One row per employee, rule, and cycle. This is the actual compliance schedule ledger.

```sql
create table public.employee_compliance_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  person_id uuid not null references public.people(id),
  rule_id uuid not null references public.training_compliance_rules(id),
  group_enrollment_id uuid null references public.employee_group_enrollments(id),
  cycle_number integer not null,
  cycle_start_at timestamptz not null,
  due_at timestamptz not null,
  completed_at timestamptz null,
  completion_source text null check (completion_source in ('learndash', 'hr_attestation')),
  completion_course_id text null,
  completion_note text null,
  reminder_suppressed boolean not null default false,
  status_override text null check (status_override in ('open', 'completed', 'reopened')),
  policy_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, person_id, rule_id, cycle_number)
);
```

`policy_snapshot` must include:

- `rule_type`
- `course_id`
- `group_id`
- `anchor_type`
- `initial_due_offset_months`
- `recurrence_interval_months`
- `reminder_days`
- `allow_early_completion`

### 5. `compliance_notification_log`

Deduplicates outbound reminders and admin notices.

```sql
create table public.compliance_notification_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  instance_id uuid not null references public.employee_compliance_instances(id),
  recipient_type text not null check (recipient_type in ('employee', 'admin')),
  notification_type text not null check (
    notification_type in ('due_60', 'due_30', 'due_today', 'overdue')
  ),
  sent_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  unique (tenant_id, instance_id, recipient_type, notification_type)
);
```

### 6. `employee_compliance_instance_actions`

Append-only manual controls and audit trail for instance-level actions.

```sql
create table public.employee_compliance_instance_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  instance_id uuid not null references public.employee_compliance_instances(id),
  action_type text not null check (
    action_type in (
      'override_anchor',
      'manual_complete',
      'reopen_cycle',
      'suppress_reminders',
      'start_new_series'
    )
  ),
  actor_id uuid not null references auth.users(id),
  payload jsonb not null default '{}'::jsonb,
  reason text not null,
  created_at timestamptz not null default now()
);
```

## Views

### `v_recurring_compliance_status`

One row per active employee cycle with derived status:

- `not_yet_due`
- `due_soon`
- `due`
- `overdue`
- `completed`

Derived logic:

- `completed`: `completed_at is not null`
- `overdue`: not completed and `now() > due_at`
- `due`: not completed and `now()::date = due_at::date`
- `due_soon`: not completed and `now() >= due_at - max(reminder_days)`
- `not_yet_due`: otherwise

### `v_onboarding_training_compliance`

Derived from `v_training_compliance`, excluding any course rows that are in recurring compliance context for that tenant and group rule. This filters business views only. It does not delete or mutate raw course data.

## Completion Recognition Rules

1. LearnDash completion can satisfy the current cycle only when a completion timestamp is on or after `cycle_start_at`.
2. A stale old completion from a previous year must not satisfy a new cycle.
3. If LearnDash produces a fresh completion timestamp, set:
   - `completed_at`
   - `completion_source = 'learndash'`
4. If LearnDash cannot produce a new yearly completion reliably, HR admins can complete the cycle manually:
   - `completed_at = now()` or entered date
   - `completion_source = 'hr_attestation'`
5. Manual completion is cycle-specific. It must not use `training_adjustments`, because those are person-course overrides, not recurring-cycle overrides.

## Rehire and Termination Policy

Add a tenant setting for recurring compliance behavior on return-to-work:

- `pause_preserve_anchor`
- `restart_on_rehire`
- `require_admin_decision`

Recommended default: `require_admin_decision`

Behavior:

- On termination or inactive status, open reminders pause.
- Open cycles remain visible to admins.
- On rehire, either resume the old series or create a new cycle series based on the tenant policy or explicit admin action.

## Manual Admin Controls

The first implementation must support:

- override anchor date
- manual complete cycle
- reopen cycle
- suppress reminders
- start a new compliance series on rehire

These actions must write to `employee_compliance_instance_actions` and update the target instance row.

## Edge Functions and Jobs

### 1. Update `sync-training`

Add:

- upsert to `training_courses`
- optional recurring-compliance reconciliation hook after raw sync completes

Do not add:

- due-date logic
- reminder logic
- cycle completion logic beyond exposing fresh raw completion data

### 2. Update `process-hire`

After successful LearnDash group enrollment:

- insert `employee_group_enrollments`
- use the actual enrollment timestamp as `enrolled_at`
- set `anchor_date = enrolled_at`
- call recurring-instance rebuild for the affected employee or tenant

### 3. New EF: `rebuild-compliance-instances`

Responsibilities:

- read active `training_compliance_rules`
- resolve anchor date from `employee_group_enrollments`
- generate missing yearly cycles
- store `policy_snapshot`
- attach LearnDash completion when a qualifying completion exists
- respect manual actions such as `reopen_cycle` and `start_new_series`

Triggers:

- nightly schedule
- after `process-hire`
- after rule create/update
- after manual admin actions

### 4. New EF: `send-compliance-reminders`

Responsibilities:

- read from `v_recurring_compliance_status`
- send employee reminders at 60 and 30 days
- optionally send day-of reminders
- send admin overdue or digest notifications
- deduplicate using `compliance_notification_log`
- skip suppressed reminders

### 5. New EF: `backfill-recurring-compliance-anchors`

Responsibilities:

- create `employee_group_enrollments` for historical employees
- use `integration_log.completed_at` for `process-hire` rows with `groups_enrolled`
- fallback to `people.hired_at`
- mark `anchor_source` appropriately
- flag rows needing manual review

## Frontend Changes

### Settings

Add a recurring compliance settings surface:

- pick course from synced `training_courses`
- choose LearnDash group
- set rule type to annual review
- configure reminder windows
- choose anchor policy
- choose rehire policy

### Training Page

Split into clear tracks:

- Onboarding
- Recurring Compliance

Recurring compliance table should show:

- employee
- annual review course
- due date
- status
- completed date
- completion source
- next reminder state

### Employee Profile

Add a dedicated recurring compliance panel with:

- current cycle status
- anchor date
- due date
- completed date
- completion source
- admin action menu

### Reporting

Add recurring compliance filters and exports for:

- not yet due
- due soon
- due
- overdue
- completed

## Simple Rule Catalog

Use these plain-language rule templates in the settings UI so HR admins are not configuring from scratch:

| Rule template | What it means | Suggested track | Typical interval |
|---|---|---|---|
| Annual Employee Review | Yearly employee review or annual review course | Recurring Compliance | 12 months |
| Annual In-Service | Yearly caregiver refresher training | Recurring Compliance | 12 months |
| Fire Safety | Annual safety and emergency refresher | Recurring Compliance | 12 months |
| CPR / First Aid | Certification that must stay current | Recurring Compliance | 12 or 24 months |
| Medication Administration | Training only for medication-authorized staff | Recurring Compliance or Assignment-Specific | Tenant-defined |
| Client-Specific Training | Training required for a specific patient or case | Assignment-Specific | Event-driven |

For the current request, the LearnDash course `CAREGIVER-MODULE 6-ANNUAL EMPLOYEE REVIEW` should use:

- template: `Annual Employee Review`
- track: `Recurring Compliance`
- interval: `12 months`
- default anchor: `Group enrollment date`
- completion source: `LearnDash + Manual HR completion`

## Simple Settings Screen Design

### Page name

`Training Compliance Rules`

### Main table

| Rule Name | LearnDash Course | Applies To | Due Every | Reminders | Status | Actions |
|---|---|---|---|---|---|---|
| Annual Employee Review | CAREGIVER-MODULE 6 | Everyone in group | 12 months | 60, 30 days | Active | Edit |

### Add/Edit rule form

Show these fields only in version 1:

- `Rule Name`
- `Rule Type`
- `LearnDash Group`
- `LearnDash Course`
- `Applies To`
- `Anchor Date`
- `First Due`
- `Repeats Every`
- `Reminder Schedule`
- `Notify`
- `Completion Source`
- `Status`

Recommended defaults for annual review:

- `Rule Type`: `Annual Recurring`
- `Applies To`: `Everyone in this group`
- `Anchor Date`: `Group enrollment date`
- `First Due`: `12 months after anchor date`
- `Repeats Every`: `12 months`
- `Reminder Schedule`: `60 days before due date`, `30 days before due date`
- `Notify`: `Employee`, `HR/Admin`
- `Completion Source`: `Accept LearnDash completion`, `Allow manual HR completion`

## Simple Recurring Compliance Dashboard Design

### Page name

`Recurring Compliance`

### Summary cards

- `Not Yet Due`
- `Due Soon`
- `Overdue`
- `Completed`

### Filter bar

- employee search
- rule filter
- status filter
- group filter

### Main table

| Employee | Rule | Anchor Date | Due Date | Status | Completed Date | Completion Source | Actions |
|---|---|---|---|---|---|---|---|
| Jane Doe | Annual Employee Review | Mar 1, 2026 | Mar 1, 2027 | Due Soon | — | — | View |

### Detail drawer

The employee detail drawer should show:

- employee name
- rule name
- status
- anchor date
- due date
- reminder schedule
- LearnDash group
- LearnDash course
- completed date
- completion source

And support these actions:

- `Mark Complete`
- `Change Anchor Date`
- `Suppress Reminder`
- `Reopen Cycle`

## Phase Plan

### Phase 1

- create new tables and views
- update `sync-training` to upsert `training_courses`
- update `process-hire` to record `employee_group_enrollments`
- build `rebuild-compliance-instances`
- exclude annual review from onboarding summaries
- add recurring compliance dashboard and manual completion actions

### Phase 2

- build `send-compliance-reminders`
- add admin digests
- add exports and compliance reporting
- add historical anchor backfill

### Phase 3

- add WordPress or LearnDash reset automation if required
- add full rehire-policy automation
- add richer audit screens for instance action history

## Acceptance Criteria

1. HR admin can mark one or more tenant courses as annual recurring compliance by selecting LearnDash `course_id` in settings.
2. Annual-review courses no longer block onboarding completion or onboarding-to-active transitions.
3. A new employee enrolled into the configured LearnDash group gets an annual-review cycle with due date `anchor_date + 12 months`.
4. Recurring compliance statuses display separately from onboarding statuses.
5. Employee and admin reminders send once per configured reminder window and do not duplicate.
6. Historical cycles remain auditable after rule changes because `policy_snapshot` is stored on each instance.
7. Admin can override anchor date, manually complete a cycle, reopen a cycle, suppress reminders, and start a new series on rehire without direct DB edits.
8. If LearnDash provides a fresh completion timestamp, the current cycle is completed automatically.
9. If LearnDash does not provide a fresh completion timestamp, HR can complete the cycle manually and the system records `completion_source = 'hr_attestation'`.
10. Existing employees can be backfilled with anchors using a deterministic fallback path and manual review where needed.

## Open Product Decisions

These should be finalized before implementation starts:

1. Do we send a day-of due reminder in addition to 60 and 30?
2. Should overdue alerts go to employees, admins, or both?
3. What is the default rehire policy for new tenants?
4. Do we want reminder suppression at the cycle level only, or also at the person-rule level?
5. If a course appears in multiple group contexts later, do we require explicit rule-per-group configuration?
6. Is WordPress reset automation phase 3 only, or do some tenants require it before launch?
