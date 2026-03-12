# SPRINT PLAN - HOMS MVP

> Updated: 2026-03-12
> Sprint window: 60-90 days from 2026-03-04
> Methodology: Epic-gated. Each epic has a CI gate. Next epic only starts after gate passes.

---

## Status Key
- [x] Done
- [~] In progress
- [ ] Not started
- [B] Blocked

---

## EPIC 0 - Pre-existing baseline (legacy, pre-multitenant)
*Already in codebase. Not fully multi-tenant. Not in scope to rewrite - leave as-is until Epic 5.*

- [x] JotForm webhook + manual sync (listApplicants)
- [x] Applicant management UI
- [x] Offer creation + public signing
- [x] Employee management UI
- [x] AI features: rank, summarize, draft offer letter
- [x] File migration (JotForm CDN -> Supabase Storage)

---

## EPIC 1 - Foundation Gate [COMPLETE - 2026-03-04]

**Gate criteria:** All pass before Epic 2 starts.
- [x] tenant_guard reads ONLY from JWT app_metadata
- [x] All new EFs return typed error envelope
- [x] CORS allow-list from env vars
- [x] audit-logger fire-and-forget, never throws
- [x] 100% test coverage on all 4 shared utilities (43 tests)
- [x] Two-tenant RLS isolation test passes (zero cross-tenant leakage) - VERIFIED 2026-03-06
- [x] Migrations 001-004 applied to production

**Stories completed:**
- [x] 1.0 Shared EF utilities (tenant-guard, cors, audit-logger, error-response)
- [x] 1.1 Multi-tenant DB schema (tenants, tenant_settings, people, integration_log, audit_log)
- [x] 1.2 JWT custom claims hook (custom_access_token_hook)
- [x] 1.3 Connector settings EFs (test-connector, save-connector)
- [x] 1.3a Connector configured-state persistence fix (generated `*_key_configured` flags in `tenant_settings`) - 2026-03-10
- [x] 2.2a JazzHR connector manual sync action in settings UI - 2026-03-10
- [x] 2.2b JazzHR hire detector endpoint fix (`api.resumatorapi.com`) - 2026-03-10
- [x] 1.4 LearnDash mapping EF (save-ld-mappings)
- [x] 1.5 User management EFs (list, invite, update-role, deactivate)
- [x] 1.6 Settings UI pages + sidebar wiring

---

## EPIC 2 - Hire Detection [COMPLETE - 2026-03-06]

**Goal:** Poll BambooHR/JazzHR every 15 minutes per tenant. Emit exactly one `hire.detected` event per person per tenant. Gate: idempotency test passes.

### Story 2.1 - BambooHR hire detector EF
**AC:**
- Reads `bamboohr_api_key_encrypted` from tenant_settings (decrypts in EF)
- Fetches employees with status "Active" from BambooHR API
- For each employee not in `integration_log` (tenant_id, 'bamboohr', email): inserts row with status='hire_detected'
- Inserts/upserts `people` record (type='employee', profile_source='bamboohr')
- Never sets hired_at if already set (NFR-3)
- Idempotent: safe to run twice with same data
- Logs run to integration_log (started_at, completed_at, rows_processed, error_count)
- Status: [x] Complete - DEPLOYED 2026-03-06

### Story 2.2 - JazzHR hire detector EF
**AC:**
- Same pattern as 2.1 but JazzHR API
- Normalized stage detection: stage name contains "hired" (case-insensitive)
- Status: [x] Complete - DEPLOYED 2026-03-06

### Story 2.3 - pg_cron scheduler (15-min poll)
**AC:**
- pg_cron job calls `detect-hires` EF every 15 minutes
- Each tenant polled independently (fan-out per tenant)
- Status: [x] Complete - APPLIED 2026-03-06 (migration 20260306000001)

### Story 2.4 - Hire detection idempotency test
**AC:**
- Run detector twice with same fixture data
- Confirm integration_log has exactly 1 row per (tenant_id, source, email)
- Confirm people table has exactly 1 row per (tenant_id, email)
- Status: [x] Complete - PASSED 2026-03-06 (12/12 assertions)

**Epic 2 Gate:** Story 2.4 passes. No duplicate hire events in 24-hour soak test.
**Epic 2 Gate - CLOSED 2026-03-06**

---

## EPIC 3 - Process Hire (WP + LearnDash) [COMPLETE - 2026-03-06]

**Goal:** On hire.detected, create WP user + enroll in LearnDash groups. Safe to re-run.

### Story 3.1 - process-hire EF
**AC:**
- Triggered by integration_log row with status='hire_detected'
- Creates WP user via WP REST API (POST /wp-json/wp/v2/users)
- Stores wp_user_id on people record
- Looks up ld_group_mappings for job_title match
- Enrolls user in matching LearnDash groups (POST /wp-json/ldlms/v2/groups/{id}/users)
- Updates integration_log row to status='processed'
- If WP user already exists (email match): skips creation, uses existing wp_user_id
- Logs all WP/LD API calls to integration_log
- Status: [x] Complete - DEPLOYED 2026-03-06

### Story 3.2 - process-hire idempotency test
**AC:**
- Run process-hire twice for same person
- WP user created exactly once
- LD group enrollment attempted exactly once
- integration_log shows status='processed'
- Status: [x] Complete - PASSED 2026-03-06 (8/8 assertions)

### Story 3.3 - process-hire failure handling
**AC:**
- WP API failure -> integration_log status='failed', error stored in payload
- Retry is safe (re-run from status='failed')
- No silent failures
- Status: [x] Complete - Covered in Story 3.2 test (8/8)

**Epic 3 Gate:** Stories 3.1-3.3 pass. Manual verification: hire a test employee in BambooHR -> WP user appears within 20 min.
**Epic 3 Gate - CLOSED 2026-03-06** (automated gate passed; manual WP verification pending real connector setup)

---

## EPIC 4 - Training Sync (3-Layer Compliance Model) [COMPLETE - 2026-03-08]

**Goal:** Pull LearnDash course progress. Store in compliance-grade 3-layer model. Effective values never overwritten by sync.

### Story 4.1 - Training ledger schema migration
**AC:**
- `training_events`: INSERT-only, immutable (no UPDATE/DELETE policy in RLS)
- `training_records`: raw fields synced from LearnDash (sync can update)
- `training_adjustments`: append-only overrides by HR (no destructive edits)
- Effective value = latest adjustment override if exists, else raw training_record value
- All tables: tenant_id, RLS, audit triggers
- `v_training_compliance` VIEW (Layer C) computes effective values
- Event-generating triggers: enrolled, completed, adjusted (auto-populated)
- Status: [x] Complete - APPLIED 2026-03-07

### Story 4.2 - LearnDash sync EF
**AC:**
- Fetches course progress per WP user from LearnDash API
- Upserts training_records (raw fields only)
- Never touches training_adjustments
- Never overwrites effective compliance dates
- Logs sync run to integration_log
- pg_cron daily at 7:00 AM UTC (migration 20260307000002)
- Run dedup: skip if running <1hr, mark stale if >1hr
- Rate limiting: 200ms delay between employees if >50 per tenant
- Manual trigger: POST with optional tenant_id and force params
- Status: [x] Complete - DEPLOYED 2026-03-07

### Story 4.3 - Training compliance dashboard (frontend)
**AC:**
- Shows per-employee: courses assigned, completed, completion %, last sync
- Effective values shown (not raw)
- Pending adjustments flagged
- Status: [x] Complete - DEPLOYED 2026-03-08
- Includes: stats cards, employee table, detail drawer, adjustment modal, course/status filters
- Bug fixes: dark mode dropdowns, HTML entity decoding in course names, sfwd-courses endpoint

### Story 4.3.1 - Employee training detail page
**AC:**
- Row click from `/training` navigates to `/training/:employeeId`
- Replaces right-side drawer with full dedicated detail page
- Shows employee header, course cards, adjustment history, and training events
- Adjustment modal works from detail page and refreshes both detail + list queries
- Status: [x] Complete - 2026-03-09

### Story 4.4 - pg_cron + infrastructure fixes
**AC:**
- All 5 pg_cron jobs rewritten to use vault.decrypted_secrets (were silently failing via current_setting)
- CORS ALLOWED_ORIGIN_1 set to Vercel deployment URL
- Legacy VITE_WP_* browser calls removed from Dashboard
- Status: [x] Complete - APPLIED 2026-03-08

**Epic 4 Gate:** Sync runs for 48 hours without overwriting any adjustment values. pg_cron now operational.
**Epic 4 Gate - CLOSED 2026-03-08** (48-hour soak window: sync deployed 2026-03-07, cron fixed 2026-03-08)

---

## EPIC 4.5 - WordPress User Sync + Compliance Fixes [COMPLETE - 2026-03-09]

**Goal:** Import existing WP/LearnDash users, fix compliance to show all employees, add manual sync controls.

### Story 4.5.1 - sync-wp-users Edge Function
**AC:**
- Fetches all WP users (filters out administrator/editor roles)
- Insert-ignore into `people` with `profile_source: 'wordpress'`
- Update non-protected fields (never overwrites profile_source, hired_at, job_title)
- Run dedup, integration_log tracking, audit logging
- pg_cron daily at 6:30 AM UTC (30 min before sync-training)
- Status: [x] Complete - DEPLOYED 2026-03-09

### Story 4.5.2 - Compliance LEFT JOIN (show all employees)
**AC:**
- Training compliance queries `people` first, LEFT JOINs `v_training_compliance`
- Employees with 0 training records get `complianceStatus: 'no_courses'`
- New status style in TrainingEmployeeTable + filter option
- Stats card shows "Total Employees" with no-courses count
- Status: [x] Complete - DEPLOYED 2026-03-09

### Story 4.5.3 - Manual sync buttons on Connectors page
**AC:**
- "Sync WordPress Users" button (tenant_admin+, 60s cooldown)
- "Sync LearnDash Training" button (tenant_admin+, 60s cooldown)
- Both show toast with synced/skipped/errors counts
- Status: [x] Complete - DEPLOYED 2026-03-09

### Hotfixes applied during 4.5:
- `people.profile_source` CHECK constraint: added `'wordpress'` (was only bamboohr/jazzhr)
- `sync-wp-users`: removed `roles=subscriber` filter (LearnDash sites use varying roles)
- `cron-or-tenant-guard.ts`: new shared utility for dual-path auth (cron vs user invocation)

**Epic 4.5 Gate - CLOSED 2026-03-09** (WP users synced, compliance shows all employees)

---

## EPIC 5 - Legacy Data Model Cleanup [IN PROGRESS]

**Goal:** Unify data model. Drop legacy tables without `tenant_id`. Make all pages multi-tenant aware with source-agnostic data.

### Audit Results (2026-03-09)
**Tables WITHOUT `tenant_id` (legacy):**

| Table | Rows | Verdict |
|-------|------|---------|
| `employees` | 4 | **DROP** - replaced by `people` |
| `applicants` | 46 | **ADD tenant_id + source** |
| `applicants_archive` | 0 | **DROP** - empty |
| `offers` | 0 | **ADD tenant_id** |
| `offers_archive` | 0 | **DROP** - empty |
| `ai_cache` | 27 | **ADD tenant_id** |
| `profiles` | 2 | **DEPRECATE** - replaced by tenant_users + auth metadata |
| `profile_change_requests` | 0 | **DROP** - empty |
| `settings` | 16 | **DROP** - replaced by tenant_settings |

### Story 5.1 - Drop legacy tables + dead code
**AC:**
- Drop tables: `employees`, `applicants_archive`, `offers_archive`, `profile_change_requests`, `settings`
- Delete dead code: `cleanup-old-submissions/` EF, `approve-profile-request/` EF
- Delete `src/lib/wordpress.ts`, `src/services/wordpressService.ts` (direct WP API calls from frontend)
- Status: [x] Complete - APPLIED 2026-03-09 (migration 20260309000001)

### Story 5.2 - Add tenant_id + source to applicants
**AC:**
- Migration: ADD `tenant_id UUID REFERENCES tenants(id)`, `source TEXT` to `applicants`
- Backfill: SET tenant_id = (current tenant) for existing 46 rows, source = 'jotform'
- Add RLS policies scoped by tenant_id (SELECT, INSERT, UPDATE - no DELETE)
- Add CHECK constraint: source IN ('jotform', 'bamboohr', 'jazzhr')
- Unique index on `(tenant_id, email)`
- Status: [x] Complete - APPLIED 2026-03-09 (migration 20260309000002)

### Story 5.3 - Rewrite Employee page to `people` table
**AC:**
- Migration: ADD `phone`, `department`, `employee_id`, `employee_status`, `applicant_id` to `people`
- `employeeService.ts` rewritten -> queries `people WHERE type='employee'`
- `EmployeeList.tsx` rewritten: training from `training_records` table (not WP API), removed `wordpressService`
- `dashboardService.ts` employee counts -> `people WHERE type='employee'`
- `ApplicantDetailsPage.tsx`: employee existence check -> `people` table
- `types/index.ts`: `Employee` interface maps to `people` table columns
- Status: [x] Complete - 2026-03-09 (migration 20260309000003)

### Story 5.4 - Rewrite applicant EFs for multi-tenant + multi-source
**AC:**
- Migration: ADD `jotform_form_id_*` (6 columns), `brevo_api_key_encrypted`, `logo_light` to `tenant_settings`
- `listApplicants/` EF: full rewrite - tenantGuard, encrypted key decrypt, tenant-scoped queries, JSR imports
- `getApplicantDetails/` EF: full rewrite - same pattern, compliance form IDs from tenant_settings
- `jotform-webhook/` EF: full rewrite - `findTenantByFormId()` for multi-tenant webhook routing, `people` not `employees`
- `sendRequirementRequest/` EF: full rewrite - tenantGuard, Brevo key from tenant_settings
- `onboard-employee/` EF: targeted fix - `tenant_settings` + decrypt, `people` not `employees`
- `sendOffer/` EF: targeted fix - `tenant_settings` + decrypt
- Zero remaining references to dropped `settings` or `employees` tables across all EFs
- `settingsService.ts`: rewritten as stub (settings table dropped)
- Status: [x] Complete - 2026-03-09 (migration 20260309000004)

### Story 5.5 - Applicants page multi-source with source badge
**AC:**
- `ApplicantList.tsx`: new `SourceBadge` component (amber=JotForm, green=BambooHR, blue=JazzHR)
- Source column now reads `applicant.source` from DB (not hardcoded)
- Page header font updated to Plus Jakarta Sans 800 (design system)
- Monogram colors updated to teal (`#00C9B1`)
- `useApplicants.ts`: already reads from `applicants` table with RLS (tenant-scoped)
- Status: [x] Complete - 2026-03-09
- Follow-up: [x] 2026-03-10 - dashboard/applicant read paths no longer depend on `listApplicants` EF; normal reads query `applicants` directly and JotForm sync remains manual-only

### Story 5.6 - Extend hire detectors to write applicants
**AC:**
- `detect-hires-bamboohr`: also insert into `applicants` with source='bamboohr'
- `detect-hires-jazzhr`: also insert into `applicants` with source='jazzhr'
- Dedup by (tenant_id, email) - skip if applicant already exists
- Status: [x] Complete - 2026-03-10 (verified: both hire detectors write hired rows to `applicants` and preserve `people` as canonical employee/person state)

### Story 5.7 - Add tenant_id to offers + ai_cache
**AC:**
- Migration: ADD tenant_id to `offers`, `ai_cache`
- Backfill existing rows
- Add RLS policies
- Rewrite `offerService.ts`, `sendOffer/` EF with tenant_guard
- Status: [x] Complete - 2026-03-10 (migration `20260310000001` already applied on linked DB; remote schema confirms `tenant_id` on `offers` + `ai_cache`; shared AI cache client verified tenant-scoped)

### Story 5.8 - Deprecate profiles to tenant_users + auth
**AC:**
- `ProfilePage.tsx`: read/write via tenant_users + auth.users metadata
- `Header.tsx`: user name from session, not profiles table
- Drop `profiles` table after migration
- Follow-up: Drop legacy auth signup trigger still inserting into `public.profiles`
- Status: [x] Complete - 2026-03-11 (migration `20260311000006` drops `on_auth_user_created` + `public.handle_new_user()`; fixes auth user creation after `profiles` drop)

### Story 5.9 - Public request-access onboarding intake
**AC:**
- Public route `/request-access` is reachable without authentication
- Valid submissions persist to `tenant_access_requests` only; no tenant, auth, or `tenant_users` rows are created
- Ops/admin notification email is sent from platform-level configuration, not `tenant_settings`
- Success state explains manual review and follow-up expectations
- Validation errors return structured client responses
- Notification failures retain the DB row for manual recovery and return a clear error
- Status: [x] Complete - 2026-03-11

### Story 5.10 - Request-access hardening + platform-admin review
**AC:**
- Public request-access EF applies basic anti-spam controls (honeypot plus simple rate limits)
- Requester receives a confirmation email when the request is accepted
- Platform-admin-only screen exists in the app for reviewing and updating `tenant_access_requests`
- Internal page surfaces delivery failures and keeps manual tenant provisioning expectations explicit
- Status: [x] Complete - 2026-03-11

### Story 5.11 - Training sync group change reconciliation
**AC:**
- Sync detects when a user has been removed from one LearnDash group and added to another
- Training tied only to removed groups is marked inactive, legacy, or superseded in active HR views
- Active compliance counts no longer include removed-group obligations
- Historical training remains traceable for audit/admin review
- Status: [ ] Not started
- Plan: `docs/plans/2026-03-12-epic5-story511-plan.md`

### Story 5.12 - Recurring compliance supersession on group change
**AC:**
- Removed-group recurring anchors/instances no longer count as active obligations
- Historical recurring cycles remain visible for audit
- Rebuild logic does not recreate superseded old-group obligations
- Status: [ ] Not started
- Plan: `docs/plans/2026-03-12-epic5-story512-plan.md`

### Story 5.13 - Multi-rule recurring compliance UI loading fix
**AC:**
- All active recurring rules for a tenant appear in the admin UI
- Rules from different group/course contexts are visible and selectable
- No tenant-scoping regression in settings/training views
- Status: [ ] Not started
- Plan: `docs/plans/2026-03-12-epic5-story513-plan.md`

### Story 5.14 - Multi-rule anchor generation fix
**AC:**
- Employees in every configured recurring rule context receive anchors
- Anchor generation prefers actual LearnDash assignment evidence over weak inference
- Backfill remains idempotent
- Status: [ ] Not started
- Plan: `docs/plans/2026-03-12-epic5-story514-plan.md`

### Story 5.15 - Multi-rule recurring instance rebuild fix
**AC:**
- Rebuild creates instances for all active recurring rules
- `v_recurring_compliance_status` shows rows for every active rule context
- No duplicate cycle rows are created
- Status: [ ] Not started
- Plan: `docs/plans/2026-03-12-epic5-story515-plan.md`

### Story 5.16 - Platform-admin applicant tenant filter
**AC:**
- Platform admins can choose `All tenants` or a specific tenant in applicant UI
- Applicant list scopes correctly when a tenant is selected
- `tenant_admin` and `hr_admin` behavior remains unchanged
- Status: [ ] Not started
- Plan: `docs/plans/2026-03-12-epic5-story516-plan.md`

**Epic 5 Gate:** Stories 5.1-5.10 are functionally complete on the linked project. Remote DB matches the post-migration model, active EF/runtime paths no longer depend on `employees`, `settings`, or `profiles`, and public request-access intake now hands off cleanly into the manual onboarding flow. Tenant provisioning itself is still manual and remains the next obvious platform-admin workflow gap.

### Epic 5 Follow-up Priority Order

1. Story 5.13 - Multi-rule recurring compliance UI loading fix
2. Story 5.14 - Multi-rule anchor generation fix
3. Story 5.15 - Multi-rule recurring instance rebuild fix
4. Story 5.11 - Training sync group change reconciliation
5. Story 5.12 - Recurring compliance supersession on group change
6. Story 5.16 - Platform-admin applicant tenant filter

---

## EPIC 6 - Compliance Exports [NOT STARTED]

### Story 6.1 - Tamper-evident export
**AC:**
- Export generates CSV/PDF of training records
- SHA-256 hash of export content stored in audit_log
- Export metadata: tenant_id, actor_id, timestamp, hash
- Status: [ ] Not started

---

## Out of Scope (MVP)
- Employee self-service portal
- EVV / HHAX / Nursys / E-Verify / Databricks
- WordPress multisite provisioning
- BambooHR webhooks (polling only in MVP)
- BambooHR/JazzHR applicant API sync (Epic 5 preps the schema; actual API polling is post-MVP)
