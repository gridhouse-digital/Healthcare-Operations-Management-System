# Epic 5 Story 5.16 - Platform Admin Applicant Tenant Filter Plan

**Issue link:** Issue 3 in `docs/Project Docs/ISSUES.md`  
**Priority:** P2  
**Severity:** Medium

## Goal

Platform admins must be able to view applicants by tenant without losing the ability to view all tenants.

## Problem Statement

Cross-tenant applicant visibility is intentional for platform admins, but the UI has no tenant scoping control. This makes the page harder to use as tenant volume grows.

## Scope

- add tenant filter or switcher to applicant UI for platform admins
- support `All tenants` plus single-tenant selection
- keep non-platform roles unchanged

## In Scope Files

- applicant list hook and page components
- any platform-admin specific filtering state

## Acceptance Criteria

- platform admins can choose `All tenants` or one tenant
- applicant list scopes correctly when a tenant is chosen
- `tenant_admin` and `hr_admin` flows are unchanged

## Risks

- if tenant labels are unclear, admins may select the wrong tenant context
- large tenant lists may need typeahead rather than a simple dropdown later

## Validation

- verify platform-admin sees filter
- verify tenant-admin and hr-admin do not
- verify applicant counts change correctly by tenant selection
