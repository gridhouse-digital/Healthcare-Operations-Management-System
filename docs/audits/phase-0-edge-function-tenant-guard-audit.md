# Phase 0 — Edge Function Tenant-Guard Audit

> **Phase**: 0 — Preserve and Audit Current HOMS
> **Source of truth**: `docs/architecture/homs-platform-expansion-implementation-spec.md` §10, §20 (Phase 0)
> **Date**: 2026-05-29 (audit) · 2026-05-29 (remediation)
> **Scope**: Audit + Phase 0 tenant-guard remediation. No folder refactor, RBAC change, Care Ops, or Staff App work. Code changes limited to tenant-guard hardening of the 5 flagged functions and one supporting trigger migration.

> **Remediation status (2026-05-29): COMPLETE — Phase 0 gate MET.** All 5 non-compliant
> functions hardened (see §5). Static validation passed (guard-first placement, no `x-tenant-id`,
> no hardcoded tenant UUID, zero new lint problems vs baseline). The `on_offer_accepted` trigger
> migration was applied and validated against the local database: applies cleanly, idempotent,
> and an end-to-end fire confirmed the webhook now carries `Authorization: Bearer
> <service_role_key>` with the `record` body preserved (see §5 → DB validation). Remaining work
> is deployment-only.

---

## 1. Objective

Verify that every Edge Function uses `tenantGuard()` (single-tenant, user-authenticated)
or `cronOrTenantGuard()` (dual-path: pg_cron service-role **or** user) as the **first call**
in its handler, per the Phase 0 acceptance criterion:

> *"Every Edge Function uses `tenantGuard()` or `cronOrTenantGuard()` as first call.
> No known data leakage paths between tenants."*

The non-negotiable rule under audit (CLAUDE.md → Security):

> `tenant_id` is read **ONLY** from `JWT → app_metadata → tenant_id` — NEVER from request body or headers.

---

## 2. Method

- Enumerated all function directories under `prolific-hr-app/supabase/functions/`
  (excluding `_shared`, `coverage`, `emails`).
- Inspected the handler entry point (`Deno.serve` / `serve`) of each `index.ts`.
- A function is **compliant** only if a guard is the first statement after the
  CORS/`OPTIONS` preflight short-circuit, AND tenant identity is sourced solely from the JWT.
- Functions that derive tenant identity from the request body, a custom header
  (`x-tenant-id`), or a hardcoded fallback are **non-compliant**.
- Genuinely public endpoints (unauthenticated by design) are listed separately as
  **intentionally unauthenticated** with the justification.

**Function count:** 29 deployable functions inspected. (The spec text references "31 Edge
Functions"; the current tree contains 29 deployable functions plus the `_shared` library and
`coverage`/`emails` support folders. The discrepancy is a count-drift in the spec, not a
missing function — flagged for spec maintenance, no code change made.)

---

## 3. Summary (post-remediation)

| Classification | Count | Functions |
|---|---|---|
| ✅ Compliant | 26 | see §4 (18 `tenantGuard`, 8 `cronOrTenantGuard`) |
| ❌ Non-compliant | 0 | — (all 5 remediated; see §5) |
| ⚪ Intentionally unauthenticated (by design) | 2 | see §6 |
| ❓ Unclear | 0 | — |

**Total: 28 deployable functions.**

The 5 previously non-compliant functions (`ai-rank-applicants`, `ai-draft-offer-letter`,
`ai-onboarding-logic`, `ai-wp-validation`, `onboard-employee`) now call a tenant guard as the
first statement after the `OPTIONS` preflight and source tenant identity only from the JWT (or,
for `onboard-employee`, from the server-trusted applicant record). The Phase 0 acceptance
criterion ("Every Edge Function uses `tenantGuard()` or `cronOrTenantGuard()` as first call") is
**met in code**, pending the one DB-validation step noted in the header.

---

## 4. ✅ Compliant (26)

All call a guard as the first statement after the `OPTIONS` preflight, and read tenant
identity exclusively from the JWT (or, for `onboard-employee`, from the server-trusted
applicant record after authenticating the caller).

### Uses `tenantGuard()` (18)

| Function | Guard line | Notes |
|---|---|---|
| `admin-update-user` | `index.ts:16` | Guard first; additional role check on `ctx.role`. |
| `deactivate-tenant-user` | `index.ts:18` | |
| `getApplicantDetails` | `index.ts:35` | |
| `invite-tenant-user` | `index.ts:19` | |
| `invite-user` | `index.ts:16` | |
| `listApplicants` | `index.ts:37` | |
| `list-tenant-users` | `index.ts:11` | |
| `manage-recurring-compliance-instance` | `index.ts:94` | |
| `save-connector` | `index.ts:29` | |
| `save-ld-mappings` | `index.ts:23` | |
| `sendOffer` | `index.ts:40` | |
| `sendRequirementRequest` | `index.ts:38` | |
| `test-connector` | `index.ts:20` | |
| `update-tenant-user-role` | `index.ts:20` | |
| `ai-rank-applicants` | `index.ts:28` | **Remediated** — was `getContext`/`x-tenant-id`. |
| `ai-draft-offer-letter` | `index.ts:31` | **Remediated** — was `getContext`/`x-tenant-id`. |
| `ai-onboarding-logic` | `index.ts:23` | **Remediated** — was `getContext`/`x-tenant-id`. `_ai_instructions` branch preserved. |
| `ai-wp-validation` | `index.ts:23` | **Remediated** — was `getContext`/`x-tenant-id`. |

Subtotal: **18** functions using `tenantGuard()` (`invite-user` and `invite-tenant-user` are distinct functions).

### Uses `cronOrTenantGuard()` (8)

These are dual-path functions invoked by both pg_cron / DB-webhook (service-role) and
authenticated users. The guard returns `{ mode: "cron" }` for fan-out across tenants, or
`{ mode: "user", tenantId, ... }` for a single tenant.

| Function | Guard line | Notes |
|---|---|---|
| `backfill-recurring-compliance-anchors` | `index.ts:389` | |
| `detect-hires-bamboohr` | `index.ts:426` | |
| `detect-hires-jazzhr` | `index.ts:444` | |
| `process-hire` | `index.ts:308` | |
| `rebuild-compliance-instances` | `index.ts:319` | |
| `sync-training` | `index.ts:1081` | |
| `sync-wp-users` | `index.ts:403` | |
| `onboard-employee` | `index.ts:24` | **Remediated** — was unguarded + body-trust + hardcoded fallback. Invoked by the `on_offer_accepted` DB webhook (service-role → mode `cron`). Tenant derived from the applicant record; `record.tenant_id` validated against it; no fallback. Requires the trigger migration (§5) so the webhook sends the service-role JWT. |

Subtotal: **8** functions using `cronOrTenantGuard()`. Combined compliant total: **18 + 8 = 26**.

---

## 5. Remediation (5 functions fixed — 0 non-compliant remaining)

All five functions flagged in the original audit have been remediated. Tenant source
before → after:

| Function | Before | After |
|---|---|---|
| `ai-rank-applicants` | No guard; `getContext(req)` → `x-tenant-id` **header** | `tenantGuard(req)` first; `tenantId`/`userId` from JWT |
| `ai-draft-offer-letter` | No guard; `getContext(req)` → `x-tenant-id` **header** | `tenantGuard(req)` first; `tenantId`/`userId` from JWT |
| `ai-onboarding-logic` | No guard; `getContext(req)` → `x-tenant-id` **header** | `tenantGuard(req)` first; `tenantId`/`userId` from JWT |
| `ai-wp-validation` | No guard; `getContext(req)` → `x-tenant-id` **header** | `tenantGuard(req)` first; `tenantId`/`userId` from JWT |
| `onboard-employee` | No guard; service-role; `record.tenant_id` from **body** + **hardcoded fallback** `'11111111-…'` | `cronOrTenantGuard(req)` first; tenant derived from server-trusted `applicant.tenant_id`; `record.tenant_id` validated to match (reject on mismatch); user-mode caller tenant validated; **no fallback** |

### What changed in the four AI functions

- Import `getContext` from `_shared/context.ts` replaced with `tenantGuard` from
  `_shared/tenant-guard.ts`. `getContext()` (which read `tenant_id` from the `x-tenant-id`
  header) is no longer used by these functions.
- `x-tenant-id` removed from each function's `Access-Control-Allow-Headers`.
- `tenantGuard(req)` is the first statement inside the `try`, immediately after the `OPTIONS`
  preflight. `tenantId`/`userId` passed to `aiRequest(...)` now come from the guard context.
- `catch` now returns the guard's status (401 for auth failures) instead of a blanket 400.
- **Behavior preserved:** schemas, prompts, `task`/`feature` strings, the `_ai_instructions`
  branch in `ai-onboarding-logic`, and the success response shape (`JSON.stringify(result)`)
  are unchanged. Net behavioral effect: these functions now **require** an authenticated tenant
  JWT (previously `getContext` allowed anonymous calls with `tenantId: null`). The frontend
  already sends the JWT via `supabase.functions.invoke`, so authenticated users are unaffected.
  No frontend change was required (verified: no client code sends `x-tenant-id`).

### What changed in `onboard-employee`

- `cronOrTenantGuard(req)` is the first statement after `OPTIONS` (before any body read or
  client creation). The function is invoked by the `on_offer_accepted` DB webhook (service-role
  → mode `cron`); a user JWT is also accepted.
- Tenant is derived from the server-trusted `applicant.tenant_id` (looked up by
  `record.applicant_id`). Errors if the applicant has no tenant. If `record.tenant_id` is
  present it must equal the applicant's tenant (reject on mismatch). In user mode, the caller's
  tenant must also match. The hardcoded `'11111111-…'` fallback is removed.
- Service-role client is still used for cross-tenant WP/LearnDash onboarding, but only **after**
  the guard authenticates the caller. Conversion behavior (WP user, LearnDash enrollment,
  `people.wp_user_id` update, Brevo email, success response) is unchanged.

### Supporting migration

`supabase/migrations/20260529000000_onboard_trigger_service_role_auth.sql` recreates the
`on_offer_accepted` trigger so the webhook sends `Authorization: Bearer <service_role_key>`,
read at execution time from `vault.decrypted_secrets` (the established pattern from
`20260308000001`). **No secret value is written into the migration** — Vault lookup by name
only. Required because the function now rejects unauthenticated calls; without this the legacy
no-auth trigger would break onboarding.

**Implementation note (found during DB validation):** the original legacy trigger used
`supabase_functions.http_request(...)` with literal arguments. A `CREATE TRIGGER ... EXECUTE
FUNCTION` clause only accepts *literal constant* arguments — it cannot evaluate
`jsonb_build_object(...)` or a Vault subquery — so the service-role key cannot be injected into
that call's argument list (verified: it raises `syntax error at or near "("`). The migration
therefore attaches a dedicated PL/pgSQL trigger function, `public.notify_onboard_employee()`
(`security definer`, returns `NEW`), which builds the headers at execution time from Vault and
calls `net.http_post` (pg_net) with body `{ "record": to_jsonb(new) }`.

### Static validation performed

- All 5 call a guard as the first statement after `OPTIONS` (verified by inspection).
- No function references `x-tenant-id`; none import `getContext` (verified by grep).
- `onboard-employee` contains no `11111111-…` literal (verified by grep).
- The migration uses `vault.decrypted_secrets` and contains no literal JWT/secret (verified).
- `deno lint` problem count is **18 before = 18 after** — zero new lint issues introduced
  (all 18 are pre-existing legacy style rules: `no-import-prefix`, `no-explicit-any`).
- `deno check` could not complete in this environment (TLS interception blocks fetching the
  remote `zod`/`esm.sh`/`react` imports — an environment limitation, not a code defect). The
  shared `cron-or-tenant-guard.ts` (jsr imports) type-checks clean, confirming the
  `auth.mode`/`auth.tenantId` usage is type-correct.

### DB validation (PASSED — 2026-05-29)

The trigger migration was applied and validated against the local Supabase database:

- Migration applies cleanly: `notify_onboard_employee()` created (returns `trigger`,
  `security definer`), `on_offer_accepted` recreated to `EXECUTE FUNCTION
  notify_onboard_employee()` with the original `WHEN` condition intact.
- **Idempotent:** re-applying leaves exactly one trigger (uses `drop trigger if exists` +
  `create or replace function`).
- **End-to-end fire** (in a rolled-back transaction, with throwaway local Vault secrets):
  flipping an offer to `Accepted` enqueued a pg_net POST to `/functions/v1/onboard-employee`
  with `Authorization: Bearer <service_role_key from Vault>` present, and body
  `{ "record": { id, status: "Accepted", applicant_id, tenant_id, … } }` — confirming both the
  auth header and the preserved `record` contract. No test data or secrets persisted.

**Phase 0 gate: MET in code and validated.** Remaining work is deployment-only (deploy the
migration + redeploy the 5 functions; ensure the `service_role_key` Vault secret exists in the
target project).

---

## 6. ⚪ Intentionally unauthenticated (2)

These are public endpoints by design. They do not — and should not — use a tenant guard. Each
resolves/scopes the tenant through a server-trusted mechanism, not client-supplied identity.

| Function | Handler | Justification |
|---|---|---|
| `jotform-webhook` | `index.ts:32` | Inbound webhook from JotForm — unauthenticated by protocol. Tenant is resolved server-side by looking up the owning tenant from the submission's `formID` against `tenant_settings`. Uses service-role client. Documented as such in the file header. |
| `request-access` | `index.ts:497` | Public "request access" form for users who do not yet have an account/tenant. No tenant exists to guard. Protected instead by rate limiting (per-email/per-IP) and a honeypot (`website`) field; uses an admin client to persist the request. |

> **Recommendation (no code change):** Both are legitimately public, but they widen the
> attack surface. Confirm JotForm webhook authenticity (e.g., shared-secret / signature
> validation) and keep `request-access` rate limits tuned. Track as hardening items, not Phase 0
> blockers.

---

## 7. Final Tally (post-remediation)

| Classification | Count |
|---|---|
| ✅ Compliant (guard is first call, JWT-only tenant) | 26 |
| ❌ Non-compliant | 0 |
| ⚪ Intentionally unauthenticated | 2 |
| **Total deployable functions** | **28** |

> The function-directory scan returned 29 entries; one (`emails/`) is a shared non-handler
> support folder, not a deployable function.

---

## 8. Conclusion

- **Compliant:** 26 functions use `tenantGuard()` / `cronOrTenantGuard()` as the first call and
  source tenant identity only from the JWT (or, for `onboard-employee`, the server-trusted
  applicant record after authenticating the caller).
- **Non-compliant:** 0 — all 5 originally-flagged functions have been remediated (§5).
- **Intentionally unauthenticated:** 2 functions (`jotform-webhook`, `request-access`) are
  public by design and correctly excluded from the guard requirement.
- **Unclear:** none.

**Phase 0 gate status: MET.** Code remediation is complete, statically validated, and the
trigger migration has been applied/validated against the database (see §5 → DB validation:
clean apply, idempotent, end-to-end fire with auth header + preserved `record` body). Deploy
ordering note: deploy the migration and the `onboard-employee` function together — deploying the
guarded function without the updated trigger would break onboarding until the migration runs.
The `service_role_key` Vault secret must exist in the target project (already required by
`process-hire`).
