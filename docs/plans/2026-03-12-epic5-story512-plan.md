# Epic 5 Story 5.12 - Recurring Compliance Supersession on Group Change Plan

**Issue link:** Issue 1 in `docs/Project Docs/ISSUES.md`  
**Priority:** P1  
**Severity:** High

## Goal

Recurring compliance anchors and instances from a removed LearnDash group must no longer be counted as active after a group change.

## Problem Statement

Even if active training views are reconciled, recurring compliance remains incorrect if old-group anchors and instances continue to appear active.

## Scope

- define lifecycle behavior for `employee_group_enrollments` on group removal
- define lifecycle behavior for `employee_compliance_instances` linked to removed group context
- update recurring status views to exclude superseded obligations

## In Scope Files

- `supabase/functions/rebuild-compliance-instances/index.ts`
- `supabase/migrations/*` for lifecycle/supersession columns if needed
- recurring compliance views

## Proposed Approach

1. Add or use existing lifecycle fields to close an enrollment context when a group is removed.
2. Ensure rebuild logic ignores inactive/superseded enrollment contexts.
3. Close or supersede open recurring instances tied to removed groups without deleting history.
4. Keep historical cycle records queryable for audit purposes.

## Acceptance Criteria

- removed-group recurring obligations no longer appear as active
- current-group recurring obligations still generate normally
- historical recurring cycles remain audit-visible

## Dependencies

- Story 5.11 group reconciliation model
- agreed rule for whether superseded instances are visible in admin history

## Risks

- if instance supersession is not modeled clearly, rebuild may recreate old obligations
- status views may need explicit filtering changes

## Validation

- move one employee from group A to group B
- rerun sync and rebuild
- verify recurring dashboard shows only active group obligations
