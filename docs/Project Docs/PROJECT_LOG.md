# PROJECT LOG — HOMS (Healthcare Operations Management System)

> Living document. Updated every session. Most recent entry at top.

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
