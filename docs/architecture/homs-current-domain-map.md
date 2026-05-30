# HOMS Current Domain Map

## Current Architecture Summary

HOMS is currently one React and Supabase application with domain clusters, not a monorepo and not a physically modularized domain platform. The current structure is best understood as a single codebase with bounded business areas already emerging inside `src/features`, `src/services`, Supabase tables, views, and Edge Functions.

The most useful current architectural lens is:

- one application
- several logical domains
- cross-cutting connectors and audit infrastructure
- an obvious path toward module extraction later

## Status Taxonomy

- `Implemented`
- `Partially Implemented`
- `Wired but Incomplete`
- `Planned`
- `Not Implemented`
- `Deprecated / Superseded`

## Current Domain Map

| Logical Domain | Status | Frontend Area | Schema / Views | Edge Functions / Backend Paths | Connector Touchpoints |
|---|---|---|---|---|---|
| `core-platform` | `Implemented` | `prolific-hr-app/src/features/auth`; `prolific-hr-app/src/features/profile`; `prolific-hr-app/src/features/settings`; `prolific-hr-app/src/features/admin` | `tenants`; `tenant_settings`; `tenant_users`; `tenant_access_requests`; `audit_log`; `integration_log` | `request-access`; `save-connector`; `list-tenant-users`; `invite-tenant-user`; `update-tenant-user-role`; `deactivate-tenant-user`; shared tenant guards | Public access intake, connector credentials, tenant-scoped auth and roles |
| `hiring` | `Implemented` | `prolific-hr-app/src/features/applicants`; `prolific-hr-app/src/features/offers`; `prolific-hr-app/src/hooks/useApplicants.ts`; `prolific-hr-app/src/hooks/useApplicantDetails.ts` | `applicants`; `offers`; supporting applicant archive and AI tables | `listApplicants`; `getApplicantDetails`; `sendOffer`; `jotform-webhook`; AI offer and applicant helpers | JotForm intake, BambooHR and JazzHR feed hire-related data into adjacent flows |
| `employee-management` | `Partially Implemented` | `prolific-hr-app/src/features/employees`; `prolific-hr-app/src/services/employeeService.ts` | `people`; `tenant_users`; applicant link fields on `people` | `onboard-employee`; employee record updates via frontend service layer | Employee records can be created from applicant conversion or sync-driven connector flows |
| `training-compliance` | `Implemented` | `prolific-hr-app/src/features/training`; `prolific-hr-app/src/features/settings/components/TrainingComplianceRulesPage.tsx` | `training_records`; `training_adjustments`; `training_events`; `training_courses`; `v_training_compliance`; `v_onboarding_training_compliance`; `v_active_training_compliance` | `sync-training`; `save-ld-mappings`; training rule hooks and direct Supabase reads | LearnDash and WordPress drive course, progress, and group mapping state |
| `recurring-compliance` | `Partially Implemented` | `prolific-hr-app/src/features/training/components/RecurringComplianceDashboard.tsx`; `prolific-hr-app/src/features/training/hooks/useRecurringComplianceDashboard.ts` | `training_compliance_rules`; `employee_group_enrollments`; `employee_compliance_instances`; `employee_compliance_instance_actions`; `compliance_notification_log`; `v_recurring_compliance_status`; `v_recurring_compliance_audit` | `manage-recurring-compliance-instance`; `rebuild-compliance-instances`; `backfill-recurring-compliance-anchors`; shared recurring series logic | Depends on LearnDash group-course mapping and employee group enrollment state |
| `connectors` | `Implemented` | `prolific-hr-app/src/features/settings/components/ConnectorSettingsPage.tsx`; `prolific-hr-app/src/features/settings/components/LdGroupMappingsPage.tsx` | `tenant_settings`; `integration_log`; `learndash_group_courses` | `detect-hires-bamboohr`; `detect-hires-jazzhr`; `process-hire`; `sync-wp-users`; `sync-training`; `test-connector`; `save-connector`; `save-ld-mappings` | BambooHR, JazzHR, WordPress, LearnDash, JotForm, Brevo-related configuration |
| `admin` | `Partially Implemented` | `prolific-hr-app/src/features/admin/pages/AccessRequestsPage.tsx`; `prolific-hr-app/src/features/admin/pages/AIDashboardPage.tsx`; admin-gated routes in `App.tsx` | `tenant_access_requests`; `ai_logs`; `ai_cache`; `tenant_users` | `request-access`; user management functions; AI helper functions | Platform-admin review exists, but broader platform operations tooling is still light |
| `audit` | `Implemented` | No dedicated standalone UI; surfaced indirectly through domain screens | `audit_log`; `training_events`; recurring action history tables | `prolific-hr-app/supabase/functions/_shared/audit-logger.ts`; DB triggers on tenant, people, training, and recurring tables | Cross-cuts all connector and operational domains |

## Domain Notes

### `core-platform`

This is the tenancy and access foundation. It already owns tenant settings, user-to-tenant role mapping, access intake, and key shared Edge Function utilities. It is the clearest candidate for a future extracted module because most other domains depend on it.

### `hiring`

This domain currently spans applicant ingestion, applicant detail work, offers, and part of the applicant-to-employee conversion path. It is functionally present, but some lifecycle logic still leaks into employee and connector flows.

### `employee-management`

This domain has consolidated around the `people` table for employees and is no longer modeled as a separate legacy employee table. The domain is real, but its boundaries are still affected by hiring and WordPress sync behavior.

### `training-compliance`

This is one of the most mature domains in the current app. It includes synced records, adjustment history, computed compliance views, dashboards, and training-detail experiences.

### `recurring-compliance`

Product-wise this still belongs under training and compliance. Architecturally, it is now large enough to justify its own future module boundary because it has its own schema, actions, business rules, series logic, and audit concepts.

## Modularization-Ready Boundaries

### Current extraction candidates

The current system can be logically separated into these present extraction candidates:

- `core-platform`
- `hiring`
- `employee-management`
- `training-compliance`
- `recurring-compliance`
- `connectors`
- `admin`
- `audit`

These are target boundaries for refactoring and documentation clarity based on current code. They are not the current filesystem layout.

### Future expansion candidates

The next modular direction should reserve these future boundaries:

- `care-operations`
- `staff-app`
- `ai-powered-evv`
- `shift-readiness`
- `in-shift-staff-support`
- `open-shift-recovery`
- `evv-governance-integrations`
- `intelligence-agentic-operations`

These are planned expansion candidates, not current extraction candidates from the shipped app.

## Near-Term Planned Domain Expansion

The current app does not yet implement Care Operations, Staff App, AI-Powered EVV, Agentic Shift Readiness, In-Shift Staff Support, Open Shift Recovery, or EVV Governance integrations.

However, the next modular direction should reserve these future boundaries:

- `care-operations`
- `staff-app`
- `ai-powered-evv`
- `shift-readiness`
- `in-shift-staff-support`
- `open-shift-recovery`
- `evv-governance-integrations`
- `intelligence-agentic-operations`

These should be treated as planned module boundaries, not current filesystem or shipped product boundaries.

## Boundary Issues And Cross-Cutting Concerns

- Connectors cut across hiring, employee management, and training/compliance. They should not be mistaken for one business domain.
- Audit is truly cross-cutting. It belongs under platform infrastructure, but its records are generated by almost every operational domain.
- Applicant conversion and employee activation currently cross domain boundaries in ways that still create lifecycle ambiguity.
- Recurring compliance is product-linked to training but operationally distinct enough to merit future extraction.
- The repo currently groups work mainly by frontend feature areas and Supabase function folders. That is helpful, but it is not equivalent to completed domain modularization.
- Planned Staff App, field operations, and EVV governance modules should be treated as future domain boundaries, not inferred from current training, employee, or connector slices.
