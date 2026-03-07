# SPRINT PLAN — HOMS MVP

> Updated: 2026-03-06
> Sprint window: 60-90 days from 2026-03-04
> Methodology: Epic-gated. Each epic has a CI gate. Next epic only starts after gate passes.

---

## Status Key
- [x] Done
- [~] In progress
- [ ] Not started
- [B] Blocked

---

## EPIC 0 — Pre-existing baseline (legacy, pre-multitenant)
*Already in codebase. Not fully multi-tenant. Not in scope to rewrite — leave as-is until Epic 5.*

- [x] JotForm webhook + manual sync (listApplicants)
- [x] Applicant management UI
- [x] Offer creation + public signing
- [x] Employee management UI
- [x] AI features: rank, summarize, draft offer letter
- [x] File migration (JotForm CDN → Supabase Storage)

---

## EPIC 1 — Foundation Gate [COMPLETE - 2026-03-04]

**Gate criteria:** All pass before Epic 2 starts.
- [x] tenant_guard reads ONLY from JWT app_metadata
- [x] All new EFs return typed error envelope
- [x] CORS allow-list from env vars
- [x] audit-logger fire-and-forget, never throws
- [x] 100% test coverage on all 4 shared utilities (43 tests)
- [x] Two-tenant RLS isolation test passes (zero cross-tenant leakage) — VERIFIED 2026-03-06
- [x] Migrations 001-004 applied to production

**Stories completed:**
- [x] 1.0 Shared EF utilities (tenant-guard, cors, audit-logger, error-response)
- [x] 1.1 Multi-tenant DB schema (tenants, tenant_settings, people, integration_log, audit_log)
- [x] 1.2 JWT custom claims hook (custom_access_token_hook)
- [x] 1.3 Connector settings EFs (test-connector, save-connector)
- [x] 1.4 LearnDash mapping EF (save-ld-mappings)
- [x] 1.5 User management EFs (list, invite, update-role, deactivate)
- [x] 1.6 Settings UI pages + sidebar wiring

---

## EPIC 2 — Hire Detection [COMPLETE - 2026-03-06]

**Goal:** Poll BambooHR/JazzHR every 15 minutes per tenant. Emit exactly one `hire.detected` event per person per tenant. Gate: idempotency test passes.

### Story 2.1 — BambooHR hire detector EF
**AC:**
- Reads `bamboohr_api_key_encrypted` from tenant_settings (decrypts in EF)
- Fetches employees with status "Active" from BambooHR API
- For each employee not in `integration_log` (tenant_id, 'bamboohr', email): inserts row with status='hire_detected'
- Inserts/upserts `people` record (type='employee', profile_source='bamboohr')
- Never sets hired_at if already set (NFR-3)
- Idempotent: safe to run twice with same data
- Logs run to integration_log (started_at, completed_at, rows_processed, error_count)
- Status: [x] Complete — DEPLOYED 2026-03-06

### Story 2.2 — JazzHR hire detector EF
**AC:**
- Same pattern as 2.1 but JazzHR API
- Normalized stage detection: stage name contains "hired" (case-insensitive)
- Status: [x] Complete — DEPLOYED 2026-03-06

### Story 2.3 — pg_cron scheduler (15-min poll)
**AC:**
- pg_cron job calls `detect-hires` EF every 15 minutes
- Each tenant polled independently (fan-out per tenant)
- Status: [x] Complete — APPLIED 2026-03-06 (migration 20260306000001)

### Story 2.4 — Hire detection idempotency test
**AC:**
- Run detector twice with same fixture data
- Confirm integration_log has exactly 1 row per (tenant_id, source, email)
- Confirm people table has exactly 1 row per (tenant_id, email)
- Status: [x] Complete — PASSED 2026-03-06 (12/12 assertions)

**Epic 2 Gate:** Story 2.4 passes. No duplicate hire events in 24-hour soak test.
**Epic 2 Gate — CLOSED 2026-03-06**

---

## EPIC 3 — Process Hire (WP + LearnDash) [COMPLETE - 2026-03-06]

**Goal:** On hire.detected, create WP user + enroll in LearnDash groups. Safe to re-run.

### Story 3.1 — process-hire EF
**AC:**
- Triggered by integration_log row with status='hire_detected'
- Creates WP user via WP REST API (POST /wp-json/wp/v2/users)
- Stores wp_user_id on people record
- Looks up ld_group_mappings for job_title match
- Enrolls user in matching LearnDash groups (POST /wp-json/ldlms/v2/groups/{id}/users)
- Updates integration_log row to status='processed'
- If WP user already exists (email match): skips creation, uses existing wp_user_id
- Logs all WP/LD API calls to integration_log
- Status: [x] Complete — DEPLOYED 2026-03-06

### Story 3.2 — process-hire idempotency test
**AC:**
- Run process-hire twice for same person
- WP user created exactly once
- LD group enrollment attempted exactly once
- integration_log shows status='processed'
- Status: [x] Complete — PASSED 2026-03-06 (8/8 assertions)

### Story 3.3 — process-hire failure handling
**AC:**
- WP API failure → integration_log status='failed', error stored in payload
- Retry is safe (re-run from status='failed')
- No silent failures
- Status: [x] Complete — Covered in Story 3.2 test (8/8)

**Epic 3 Gate:** Stories 3.1-3.3 pass. Manual verification: hire a test employee in BambooHR → WP user appears within 20 min.
**Epic 3 Gate — CLOSED 2026-03-06** (automated gate passed; manual WP verification pending real connector setup)

---

## EPIC 4 — Training Sync (3-Layer Compliance Model) [IN PROGRESS]

**Goal:** Pull LearnDash course progress. Store in compliance-grade 3-layer model. Effective values never overwritten by sync.

### Story 4.1 — Training ledger schema migration
**AC:**
- `training_events`: INSERT-only, immutable (no UPDATE/DELETE policy in RLS)
- `training_records`: raw fields synced from LearnDash (sync can update)
- `training_adjustments`: append-only overrides by HR (no destructive edits)
- Effective value = latest adjustment override if exists, else raw training_record value
- All tables: tenant_id, RLS, audit triggers
- `v_training_compliance` VIEW (Layer C) computes effective values
- Event-generating triggers: enrolled, completed, adjusted (auto-populated)
- Status: [x] Complete — APPLIED 2026-03-07

### Story 4.2 — LearnDash sync EF
**AC:**
- Fetches course progress per WP user from LearnDash API
- Upserts training_records (raw fields only)
- Never touches training_adjustments
- Never overwrites effective compliance dates
- Logs sync run to integration_log
- Status: [ ] Not started

### Story 4.3 — Training compliance dashboard (frontend)
**AC:**
- Shows per-employee: courses assigned, completed, completion %, last sync
- Effective values shown (not raw)
- Pending adjustments flagged
- Status: [ ] Not started

**Epic 4 Gate:** Sync runs for 48 hours without overwriting any adjustment values.

---

## EPIC 5 — JotForm Ingestion (Credentials/Policies) [NOT STARTED]

### Story 5.1 — JotForm intake EF (multi-tenant aware)
**AC:**
- Existing jotform-webhook refactored to use tenant_guard
- tenant_id injected via webhook secret (one webhook URL per tenant)
- Documents linked to people record by email
- Status: [ ] Not started

---

## EPIC 6 — Compliance Exports [NOT STARTED]

### Story 6.1 — Tamper-evident export
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
