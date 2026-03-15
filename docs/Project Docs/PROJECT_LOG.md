# PROJECT LOG — HOMS (Healthcare Operations Management System)

> Living document. Updated every session. Most recent entry at top.

---
## 2026-03-12 â€” Shared dropdown standardization + design-system green hover state

### What shipped

- Standardized all app dropdowns under `src` onto the shared `AppSelect` component instead of mixing native `<select>` elements with custom dropdowns
- Updated form-backed pages to use the same dropdown style through controlled `react-hook-form` integrations
- Updated the shared dropdown-menu primitive so highlighted and mouse-over states use the design-system green (`--severity-low`)

### Files changed

- `src/components/ui/AppSelect.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/features/employees/EmployeeList.tsx`
- `src/features/training/TrainingPage.tsx`
- `src/features/training/components/RecurringComplianceDashboard.tsx`
- `src/features/training/components/TrainingAdjustmentModal.tsx`
- `src/features/settings/components/TrainingComplianceRulesPage.tsx`
- `src/features/auth/RequestAccessPage.tsx`
- `src/features/offers/OfferEditor.tsx`
- `src/features/settings/components/users/UserManagementPage.tsx`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- `rg -n -F "<select" src` returns no matches
- `npx tsc --noEmit`
- `npm run build`

---

## 2026-03-12 — Primary compliance group override

### What shipped

- Added `people.primary_compliance_group_id` so HR can choose one active LearnDash group as the compliance-driving group for intentional multi-group employees
- Updated active training and recurring compliance views to prefer the primary compliance group when it points to an active group
- Updated `rebuild-compliance-instances` so recurring cycles are generated only for the selected primary compliance group when one is set
- Added a simple employee-profile control to review active LearnDash groups and choose a primary compliance group when multiple groups are active

### Files changed

- `supabase/migrations/20260312000003_primary_compliance_group.sql`
- `supabase/functions/rebuild-compliance-instances/index.ts`
- `src/types/index.ts`
- `src/features/employees/EmployeeList.tsx`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- `npx tsc --noEmit`
- `deno check supabase/functions/rebuild-compliance-instances/index.ts`
- `npm run build`

---

## 2026-03-12 — LearnDash group reconciliation slice + multi-rule recurring validation

### What shipped

- Added a new migration to create `learndash_group_courses` and derive active training from current LearnDash group context instead of showing every historical synced course as active
- Updated `sync-training` to:
  - fetch current LearnDash groups per user
  - reconcile `employee_group_enrollments` when users leave or re-enter groups
  - sync group-to-course mappings from LearnDash
- Updated active training UI paths to read the reconciled onboarding-safe view instead of raw `training_records`
- Confirmed the second recurring compliance rule path works end-to-end after production backfill/rebuild:
  - rule visible in UI
  - anchors created
  - compliance instances created
  - correct employees see the rule and unrelated employees do not

### Design decisions

- Historical training records remain in `training_records`; the new behavior only changes which courses count as active in admin views
- Group re-entry currently behaves like `resume_previous_series` because `employee_group_enrollments` is reactivated in place and preserves the original anchor
- Recurring compliance status now hides rows tied to inactive group enrollments instead of deleting old cycles

### Files changed

- `supabase/migrations/20260312000002_story511_group_reconciliation.sql`
- `supabase/functions/sync-training/index.ts`
- `src/features/employees/EmployeeList.tsx`
- `src/features/training/hooks/useEmployeeTrainingDetail.ts`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`
- `docs/Project Docs/ISSUES.md`

### Verified

- `npx tsc --noEmit`
- `deno check supabase/functions/sync-training/index.ts`
- `npm run build`

---

## 2026-03-12 — Multi-group compliance assignment policy spec

### What shipped

- Added a small implementation spec for intentional multi-group users such as supervisors or group leaders who need LearnDash access across multiple groups without inheriting every group's compliance obligations
- Recommended an HR-owned `primary_compliance_group_id` model as the first implementation cut

### Files changed

- `docs/plans/2026-03-12-epic5-multi-group-compliance-policy-plan.md`
- `docs/Project Docs/ISSUES.md`
- `docs/Project Docs/PROJECT_LOG.md`

---

## 2026-03-11 — Auth user creation fix (profiles trigger cleanup)

### What shipped

- Dropped legacy `auth.users` trigger `on_auth_user_created` and `public.handle_new_user()` which still tried inserting into `public.profiles` after Epic 5 removed the table
- This unblocks creating users in Supabase Authentication (signup/admin create) on the linked project

### Files changed

- `supabase/migrations/20260311000006_drop_legacy_profiles_auth_trigger.sql`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- Confirmed trigger removed from `auth.users` and `public.handle_new_user` no longer exists on project `peffyuhhlmidldugqalo`

---

## 2026-03-11 — Public request-access intake MVP

### What shipped

- Added a public `/request-access` route and a new auth-shell intake page for organizations that do not yet have a workspace
- Added the `request-access` Supabase Edge Function to validate submissions, persist them in `tenant_access_requests`, and notify ops/admin through platform-level Brevo configuration
- Added `tenant_access_requests` as an intentionally non-tenant-scoped table with RLS, operational status fields, and notification recovery fields
- Added a new login-page CTA for organizations that need onboarding rather than direct sign-in
- Documented the manual handoff from request submission into tenant seeding and first-user setup

### Design decisions

- Request rows are retained even when the notification email fails; the EF returns a clear error and marks `notification_status = 'failed'` so ops can recover the submission manually
- Public notification uses platform-level secrets instead of `tenant_settings` because no tenant exists at intake time
- Open requests are deduplicated by normalized organization name plus work email so repeated submissions update the same in-flight request instead of spamming duplicate rows

### Files changed

- `src/App.tsx`
- `src/features/auth/LoginPage.tsx`
- `src/features/auth/RequestAccessPage.tsx`
- `supabase/migrations/20260311000004_mvp_tenant_access_requests.sql`
- `supabase/functions/request-access/index.ts`
- `supabase/functions/_shared/emails/AccessRequestNotificationEmail.tsx`
- `docs/Project Docs/RUNBOOK.md`
- `docs/Project Docs/SCHEMA.md`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- `deno check` run for the new request-access Edge Function
- Frontend TypeScript validation attempted, but the repo already has unrelated errors in `src/features/auth/ProtectedRoute.tsx`, `src/features/auth/UpdatePasswordPage.tsx`, `src/features/training/hooks/useTrainingCompliance.ts`, `src/hooks/useUserRole.ts`, `src/lib/supabase.ts`, and `src/services/dashboardService.ts`

---

## 2026-03-11 — Request-access guardrails + platform-admin review page

### What shipped

- Added lightweight anti-spam controls to the public `request-access` EF:
  - honeypot field
  - rate limiting by recent email submissions
  - rate limiting by recent request IP
- Added applicant-facing confirmation email delivery after ops notification succeeds
- Added request metadata and confirmation tracking fields on `tenant_access_requests`
- Added a platform-admin-only internal page for reviewing `tenant_access_requests`, inspecting delivery state, and updating request status

### Design decisions

- Internal ops notification remains the hard requirement; requester confirmation failure is recorded but does not fail the submission after ops has already been notified
- Tenant provisioning is still manual. The new admin page makes that explicit instead of pretending the workflow is automated
- Platform-admin review uses direct table access under RLS rather than a dedicated read EF because the table already has platform-admin select/update policies

### Files changed

- `src/App.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/features/auth/RequestAccessPage.tsx`
- `src/features/admin/hooks/useAccessRequests.ts`
- `src/features/admin/pages/AccessRequestsPage.tsx`
- `supabase/migrations/20260311000005_request_access_guardrails.sql`
- `supabase/functions/request-access/index.ts`
- `supabase/functions/_shared/emails/AccessRequestConfirmationEmail.tsx`
- `docs/Project Docs/RUNBOOK.md`
- `docs/Project Docs/SCHEMA.md`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- `deno check request-access/index.ts` run after the guardrail and confirmation-email changes

---

## 2026-03-10 — Applicants read path decoupled from JotForm sync

### What shipped

- Replaced remaining frontend read-time calls to `listApplicants` with direct `applicants` table queries
- `dashboardService.getStats()` now counts applicants from the DB instead of invoking the JotForm sync EF
- `dashboardService.getRecentActivity()` now reads recent applicants directly from `applicants`
- `applicantService.getApplicants()` now reads directly from `applicants`
- `listApplicants` remains available for explicit manual JotForm sync via `useSyncApplicants`

### Why

- `listApplicants` is a JotForm sync EF, not a general-purpose read endpoint
- It returns `400` when JotForm credentials or form ID are not configured
- Dashboard and applicant views should still work even when JotForm is not configured

### Files changed

- `src/services/dashboardService.ts`
- `src/services/applicantService.ts`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- Local TypeScript build run after implementation

---

## 2026-03-10 — JazzHR hire detector endpoint fix

### What shipped

- Fixed `detect-hires-jazzhr` to call the same JazzHR applicants endpoint as `test-connector`
- Changed the detector base URL from `api.jazz.co` to `api.resumatorapi.com`
- This resolves the case where connector test passes but manual sync returns `JazzHR API error: 404`

### Files changed

- `supabase/functions/detect-hires-jazzhr/index.ts`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- Local TypeScript check run after implementation
- Endpoint mismatch confirmed from runtime error and code comparison

---

## 2026-03-10 — JazzHR connector manual sync button

### What shipped

- Added a manual `Sync Hires` action to the JazzHR connector card in settings
- The button invokes the existing `detect-hires-jazzhr` EF with the signed-in user JWT, so the EF runs only for the caller’s tenant
- Added explicit UI copy clarifying that the JazzHR integration imports hired-stage applicants only, not the full applicant pipeline
- Reused the same cooldown pattern as the WordPress sync buttons to prevent rapid repeat clicks

### Files changed

- `src/features/settings/components/ConnectorSettingsPage.tsx`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- The existing `detect-hires-jazzhr` EF already supports authenticated manual invocation via `cronOrTenantGuard`
- Local TypeScript build run after implementation

---

## 2026-03-10 — Connector status persistence fix for BambooHR/JazzHR/WordPress/JotForm

### What shipped

- Added migration `20260310000003_connector_configured_flags.sql`
- `tenant_settings` now exposes generated connector status booleans:
  - `bamboohr_key_configured`
  - `jazzhr_key_configured`
  - `wp_key_configured`
  - `jotform_key_configured`
- `useTenantSettings.ts` now selects those safe derived fields directly instead of trying to infer status from encrypted columns that are intentionally never returned to the frontend
- This fixes the connector settings page showing JazzHR/BambooHR/JotForm as "Not configured" after refresh even though the credentials were saved successfully

### Files changed

- `supabase/migrations/20260310000003_connector_configured_flags.sql` (new)
- `src/features/settings/hooks/useTenantSettings.ts`
- `docs/Project Docs/SCHEMA.md`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- Implementation is additive only; no secret-returning behavior changed
- Frontend continues to consume the same `TenantSettings` shape
- Local production build run after implementation

---

## 2026-03-09 — Training detail page replaces compliance drawer

### What shipped

- Added dedicated employee training detail route: `/training/:employeeId`
- New `useEmployeeTrainingDetail` hook fetches `people`, `v_training_compliance`, `training_adjustments`, and `training_events` in parallel
- Added `EmployeeTrainingDetailPage.tsx` with:
  - employee header + aggregate stat chips
  - course cards with effective status/progress/expiry metadata
  - adjustment history panel
  - training events timeline
- `TrainingEmployeeTable.tsx` now navigates to the detail page on row click
- `TrainingPage.tsx` simplified: removed drawer state and inline adjustment modal
- Deleted `TrainingEmployeeDrawer.tsx`
- `TrainingAdjustmentModal.tsx` now invalidates the detail-page query key after save

### Files changed

- `src/App.tsx`
- `src/features/training/types.ts`
- `src/features/training/hooks/useEmployeeTrainingDetail.ts` (new)
- `src/features/training/EmployeeTrainingDetailPage.tsx` (new)
- `src/features/training/components/TrainingEmployeeTable.tsx`
- `src/features/training/TrainingPage.tsx`
- `src/features/training/components/TrainingEmployeeDrawer.tsx` (deleted)
- `src/features/training/components/TrainingAdjustmentModal.tsx`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- No remaining `TrainingEmployeeDrawer` references
- Edited files are lint-clean
- Build check run after implementation

---

## 2026-03-10 — Epic 5 Stories 5.6–5.8: Verification Closeout

### Implementation plan used
- Verify linked DB migration state for Stories 5.7 and 5.8
- Confirm live schema shape for `offers`, `ai_cache`, and `profiles`
- Verify the affected EFs against the post-migration schema and patch any breakage
- Update project tracking docs to reflect the closed state accurately

### What was verified
- Linked Supabase project already had migrations `20260310000001_epic5_offers_aicache_tenant.sql` and `20260310000002_epic5_drop_profiles.sql` applied
- Remote schema dump confirms:
  - `offers.tenant_id` exists and is `NOT NULL`
  - `ai_cache.tenant_id` exists and is `NOT NULL`
  - `profiles` table is absent
- Hire detectors already satisfy Story 5.6:
  - `detect-hires-bamboohr` writes hired records to `applicants`
  - `detect-hires-jazzhr` writes hired records to `applicants`
- Affected EFs were verified/aligned for the post-`profiles` model:
  - `admin-update-user` now uses `tenant_users` + auth admin update flow
  - `invite-user` now uses `tenant_users` + auth invite flow
  - `_shared/aiClient` now reads/writes `ai_cache` with tenant scoping
- `deno check` passes for:
  - `supabase/functions/_shared/aiClient.ts`
  - `supabase/functions/admin-update-user/index.ts`
  - `supabase/functions/invite-user/index.ts`

### Residual non-blocking follow-up
- `src/services/userService.ts` still contains legacy `profiles` references, but it is not imported by current app code
- Remote deployment status of all changed EFs can still be audited explicitly if needed

---

## 2026-03-09 — Epic 5 Stories 5.6–5.8: Applicant Hire Writes + Offers/AI Tenanting + Profiles Deprecation

### What shipped

**Story 5.6 — Extend hire detectors to write applicants**
- `detect-hires-bamboohr`: after `people` insert, now `upsert`s into `applicants` with `source='bamboohr'`, `status='Hired'`, and `onConflict: (tenant_id,email)` with `ignoreDuplicates: true`
- `detect-hires-jazzhr`: same pattern with `source='jazzhr'`
- This preserves existing JotForm applicant rows and avoids cross-source overwrite

**Story 5.7 — Add tenant_id to offers + ai_cache**
- Migration `20260310000001_epic5_offers_aicache_tenant.sql` created:
  - Adds `tenant_id` to `offers` and `ai_cache`
  - Backfills rows from first tenant row and enforces `NOT NULL`
  - Enables RLS and adds tenant-scoped policies
  - Adds audit triggers/functions for both tables
- `sendOffer` EF rewritten to modern shared patterns (`tenantGuard`, shared CORS/error utilities, JSR import) and now writes/filters by `tenant_id` for `offers` and `applicants`
- `offerService.ts` updated to include tenant scoping on all `offers` queries

**Story 5.8 — Deprecate profiles → tenant_users + auth**
- `ProfilePage.tsx` rewritten to:
  - read name/email/role from auth session metadata
  - read tenant context from `tenant_users` joined to `tenants`
  - update profile name via `supabase.auth.updateUser({ data: { full_name } })`
- `Header.tsx` now displays user name/role from auth metadata (no `profiles` query)
- Migration `20260310000002_epic5_drop_profiles.sql` added to drop `profiles`

### Files changed

- `supabase/functions/detect-hires-bamboohr/index.ts`
- `supabase/functions/detect-hires-jazzhr/index.ts`
- `supabase/functions/sendOffer/index.ts`
- `src/services/offerService.ts`
- `src/features/profile/ProfilePage.tsx`
- `src/components/layout/Header.tsx`
- `supabase/migrations/20260310000001_epic5_offers_aicache_tenant.sql` (new)
- `supabase/migrations/20260310000002_epic5_drop_profiles.sql` (new)
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verification checklist (closed 2026-03-10)

- [x] Verify linked DB already has Story 5.7/5.8 migrations applied
- [x] Verify live schema has `tenant_id` on `offers` and `ai_cache`
- [x] Verify live schema no longer contains `profiles`
- [x] Verify affected EF code paths against the post-migration schema
- [x] Run `deno check` on `aiClient`, `admin-update-user`, and `invite-user`
- [ ] Optional follow-up: audit remote deployment status of all changed EFs
- [ ] Optional follow-up: remove unused `src/services/userService.ts` legacy `profiles` references

---

## 2026-03-09 — Epic 5 Stories 5.1–5.5: Legacy Data Model Cleanup

### What shipped

**Story 5.1 — Drop legacy tables + dead code**
- Migration `20260309000001_epic5_drop_legacy_tables.sql`: dropped `employees`, `applicants_archive`, `offers_archive`, `profile_change_requests`, `settings`
- Deleted dead EFs: `cleanup-old-submissions/`, `approve-profile-request/`
- Deleted dead frontend files: `src/lib/wordpress.ts`, `src/services/wordpressService.ts`

**Story 5.2 — Add tenant_id + source to applicants**
- Migration `20260309000002_epic5_applicants_tenant_source.sql`: added `tenant_id`, `source` columns to `applicants`
- Backfilled 46 existing rows with current tenant + source='jotform'
- RLS policies (SELECT, INSERT, UPDATE — no DELETE), CHECK constraint on source, UNIQUE on `(tenant_id, email)`

**Story 5.3 — Rewrite Employee page → people table**
- Migration `20260309000003_epic5_people_employee_columns.sql`: added `phone`, `department`, `employee_id`, `employee_status`, `applicant_id` to `people`
- `employeeService.ts`: full rewrite → queries `people WHERE type='employee'`
- `EmployeeList.tsx`: full rewrite → training from `training_records` (not WP API), removed `wordpressService`
- `dashboardService.ts`: all employee counts → `people WHERE type='employee'`
- `ApplicantDetailsPage.tsx`: employee existence check → `people` table

**Story 5.4 — Rewrite applicant EFs for multi-tenant + multi-source**
- Migration `20260309000004_epic5_jotform_brevo_columns.sql`: added 6 JotForm form ID columns, `brevo_api_key_encrypted`, `logo_light` to `tenant_settings`; updated `profile_source` CHECK to include 'wordpress'
- Full rewrites: `listApplicants/`, `getApplicantDetails/`, `jotform-webhook/`, `sendRequirementRequest/`
- Targeted fixes: `onboard-employee/`, `sendOffer/`
- All now use tenantGuard, encrypted key decrypt from tenant_settings, JSR imports, shared cors/error utilities
- `jotform-webhook/`: new `findTenantByFormId()` for multi-tenant webhook routing
- `settingsService.ts`: rewritten as stub (settings table dropped)

**Story 5.5 — Applicants page multi-source with source badge**
- `ApplicantList.tsx`: new `SourceBadge` component (amber=JotForm, green=BambooHR, blue=JazzHR)
- Source column reads `applicant.source` from DB (not hardcoded)
- Page header font updated to Plus Jakarta Sans 800, monogram colors to teal

### Design decisions

- `findTenantByFormId()` scans all `tenant_settings` rows to route unauthenticated JotForm webhooks — trade-off: extra query per webhook, but avoids passing tenant_id in webhook URL
- `settingsService.ts` kept as stub with hardcoded defaults rather than deleted — multiple UI components import it, full removal deferred to Story 5.8
- Profile source protection: `jotform-webhook/` sets `profile_source: 'jotform'` only on new applicant inserts, never overwrites existing

### Files changed

- 4 new migrations (20260309000001–20260309000004)
- 6 Edge Functions rewritten/fixed (listApplicants, getApplicantDetails, jotform-webhook, sendRequirementRequest, onboard-employee, sendOffer)
- 2 dead EFs deleted (cleanup-old-submissions, approve-profile-request)
- 2 dead frontend files deleted (wordpress.ts, wordpressService.ts)
- 6 frontend files rewritten/edited (employeeService, EmployeeList, dashboardService, ApplicantDetailsPage, ApplicantList, settingsService)
- 1 types file updated (types/index.ts — Employee + Applicant interfaces)
- Sprint plan + schema docs updated

### Verified

- Zero remaining references to dropped `employees`, `settings` tables across `src/` and `supabase/functions/`
- Zero remaining `wordpressService` imports
- Build succeeds (pre-existing lint warnings only, none introduced)

### Next

- Stories 5.6, 5.7, 5.8 handed off to Codex
- Epic 6 — Compliance Exports (after Epic 5 gate)

---

## 2026-03-07 (session 2) -- Epic 4 Story 4.2: LearnDash Training Sync EF

### What shipped

- sync-training Edge Function deployed to production
  - Fetches course progress from LearnDash REST API per employee with wp_user_id
  - UPSERTS training_records (Layer A) using ON CONFLICT (tenant_id, person_id, course_id)
  - Intentionally omits training_hours + expires_at from upsert (NFR-3 -- protects Layer B overrides)
  - Course name resolution via GET /ldlms/v2/courses/{id} with per-run Map cache
  - Pagination via per_page=100 + x-wp-totalpages header
  - Run dedup: checks integration_log for running status, marks stale if >1hr old
  - 200ms rate limiting for tenants with >50 employees
  - Sequential tenant processing (avoids overwhelming WP)
  - Manual trigger with optional tenant_id and force params
  - Status mapping: not-started to not_started, in-progress to in_progress, completed to completed
  - Unknown statuses skipped (not defaulted) to avoid data regression
- Migration 20260307000002: pg_cron daily at 7:00 AM UTC for sync-training

### Design decisions

- Sequential tenant processing instead of Promise.allSettled -- each tenant fans out to N employees x M courses, parallel would overwhelm WP
- Course name cache scoped to processTenant() -- not global (prevents cross-tenant leaks)
- Run dedup with 1-hour stale threshold (matching detect-hires pattern)
- Unknown LD statuses skipped rather than defaulted to null -- prevents overwriting valid data

### Files changed

- supabase/functions/sync-training/index.ts (new -- 473 lines)
- supabase/migrations/20260307000002_epic4_training_sync_cron.sql (new)
- docs/plans/2026-03-07-epic4-sync-training-design.md (new -- approved design)
- docs/plans/2026-03-07-epic4-story42-plan.md (new -- implementation plan)
- docs/Project Docs/SPRINT_PLAN.md (Story 4.2 marked complete)
- docs/Project Docs/PROJECT_LOG.md (this entry)
- docs/Project Docs/INTEGRATIONS.md (LearnDash sync details added)

### Next

- Story 4.3 -- Training compliance dashboard UI

---


## 2026-03-07 -- Epic 4 Story 4.1: Training Ledger Schema Migration

### What shipped

- Migration 20260307000001_epic4_training_ledger.sql applied to production
  - training_records (Layer A): raw LearnDash sync data with course_name, training_hours (minutes), expires_at (future use). UNIQUE on (tenant_id, person_id, course_id). RLS own tenant. Audit trigger.
  - training_adjustments (Layer B): append-only HR overrides. field CHECK constraint: status, completion_pct, completed_at, training_hours. INSERT + SELECT RLS only (no UPDATE/DELETE). Audit trigger.
  - training_events: immutable training audit trail. Auto-generated by DB triggers: enrolled (on record INSERT), completed (on status change), adjusted (on override INSERT). expired event type schema-ready but detection deferred.
  - v_training_compliance VIEW (Layer C): effective values = latest Layer B override if exists, else Layer A raw value. Includes has_overrides boolean. RLS inherited from underlying tables.
  - Audit triggers on all 3 tables (NFR-4 compliance)

### Design decisions

- Regular VIEW (not materialized) -- 60K rows max at 10 tenants, single-digit ms query time
- training_adjustments.field uses CHECK constraint (extensible via one-line migration)
- training_hours + expires_at added to training_records for future use
- expired event detection deferred -- no expiring courses yet, schema supports it
- Event generation via DB triggers (guarantees no missed events regardless of code path)

### Files changed

- supabase/migrations/20260307000001_epic4_training_ledger.sql (new -- 337 lines)
- docs/Project Docs/SCHEMA.md (updated -- 3 tables + VIEW documented)
- docs/Project Docs/SPRINT_PLAN.md (Story 4.1 marked complete)
- docs/plans/2026-03-07-epic4-training-ledger-design.md (new -- approved design)
- docs/plans/2026-03-07-epic4-story41-plan.md (new -- implementation plan)

### Next

- Story 4.2 -- LearnDash sync EF

---

## 2026-03-06 (session 4)

### What shipped

- **WordPress connector: end-to-end save path complete**
  - `save-connector` EF extended: new `source: "wordpress"` branch encrypts `wpUsername` and `wpAppPassword` separately, stores `wp_site_url` (plaintext) + `wp_username_encrypted` + `wp_app_password_encrypted` on `tenant_settings`
  - `TenantSettings` type: added `wp_key_configured: boolean` (derived from `wp_site_url` presence, no encrypted fields exposed)
  - `useSaveWordPress` hook added to `useTenantSettings.ts`
  - `WordPressConnector` form component added to `ConnectorSettingsPage.tsx` — site URL, admin username, app password fields; saves directly (no test-connection step — WP tested on first real hire)
  - `save-connector` EF deployed to production
- **Full hire pipeline is now enabled end-to-end:** BambooHR/JazzHR detect hire → process-hire creates WP user + enrolls LD groups

### Pending

- PGCRYPTO_ENCRYPTION_KEY secret must be set in Supabase Dashboard (required for all encryption/decryption)
- Manual end-to-end test: configure WP connector → trigger hire in BambooHR → verify WP user appears within 5 min

---

## 2026-03-06 (session 3)

### What shipped

- **Epic 3 — Process Hire: COMPLETE**
  - Story 3.1:  EF deployed — lookup-before-create WP user, stores  on people, enrolls LD groups by job_title, marks processed
  - Stories 3.2 + 3.3: Tests passed 8/8 — idempotency + failure logging verified
  - Migration 20260306000003:  on people
  - Migration 20260306000004: pg_cron every 5 min for process-hire

### Epic 3 Gate — CLOSED 2026-03-06

- 8/8 passed
- Manual WP verification pending real connector credentials

---

## 2026-03-06 (session 2)

### What shipped

- **Epic 2 — Hire Detection: COMPLETE**
  - Story 2.1: `detect-hires-bamboohr` EF deployed to production
  - Story 2.2: `detect-hires-jazzhr` EF deployed to production
  - Story 2.3: `20260306000001_epic2_hire_detection_cron.sql` applied — BambooHR polls every 15 min, JazzHR at 7,22,37,52
  - Story 2.4: Idempotency test passed — 12/12 assertions (NFR-2 + NFR-3 verified)
  - Migration `20260306000002_pgp_decrypt_wrapper.sql` applied — `pgp_sym_decrypt_text` RPC for EF key decryption
  - Frontend fixes deployed: `useUserRole` (reads JWT app_metadata), `App.tsx`, `SettingsPage.tsx`, `useTenantSettings.ts`

### Epic 2 Gate — CLOSED 2026-03-06

- Idempotency test (scripts/test-hire-idempotency.ts): 12/12 passed
- NFR-2: zero duplicate hire events (DB UNIQUE constraint guards)
- NFR-3: hired_at not overwritten on re-detection (confirmed)
- Both EFs live on production. pg_cron polling active.

### Pending

- PGCRYPTO_ENCRYPTION_KEY secret must be set in Supabase Dashboard for EFs to decrypt keys in production
- Frontend Vercel deploy (if not auto-deployed from git push)

---

## 2026-03-06

### What changed

- Renamed app from "Prolific HR - Command Centre" to **HOMS** (placeholder until MVP branding)
  - `index.html` title, `package.json` name, `config.yaml` project_name
  - Login/auth page titles and alt tags updated
  - AI system prompt updated
  - Offer letter content and tenant-specific strings left unchanged
- Created tracking docs: PROJECT_LOG, SPRINT_PLAN, DECISIONS, INTEGRATIONS, SCHEMA, RUNBOOK
- Updated `docs/CLAUDE.md` with multitenant rules, MVP scope, and quality bar

### What shipped

- **Epic 1 — Foundation: COMPLETE**
  - 4 MVP migrations live on production Supabase (`peffyuhhlmidldugqalo`)
  - 7 Edge Functions deployed: test-connector, save-connector, save-ld-mappings, list-tenant-users, invite-tenant-user, update-tenant-user-role, deactivate-tenant-user
  - Shared EF utilities: tenant-guard, audit-logger, error-response, cors (100% test coverage, 43 tests)
  - Settings UI: ConnectorSettingsPage, LdGroupMappingsPage, UserManagementPage (routed + sidebar-linked)
  - Prolific Homecare tenant seeded: tenant_id=11111111-1111-1111-1111-111111111111
  - All 3 users assigned tenant_id + role=tenant_admin in app_metadata
  - Two-tenant RLS isolation test passed
  - ALLOWED_ORIGIN_1 secret set in Supabase Dashboard

### Epic 1 Gate — CLOSED 2026-03-06

- RLS isolation test (scripts/test-rls-isolation.ts) run against local Supabase
- All 5 tables passed: people, tenant_settings, integration_log, audit_log, tenant_users
- Zero cross-tenant leakage confirmed
- Epic 2 is UNBLOCKED

### Hotfix — Settings pages not showing on Vercel

- **Root cause:** `useUserRole` was reading from legacy `profiles` table (local DB had row, production did not)
- **Fix:** `useUserRole` now reads `role` from `session.user.app_metadata` (JWT) — consistent with Epic 1 architecture
- **Files changed:** `src/hooks/useUserRole.ts`, `src/App.tsx`, `src/features/settings/SettingsPage.tsx`
- **DB fix:** Inserted `tenant_users` row for `gridhouse.digital10@gmail.com` (role=tenant_admin) on production Supabase — was missing, so JWT hook had nothing to inject

### What broke / known issues

- Legacy EFs (jotform-webhook, listApplicants, etc.) are NOT multi-tenant aware — bypass tenant_guard. Addressed in Epic 2+ scope.
- deno.lock version incompatibility deleted; regenerates on next deploy.
- WordPress API calls from localhost timeout (expected). Works in production.

### What's next

- Epic 2: Hire detection (BambooHR/JazzHR polling → hire.detected event)
- Epic 3: process-hire → WP user creation + LearnDash group enrollment
- Training ledger schema (training_events, training_records, training_adjustments)

---

## 2026-03-04 (Sprint 0 / Epic 1 build session)

### What shipped

- Migrations 20260304000001-000004
- _shared utilities: tenant-guard, cors, audit-logger, error-response
- 7 MVP Edge Functions
- Settings frontend pages + routing
- custom_access_token_hook Postgres function
- RLS isolation test script

### What broke / fixed

- Migration 20251130000003 rewrote CHECK to ALTER TYPE (enum fix)
- Migration 20251204000001 removed invalid COMMENT ON TABLE storage.buckets
- Migration 20260304000004 added SET search_path = public to handle_new_user() (GoTrue fix)
- cors.ts moved ALLOWED_ORIGINS to function (env var timing fix)
- audit-logger tests used Deno.serve mock for lines 51-52 coverage

