# Epic 5 Story 5.11 - Training Sync Group Change Reconciliation Plan

**Issue link:** Issue 1 in `docs/Project Docs/ISSUES.md`  
**Priority:** P1  
**Severity:** High

## Goal

When a user's LearnDash group membership changes, the HR app must stop treating old-group training as active while preserving historical traceability.

## Problem Statement

The current sync flow adds assignments from the new group but does not reconcile assignments tied only to the removed group. This leaves stale training visible in active views and inflates compliance obligations.

## Scope

- detect group membership deltas per employee during sync
- identify training records tied only to removed groups
- introduce a safe non-destructive supersession strategy for old-group training
- exclude superseded records from active training/compliance views

## In Scope Files

- `supabase/functions/sync-wp-users/index.ts`
- `supabase/functions/sync-training/index.ts`
- `supabase/migrations/*` for any required flags or views
- active training/compliance views used by frontend

## Proposed Approach

1. Persist enough group-context metadata to determine which training records came from which LearnDash group.
2. During sync, compare current external group state with prior synced group state.
3. For removed groups, mark affected records as superseded rather than deleting them.
4. Update active views so superseded records no longer count as current obligations.

## Acceptance Criteria

- After moving a user from one LearnDash group to another and running sync:
  - only current-group training appears in active HR views
  - old-group training remains historically traceable
  - active compliance counts no longer include removed-group obligations

## Dependencies

- clear mapping between LearnDash group context and HR training records
- agreement on whether superseded records are hidden or shown with a legacy badge in admin detail views

## Risks

- incomplete group-to-course traceability may require a small schema extension
- if old records are filtered too aggressively, admins may think history was lost

## Validation

- manual QA with one employee moved between two groups
- verify dashboard counts before and after sync
- verify old-group training still exists in historical detail

## Future Production QA Checklist

1. Hard refresh the app after deploy and rerun the repaired sync/rebuild sequence.
2. Recheck a known employee such as Sonie Jaryee in recurring compliance.
3. Confirm:
   - `Last Activity` still shows the expected LearnDash activity date
   - `Anchor Date` matches the expected onboarding/activity date
   - `Due Date` is recalculated correctly from that anchor
4. Spot-check at least 2-3 additional employees:
   - one imported from WordPress
   - one created through the normal hire flow
   - one with a manual anchor override
5. If any employee is still wrong, run the recurring-compliance verification SQL below to isolate whether the problem is source data, anchor rows, or rebuilt instances.

### Verification SQL

Replace `EMPLOYEE_EMAIL_HERE` with the employee email under test.

```sql
select
  p.id,
  p.first_name,
  p.last_name,
  p.email,
  p.hired_at,
  p.created_at,
  ege.group_id,
  ege.enrolled_at,
  ege.anchor_date,
  ege.anchor_source,
  ege.active
from public.people p
left join public.employee_group_enrollments ege
  on ege.person_id = p.id
 and ege.tenant_id = p.tenant_id
where lower(p.email) = lower('EMPLOYEE_EMAIL_HERE')
order by ege.group_id;
```

```sql
select
  tr.course_id,
  tr.course_name,
  tr.enrolled_at,
  tr.completed_at,
  tr.last_synced_at
from public.training_records tr
join public.people p
  on p.id = tr.person_id
 and p.tenant_id = tr.tenant_id
where lower(p.email) = lower('EMPLOYEE_EMAIL_HERE')
order by tr.enrolled_at nulls last, tr.course_id;
```

```sql
select
  vrcs.rule_name,
  vrcs.group_id,
  vrcs.cycle_number,
  vrcs.cycle_start_at,
  vrcs.due_at,
  vrcs.completed_at,
  vrcs.compliance_status
from public.v_recurring_compliance_status vrcs
join public.people p
  on p.id = vrcs.person_id
 and p.tenant_id = vrcs.tenant_id
where lower(p.email) = lower('EMPLOYEE_EMAIL_HERE')
order by vrcs.rule_name, vrcs.cycle_number desc;
```
