# Epic 5 Story 5.13 - Multi-Rule Recurring Compliance UI Loading Fix Plan

**Issue link:** Issue 2 in `docs/Project Docs/ISSUES.md`  
**Priority:** P1  
**Severity:** High

## Goal

All active recurring compliance rules for the tenant must appear in the admin UI, regardless of group or course context.

## Problem Statement

The recurring compliance feature appears to work for the initial rule path but may not load additional active rules consistently in settings or related selectors.

## Scope

- audit rule-loading hooks and selectors
- remove any implicit first-rule or first-group assumptions
- verify multi-rule rendering in rules table, selectors, and dashboard filters

## In Scope Files

- `src/features/settings/hooks/useTrainingComplianceRules.ts`
- `src/features/settings/components/TrainingComplianceRulesPage.tsx`
- any recurring rule selectors used elsewhere in training UI

## Acceptance Criteria

- two or more active recurring rules display in the UI
- rules from different group/course contexts are all visible
- tenant scoping remains correct

## Risks

- UI may be masking a deeper data problem; verify DB state first
- fallback course-loading logic must not hide valid rules

## Validation

- create at least two active rules for the same tenant
- verify both appear in settings and any related dropdown/filter
