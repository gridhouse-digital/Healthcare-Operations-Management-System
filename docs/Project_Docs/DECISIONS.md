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

---

## 2026-05-31 — Phase 0.1 (expanded): tenant-isolation remediation on reconciled `main`

Phase 0.1 was rebased onto reconciled `main` (`f6d4216`, = production, 61 migrations) and
expanded from the original single-migration RLS hotfix into **three discrete, individually
reversible migrations**:

| Migration | Purpose |
|---|---|
| `20260530000000_phase01_rls_legacy_policy_remediation.sql` (A — existing, re-validated) | Drop legacy permissive policies on applicants/offers/ai_cache; close the anon offers `secure_token` backdoor; tenant-scope `ai_logs` reads; tenant-scope the `resumes` + `compliance-documents` storage read policies. |
| `20260530000001_phase01_security_definer_views.sql` (B — new) | Flip 5 reporting views to `security_invoker = on` (clears advisor ERROR `security_definer_view`; stops cross-tenant view leak). |
| `20260530000002_phase01_function_grants_search_path.sql` (C — new) | Revoke RPC EXECUTE on the pgcrypto text wrappers (anon; + authenticated for encrypt) and on the audit trigger functions (anon/authenticated/PUBLIC); pin a fixed `search_path = public, pg_catalog` on the ~17 mutable SECURITY DEFINER functions. |

### Decision — migration numbering (brief contradiction surfaced)
The brief required B/C to sort **after** `20260530000000` **and before** Phase 1's
`20260530000001/2`, **and** to not touch Phase 1. Those are mutually impossible
(`…000000` and `…000001` are consecutive — no version sorts strictly between under
Supabase's numeric ordering). **Resolution:** B/C take `20260530000001`/`20260530000002`;
Phase 1's two WIP migrations (currently those numbers, on unmerged `99f5d7a`) must be
**renumbered to `…0003/0004` during Phase 1's own rebase**. Phase 1 is not touched now.

### Decision — test-suite regression caught by the rebase
The original 0.1 commit (`0d92220`, authored against stale `main`) had **stripped** the
recurring-compliance seeding (`training_courses`/`training_compliance_rules`/
`employee_compliance_instances`) from the RLS suite and added a now-false comment that those
tables "don't exist on main." On reconciled `main` they exist (Epic 5.9) and underlie the
view fix (B). The rebase restored the reconciled-main suite as the base and layered the 0.1
leak cases + B/C cases on top (union), rather than taking `0d92220` wholesale.

### Decision — view security model (B), dashboard-safety
`security_invoker = on` makes the querying user's RLS apply. Verified precondition: every
underlying table (`training_records`, `training_adjustments`, `people`,
`employee_compliance_instances`, `employee_group_enrollments`, `training_compliance_rules`,
`learndash_group_courses`) has an own-tenant SELECT/ALL policy keyed on
`tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)`, so own-tenant dashboard
reads still succeed. All five views (including the nested chain) are flipped so RLS propagates.

### Phase-gate redefinition (governance — owner to ratify)
"Phase 0 gate MET" covered only the **Edge-Function `tenant_guard()`** layer. The **DB
RLS-policy + storage + view + function-grant** layers had pre-existing legacy gaps. The
"tenant isolation verified" gate is redefined to require a **live RLS + storage + view pass
across ALL tenant-scoped objects** plus an ERROR-clean `get_advisors(security)`.

### ROLLBACK BLOCKS (each migration independently reversible)

**A — re-create the dropped permissive policies** (re-opens the leak — disposable env only):
recreate `"Allow all access for authenticated users"` on `applicants`; `"Allow full access for
authenticated users"`, `"Everyone can view offers"`, the profiles-admin policies and
`"Allow public read access via secure_token"` on `offers`; `"Authenticated users can read cache"`
on `ai_cache`; `"Authenticated users can read logs"` on `ai_logs` (drop `ai_logs_select_own_tenant`);
restore the prior bare `TO authenticated` storage read policies and drop
`public.storage_obj_in_caller_tenant`. (Original definitions: Epic-0 migrations
`20251128000000/01`, `20251129000002`, `20251209000000`, `20251204000001`.)

**B — revert views to SECURITY DEFINER:**
```sql
do $$
declare v text;
  vs text[] := array['v_training_compliance','v_active_training_compliance',
    'v_onboarding_training_compliance','v_recurring_compliance_status','v_recurring_compliance_audit'];
begin
  foreach v in array vs loop
    if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relname=v and c.relkind='v') then
      execute format('alter view public.%I set (security_invoker = off)', v);
    end if;
  end loop;
end $$;
```

**C — restore grants + mutable search_path:**
```sql
-- re-grant pgcrypto wrappers
grant execute on function public.pgp_sym_decrypt_text(text, text) to anon;
grant execute on function public.pgp_sym_encrypt_text(text, text) to anon, authenticated;
-- re-grant audit trigger functions + reset search_path on the hardened set
do $$
declare r record;
  audit_fns text[] := array['audit_people','audit_offers','audit_ai_cache','audit_tenant_settings',
    'audit_tenant_users','audit_training_records','audit_training_adjustments','audit_training_events',
    'audit_recurring_compliance_table'];
  sp_fns text[] := array['update_updated_at_column','set_tenant_access_requests_updated_at','is_admin',
    'get_my_role','training_adjustments_event_trigger','training_records_event_trigger','audit_people',
    'audit_offers','audit_ai_cache','audit_tenant_settings','audit_tenant_users','audit_training_records',
    'audit_training_adjustments','audit_training_events','audit_recurring_compliance_table',
    'respond_to_offer','custom_access_token_hook'];
begin
  for r in select p.proname, pg_get_function_identity_arguments(p.oid) a from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(audit_fns) loop
    execute format('grant execute on function public.%I(%s) to anon, authenticated', r.proname, r.a);
  end loop;
  for r in select p.proname, pg_get_function_identity_arguments(p.oid) a from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(sp_fns) loop
    execute format('alter function public.%I(%s) reset search_path', r.proname, r.a);
  end loop;
end $$;
```
> Rolling back re-opens the corresponding advisor finding — disposable/preview environments only.
