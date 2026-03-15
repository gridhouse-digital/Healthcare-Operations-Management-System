## Known Issues

This document tracks active product and engineering issues that require follow-up.

### Priority Guide

| Priority | Meaning |
|---|---|
| `P1` | Must be fixed before wider rollout or relied on as a source of truth |
| `P2` | Important and should be scheduled soon, but does not immediately break core platform trust |
| `P3` | Valid issue, but lower urgency than data integrity, compliance, or scale blockers |

### Severity Guide

| Severity | Meaning |
|---|---|
| `Critical` | Can materially corrupt platform truth, compliance status, or tenant safety |
| `High` | Causes significant operational confusion, missing functionality, or incorrect admin behavior |
| `Medium` | Noticeable defect or workflow limitation with manageable workaround |
| `Low` | Minor friction or cosmetic issue |

---

## Triage Overview

| # | Issue | Priority | Severity | Owner | Next Action | Target Sprint |
|---|---|---|---|---|---|---|
| 1 | WordPress group change does not fully resync HR app training assignments | `P1` | `High` | Engineering + Architecture | Close out re-entry validation and finalize superseded-state behavior for multi-group edge cases | Current sprint |
| 2 | Second recurring compliance rule not visible or generating compliance records | `P1` | `High` | Engineering | Keep regression coverage only; manual cycle controls are shipped and reminder automation remains separate feature work | Current sprint |
| 3 | Platform admin applicant visibility lacks tenant filter | `P2` | `Medium` | Product + UX, then Engineering | Monitor after rollout; keep behavior unchanged for tenant-admin and HR-admin roles | Current sprint |

---

## 1. WordPress group change does not fully resync HR app training assignments

| Field | Value |
|---|---|
| Priority | `P1` |
| Severity | `High` |
| Area | Sync pipeline -> `sync-wp-users` / `sync-training` / training ledger |
| Status | In progress / narrowed |
| Owner | Engineering + Architecture |
| Next Action | Validate A -> B -> A/C reassignment behavior, confirm expected UX for superseded training history, and document any required re-entry override |
| Target Sprint | Current sprint |
| Date discovered | 2026-03-11 |
| Reported by | Oyiny |

### Summary

When a user's LearnDash/WordPress group membership changes, the HR app sync adds training from the new group but does not deactivate or supersede training tied to the removed group.

This leaves stale course assignments and can cause the HR app to show a user as carrying obligations from both the old and new groups.

### Why this matters

- This is a data reconciliation defect, not just a UI issue.
- It can overstate active training obligations.
- It can make compliance dashboards unreliable after group changes.
- It erodes trust in the HR app as the operational view of current training requirements.

### Current behavior

- `sync-wp-users` and `sync-training` append or upsert new course progress from the user's current LearnDash group.
- There is no reconciliation step that detects removal from an old group and marks old group training as inactive, legacy, or superseded.
- Because the training ledger is append-only, this cannot be solved with hard deletes; it needs a controlled status/flag strategy.

### Technical details

- **Source of truth**: LearnDash group membership via WordPress / LearnDash APIs
- **Likely affected structures**:
  - `training_records`
  - `training_adjustments`
  - training/compliance views built on top of the ledger
- **Gap**:
  - no group-membership delta reconciliation
  - no explicit "superseded by group change" handling
  - no recurring compliance supersession logic when group context changes

### Impact

- Users can appear assigned to old and new group courses at the same time.
- Compliance counts may be inflated.
- Recurring compliance may continue to count obligations from the old group after reassignment.

### Current validation notes

- Production validation on 2026-03-12 confirmed old-group training is removed from active views for a user reassigned from group `54` to group `1428`.
- A multi-group leader case remains intentional rather than defective when the user truly belongs to both groups in LearnDash.
- `primary_compliance_group_id` now lets HR keep multi-group access while scoping onboarding and recurring compliance to one selected group.

### Proposed direction

- Add a reconciliation step during sync that compares current LearnDash groups vs prior synced groups per user.
- Mark training tied only to removed groups as inactive, legacy, or superseded.
- Define how recurring compliance anchors and instances are paused, closed, or superseded when a group context changes.
- Add diagnostics/audit logging for group-change reconciliation.
- For intentional multi-group leaders, add an HR-owned primary compliance group so LearnDash access does not automatically equal compliance responsibility.

### Acceptance criteria

- After changing a user's group in WordPress and running user + training sync:
  - HR app active views show only training tied to the user's current group context.
  - Old-group training is clearly marked inactive, legacy, or excluded from active compliance views.
  - Recurring compliance from the removed group no longer counts as an active obligation.

### Linked stories

- Story 5.11 - Training sync group change reconciliation
- Story 5.12 - Recurring compliance supersession on group change

### Related design note

- `docs/plans/2026-03-12-epic5-multi-group-compliance-policy-plan.md`

---

## 2. Second recurring compliance rule not visible or generating compliance records

| Field | Value |
|---|---|
| Priority | `P1` |
| Severity | `High` |
| Area | Settings -> Training Compliance Rules UI, anchor generation, recurring compliance pipeline |
| Status | Resolved / Monitoring |
| Owner | Engineering |
| Next Action | Keep regression coverage in place and verify no regression after future sync / recurring changes; reminder automation remains separate feature work |
| Target Sprint | Current sprint |
| Date discovered | 2026-03-11 |
| Reported by | Oyiny |

### Summary

Creating a second recurring compliance rule for a different LearnDash group/course succeeds at the database layer, but the full product flow does not complete reliably.

Observed symptoms:
- the rule may not appear in the expected UI selection path
- anchors may not be generated for employees in the second group
- compliance instances may not appear for that rule

### Why this matters

- This blocks the recurring compliance model from scaling beyond a single configured rule/group.
- It suggests the current implementation may still be implicitly optimized for the first rule path.
- If unresolved, admins will assume recurring compliance supports multiple rules when it only partially does.

### Current behavior

- `training_compliance_rules` can contain multiple valid rules.
- For the second rule path, one or more of the following can fail:
  - rule visibility in the UI
  - anchor creation in `employee_group_enrollments`
  - cycle generation in `employee_compliance_instances`
  - reporting in `v_recurring_compliance_status`

### Technical details

- **Tables/Views**:
  - `training_compliance_rules`
  - `employee_group_enrollments`
  - `employee_compliance_instances`
  - `v_recurring_compliance_status`
- **Frontend area**:
  - `useTrainingComplianceRules`
  - any selectors/dropdowns that load active recurring rules
- **Likely failure classes**:
  - UI query/filtering problem
  - anchor backfill scoped too narrowly
  - rebuild logic not handling multiple group/course contexts correctly

### Impact

- Admins cannot rely on the recurring compliance feature for more than one configured pathway.
- Employees in the second group may show no compliance obligations even when a valid rule exists.
- Reporting and dashboards understate actual recurring requirements.

### Proposed direction

- Verify the UI loads all active recurring rules for the tenant, not just the first matching context.
- Verify anchor generation works for each configured rule/group context.
- Verify rebuild logic generates instances for all active recurring rules, not only the initial rule path.
- Add QA coverage for "multiple recurring rules across different groups/courses".

### Acceptance criteria

- A second active recurring rule appears anywhere the admin is expected to select or view rules.
- Employees in the second rule's group receive anchors in `employee_group_enrollments`.
- Employees in that group receive instances in `employee_compliance_instances`.
- `v_recurring_compliance_status` returns rows for the second rule.

### Validation notes

- Verified on 2026-03-12 with a second recurring rule:
  - `ODP - Annual Employee Compliance Review`
  - `group_id = 1428`
  - `course_id = 1472`
- Production backfill inserted anchors from `training_record` evidence for the correct employees.
- Production rebuild generated cycle rows for that rule.
- UI rule filter and employee recurring views showed the second rule for the right employees only.
- Manual cycle operations shipped on 2026-03-15 so admins can complete, reopen, suppress reminders, and override anchors directly from the recurring dashboard.

### Linked stories

- Story 5.13 - Multi-rule recurring compliance UI loading fix
- Story 5.14 - Multi-rule anchor generation fix
- Story 5.15 - Multi-rule recurring instance rebuild fix

---

## 3. Platform admin applicant visibility lacks tenant filter

| Field | Value |
|---|---|
| Priority | `P2` |
| Severity | `Medium` |
| Area | Applicants / Platform admin UX |
| Status | Resolved / Monitoring |
| Owner | Product + UX, then Engineering |
| Next Action | Monitor after rollout and add tenant context to details/reporting only if platform-admin volume warrants it |
| Target Sprint | Current sprint |
| Date discovered | 2026-03-11 |
| Reported by | Oyiny |

### Summary

Platform admins can see applicants across all tenants, but the UI does not provide a tenant filter or tenant context picker.

This is acceptable at very small scale, but it becomes increasingly difficult to operate once multiple tenants are active.

### Why this matters

- This is primarily a scale and usability issue.
- It does not appear to be a tenant isolation defect because platform admins are intentionally allowed broad visibility.
- The problem is that the UI offers no way to scope that visibility to a specific tenant when needed.

### Technical details

- **Table**: `public.applicants`
- **RLS** (from `20260309000002_epic5_applicants_tenant_source.sql`):

  ```sql
  CREATE POLICY applicants_select_own_tenant ON applicants
    FOR SELECT USING (
      tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
      OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
    );
  ```

- For `platform_admin`, the policy intentionally allows cross-tenant reads.
- **Frontend**:
  - `useApplicants`

    ```ts
    supabase.from('applicants').select('*').order('created_at', { ascending: false });
    ```

  - `ApplicantList` filters by status, role (`position_applied`), and search term only.
  - There is no tenant filter or tenant switcher.

### Impact

- Platform admins see a flat, cross-tenant applicant list.
- There is no direct way to answer tenant-specific applicant questions from the UI.
- This will become noisy and inefficient as tenant count grows.

### Proposed direction

- Add tenant context to the platform-admin applicant experience.
- Support a tenant filter or tenant switcher with:
  - `All tenants`
  - individual tenant selection
- Keep non-platform roles unchanged and scoped to their own tenant.

### Acceptance criteria

- Platform admins can select `All tenants` or a specific tenant in the applicant UI.
- When a tenant is selected, the applicant list is scoped to that tenant.
- `tenant_admin` and `hr_admin` behavior remains unchanged.

### Validation notes

- Implemented on 2026-03-12 in `ApplicantList` with a platform-admin-only tenant dropdown.
- `useApplicants` now supports tenant-scoped queries and `useApplicantTenants` loads filter options from `public.tenants`.
- Non-platform roles still use the existing tenant-scoped applicant experience with no additional filter shown.

### Linked stories

- Story 5.16 - Platform-admin applicant tenant filter
