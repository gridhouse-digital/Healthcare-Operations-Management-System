# Epic 5 - Multi-Group Compliance Assignment Policy Plan

**Related issues:** Issue 1 in `docs/Project Docs/ISSUES.md`  
**Related stories:** Story 5.11, Story 5.12  
**Priority:** P1  
**Severity:** High

## Goal

Allow employees to belong to multiple LearnDash groups for access or oversight, while ensuring only the intended group context drives HR onboarding and recurring compliance obligations.

## Problem Statement

The current reconciliation model treats every active LearnDash group as a compliance-driving group. That is correct for most employees, but it over-assigns onboarding and recurring requirements for supervisors or group leaders who sit in multiple groups for visibility rather than role-based compliance.

Example:

- Kikelomo belongs to group `54` and group `1428`
- one group may represent real compliance responsibility
- the other may exist only because she supervises that team

Without an HR-owned compliance assignment layer, the app will count both groups as active obligations.

## Recommended Policy

Separate:

- **LearnDash membership**: access, content visibility, administrative oversight
- **HR compliance assignment**: which group actually drives onboarding and recurring compliance

### Default behavior

1. If a person has exactly one active LearnDash group, use it automatically for compliance.
2. If a person has multiple active LearnDash groups, require a designated primary compliance group.
3. If no primary compliance group is chosen for a multi-group employee, surface a warning and fall back to:
   - either all groups count, or
   - no new compliance recalculation until admin chooses

**Recommended default fallback:** all groups count until HR chooses a primary compliance group.

That keeps the system conservative and avoids silently hiding obligations.

## Proposed Data Model

### Option A - Minimal employee-level field

Add to `public.people`:

- `primary_compliance_group_id text null`

Behavior:

- if null and employee has one active group, use that group
- if null and employee has multiple active groups, warn HR and count all groups
- if set, active onboarding and recurring compliance views prefer that group only

### Option B - Dedicated assignment table

Create `employee_compliance_group_assignments`:

- `id`
- `tenant_id`
- `person_id`
- `group_id`
- `is_primary boolean`
- `active boolean`
- `reason text`
- `created_at`
- `updated_at`

This is more flexible, but the first version does not need it unless you expect multiple compliance-driving groups by design.

**Recommendation:** start with Option A.

## Business Rules

### Active onboarding / training

- Single active LearnDash group: show active courses for that group
- Multiple active groups + no primary compliance group: show all active groups and warn HR
- Multiple active groups + primary compliance group set: only that group's active courses count in onboarding/training views

### Recurring compliance

- Rules still attach to LearnDash `group_id` and `course_id`
- Instance rebuild should only create active obligations for:
  - the employee's single active group, or
  - the employee's selected `primary_compliance_group_id`
- Existing historical recurring cycles remain intact

### Group re-entry

This plan is compatible with the current `resume_previous_series` behavior:

- if a group becomes active again and is also the primary compliance group, prior recurring cadence resumes
- if a different group becomes the new primary compliance group, that group's recurring rules become the active compliance context

## UX / Admin Changes

### Employee profile

Add a small section:

- `LearnDash Groups`
- `Primary Compliance Group`

If multiple active groups exist and no primary group is selected:

- show a warning badge: `Compliance Group Needed`

### Employee edit flow

Allow HR/admin to choose:

- `Primary Compliance Group`

Only show this control when the employee has more than one active group.

### Training / recurring dashboard

If an employee has multiple active groups and no primary group:

- show a warning indicator
- optionally include a filter: `Needs Compliance Group Assignment`

## Implementation Steps

1. Add `primary_compliance_group_id` to `people`
2. Update active training view logic:
   - if `primary_compliance_group_id` exists, prefer that group
   - otherwise retain current behavior
3. Update recurring compliance view/rebuild logic:
   - only active primary-group obligations count when set
4. Add employee-profile admin control to choose the primary group
5. Add QA coverage for:
   - single-group employee
   - dual-group supervisor without primary selection
   - dual-group supervisor with primary selection
   - changing the primary group from A to B

## Acceptance Criteria

- Multi-group employees can remain in multiple LearnDash groups without automatically inheriting all compliance obligations
- HR can set one primary compliance group per employee
- Onboarding and recurring compliance views respect the primary compliance group when it exists
- Historical training and recurring records remain traceable
- Employees with only one active group continue working without any extra admin step

## Risks

- If HR forgets to choose a primary group for multi-group employees, obligations may remain broader than intended
- Employee-level primary-group logic is simple, but may be too limited if some users legitimately need two compliance-driving groups

## Recommended Rollout

1. Ship the current group-reconciliation slice first
2. Validate real reassignment behavior in production
3. Add the primary compliance group override for known multi-group leaders like Kikelomo
4. Reassess whether a dedicated assignment table is needed after real usage
