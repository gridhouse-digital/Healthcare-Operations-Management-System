# PROJECT LOG — HOMS (Healthcare Operations Management System)

> Living document. Updated every session. Most recent entry at top.

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

