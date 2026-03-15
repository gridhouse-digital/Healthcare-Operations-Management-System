# Epic 5 Story 5.15 - Multi-Rule Recurring Instance Rebuild Fix Plan

**Issue link:** Issue 2 in `docs/Project Docs/ISSUES.md`  
**Priority:** P1  
**Severity:** High

## Goal

The rebuild pipeline must generate recurring compliance instances for every active recurring rule, not just the first configured rule path.

## Problem Statement

Even with valid rules and anchors, recurring compliance remains incomplete if rebuild logic does not iterate correctly across all active rule contexts.

## Scope

- audit rule iteration and filtering inside rebuild
- verify instance generation for multiple rules in the same tenant
- verify reporting view output across all generated rules

## In Scope Files

- `supabase/functions/rebuild-compliance-instances/index.ts`
- recurring compliance status views

## Acceptance Criteria

- instances are generated for all active recurring rules
- `v_recurring_compliance_status` shows rows for all configured rules
- rebuild remains idempotent with no duplicate cycle rows

## Risks

- old manual backfills may hide iteration defects unless tested with a clean second rule path
- view logic may still under-report even if instances exist

## Validation

- configure multiple rules
- run rebuild
- verify counts in `employee_compliance_instances` and `v_recurring_compliance_status`
