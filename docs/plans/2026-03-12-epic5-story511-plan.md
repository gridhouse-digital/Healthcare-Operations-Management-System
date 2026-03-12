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
