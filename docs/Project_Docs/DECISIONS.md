# DECISIONS — HOMS

> **Hierarchy rank:** 5 (current — authoritative for design rationale / "why" behind the codebase).
> Companion to the rank-5 current capability/domain/gap docs. Registered by the 2026-05-29 doc audit.

> Architecture, product, and security decisions. Most recent first.
> Format: ## [DATE] Title | What | Why | Alternatives considered

---

## 2026-05-28 | LearnDash group re-entry starts a new active compliance series by default

**What:** When a person returns to a previously removed LearnDash group and there is no newer assignment evidence than the old anchor, the HR app starts a fresh active recurring-compliance series from the re-entry date and marks the prior open series rows as `superseded`.
**Why:** Re-entry is a new active obligation context. Reusing the old anchor would pull stale due dates and overdue cycles back into active dashboards after a group change, which breaks operator trust.
**Alternatives:** Always resume the prior series â€” rejected because it revives stale obligations after A -> B -> A reassignment. Hard-delete old rows â€” rejected because it destroys audit history.
**Consequence:** Active recurring views now exclude pre-reentry cycles and superseded rows, while audit views retain them for traceability.

---

## 2026-03-26 | Recurring compliance business dates use DATE semantics

**What:** `employee_group_enrollments.anchor_date`, `employee_compliance_instances.cycle_start_at`, and `employee_compliance_instances.due_at` are treated as calendar dates, not instants in time. The model is standardized on Postgres `DATE` semantics.
**Why:** Recurring compliance anchors and due dates are business calendar values. Storing them as timestamps caused timezone drift, off-by-one UI behavior, and unstable operator overrides.
**Alternatives:** Keep `TIMESTAMPTZ` and normalize to noon UTC — rejected as a workaround that preserves the wrong domain model. Leave UI-only formatting patches in place — rejected because write-paths and SQL comparisons would remain fragile.
**Consequence:** UI and Edge Functions must send and render `YYYY-MM-DD` for recurring compliance dates. Audit/event timestamps remain timestamped.

---

## 2026-03-06 | App rename to HOMS

**What:** Renamed the product from "Prolific HR - Command Centre" to HOMS (Healthcare Operations Management System).
**Why:** Moving from single-tenant (Prolific Homecare only) to multi-tenant SaaS. The old name was client-specific. HOMS is a neutral placeholder until proper branding at MVP launch.
**Alternatives:** Keep old name until launch — rejected (confusing during development), "CareOps" — reserved as option for final branding.
**Assumption:** Final brand name decided before public launch. Until then, HOMS is used in all UI strings, docs, and config.

---

## 2026-03-04 | tenant_id injected via JWT app_metadata only

**What:** `tenant_guard.ts` reads `tenant_id` exclusively from `JWT -> app_metadata -> tenant_id`. Never from request body or headers.
**Why:** Prevents tenant spoofing attacks. A malicious client cannot set their own tenant_id in the request body.
**Alternatives:** Read from a header (X-Tenant-ID) — rejected (trivially spoofable). Read from DB lookup by user_id — rejected (adds latency, still needs JWT for auth).
**Consequence:** Every new EF must call `tenant_guard()` as its first operation before any DB access.

---

## 2026-03-04 | Email as universal identity anchor

**What:** `UNIQUE (tenant_id, email)` on `people` table. Email is the deduplication key across all sources (BambooHR, JazzHR, JotForm, WP).
**Why:** External systems (BambooHR, JazzHR) each have their own internal IDs. Email is the only stable cross-system identifier for a person.
**Alternatives:** Use BambooHR employee ID — rejected (no equivalent in JazzHR). Use WP user ID — rejected (only exists post-hire).
**Assumption:** Email does not change for a person across systems. If it does, create a new record (acceptable for MVP).

---

## 2026-03-04 | Hire detection via polling (not webhooks)

**What:** BambooHR and JazzHR are polled every 15 minutes via pg_cron. No inbound webhooks from these systems.
**Why:** BambooHR webhook setup requires enterprise plan. JazzHR webhooks are unreliable. Polling is simpler to build, test, and control.
**Alternatives:** BambooHR webhooks — deferred post-MVP. JazzHR webhooks — same.
**Consequence:** Up to 15-minute lag between hire event and WP user creation. Acceptable for MVP.

---

## 2026-03-04 | Idempotency enforced at DB layer via UNIQUE constraint

**What:** `integration_log` has UNIQUE index on `(tenant_id, source, idempotency_key)`. For hire events, `idempotency_key = email`.
**Why:** EFs can be retried, cron can fire twice, network errors can cause double-processing. DB constraint is the only reliable idempotency guard.
**Alternatives:** Application-level check (SELECT before INSERT) — rejected (race condition). Redis lock — rejected (adds infrastructure).

---

## 2026-03-04 | 3-layer training compliance model

**What:** Training data stored in 3 tables: `training_records` (raw sync), `training_adjustments` (HR overrides, append-only), `training_events` (audit trail, INSERT-only). Effective value = latest adjustment if exists, else raw.
**Why:** Sync must not overwrite official compliance dates that HR has manually adjusted. Immutable layers allow auditable history.
**Alternatives:** Single table with override flags — rejected (complex queries, mutation risk). Just use training_records — rejected (sync overwrites HR corrections).
**Non-negotiable:** Sync MUST NEVER write to effective fields. Only training_adjustments can set effective values.

---

## 2026-03-04 | No WP multisite provisioning in MVP

**What:** Tenants connect to their existing standalone WordPress sites. HOMS does not create or provision WP subsites.
**Why:** WP multisite setup is complex infrastructure. MVP validates the hire-to-onboard flow first.
**Alternatives:** WP multisite — deferred post-MVP (FR-18 locked out).
**Assumption:** Each MVP tenant already has a WP site with LearnDash installed and accessible via REST API.

---

## 2026-03-04 | pgp_sym_encrypt for API key storage

**What:** BambooHR and JazzHR API keys stored encrypted in `tenant_settings` using pgcrypto's `pgp_sym_encrypt`. Decryption only in Edge Functions.
**Why:** API keys must never be returned to the browser. Encrypting at rest provides defense-in-depth.
**Alternatives:** Supabase Vault — considered, but adds complexity for MVP. Environment secrets per tenant — rejected (doesn't scale to multi-tenant).
**Consequence:** `SUPABASE_DB_ENCRYPTION_KEY` must be set as EF secret. Losing this key = losing all encrypted data.

---

## 2026-03-04 | audit_log is INSERT-only via RLS

**What:** `audit_log` has no UPDATE or DELETE RLS policy. Even service_role cannot delete rows via PostgREST.
**Why:** Compliance requirement. Audit trail must be tamper-evident.
**Alternatives:** Separate immutable table in a different schema — overkill for MVP.
**Consequence:** audit_log will grow indefinitely. Archiving strategy needed post-MVP.

---

## 2026-03-04 | Legacy EFs not refactored in Epic 1

**What:** Pre-Epic 1 Edge Functions (jotform-webhook, listApplicants, ai-*, etc.) were not refactored to use tenant_guard.
**Why:** Risk of breaking existing functionality. Scope contained to Epic 1.
**Consequence:** Legacy EFs operate in single-tenant mode (Prolific Homecare only) until explicitly refactored in Epic 5.
**Assumption:** Only one tenant (Prolific Homecare) uses the legacy features until Epic 5 migration.
