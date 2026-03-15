# Epic 5 Story 5.14 - Multi-Rule Anchor Generation Fix Plan

**Issue link:** Issue 2 in `docs/Project Docs/ISSUES.md`  
**Priority:** P1  
**Severity:** High

## Goal

Employees in every configured recurring rule context must receive anchors in `employee_group_enrollments`.

## Problem Statement

Anchor generation has already shown signs of relying too heavily on inference paths. Multi-rule support will remain fragile unless anchors are generated from actual LearnDash assignment evidence wherever possible.

## Scope

- verify anchor creation across multiple active rule/group contexts
- prefer actual LearnDash assignment evidence over job-title inference
- keep backfill idempotent and tenant-safe

## In Scope Files

- `supabase/functions/backfill-recurring-compliance-anchors/index.ts`
- `supabase/functions/process-hire/index.ts`
- `supabase/functions/sync-training/index.ts`

## Proposed Approach

1. For each active recurring rule, derive anchor candidates from real assignment evidence first.
2. Use fallback inference only when stronger evidence is unavailable.
3. Ensure reruns do not create duplicate anchors.

## Acceptance Criteria

- employees in each active rule context receive anchors
- multiple active rules across different groups work in the same tenant
- rerunning backfill does not duplicate `employee_group_enrollments`

## Risks

- some historical tenants may lack enough assignment evidence for clean backfill
- fallback order must be explicit to avoid inconsistent anchor dates

## Validation

- configure two rules with different groups
- run backfill
- verify anchors exist for both populations
