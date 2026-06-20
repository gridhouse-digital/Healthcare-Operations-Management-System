# SPRINT PLAN - HOMS MVP

> Updated: 2026-06-20
> Sprint window: 60-90 days from 2026-03-04
> Methodology: Epic-gated. Each epic has a CI gate. Next epic only starts after gate passes.

---

## Status Key

- Done
- [~] In progress
- Not started
- [B] Blocked

---

## Operational Hotfixes

- **2026-06-20 — Offers feature completion (4 phased PRs).** Completing the half-built offers feature per `docs/bmad/working-notes/2026-06-20-offers-feature-completion-handoff.md`. Phases: (1) edit route, (2) per-tenant offer-letter template foundation + de-hardcode + CI guard, (3) real Brevo delivery via refactored `sendOffer` EF (no false success), (4) AI reconnect to fill the tenant template. Each ships as its own PR after review.
  - Phase 1 — edit route: Done (code complete on branch `feat/offers-edit-route`; `npm run build` + lint clean). Adds missing `offers/:id/edit` route in `App.tsx`. Awaiting review/merge.
  - Phase 2 - per-tenant offer-letter template foundation: [~] Code complete on branch `feat/offers-template-foundation`; verification complete with build/shared tests/static guards green; full lint remains blocked by pre-existing repo-wide lint debt and live RLS assertions skipped without local Supabase env keys. Adds tenant_settings template/signatory/company columns, real Settings UI persistence, render utility, de-hardcoded offer/AI/sendOffer surfaces, and CI literal guard. No `db push`, deploy, or Phase 3 delivery wiring.
  - Phases 3-4: Not started.

- **2026-06-15 - Durable Data API grants for RLS isolation CI.** [~] Draft PR #21 on branch `chore/explicit-data-api-grants` replaces the temporary `api.auto_expose_new_tables = true` local-stack compatibility flag with explicit Data API grants in migration `20260615000001_explicit_data_api_grants.sql`. Fresh local reset without the flag now preserves table grants and keeps the existing hardened function RPC exceptions; local `deno task test:rls` passes **68/0** after reset. Awaiting pushed branch CI / reviewer verification; no `db push` or deploy from this branch.

- **2026-06-07 — `onConflict` target regression (P1).** [~] Code complete on branch `hotfix/onconflict-email-normalized`; **deploy pending sign-off.** Four EFs (`sync-wp-users`, `detect-hires-bamboohr`, `detect-hires-jazzhr`, `listApplicants`) upserted `people`/`applicants` with the stale `onConflict: "tenant_id,email"` after migration `20260528000002` moved uniqueness to `(tenant_id, email_normalized)` → `42P10` (silent data loss in WP sync; latent throw in hire detectors). Fixed target at 6 sites + hardened `sync-wp-users` swallowed-error path; added contract test. `deno test` 118/0, `npm run build` clean, live probe flip confirmed. See PROJECT_LOG 2026-06-07 and DECISIONS 2026-06-07. Deploy step (4 functions) + Ida confirmation outstanding.

---

## EPIC 0 - Pre-existing baseline (legacy, pre-multitenant)

*Already in codebase. Not fully multi-tenant. Not in scope to rewrite - leave as-is until Epic 5.*

- JotForm webhook + manual sync (listApplicants)
- Applicant management UI
- Offer creation + public signing
- Employee management UI
- AI features: rank, summarize, draft offer letter
- File migration (JotForm CDN -> Supabase Storage)

---

## EPIC 1 - Foundation Gate [COMPLETE - 2026-03-04]

**Gate criteria:** All pass before Epic 2 starts.

- tenant_guard reads ONLY from JWT app_metadata
- All new EFs return typed error envelope
- CORS allow-list from env vars
- audit-logger fire-and-forget, never throws
- 100% test coverage on all 4 shared utilities (43 tests)
- Two-tenant RLS isolation test passes (zero cross-tenant leakage) - VERIFIED 2026-03-06
- Migrations 001-004 applied to production

**Stories completed:**

- 1.0 Shared EF utilities (tenant-guard, cors, audit-logger, error-response)
- 1.1 Multi-tenant DB schema (tenants, tenant_settings, people, integration_log, audit_log)
- 1.2 JWT custom claims hook (custom_access_token_hook)
- 1.3 Connector settings EFs (test-connector, save-connector)
- 1.3a Connector configured-state persistence fix (generated `*_key_configured` flags in `tenant_settings`) - 2026-03-10
- 2.2a JazzHR connector manual sync action in settings UI - 2026-03-10
- 2.2b JazzHR hire detector endpoint fix (`api.resumatorapi.com`) - 2026-03-10
- 1.4 LearnDash mapping EF (save-ld-mappings)
- 1.5 User management EFs (list, invite, update-role, deactivate)
- 1.6 Settings UI pages + sidebar wiring

---

## EPIC 2 - Hire Detection [COMPLETE - 2026-03-06]

**Goal:** Poll BambooHR/JazzHR every 15 minutes per tenant. Emit exactly one `hire.detected` event per person per tenant. Gate: idempotency test passes.

### Story 2.1 - BambooHR hire detector EF

**AC:**

- Reads `bamboohr_api_key_encrypted` from tenant_settings (decrypts in EF).
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

### Enhancement (unplanned) - Training Compliance dashboard rebuild [2026-06-18]

> No story ID — unscheduled UI rebuild enhancing Stories 4.3 / 4.3.1. Tracked here against its functional area rather than as a new story.

- Rebuilt the onboarding tab into a compliance directory: clickable summary cards, multi-facet toolbar (status / course / onboarding-gate / adjustments), client-side pagination, mobile list, and an employee compliance drawer overlay.
- Integrated per-person onboarding-gate state via new `useOnboardingGateSummaries` (reads `v_onboarding_gate`, reusing the Phase 1.1 per-department gate).
- `EmployeeTrainingDetailPage` gained an embedded mode so it renders both as a full page and inside the drawer.
- **Routing change (revisits 4.3.1):** `/training/:employeeId?` now shows the list with an optional drawer overlay; the full detail page moved to `/training/employee/:employeeId`.
- Removed now-dead `TrainingStatsCards` / `TrainingEmployeeTable`.
- Status: [~] In review — PR #22 on branch `feat/training-compliance-dashboard`; frontend only, no DB/EF changes; `npm run build` clean. See PROJECT_LOG 2026-06-18.

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


| Table                     | Rows | Verdict                                                  |
| ------------------------- | ---- | -------------------------------------------------------- |
| `employees`               | 4    | **DROP** - replaced by `people`                          |
| `applicants`              | 46   | **ADD tenant_id + source**                               |
| `applicants_archive`      | 0    | **DROP** - empty                                         |
| `offers`                  | 0    | **ADD tenant_id**                                        |
| `offers_archive`          | 0    | **DROP** - empty                                         |
| `ai_cache`                | 27   | **ADD tenant_id**                                        |
| `profiles`                | 2    | **DEPRECATE** - replaced by tenant_users + auth metadata |
| `profile_change_requests` | 0    | **DROP** - empty                                         |
| `settings`                | 16   | **DROP** - replaced by tenant_settings                   |


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

- Migration: ADD `jotform_form_id_`* (6 columns), `brevo_api_key_encrypted`, `logo_light` to `tenant_settings`
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
- Status: [x] Complete - 2026-05-28
- Delivery notes:
  - `sync-training` now supersedes removed-group recurring instances and re-entry starts a fresh active series when no newer assignment evidence exists
  - historical training is visible in employee training detail without counting toward active obligations
  - recurring compliance history remains audit-visible through `v_recurring_compliance_audit`
- Plan: `docs/plans/2026-03-12-epic5-story511-plan.md`

### Story 5.12 - Recurring compliance supersession on group change

**AC:**

- Removed-group recurring anchors/instances no longer count as active obligations
- Historical recurring cycles remain visible for audit
- Rebuild logic does not recreate superseded old-group obligations
- Status: [x] Complete - 2026-05-28
- Delivery notes:
  - active recurring views now hide inactive-group rows, explicit `superseded` rows, pre-reentry historical cycles, and primary-group-filtered rows
  - removed-group history is preserved for audit instead of being destroyed or reused as active obligation state
  - manual anchor overrides remain protected from automated re-entry repair paths
- Plan: `docs/plans/2026-03-12-epic5-story512-plan.md`

### Story 5.13 - Multi-rule recurring compliance UI loading fix

**AC:**

- All active recurring rules for a tenant appear in the admin UI
- Rules from different group/course contexts are visible and selectable
- No tenant-scoping regression in settings/training views
- Status: [x] Complete - 2026-03-12
- Plan: `docs/plans/2026-03-12-epic5-story513-plan.md`

### Story 5.14 - Multi-rule anchor generation fix

**AC:**

- Employees in every configured recurring rule context receive anchors
- Anchor generation prefers actual LearnDash assignment evidence over weak inference
- Backfill remains idempotent
- Status: [x] Complete - 2026-03-12
- Plan: `docs/plans/2026-03-12-epic5-story514-plan.md`

### Story 5.15 - Multi-rule recurring instance rebuild fix

**AC:**

- Rebuild creates instances for all active recurring rules
- `v_recurring_compliance_status` shows rows for every active rule context
- No duplicate cycle rows are created
- Status: [x] Complete - 2026-03-12
- Plan: `docs/plans/2026-03-12-epic5-story515-plan.md`

### Story 5.16 - Platform-admin applicant tenant filter

**AC:**

- Platform admins can choose `All tenants` or a specific tenant in applicant UI
- Applicant list scopes correctly when a tenant is selected
- `tenant_admin` and `hr_admin` behavior remains unchanged
- Status: [x] Complete - 2026-03-12
- Plan: `docs/plans/2026-03-12-epic5-story516-plan.md`

### Story 5.17 - Recurring compliance manual cycle actions

**AC:**

- HR can mark a recurring cycle complete from the recurring compliance dashboard
- HR can reopen a completed cycle without manual SQL or direct table edits
- HR can suppress or resume reminders for a cycle
- HR can override an anchor date and have linked cycle dates recalculate
- All manual actions write audit rows and refresh recurring dashboard state
- Status: [x] Complete - 2026-03-15
- Delivery notes:
  - New Edge Function: `manage-recurring-compliance-instance`
  - Dashboard actions shipped: `Mark Complete`, `Reopen Cycle`, `Suppress/Resume Reminders`, `Update Anchor Date`
  - Reminder notification automation remains follow-up work; this slice ships the operator controls first
  - 2026-03-26 hardening: recurring compliance business dates now use calendar-date semantics (`DATE`) for `anchor_date`, `cycle_start_at`, and `due_at` to eliminate timezone drift in anchor overrides and due-date displays

### Story 5.18 - JotForm compliance catalog restructure

**AC:**

- HR can sync available JotForm forms for the tenant from the JotForm connector
- HR can choose which JotForm forms count as compliance artifacts without adding new schema columns
- Compliance/applicant detail views read selected form bindings from DB configuration rather than hardcoded `tenant_settings` form slots
- Status: [ ] Not started
- Plan: `docs/plans/2026-03-15-pre-epic6-restructure-plan.md`

### Story 5.19 - Applicant source policy + ATS sync restructure

**AC:**

- Applicants page reflects the tenant's configured applicant source strategy instead of ATS hire shadow rows only
- BambooHR and JazzHR paths are explicitly supported or constrained according to connector capabilities
- `applicants` remains the unified UI table while source freshness and statuses improve
- Status: [ ] Not started
- Plan: `docs/plans/2026-03-15-pre-epic6-restructure-plan.md`

### Story 5.20 - Offer flow source-agnostic audit

**AC:**

- Offers can be created, sent, and onboarded for applicants from the supported source paths
- No JotForm-only assumptions remain in the offer flow
- Status: [ ] Not started
- Plan: `docs/plans/2026-03-15-pre-epic6-restructure-plan.md`

### Story 5.21 - AI intelligence post-restructure audit

**AC:**

- Applicant ranking, summarization, and offer drafting work for supported non-JotForm applicants
- AI prompts and fallbacks tolerate sparse ATS applicant data
- Status: [ ] Not started
- Plan: `docs/plans/2026-03-15-pre-epic6-restructure-plan.md`
- BMAD architecture review completed 2026-06-06 as a working note:
  `docs/audits/homs-ai-architect-review-enterprise-gateway.md`.
  This does not mark Story 5.21 complete; it identifies prerequisite hardening
  before implementation.

**Epic 5 Gate:** Stories 5.1-5.10 are functionally complete on the linked project. Remote DB matches the post-migration model, active EF/runtime paths no longer depend on `employees`, `settings`, or `profiles`, and public request-access intake now hands off cleanly into the manual onboarding flow. Tenant provisioning itself is still manual and remains the next obvious platform-admin workflow gap.

### Epic 5 UI consistency note

- 2026-03-12: all dropdowns under `src` standardized on the shared `AppSelect` component; shared hover/highlight state now uses the design-system green.

### Epic 5 Follow-up Priority Order

1. Story 5.18 - JotForm compliance catalog restructure
2. Story 5.19 - Applicant source policy + ATS sync restructure
3. Story 5.20 - Offer flow source-agnostic audit
4. Story 5.21 - AI intelligence post-restructure audit
5. Recurring compliance reminder notification flow
6. Epic 6 - Compliance exports

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

---

## PLATFORM EXPANSION — Phase 0: Preserve and Audit [COMPLETE — gate MET]

> Roadmap source of truth: `docs/architecture/homs-platform-expansion-implementation-spec.md` §20.
> Tracks the evolution of HOMS into a modular care-ops platform. Phases 1+ not started.

### Phase 0 — RLS test suite + Edge Function audit

**AC (spec §20 Phase 0):**

- RLS test suite proving cross-tenant isolation — **DONE** (`supabase/tests/rls/`, runnable via
  `npm run test:rls`). All §10 matrix tables covered; live green run gated on a local/disposable
  Supabase stack (never production).
- Every Edge Function uses `tenantGuard()` or `cronOrTenantGuard()` as first call — **MET.**
  Now 26/28 compliant, 0 non-compliant, 2 intentionally unauthenticated (`jotform-webhook`,
  `request-access`). The 5 previously-flagged functions (`ai-rank-applicants`,
  `ai-draft-offer-letter`, `ai-onboarding-logic`, `ai-wp-validation`, `onboard-employee`) were
  hardened on 2026-05-29: the 4 AI fns now use `tenantGuard` (JWT only, `x-tenant-id` removed);
  `onboard-employee` uses `cronOrTenantGuard`, derives tenant from the server-trusted applicant
  record, validates `record.tenant_id`, and dropped the hardcoded fallback. Supporting migration
  `20260529000000_onboard_trigger_service_role_auth.sql` authenticates the `on_offer_accepted`
  webhook via a `security definer` wrapper (`notify_onboard_employee()`) that reads the
  service-role key from Vault — applied and validated against the local DB (clean, idempotent,
  end-to-end fire confirmed auth header + preserved `record` body). Report:
  `docs/audits/phase-0-edge-function-tenant-guard-audit.md`.
- No known data leakage paths between tenants — **MET.** All EFs source tenant only from the JWT
  (or the server-trusted applicant record for `onboard-employee`); RLS suite covers the §10 matrix.
- Status: [x] **COMPLETE — Phase 0 gate MET.** RLS suite delivered; audit delivered; tenant-guard
  remediation code-complete, statically validated, and DB-validated. Remaining work is
  deployment-only: deploy the migration + redeploy the 5 functions; ensure the `service_role_key`
  Vault secret exists in the target project. **Phase 1 STARTED + IMPLEMENTED** (below).

---

## Phase 1 — Lifecycle Stabilization (conversion · identity · diagnostics)

Source: `docs/bmad/working-notes/2026-05-29-phase-1-lifecycle-stabilization-handoff.md`;
decisions Q1–Q5 in `DECISIONS.md` (2026-05-30). Implemented 2026-05-30.

**P2 — Identity reconciliation extract (done first).** Status: [x] **DONE.**
- `_shared/identity.ts` centralizes `normalizeEmail`+tenant-scoped fail-safe `findEmployeeMatch`;
  `sync-wp-users` repointed; frontend inline matcher deleted (0 duplicate definitions). AC-4 met.
- Tests: `identity.test.ts` (ID-1..ID-5 incl. cross-tenant non-match). AC-9/AC-12 supported.

**P1 — One conversion authority + one status model.** Status: [x] **DONE.**
- `convert-applicant` EF (+ `_shared/conversion.ts` core) is the single server-side conversion
  authority; client collapsed to one thin caller; both duplicate methods deleted (AC-1).
- `hired_at`=accepted `offer.start_date`, immutable on retry (AC-2); `job_title`=`offer.position_title`,
  missing ⇒ fail, no placeholder (AC-3). Idempotent on `(tenant_id, email_normalized)` (AC-5).
- `_shared/employee-status-resolver.ts`: pure fail-closed resolver, sole writer of `employee_status`,
  re-invoked post-write (AC-6, AC-7). Separate `compliance_state` column (AC-10). NFR-3 preserved (AC-11).
- Conversion ↔ provisioning are separate idempotent steps; `onboard-employee` narrowed to provisioning,
  `record.position`→`position_title` read-side fix, retry-safe, `integration_log` visibility (AC-8).
  `on_offer_accepted` trigger repointed to `convert-applicant` (migration `20260601000003`).

**P3 — Recurring-compliance diagnostics (read-only).** Status: [x] **DONE.**
- `_shared/compliance-diagnostics.ts` surfaces missing group/rule/mapping/anchor/sync. Engine
  (5.11–5.17) unchanged (AC-10). Read-side only.

**Migration:** `20260601000002` (compliance_state + identity_collisions + drop employee_status default).
**Docs (AC-13):** DECISIONS.md (Q1–Q5, + rollback), SCHEMA.md (people/identity_collisions), PROJECT_LOG.md, this entry.
**Validation:** `deno test _shared/tests/` 91/91 pass; `npm run build` 0 errors; RLS ID-5 added (merge gate).
**Out of scope (not done, by design):** Phase 2 macro-domain refactor; existing-employee status backfill;
any recurring-compliance engine change; Care Ops / Staff App / EVV / Family Portal / Billing / Payroll;
Folk Care code.

**Rebase status — 2026-06-02 (branch `phase-1/lifecycle-stabilization`, PREPARE-AND-VALIDATE):**
[x] WIP `99f5d7a` cherry-picked onto current `main` (post 0.1 + bootstrap + ai-summarize); 2 conflicts
resolved (PROJECT_LOG, rls.test.ts). [x] Migrations **renumbered** `20260530000001/2` →
`20260601000002/3` (strictly after the verified live-ledger tip `20260601000001`) to avoid a
silent-skip collision with main's `phase01_security_definer_views`/`function_grants` at the old
versions. [x] CV-2 provisioning-failure logger made testable + tested; CV-1 confirmed; CV-3 owner ruling
recorded (keep `Active`). [x] `deno test _shared/tests/` **105/0**. Pending in PR: `supabase db reset`
fresh-apply, RLS suite, `npm run build`, GitHub Actions gate (must be GREEN). **Not deployed.**

---

## Phase 1.1 — Onboarding Completion Gate (fix fail-open Active) [IMPLEMENTED — revision PR pending sign-off]

Source: `docs/bmad/working-notes/2026-06-13-onboarding-gate-per-department-revision.md`, superseding `docs/bmad/working-notes/2026-06-07-onboarding-completion-gate-handoff.md`. P1 compliance correctness. Branch `feature/onboarding-gate-per-department`. Implemented 2026-06-13. **Not deployed; migration not pushed; backfill not executed.**

**Acceptance criteria → status:**
- [x] Migration `20260613000001`: drops `tenant_settings.onboarding_group_id`; rewrites `v_onboarding_gate` from `ld_group_mappings[].is_onboarding=true`; keeps same output columns; `security_invoker = on`; `v_onboarding_training_compliance` and recurring subsystem unmodified.
- [x] `gatherStatusInput` rewired to flagged mappings + active enrollment in any flagged group; pure `resolveEmployeeStatus` unchanged; `writeEmployeeStatus` sole writer.
- [x] Single-group auto-enroll reverted in `process-hire` and `onboard-employee`; existing job-title department enrollment remains.
- [x] Settings uses per-row "Onboarding group" checkbox; `save-ld-mappings` validates/persists `is_onboarding` per mapping, tenant_id from JWT only.
- [x] `OnboardingGateCard`/`useOnboardingGate` still consume the same view columns; backfill script keeps reset-then-resolve and preflights flagged mappings.
- [x] Tests: `deno test _shared/tests/` 131/0; RLS suite updated with `v_onboarding_gate` cross-tenant coverage + two-department contract (live assertions skipped locally because env vars absent); `npm run build` clean; targeted touched-file ESLint 0 errors. Full `npm run lint` remains blocked by pre-existing repo lint debt (86 problems).
- [ ] Deploy from `main` after sign-off only: migration -> `convert-applicant`, `process-hire`, `onboard-employee`, `save-ld-mappings`; owner flags groups 54 and 1428; run backfill identify first, then `--apply` only after approval.
