# PROJECT LOG — HOMS (Healthcare Operations Management System)

> Living document. Updated every session. Most recent entry at top.

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

### Verification checklist

- [ ] Run `npx supabase db push` (apply both Story 5.7/5.8 migrations)
- [ ] Deploy EFs: `npx supabase functions deploy detect-hires-bamboohr`, `detect-hires-jazzhr`, `sendOffer`
- [ ] Confirm zero `profiles` table queries remain in active frontend paths
- [ ] Confirm offer creation still succeeds and writes `tenant_id`
- [ ] Confirm hire detectors create applicant rows with source badges in Applicants page

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

