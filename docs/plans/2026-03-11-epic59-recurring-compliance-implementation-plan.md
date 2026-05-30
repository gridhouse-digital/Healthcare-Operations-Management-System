> [!NOTE]
> **PROVENANCE / HISTORICAL BASELINE**
> This file is a canonical copy of the original planning spec drafted on 2026-03-11.
> It represents the design baseline for the recurring compliance subsystem subsequently
> implemented and shipped under **Stories 5.11 through 5.17** of Epic 5
> (the "Epic 5.9" label used below was a placeholder; the work was renumbered before
> implementation — Story 5.9 was reassigned to public request-access onboarding intake).
> For active runtime architecture, refer to `prolific-hr-app/docs/Project_Docs/DECISIONS.md`
> and `prolific-hr-app/docs/Project_Docs/SCHEMA.md`.
>
> **Shipped artifacts that realize this plan:**
> - Migration: `supabase/migrations/20260311000007_epic59_recurring_compliance_schema.sql`
> - Hardening migration (re-entry/supersession): `supabase/migrations/20260528000001_story511_story512_reentry_supersession.sql` (adds `v_recurring_compliance_audit`)
> - Edge Functions: `rebuild-compliance-instances`, `backfill-recurring-compliance-anchors`, `manage-recurring-compliance-instance` (manual HR overrides, Story 5.17)
> - Frontend: `src/features/settings/components/TrainingComplianceRulesPage.tsx` (route `/settings/training-rules`), `src/features/training/components/RecurringComplianceDashboard.tsx` (route `/training`)
>
> **Note on legacy paths:** The original body below references `docs/Project Docs/SCHEMA.md`
> (space-named). That path is preserved verbatim as historical record. The approved
> canonical path is `docs/Project_Docs/SCHEMA.md` (underscore) — see documentation-governance §3.
> Some file paths in the story breakdown reflect the pre-Phase-2 `src/features/` layout that
> existed on 2026-03-11; the shipped UI landed at the locations noted above.
>
> Rescued into the canonical tree by the 2026-05-29 documentation audit. The original
> remains in the parent workspace local mirror per owner instruction.

---

# Epic 5.9 - Recurring Compliance Enhancement Implementation Plan

> Date: 2026-03-11
> Scope: Phase 1 implementation plan for Annual Review and recurring compliance
> Reference spec: `docs/plans/2026-03-11-annual-review-recurring-compliance-spec.md`

## Goal

Implement the first production-ready slice of recurring compliance so the HR app can:

- classify selected LearnDash courses as recurring compliance
- track annual due dates from a stable anchor
- keep recurring compliance separate from onboarding
- support manual HR completion for yearly cycles
- show recurring compliance status in admin UI

## Phase 1 Scope

Included:

- new recurring compliance schema
- recurring rule settings UI
- canonical group-enrollment anchor capture
- recurring cycle generation job
- recurring compliance dashboard
- employee profile recurring panel
- onboarding exclusion for recurring courses
- manual cycle completion + anchor override

Deferred:

- scheduled reminder delivery
- admin digests
- exports
- WordPress/LearnDash reset automation
- full rehire automation

## Build Order

1. Database schema and views
2. LearnDash / hire-flow integration updates
3. Recurring instance generation EF
4. Settings UI for rule creation
5. Recurring dashboard and employee profile UI
6. Onboarding exclusion logic
7. Verification and backfill

## Story 5.9.1 - Schema and Views

### Goal

Create the recurring compliance data model without disturbing the existing 3-layer training ledger.

### Files

- Create: `prolific-hr-app/supabase/migrations/20260311000007_epic59_recurring_compliance_schema.sql`
- Modify: `docs/Project Docs/SCHEMA.md`

### Deliverables

- `training_courses`
- `training_compliance_rules`
- `employee_group_enrollments`
- `employee_compliance_instances`
- `compliance_notification_log`
- `employee_compliance_instance_actions`
- `v_recurring_compliance_status`
- `v_onboarding_training_compliance`

### Acceptance Criteria

- All new tables are tenant-scoped with RLS
- `employee_compliance_instances` stores `policy_snapshot`
- Status view returns:
  - `not_yet_due`
  - `due_soon`
  - `due`
  - `overdue`
  - `completed`
- No existing training tables are repurposed for recurring-cycle state

## Story 5.9.2 - Anchor Capture and Course Catalog Sync

### Goal

Capture reliable group-enrollment anchors and maintain a synced course catalog for settings.

### Files

- Modify: `prolific-hr-app/supabase/functions/process-hire/index.ts`
- Modify: `prolific-hr-app/supabase/functions/sync-training/index.ts`
- Create: `prolific-hr-app/supabase/functions/backfill-recurring-compliance-anchors/index.ts`

### Deliverables

- `process-hire` inserts `employee_group_enrollments` after successful LearnDash group enrollment
- `sync-training` upserts `training_courses`
- backfill EF creates anchors for historical employees

### Acceptance Criteria

- New enrollments create anchor rows with `anchor_source='process_hire'`
- Historical anchor backfill uses deterministic fallback:
  - process-hire integration log
  - `people.hired_at`
  - manual follow-up
- recurring due-date logic no longer relies on `training_records.enrolled_at` alone

## Story 5.9.3 - Recurring Compliance Instance Generator

### Goal

Generate yearly or interval-based cycles per employee and attach qualifying completions.

### Files

- Create: `prolific-hr-app/supabase/functions/rebuild-compliance-instances/index.ts`

### Deliverables

- one EF to:
  - load active rules
  - resolve anchors
  - create missing cycles
  - write `policy_snapshot`
  - match current-cycle LearnDash completions
  - respect manual actions

### Acceptance Criteria

- first annual cycle is created at `anchor_date + 12 months`
- next cycles remain anniversary-based
- stale prior-year completions do not satisfy new cycles
- LearnDash completion sets `completion_source='learndash'`
- manual completion is supported at cycle level

## Story 5.9.4 - Settings UI

### Goal

Give HR a simple screen to configure recurring compliance rules without DB edits.

### Files

- Create: `prolific-hr-app/src/features/training-rules/TrainingComplianceRulesPage.tsx`
- Create: `prolific-hr-app/src/features/training-rules/components/TrainingComplianceRulesTable.tsx`
- Create: `prolific-hr-app/src/features/training-rules/components/TrainingComplianceRuleDrawer.tsx`
- Create: `prolific-hr-app/src/features/training-rules/hooks/useTrainingComplianceRules.ts`
- Modify: `prolific-hr-app/src/App.tsx`
- Modify: `prolific-hr-app/src/components/layout/Sidebar.tsx`

### UI Fields

- Rule Name
- Rule Type
- LearnDash Group
- LearnDash Course
- Applies To
- Anchor Date
- First Due
- Repeats Every
- Reminder Schedule
- Notify
- Completion Source
- Status

### Acceptance Criteria

- HR can create an `Annual Employee Review` rule by selecting a synced course
- rules are keyed by `course_id`, not course name
- UI defaults are opinionated for annual recurring compliance
- page is clearly separate from connector configuration

## Story 5.9.5 - Recurring Compliance Dashboard

### Goal

Surface employee recurring-compliance status separately from onboarding.

### Files

- Create: `prolific-hr-app/src/features/recurring-compliance/RecurringCompliancePage.tsx`
- Create: `prolific-hr-app/src/features/recurring-compliance/components/RecurringComplianceStatsCards.tsx`
- Create: `prolific-hr-app/src/features/recurring-compliance/components/RecurringComplianceTable.tsx`
- Create: `prolific-hr-app/src/features/recurring-compliance/components/RecurringComplianceDrawer.tsx`
- Create: `prolific-hr-app/src/features/recurring-compliance/components/RecurringComplianceActionModal.tsx`
- Create: `prolific-hr-app/src/features/recurring-compliance/hooks/useRecurringCompliance.ts`
- Modify: `prolific-hr-app/src/features/profile/ProfilePage.tsx`

### Dashboard Content

- summary cards:
  - Not Yet Due
  - Due Soon
  - Overdue
  - Completed
- employee table columns:
  - Employee
  - Rule
  - Anchor Date
  - Due Date
  - Status
  - Completed Date
  - Completion Source
  - Actions

### Acceptance Criteria

- recurring compliance has its own route and UI track
- annual review appears here, not mixed into onboarding summaries
- admins can manually complete a cycle and change anchor date

## Story 5.9.6 - Onboarding Exclusion

### Goal

Ensure recurring compliance courses do not block onboarding completion or employee activation.

### Files

- Modify: `prolific-hr-app/src/features/training/hooks/useTrainingCompliance.ts`
- Modify: `prolific-hr-app/src/features/employees/EmployeeList.tsx`
- Modify: any dashboard or employee summary logic that treats all course completions as onboarding

### Acceptance Criteria

- annual-review courses remain in raw LearnDash sync
- annual-review courses are excluded from onboarding completion calculations
- `Onboarding -> Active` transitions ignore recurring compliance courses

## Story 5.9.7 - Manual Actions

### Goal

Provide minimum admin controls to handle real-world exceptions without direct DB edits.

### Files

- Extend recurring compliance action UI
- add DB writes for:
  - `manual_complete`
  - `override_anchor`
  - `reopen_cycle`
  - `suppress_reminders`

### Acceptance Criteria

- admin can mark cycle complete manually
- admin can change anchor date
- admin can reopen current cycle
- action history is preserved in append-only table

## Verification Plan

### Data scenarios

1. New employee enrolled in caregiver group
2. Existing employee backfilled from `hired_at`
3. Annual review completed by LearnDash
4. Annual review completed manually by HR
5. Employee overdue
6. Employee anchor date changed
7. Reopened cycle
8. Onboarding completion unaffected by annual review

### Technical checks

- migrations apply cleanly
- RLS blocks cross-tenant access
- `sync-training` still updates raw training data correctly
- `process-hire` remains idempotent
- recurring instance rebuild is idempotent
- UI renders when no recurring rules exist

## Recommended Ticket Breakdown

1. `DB-1` Recurring compliance schema migration and views
2. `INT-1` process-hire anchor capture
3. `INT-2` sync-training course catalog sync
4. `EF-1` recurring instance generation function
5. `UI-1` training compliance rules settings page
6. `UI-2` recurring compliance dashboard
7. `UI-3` employee profile recurring panel
8. `LOGIC-1` onboarding exclusion update
9. `ADMIN-1` manual cycle actions
10. `BACKFILL-1` anchor backfill function

## First Coding Slice Recommendation

If implementation starts immediately, do this first:

1. Story 5.9.1 schema migration
2. Story 5.9.2 process-hire + sync-training updates
3. Story 5.9.3 recurring instance generator

That gives the backend foundation before any UI is built.
