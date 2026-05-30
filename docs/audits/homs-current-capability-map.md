# HOMS Current Capability Map

## Purpose

This document inventories what HOMS materially does today. It is intentionally evidence-first and does not treat PRD or architecture aspirations as shipped capability.

## Evidence Standard

Current-state claims are based in this order:

1. `prolific-hr-app/src`
2. `prolific-hr-app/supabase`
3. `prolific-hr-app/docs`
4. `_bmad-output/planning-artifacts` only for contrast or gap context

## Status Taxonomy

- `Implemented`
- `Partially Implemented`
- `Wired but Incomplete`
- `Planned`
- `Not Implemented`
- `Deprecated / Superseded`

## Core Platform

| Capability | Status | Evidence Source | Gap / Limitation |
|---|---|---|---|
| Tenant-aware data model and RLS foundation | `Implemented` | `prolific-hr-app/supabase/migrations/20260304000001_mvp_tenants_and_settings.sql`; `prolific-hr-app/supabase/migrations/20260304000002_mvp_people_integration_audit.sql`; `prolific-hr-app/docs/Project Docs/SCHEMA.md` | Brownfield legacy tables and flows still influence some behavior, especially older applicant and offer paths. |
| Tenant settings for connector and branding configuration | `Implemented` | `prolific-hr-app/src/features/settings/components/ConnectorSettingsPage.tsx`; `prolific-hr-app/src/features/settings/hooks/useTenantSettings.ts`; `prolific-hr-app/supabase/functions/save-connector/index.ts`; `prolific-hr-app/supabase/migrations/20260310000003_connector_configured_flags.sql` | Some connector settings are still operationally sensitive and require Edge Function writes plus encrypted-field handling. |
| Tenant user management and role assignment | `Implemented` | `prolific-hr-app/src/features/settings/components/users/UserManagementPage.tsx`; `prolific-hr-app/src/features/settings/hooks/useUserManagement.ts`; `prolific-hr-app/supabase/functions/list-tenant-users/index.ts`; `prolific-hr-app/supabase/functions/invite-tenant-user/index.ts`; `prolific-hr-app/supabase/functions/update-tenant-user-role/index.ts`; `prolific-hr-app/supabase/functions/deactivate-tenant-user/index.ts` | Current role model is operational for platform admin, tenant admin, and HR flows, but not yet the broader future platform RBAC described in roadmap docs. |
| Public organization access request intake | `Implemented` | `prolific-hr-app/src/features/auth/RequestAccessPage.tsx`; `prolific-hr-app/src/features/admin/pages/AccessRequestsPage.tsx`; `prolific-hr-app/src/features/admin/hooks/useAccessRequests.ts`; `prolific-hr-app/supabase/functions/request-access/index.ts`; `prolific-hr-app/supabase/migrations/20260311000004_mvp_tenant_access_requests.sql` | This handles intake and review, but it is not yet a full tenant provisioning wizard. |
| Platform audit logging on writes | `Implemented` | `prolific-hr-app/supabase/functions/_shared/audit-logger.ts`; `prolific-hr-app/supabase/migrations/20260304000002_mvp_people_integration_audit.sql`; `prolific-hr-app/supabase/migrations/20260307000001_epic4_training_ledger.sql`; `prolific-hr-app/docs/Project Docs/SCHEMA.md` | Audit data exists in the database, but there is no dedicated audit-log review UI in the current app. |

## Hiring And Applicant Management

| Capability | Status | Evidence Source | Gap / Limitation |
|---|---|---|---|
| Applicant intake via JotForm and applicant record sync | `Implemented` | `prolific-hr-app/src/hooks/useApplicants.ts`; `prolific-hr-app/src/features/applicants/ApplicantList.tsx`; `prolific-hr-app/supabase/functions/listApplicants/index.ts`; `prolific-hr-app/supabase/functions/jotform-webhook/index.ts`; `prolific-hr-app/docs/Project Docs/PROJECT_LOG.md` | Sync reliability depends on current connector configuration, especially JotForm form ID completeness. |
| Applicant list and detail workflow | `Implemented` | `prolific-hr-app/src/features/applicants/ApplicantList.tsx`; `prolific-hr-app/src/features/applicants/ApplicantDetailsPage.tsx`; `prolific-hr-app/src/hooks/useApplicantDetails.ts`; `prolific-hr-app/src/components/applicants/ApplicantTimeline.tsx` | Current pipeline is functional but still reflects legacy baseline assumptions in places. |
| Offer creation, sending, and public signing | `Implemented` | `prolific-hr-app/src/features/offers/OfferList.tsx`; `prolific-hr-app/src/features/offers/OfferEditor.tsx`; `prolific-hr-app/src/features/offers/OfferPublicView.tsx`; `prolific-hr-app/src/services/offerService.ts`; `prolific-hr-app/supabase/functions/sendOffer/index.ts`; `prolific-hr-app/supabase/migrations/20251128000001_create_offers_table.sql` | The offer flow exists, but end-to-end lifecycle consistency with applicant conversion is still not fully hardened. |
| AI-assisted applicant ranking and offer drafting | `Partially Implemented` | `prolific-hr-app/src/lib/aiClient.ts`; `prolific-hr-app/src/components/ai/ApplicantRankingPanel.tsx`; `prolific-hr-app/src/components/ai/EnhancedApplicantSummaryPanel.tsx`; `prolific-hr-app/src/components/ai/OfferLetterDraftPanel.tsx`; `prolific-hr-app/supabase/functions/ai-rank-applicants/index.ts`; `prolific-hr-app/supabase/functions/ai-draft-offer-letter/index.ts` | AI paths are present and callable, but they are assistive slices rather than a unified, deeply integrated decision engine. |
| Applicant-to-offer-to-employee handoff | `Wired but Incomplete` | `prolific-hr-app/src/services/employeeService.ts`; `prolific-hr-app/src/features/applicants/ApplicantDetailsPage.tsx`; `prolific-hr-app/supabase/functions/onboard-employee/index.ts`; `prolific-hr-app/docs/Project Docs/SPRINT_PLAN.md` | The app can convert applicants, but lifecycle consistency remains a known gap area, especially around source-of-truth timing and mixed connector-first cases. |

## Employee Management

| Capability | Status | Evidence Source | Gap / Limitation |
|---|---|---|---|
| Unified employee records in `people` | `Implemented` | `prolific-hr-app/src/services/employeeService.ts`; `prolific-hr-app/src/features/employees/EmployeeList.tsx`; `prolific-hr-app/supabase/migrations/20260304000002_mvp_people_integration_audit.sql`; `prolific-hr-app/docs/Project Docs/SCHEMA.md` | The app has moved to `people` as the employee record, but older assumptions about employees vs applicants still surface in some flows. |
| Employee drawer, profile, and employment detail display | `Implemented` | `prolific-hr-app/src/features/employees/EmployeeList.tsx`; `prolific-hr-app/src/features/profile/ProfilePage.tsx`; `prolific-hr-app/src/types/index.ts` | The employee view is operational, but employment-history depth is limited compared with the longer-term product vision. |
| Employee status management (`Onboarding`, `Active`, `Terminated`) | `Partially Implemented` | `prolific-hr-app/src/services/employeeService.ts`; `prolific-hr-app/supabase/functions/sync-training/index.ts`; `prolific-hr-app/supabase/functions/sync-wp-users/index.ts`; `prolific-hr-app/docs/Project Docs/PROJECT_LOG.md` | Status is now more defensible, but still depends on sync timing and group/course alignment rather than a single orchestrated lifecycle service. |
| Duplicate prevention and normalized-email employee matching | `Implemented` | `prolific-hr-app/src/services/employeeService.ts`; `prolific-hr-app/supabase/functions/sync-wp-users/index.ts`; `prolific-hr-app/supabase/migrations/20260528000002_normalized_email_uniqueness.sql` | This hardens current flows, but external/manual data mutation outside the app can still create operational cleanup work. |
| Connector-source tracking on employee records | `Implemented` | `prolific-hr-app/supabase/migrations/20260308000004_add_wordpress_profile_source.sql`; `prolific-hr-app/supabase/functions/detect-hires-bamboohr/index.ts`; `prolific-hr-app/supabase/functions/detect-hires-jazzhr/index.ts`; `prolific-hr-app/supabase/functions/sync-wp-users/index.ts` | Source tracking exists, but multi-source precedence rules are still evolving. |

## Training And Compliance

| Capability | Status | Evidence Source | Gap / Limitation |
|---|---|---|---|
| LearnDash training sync into tenant-scoped training ledger | `Implemented` | `prolific-hr-app/supabase/functions/sync-training/index.ts`; `prolific-hr-app/supabase/migrations/20260307000001_epic4_training_ledger.sql`; `prolific-hr-app/docs/Project Docs/SPRINT_PLAN.md` | Sync is operational, but downstream visibility still depends on clean group mappings and connector health. |
| Three-layer training model: raw records, adjustments, computed compliance view | `Implemented` | `prolific-hr-app/supabase/migrations/20260307000001_epic4_training_ledger.sql`; `prolific-hr-app/docs/Project Docs/SCHEMA.md`; `prolific-hr-app/src/features/training/TrainingPage.tsx` | Layering is in place, but broader compliance workflows still rely on periodic sync rather than real-time orchestration. |
| Training dashboard and employee-level training detail | `Implemented` | `prolific-hr-app/src/features/training/TrainingPage.tsx`; `prolific-hr-app/src/features/training/EmployeeTrainingDetailPage.tsx`; `prolific-hr-app/src/features/training/hooks/useTrainingCompliance.ts`; `prolific-hr-app/src/features/training/hooks/useEmployeeTrainingDetail.ts` | Recent fallback logic now shows assigned-but-not-started courses, but this is compensating for sync and mapping realities rather than removing them. |
| Group-assigned course visibility before progress exists | `Partially Implemented` | `prolific-hr-app/src/features/training/hooks/assignedGroupCourses.ts`; `prolific-hr-app/src/features/training/hooks/useTrainingCompliance.ts`; `prolific-hr-app/src/features/employees/EmployeeList.tsx` | The fallback now exists, but behavior still depends on correct LearnDash group-course mapping in `learndash_group_courses`. |
| Recurring compliance rules, cycles, dashboard, and manual actions | `Partially Implemented` | `prolific-hr-app/src/features/training/components/RecurringComplianceDashboard.tsx`; `prolific-hr-app/src/features/training/hooks/useRecurringComplianceDashboard.ts`; `prolific-hr-app/supabase/functions/manage-recurring-compliance-instance/index.ts`; `prolific-hr-app/supabase/functions/rebuild-compliance-instances/index.ts`; `prolific-hr-app/supabase/migrations/20260311000007_epic59_recurring_compliance_schema.sql` | Core recurring compliance exists, but visibility and obligation generation still depend on active group and rule alignment. |
| Group reconciliation, re-entry handling, and supersession audit history | `Implemented` | `prolific-hr-app/supabase/functions/sync-training/index.ts`; `prolific-hr-app/supabase/functions/_shared/recurring-compliance-series.ts`; `prolific-hr-app/supabase/migrations/20260312000002_story511_group_reconciliation.sql`; `prolific-hr-app/supabase/migrations/20260528000001_story511_story512_reentry_supersession.sql`; `prolific-hr-app/docs/Project Docs/PROJECT_LOG.md` | This is significantly hardened now, but still sits inside the current training/compliance cluster rather than a clean standalone module boundary. |

## Connectors, Admin, And Audit

| Capability | Status | Evidence Source | Gap / Limitation |
|---|---|---|---|
| BambooHR and JazzHR hire detection | `Implemented` | `prolific-hr-app/supabase/functions/detect-hires-bamboohr/index.ts`; `prolific-hr-app/supabase/functions/detect-hires-jazzhr/index.ts`; `prolific-hr-app/src/features/settings/components/ConnectorSettingsPage.tsx`; `prolific-hr-app/docs/Project Docs/SPRINT_PLAN.md` | The connectors are focused on hire detection, not full ATS pipeline mirroring. |
| WordPress user sync and LearnDash mapping management | `Implemented` | `prolific-hr-app/supabase/functions/sync-wp-users/index.ts`; `prolific-hr-app/supabase/functions/save-ld-mappings/index.ts`; `prolific-hr-app/src/features/settings/components/LdGroupMappingsPage.tsx`; `prolific-hr-app/src/features/settings/hooks/useLdGroupMappings.ts` | WordPress-first users are now better handled, but operational correctness still depends on group setup discipline. |
| JotForm connector management and sync troubleshooting | `Implemented` | `prolific-hr-app/src/features/settings/components/ConnectorSettingsPage.tsx`; `prolific-hr-app/supabase/functions/save-connector/index.ts`; `prolific-hr-app/docs/Project Docs/PROJECT_LOG.md` | Still a connector-admin workflow rather than a higher-level form operations module. |
| Access-request admin review | `Implemented` | `prolific-hr-app/src/features/admin/pages/AccessRequestsPage.tsx`; `prolific-hr-app/src/features/admin/hooks/useAccessRequests.ts`; `prolific-hr-app/supabase/functions/request-access/index.ts` | Review is present, but downstream tenant provisioning remains manual or outside this flow. |
| AI admin observability | `Wired but Incomplete` | `prolific-hr-app/src/features/admin/pages/AIDashboardPage.tsx`; `prolific-hr-app/supabase/migrations/20260310000001_epic5_offers_aicache_tenant.sql`; `prolific-hr-app/supabase/migrations/20251203000000_create_ai_tables.sql` | AI logs and cache tables exist, but this is not yet a mature AI operations module. |

## Current-State Observations

- HOMS is currently a single React and Supabase application with clear domain clusters, not a physically modularized domain architecture.
- The strongest implemented areas are tenant-aware foundations, hiring intake, employee records, LearnDash training sync, and recurring compliance scaffolding.
- The least settled current areas are cross-source lifecycle orchestration, especially where applicants, offers, WordPress-first users, and status transitions intersect.

## Cross-Domain Gap Notes

- Applicant to offer to employee lifecycle consistency is still not fully consolidated into one deterministic path.
- Employee status transitions still depend on sync order and onboarding-course completeness checks.
- Training and recurring compliance visibility still depend on active group and rule alignment, especially for newly added or partially synced users.
- The current app is organized by feature folders and backend slices, but not yet by the proposed future module boundaries such as `core-platform`, `hiring`, `employee-management`, and `training-compliance`.

## Explicitly Not Current / Planned Only

The current codebase does not materially implement:

- Care Operations / Field Operations
- Staff App
- AI-Powered EVV
- Agentic Shift Readiness
- In-Shift AI Staff Support
- Open Shift Recovery
- EVV Governance Broker
- Sandata Adapter
- HHAeXchange Adapter
- State EVV Overlays

These capabilities belong in the planned capability map and future PRDs, not in the current capability inventory.
