# DECISIONS — HOMS

> **Hierarchy rank:** 5 (current — authoritative for design rationale / "why" behind the codebase).
> Companion to the rank-5 current capability/domain/gap docs. Registered by the 2026-05-29 doc audit.

> Architecture, product, and security decisions. Most recent first.
> Format: ## [DATE] Title | What | Why | Alternatives considered

---
## 2026-06-21 | Transactional email provider strategy: abstraction first, Resend short term, SES regulated default

**What:** Phase 3 offer delivery must not be implemented as a Brevo-only path. The next delivery PR must introduce an internal transactional email provider boundary before wiring `OfferList` to real delivery. The provider boundary should support `resend`, `ses`, and legacy `brevo` as provider ids, with no false success: the caller may mark an offer `Sent` only after the selected provider returns an accepted message id/status.

**Current Brevo footprint:** Brevo is still configured in the repo today. Tenant-scoped delivery uses `tenant_settings.brevo_api_key_encrypted`; platform request-access notifications use `PLATFORM_BREVO_API_KEY`; `sendOffer`, `sendRequirementRequest`, `onboard-employee`, and `request-access` call the Brevo API directly. These are current-state facts, not the future target.

**Recommendation:** Use Resend as the fastest clean MVP provider for non-PHI transactional offer emails because it has a simple developer API and fits the existing React Email direction. Use AWS SES as the regulated-platform default before any workflow sends ePHI/PHI, patient-specific, clinical, credential, or medical-content email; SES is the stronger long-term compliance fit when paired with an AWS BAA and correct configuration. Brevo remains legacy-compatible only until email delivery is migrated behind the provider boundary.

**Content rule:** Email bodies must stay minimal and non-clinical. Send only transactional context and a secure HOMS link; the canonical offer letter and any sensitive applicant/employee details remain inside HOMS behind token/auth controls.

**Why:** HOMS is a healthcare operations platform. Vendor lock-in at the `sendOffer` layer would make compliance and deliverability decisions harder later. Brevo is a broad marketing/CRM platform and is already hardcoded into several EFs; Phase 3 is the right moment to stop adding more direct Brevo coupling.

**Phase 3 implementation direction:** Phase 3 remains blocked until explicit CTO approval after Phase 2 / PR #26 is merged. When approved, add a shared `_shared/email-provider` style module or equivalent service boundary; store provider response metadata; log failed sends to `integration_log`; surface missing provider configuration as an actionable UI error; and keep `Sent` status changes atomic with provider acceptance.

**Rollback:** If the provider abstraction causes regressions, disable the new offer send UI path and leave existing status/edit/public-accept behavior intact. Do not remove existing Brevo-backed non-offer functions until each has its own migration plan and test evidence.

## 2026-06-20 | Per-tenant offer-letter template foundation

**What:** Offer-letter identity and default body now live on the tenant-owned `tenant_settings` row: `offer_company_name`, `offer_signatory_name`, `offer_signatory_title`, and `offer_letter_template`. The Settings UI edits those fields through the real `tenant_settings` path. Offer previews, the public token view, AI offer drafting context, and the dormant `sendOffer` email template use those fields with neutral fallback values only.

**Why:** The offer flow was still carrying single-tenant identity strings in multiple offer paths. That is incompatible with HOMS as a multi-tenant platform and creates a risk that one agency's legal/company identity appears in another tenant's offer letter.

**Rendering rule:** Merge fields are `{{candidate}}`, `{{position}}`, `{{rate}}`, `{{start_date}}`, `{{company}}`, `{{signatory}}`, `{{signatory_title}}`, and `{{accept_url}}`. Frontend preview rendering escapes template text and merge values before HTML injection.

**Public candidate view:** A token-based `get_public_offer(token_arg)` SECURITY DEFINER function returns only non-sensitive offer/applicant-display/template fields needed by `/offer/:token` for unexpired offers (`expires_at IS NULL OR expires_at >= now()`). It does not expose encrypted columns, broad tenant settings, `secure_token`, applicant email, or applicant phone.

**Alternatives considered:** Keep company/signatory in frontend constants - rejected because it repeats the single-tenant bug. Add a separate `offer_templates` table - deferred; one default template per tenant is sufficient for this foundation phase. Store rendered letter on send - deferred to Phase 3 so the send/delivery refactor stays separate.

**Rollback:**
```sql
DROP FUNCTION IF EXISTS public.get_public_offer(text);
ALTER TABLE public.tenant_settings
  DROP COLUMN IF EXISTS offer_company_name,
  DROP COLUMN IF EXISTS offer_signatory_name,
  DROP COLUMN IF EXISTS offer_signatory_title,
  DROP COLUMN IF EXISTS offer_letter_template;
```
Code rollback is a git revert of the Phase 2 branch changes. Do not run the Phase 3 delivery refactor as part of this rollback.

## 2026-06-18 | Employee-status resolution must live ONLY in writeEmployeeStatus (no second copy)

**What:** `sync-training` had its own inline `resolveEmployeeStatus`/`refreshEmployeeStatus` that read the record-driven `v_onboarding_training_compliance` view and wrote `people.employee_status` directly. Replaced both with the shared `writeEmployeeStatus` from `_shared/employee-status-resolver.ts`.

**Why:** The duplicate copy was never updated when the onboarding gate shipped (PR #18/#19), so the daily 07:00 `sync-training-daily` cron silently re-resolved Onboarding employees back to `Active` using the old fail-open logic (it counts only *started* courses; Karimah's 2 of 6 both complete → "done" → Active). It ignored the per-department `v_onboarding_gate`, the fail-closed Q2 matrix, and "established Active stays Active". Net effect: the backfill set status correctly, and a stale divergent job overwrote it every night. Root-caused via audit_log (`Onboarding→Active` at exactly 07:00, actor null) cross-referenced with `cron.job` (`sync-training-daily` = `0 7 * * *`).

**Rule:** Status resolution is centralized. Any function that needs to (re)compute `people.employee_status` MUST call `writeEmployeeStatus(admin, personId)` — never reimplement the logic or write `employee_status` from its own query. The only legitimate direct writes are the initial-default on insert (`sync-wp-users` new-row `Onboarding`) and HR-driven terminal transitions.

**Deploy note:** Any change to `_shared/employee-status-resolver.ts` must redeploy EVERY function that calls `writeEmployeeStatus` — currently `convert-applicant` and `sync-training`. Missing one re-introduces drift.

**Alternatives considered:** Just redeploy `sync-training` with the (already-correct) shared resolver — rejected because it had its OWN copy, not the shared one, so a redeploy alone would not have changed its behavior; the code had to be unified.

## 2026-06-15 | RLS isolation CI: temporary local Data API auto-grants; durable explicit GRANT migration required

### Temporary CI/local-stack measure

**What:** The local Supabase config sets `api.auto_expose_new_tables = true` so a fresh local `supabase db reset` grants Data API table/view privileges to the API roles (`anon`, `authenticated`, `service_role`) as the legacy local stack did. This makes the `rls-isolation` CI job exercise RLS policies through PostgREST instead of failing during shared setup with `permission denied for table tenants`.

**Why:** Latest Supabase CLI/local-stack behavior follows the new cloud default introduced on 2026-05-30: migration-created public tables are not automatically exposed to Data API roles. With that default, even a valid `SERVICE_ROLE_KEY` JWT authenticated as `service_role`, but `service_role` lacked table privileges on `public.tenants`, so the RLS suite failed before any tenant-isolation assertions ran. Restoring local auto-exposure is a CI unblocker; RLS still enforces tenant isolation because table grants are only reachability, not row visibility.

**Clock:** `api.auto_expose_new_tables` is deprecated and scheduled for removal on 2026-10-30. This is intentionally temporary.

### Durable fix — IMPLEMENTED 2026-06-15 (migration `20260615000001_explicit_data_api_grants`)

**What:** The migration grants the Data API roles (`anon`, `authenticated`, `service_role`) `ALL` on existing public tables/sequences + `EXECUTE` on functions, plus matching `ALTER DEFAULT PRIVILEGES` for future objects. It then re-applies the existing function `EXECUTE` hardening exceptions for sensitive/internal RPCs (`pgp_sym_*` wrappers, audit trigger functions, trigger-only helpers, `storage_obj_in_caller_tenant` for `anon`, and legacy role helpers). `auto_expose_new_tables` is removed from `supabase/config.toml` (left unset → new always-revoked default). Fresh DBs / CI now get grants from the migration, not the flag — and the `rls-isolation` gate passes without the flag.

**Decision — faithful replication, NOT re-scoping (chosen 2026-06-15):** Production was audited and already grants `ALL` on every public table to all three Data API roles (the standard Supabase broad-GRANT + RLS-as-guard model the app was built on), with matching default privileges for future objects. The migration replicates that **exactly** — zero behavior change, zero prod/CI grant drift, idempotent no-op on prod. We deliberately did **not** scope `anon`/`authenticated` down per-table: that would diverge from prod, risk 403-ing the frontend, and is a separate least-privilege hardening project (needs per-table + UI regression testing), not a flag swap. RLS remains the enforced isolation layer (verified by the `rls-isolation` CI gate).

**Why:** Explicit grants make fresh databases, CI, and future Supabase defaults deterministic, and document the intended API surface in schema history instead of relying on a deprecated compatibility flag.

**Validation/root cause follow-up (2026-06-15):** A clean fresh-reset reproduction on branch `chore/explicit-data-api-grants` proved the explicit table grants survive without the flag (`service_role` kept `INSERT`/`SELECT` on `public.tenants`). The failed draft PR run was not caused by Supabase/CLI finalization revoking table grants after the migration; it was caused by the draft migration's broad `GRANT EXECUTE ON ALL FUNCTIONS` reopening `pgp_sym_encrypt_text(text,text)` to `anon`/`authenticated`, which violated the RLS suite's grant-hardening contract. Re-applying the prior function revokes at the end of the explicit-grants migration restores that contract; local `deno task test:rls` after `supabase db reset` passes `68 passed | 0 failed` with `auto_expose_new_tables` still unset.

**Rollback:** Revert the migration + restore `auto_expose_new_tables = true` in `config.toml`. Grants are idempotent; reverting the migration does not drop prod grants (which predate it).

## 2026-06-13 | Onboarding gate revision: per-department onboarding groups, recurring stays course-based, rollback

> Supersedes the 2026-06-12 single `tenant_settings.onboarding_group_id` gate before activation.
> Implements `docs/bmad/working-notes/2026-06-13-onboarding-gate-per-department-revision.md`.
> Migration `20260613000001_onboarding_gate_per_department.sql`.

### Per-department `is_onboarding` flag

**What:** Onboarding groups now live inside `tenant_settings.ld_group_mappings` as a per-entry boolean: `{ job_title, group_id, is_onboarding }`. A group gates onboarding only when `is_onboarding === true`; absent/unset defaults to false, so the resolver fails closed. The obsolete `tenant_settings.onboarding_group_id` column is dropped.
**Why:** The agency runs department-specific onboarding curricula. Caregivers use group `54`; Nurses use group `1428`. A single tenant-wide onboarding group was the wrong abstraction and was never activated in production.
**Alternatives:** One universal tenant group - superseded as incorrect for the current LearnDash model. Inferring onboarding from every mapped group - rejected because future non-onboarding groups must not gate lifecycle status.

### Gate semantics

**What:** `v_onboarding_gate` now unnests onboarding-flagged `ld_group_mappings`, joins only active `employee_group_enrollments`, active `learndash_group_courses`, and active `training_courses`, and emits the same output columns as before: `tenant_id`, `person_id`, `course_id`, `course_name`, `effective_status`, `effective_completed_at`, `has_record`. Missing records still surface as `effective_status='not_started'`. `security_invoker = on` remains.
**Resolver wiring:** Only `gatherStatusInput` changes: it reads `ld_group_mappings`, derives onboarding group IDs from `is_onboarding === true`, checks active enrollment in any of those groups, then reads rows from `v_onboarding_gate`. The pure `resolveEmployeeStatus` Q2 matrix remains unchanged, and `writeEmployeeStatus` remains the sole writer of `people.employee_status`.

### Recurring compliance stays course-based

**What:** Recurring/annual training remains modeled as a course requirement via `training_compliance_rules.compliance_track='recurring'` plus recurrence metadata. It is never represented as a separate onboarding group. `v_onboarding_gate` excludes recurring-tracked courses for the specific onboarding group/course pair; `v_onboarding_training_compliance` and the recurring-compliance subsystem are not modified.
**Why:** Annual reviews are department-specific courses inside the department groups, but recurrence is a policy attribute of the course requirement. The onboarding gate is a first-time curriculum gate, while recurring compliance remains an ongoing compliance axis.

### Rollback

```sql
-- Restore the prior single-group column if the revision must be backed out.
alter table public.tenant_settings
  add column if not exists onboarding_group_id text;

create or replace view public.v_onboarding_gate as
select
  ts.tenant_id,
  ege.person_id,
  lgc.course_id,
  tc.course_name,
  coalesce(votc.effective_status, 'not_started') as effective_status,
  votc.effective_completed_at,
  (votc.training_record_id is not null) as has_record
from public.tenant_settings ts
join public.employee_group_enrollments ege
  on ege.tenant_id = ts.tenant_id
 and ege.group_id  = ts.onboarding_group_id
 and ege.active
join public.learndash_group_courses lgc
  on lgc.tenant_id = ts.tenant_id
 and lgc.group_id  = ts.onboarding_group_id
 and lgc.active
join public.training_courses tc
  on tc.tenant_id = ts.tenant_id
 and tc.course_id = lgc.course_id
 and tc.active
left join public.v_onboarding_training_compliance votc
  on votc.tenant_id = ts.tenant_id
 and votc.person_id = ege.person_id
 and votc.course_id = lgc.course_id
where ts.onboarding_group_id is not null
  and not exists (
    select 1 from public.training_compliance_rules tcr
    where tcr.tenant_id = ts.tenant_id
      and tcr.course_id = lgc.course_id
      and tcr.group_id  = ts.onboarding_group_id
      and tcr.active
      and tcr.compliance_track = 'recurring'
  );

alter view public.v_onboarding_gate set (security_invoker = on);
```
- **Code rollback:** git revert the resolver, Settings UI/save path, backfill preflight, RLS seed/test updates, and the `process-hire`/`onboard-employee` enrollment revert if the single-group model is intentionally restored.
- **Deployment order:** revert/redeploy affected functions before changing the view back. Do not run the backfill during rollback unless an owner-approved restore script is prepared.

## 2026-06-12 | Onboarding completion gate: requirement-driven `v_onboarding_gate`, single designated group, grandfathering, rollback

> Superseded on 2026-06-13 by the per-department `ld_group_mappings[].is_onboarding`
> model above. Kept as historical context for the unactivated single-group work.
> Implements the owner decisions LOCKED 2026-06-11 in
> `docs/bmad/working-notes/2026-06-07-onboarding-completion-gate-handoff.md` §2.
> Migration `20260612000001_onboarding_completion_gate.sql`. Fixes the P1 fail-open
> `Active` bug (mandatory courses with no synced record vanished from the completeness check).

### Single `onboarding_group_id`, not multi-select (re-confirmed 2026-06-12)

**What:** `tenant_settings.onboarding_group_id text` — ONE designated onboarding LearnDash group per tenant; the source of truth for onboarding assignment and the completion gate. NULL = gate unconfigured → resolver fails closed (`configuration_incomplete`).
**Why:** Owner's planned WP restructure introduces a universal New-Hires group every new user joins first. Owner re-confirmed **single** over `onboarding_group_ids text[]` on 2026-06-12 (the handoff's ⚠️ flag).
**Alternatives:** Multi-select `text[]` (per-role gates 54/1428) — deferred; the documented escape hatch is one column-type change + one `= ANY()` predicate if the WP restructure is abandoned. Per-person "first group" inference — rejected by owner (locked decision #1: explicit setting, not inference).

### Gate semantics (requirement-driven, fail-closed)

**What:** `v_onboarding_gate` (`security_invoker = on` per the Phase 0.1 ruling) emits one row per (person × active course mapped to the designated group) **whether or not a `training_records` row exists** — missing record surfaces as `effective_status='not_started'`. Courses with an active `compliance_track='recurring'` rule on the designated group are excluded (the recurring subsystem owns them). Effective status joins `v_onboarding_training_compliance`, so Layer B `training_adjustments` overrides still apply. `v_onboarding_training_compliance` itself is NOT modified.
**Resolver wiring:** `gatherStatusInput` only — `hasActiveTrainingGroups` = active enrollment in the designated group; `complianceView` = gate rows. The pure `resolveEmployeeStatus` Q2 matrix is FROZEN and unchanged; `writeEmployeeStatus` remains the sole writer of `employee_status`.
**Implementation refinements vs the handoff's SQL block (both fail-closed-safe, validated live 2026-06-12):**
1. `and lgc.active` added to the `learndash_group_courses` join. The handoff's prose ("every **active course mapped** to the designated onboarding group"; §1 evidence used "active courses only") requires it; its SQL block omitted it. Live proof: course 135 was deactivated on group 1428 — without the predicate it would gate Karimah forever with an uncompletable course.
2. `process-hire` auto-enroll anchors use `anchor_source='process_hire'` (the existing convention for that path). The handoff's `'group_enrollment'` parenthetical is not a legal `employee_group_enrollments.anchor_source` CHECK value (`process_hire|backfill|hired_at_fallback|manual`) — it conflated `training_compliance_rules.anchor_type`.

### Grandfathering (owner-approved) + 2026-06-12 identify snapshot

**What:** One-time corrective backfill (`scripts/backfill-onboarding-gate.ts`) resets ONLY currently-`Active` employees with ≥1 incomplete gating course; `Active` employees with **zero gate rows** (not enrolled in the designated group — completing against their current role group during the WP-restructure window) are untouched. Reset = `employee_status -> null`, then re-resolve via `writeEmployeeStatus` — never a raw status write.
**Live identify (read-only, 2026-06-12):** expected resets = **Karimah Moss only** (6 gating / 2 completed). Delta vs the handoff's 2026-06-07 table: (a) course 135 deactivated on group 1428 since the snapshot; (b) **Debbra Deo is NOT reset** — her single gap was course 938, the *recurring* Annual Employee Review, which the gate excludes by locked decision #2; her 4 non-recurring gating courses completed Jan 2026. The handoff's "gap 1" for Debbra counted the recurring course as required; under shipped gate semantics she is legitimately `Active`.

### Rollback (document before `db push`)

```sql
-- Schema (additive — safe to drop):
drop view if exists public.v_onboarding_gate;
alter table public.tenant_settings drop column if exists onboarding_group_id;
```
- **Resolver/EFs/UI:** `git revert` the feature commits (gatherStatusInput rewiring, save-ld-mappings, process-hire/onboard-employee enroll step, Settings/employee-detail UI) + redeploy the affected functions.
- **Backfill:** `audit_log` preserves prior values for every status change (people audit trigger); restorable by a guarded script through `writeEmployeeStatus` after reverting the resolver wiring.
- **Order:** revert/redeploy functions BEFORE dropping the view (the rewired resolver reads the gate view; the view-missing fallback keeps it fail-safe but noisy).

## 2026-06-07 | Uniqueness key for `people`/`applicants` is `email_normalized`; all upserts must target it

**What:** Migration `20260528000002_normalized_email_uniqueness.sql` replaced the unique index on `people` and `applicants` from `(tenant_id, email)` with `(tenant_id, email_normalized)` — a `GENERATED ALWAYS AS (lower(btrim(email)))` column. **Every `people`/`applicants` upsert MUST use `onConflict: "tenant_id,email_normalized"`.** Targeting `"tenant_id,email"` no longer matches any unique index and raises Postgres `42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification`.
**Why:** Case-/whitespace-insensitive dedup is the intended identity contract (`(tenant_id, email)` is the universal dedup key, normalized). The generated column makes normalization authoritative in the DB; the application must point `ON CONFLICT` at the index that actually exists.
**Alternatives:** Keep a raw-email index — rejected (case/whitespace variants like `Ada@…` vs `ada@…` would create duplicate people/applicants). App-side normalization only — rejected (no DB-level uniqueness guarantee).
**Consequence / guard:** Phase 1 migrated `_shared/conversion.ts` correctly but **missed four Edge Functions** (`sync-wp-users`, `detect-hires-bamboohr`, `detect-hires-jazzhr`, `listApplicants`) — fixed 2026-06-07 (see PROJECT_LOG 2026-06-07). **Review guard:** any new `people`/`applicants` upsert must target `email_normalized`; an exact grep for `onConflict: "tenant_id,email"` (with the closing quote) must return zero hits under `supabase/functions/`. **Rollback:** application-layer only — `git revert` the hotfix commit + redeploy the 4 functions; no DB/migration change is involved.

## 2026-05-30 | Phase 1 lifecycle decisions (Q1–Q5): hired_at, status model, job_title, conversion authority, identity precedence

> Owner rulings that gate the Phase 1 lifecycle-stabilization implementation. Source handoff:
> `docs/bmad/working-notes/2026-05-29-phase-1-lifecycle-stabilization-handoff.md`. Implements master
> spec §3 Priorities 1–2 and §20 Phase 1. These decisions are binding on the future code task.

### Q1 — `people.hired_at` is the legal employment start date

**What:** `people.hired_at` stores the legal employment start date from the **accepted offer** (`offer.start_date`). It is NOT the button-click time, row-creation time (`created_at`), sync-discovery time, or onboarding-start time. Once populated it is immutable to automated sync and conversion retries. Corrections require an explicit, audited HR action — not an incidental side effect of editing/reprocessing an offer. If the accepted offer has no `start_date`, conversion **fails with an actionable error**.
**Why:** A hire date is a business fact that can anchor deadlines, recurring-compliance cycles, probation windows, and reporting. A conversion timestamp is merely a system event; the two must be stored separately.
**Alternatives:** Use conversion/creation timestamp — rejected (conflates a system event with a legal fact). Silently default a missing date — rejected (produces wrong compliance anchors).
**Consequence:** Conversion reads `offer.start_date`; NFR-3 sync boundary already forbids overwriting `hired_at` once set. Separation of facts: legal start → `hired_at`; record creation → `created_at`; conversion event → `audit_log`; provisioning → `integration_log`.

### Q2 — `employee_status` is resolved deterministically; lifecycle ≠ compliance

**What:** `people.employee_status` is `Onboarding` | `Active` | `Terminated`, written **only** by one idempotent resolver. `Active` = mandatory onboarding obligations complete and safely evaluable. `Onboarding` = obligations incomplete, missing, or not safely evaluable (**fail-closed** — the resolver never guesses; missing rule/group-mapping/anchor/sync ⇒ `Onboarding` + a machine-readable diagnostic reason code). `Terminated` is HR-controlled and **cannot be reversed by automation**. Ongoing compliance failures do **not** revert an established employee to `Onboarding`.
**Why:** Lifecycle state (where the employee is in the relationship), compliance state (are current obligations met), and staffing eligibility are three distinct concepts. An established employee with an expired annual credential should stay `Active` while becoming `non_compliant`/ineligible — moving them back to `Onboarding` would misrepresent history.
**Alternatives:** Define `Active` as "fully compliant forever" — rejected (conflates onboarding with ongoing compliance). Compute status inline at conversion time (current behavior) — rejected (snapshot taken by one path against a maybe-missing view; non-deterministic).
**Consequence:** Resolver is the sole automated writer of `employee_status`, idempotent, re-invoked after conversion and after relevant training/group changes, preserves explicit `Terminated`, emits reason codes. A **separate** compliance state (`compliant`/`non_compliant`/`unknown`/`configuration_error`) is introduced. Future Care-Ops staffing eligibility = `Active` AND `compliant` AND current credentials (deferred — not Phase 1).

### Q3 — `job_title` authoritative source is the accepted offer's `position_title`

**What:** During conversion, `people.job_title` is sourced from the accepted offer's `position_title`. A missing title **blocks conversion** with an actionable error (no silent `'To Be Assigned'` default). Automated connector sync must not silently replace an HR-authoritative title; later title changes require an explicit audited HR workflow.
**Why:** The accepted offer is the most specific accepted employment agreement. Applicant-selected role, requisition title, ATS profile, and WP role are weaker/staler sources; a hardcoded placeholder silently breaks LearnDash mapping and reporting.
**Alternatives:** Default to placeholder — rejected. Source from applicant/requisition — rejected (aspirational/broad).
**The authoritative contract:**
```text
sendOffer request.position
  -> offers.position_title          (persisted; authoritative once the offer exists)
  -> onboard-employee reads record.position_title
  -> people.job_title
```
The input name `position` is an **API boundary detail**; the persisted DB field `position_title` is authoritative once the offer exists.
**Consequence + verified bug to fix:** `onboard-employee/index.ts:41` reads `record.position`, but the `offers` row has only `position_title` (`20251128000001_create_offers_table.sql:6`; `Offer` type `src/types/index.ts:24`) — so `record.position` is `undefined`. (`sendOffer` accepts an input param `position` and persists it as `position_title`; the defect is the **read side** in `onboard-employee`.) Phase 1 must: (a) fix the read side to use `record.position_title`, and (b) add a regression test using the **persisted offer-row shape**. **Do NOT rename the `sendOffer` request parameter** unless a broader API cleanup is intentionally scoped — this is a targeted lifecycle bug, not a schema issue.

### Q4 — One server-side conversion authority; conversion and provisioning are separate idempotent steps

**What:** HOMS has **one server-side** applicant-to-employee conversion authority. The browser must not perform multi-step conversion writes; client code becomes a thin caller. The accepted-offer trigger and authorized UI actions enter the **same** server-side workflow. An authorized retry re-runs provisioning **without creating another employee row**.

**MANDATORY responsibility split (locked 2026-05-30):**
> Internal applicant-to-employee conversion and external WordPress/LearnDash provisioning **MUST** be separate idempotent steps with independent failure and retry handling. The **preferred** implementation is a dedicated `convert-applicant` Edge Function invoking `onboard-employee` for provisioning. An alternative structure is acceptable **only if** it preserves the same transactional boundary, retry semantics, and single-writer authority.

The split of *responsibilities* is mandatory; two separately deployed Edge Functions are **not** mandated — the constraint is the transactional boundary, not the deployment topology.
**Why:** Conversion is a business transaction with tenancy/audit/retry/idempotency requirements. Client-side orchestration creates partial-state risk on disconnect, tab-close, retry, WP-succeeds-but-LearnDash-fails, concurrent admins, or webhook↔UI race. External APIs can fail *after* the DB conversion succeeds; HOMS must preserve internal truth and support retries. Coupling internal employee creation to unreliable external APIs is the failure mode this prevents.
**Alternatives:** Keep conversion in the browser/`employeeService` — rejected (partial-state risk). Treat conversion+provisioning as one indivisible transaction — **rejected and now forbidden** (couples internal truth to external API reliability). Single EF owning both responsibilities — acceptable only if it preserves the mandatory boundary/retry/single-writer guarantees above.
**Consequence:** Idempotency on `(tenant_id, normalized_email)`; conversion retries → exactly one `people` row; existing valid `hired_at` never overwritten; WP lookup-before-create; LearnDash enrollment retries don't duplicate membership; integration failures stay visible in `integration_log`; no silent failure.

### Q5 — Identity reconciliation is tenant-scoped and fail-safe

**What:** Precedence: (1) scope every query by `tenant_id`; (2) exact `applicant_id` linkage wins; (3) else exactly one normalized-email match within that tenant auto-links; (4) zero matches ⇒ create new employee when the workflow permits; (5) multiple matches or conflicting evidence ⇒ **do not auto-link/merge** — record an unresolved identity collision for manual HR review. Normalization is `trim(lowercase(email))`, applied identically in DB uniqueness, reconciliation code, and tests. No provider-specific transforms (e.g. Gmail dot-stripping) without explicit approval.
**Why:** Email is the practical dedup key but not infallible (reuse, case/whitespace, typos, imported dupes, changed addresses, conflicting applicant/WP records). "Most recently updated wins" is unacceptable — recency is not evidence of identity. Cross-tenant matching must never happen.
**Alternatives:** Recency-wins tie-break — rejected. Auto-merge on any email match — rejected (silent wrong merges). Provider-specific normalization — rejected unless approved (can merge distinct addresses).
**Consequence:** Phase 1 defines a durable unresolved-collision state (tenant, candidate record IDs, source system, normalized email, reason code, timestamp, resolution status, resolving actor + audit trail). An admin review UI may follow if it can't fit the first slice. `findEmployeeMatch` precedence moves into `_shared/identity.ts`; cross-tenant non-match is asserted inside the Phase 0 RLS suite.

### Implementation addendum (2026-05-30, code task) — schema/rollback details

The Phase 1 code task surfaced two details worth recording beyond the Q1–Q5 rulings:

1. **`people.employee_status` pre-existed** (`20260309000003`) as `TEXT DEFAULT 'Active'` with a CHECK in {Active, Onboarding, Terminated}. The handoff framed the status column as a new, null-backfilled column; in reality only the **default** needed changing. Migration `20260601000002` therefore **drops the `'Active'` default** (so the fail-closed resolver — not a column default — is the authoritative writer; a row with no resolver run is NULL, never a false `Active`) and adds the **separate `compliance_state`** column + the `identity_collisions` ledger. No existing-row backfill (out of scope; NFR-3). **Rollback:** `alter table public.people alter column employee_status set default 'Active'; drop table identity_collisions; alter table public.people drop column compliance_state;` (NULL-only backfill ⇒ non-destructive drop).

2. **Trigger repoint (Q4 split).** `on_offer_accepted` previously invoked `onboard-employee` directly (`20260529000000`). Under the mandatory conversion↔provisioning split, migration `20260601000003` repoints the trigger to `convert-applicant` (the conversion authority), which then invokes `onboard-employee` for external provisioning. **Rollback:** drop `notify_convert_applicant()` + re-create the `notify_onboard_employee()` trigger from `20260529000000`. The `convert-applicant` → `onboard-employee` call passes the service-role key and `{ record: { applicant_id, status:'Accepted' }, person_id }`; `onboard-employee` is update-only on `people` (no duplicate row on retry).

### Verification addendum (2026-05-30) — live-gate results + two open decisions

The Phase 1 code task was verified against a **live disposable Supabase stack** (local `supabase start` + full `migration up`), not just static checks. Three things to record:

3. **CV-1 latent gap closed defensively (not a rewrite).** Audit confirmed **no code path creates a `type='candidate'` `people` row** (`detect-hires-bamboohr/jazzhr` and `sync-wp-users` all insert `type:'employee'`; JotForm only reads), so the reviewer's "P0 conversion blocker" cannot fire on current data. Rather than the proposed UPDATE-in-place rewrite of the conversion critical path, `_shared/conversion.ts` gained a 3-line **defensive fallback**: if the `type='employee'` re-select misses after the `ON CONFLICT DO NOTHING` upsert, it adopts the existing same-email row and flips its `type` to `employee` (one row, no duplicate). No behavior change on current data; covered by a `conversion.test.ts` case.

4. **`employee_status` backfill — DEFERRED (grandfather, with proof of mechanism).** The live DB confirmed `people.employee_status` now has **no column default** (the resolver is the sole writer; new rows are NULL, never a false `Active`). A meaningful "ambiguous existing `Active` rows" count requires a **production** snapshot (the disposable DB has none). Because the resolver's *"established `Active` stays `Active`"* rule (Q2) means a naive re-resolve will **not** correct historically-misclassified rows, any backfill must be a deliberate **reset-then-resolve** migration — explicitly **out of scope** here (the handoff excluded existing-employee backfill; NFR-3 forbids rewriting `hired_at`). **Decision:** ship Phase 1 without backfill; spin off a separate risk-managed **Phase 1.1 reset-then-resolve** task if a production count shows material ambiguous `Active` rows.

5. **CV-3 rehire-via-row-reuse — OWNER RULED 2026-06-02: KEEP AS-IS.** When a previously-`Active` employee is rehired by reusing their existing `people` row, the resolver keeps them `Active` even if fresh onboarding obligations are unmet — this is **literal Q2 behavior** ("established Active stays Active"; lifecycle ≠ compliance). Whether a rehire should re-enter `Onboarding` is a **product decision**, not a bug. **Ruling (Phase 1 rebase handoff, 2026-06-02):** the owner confirms the current behavior is correct — a reused/rehired row stays `Active`; compliance gaps surface through the **separate `compliance_state`** axis (`non_compliant`), never by reverting lifecycle to `Onboarding`. **No rehire-detection branch is added.** Should a future product decision want rehires to re-enter `Onboarding`, that is a deliberate, separately-scoped change (resolver gains a rehire input + reset-on-group-re-entry rule); it is explicitly NOT in Phase 1. Related: [[phase-0-tenant-guard-remediation]] follow-ups.

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
**renumbered during Phase 1's own rebase**. Phase 1 is not touched now.

> **UPDATE 2026-06-02 (Phase 1 rebase — supersedes the `…0003/0004` plan above).**
> The original note proposed renumbering Phase 1 to `20260530000003/0004`. That plan
> predated the **bootstrap fixes** `20260601000000_fix_audit_ai_cache_record_id` and
> `20260601000001_c2_function_grant_hardening`, which landed on `main` afterward and are
> already in the **live ledger** (verified tip = `20260601000001`). Renumbering Phase 1 to
> `0530…0003/4` would place it *before* those already-applied `0601` versions → an
> out-of-order `supabase db push` on deploy. **Actual renumber (this rebase):**
> `20260601000002_phase1_compliance_state_and_identity_collisions` and
> `20260601000003_repoint_offer_accepted_to_convert_applicant` — strictly after the live
> tip AND the bootstrap fixes, so a fresh `db reset` and a remote `db push` both apply them
> cleanly in order.

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

---

## 2026-06-01 — Fresh-DB bootstrap fixes (BUG 1, BUG 2) + Addendum C2

Two pre-existing defects blocked a clean `supabase start` / `db reset` (DR, staging,
local, CI). Fixed off `main` (post-0.1) on branch `fix/fresh-db-bootstrap`. Not Phase 1
or Phase 0.1 migrations.

### BUG 1 — Epic-5.7 backfill aborted on an empty tenants table
`20260310000001_epic5_offers_aicache_tenant.sql` raised an exception when `tenants`
was empty, aborting a fresh apply. Changed that branch to a graceful `return;` (empty
tenants ⇒ nothing to backfill). Editing the historical migration is correct: already-
applied environments never re-run it; only fresh applies change behavior. Backfill is
unchanged when a tenant exists.
**Rollback:** restore the original guard:
```sql
if v_tenant_id is null then
  raise exception 'No tenant row found for backfill in Epic 5.7 migration';
end if;
```
(Re-introduces the fresh-apply abort — do not roll back without a seeded tenant.)

### BUG 2 — audit_ai_cache() referenced NEW.id (ai_cache PK is input_hash)
New forward migration `20260601000000_fix_audit_ai_cache_record_id.sql` does
`create or replace function public.audit_ai_cache()` writing `record_id = null`
(audit_log.record_id is uuid; input_hash is text and is preserved in before/after via
`to_jsonb`). SECURITY DEFINER + pinned `search_path = public, pg_catalog`; C-era EXECUTE
revokes preserved across replace.
**Rollback:** `create or replace` the function back to `record_id = coalesce(new.id, old.id)`
(re-introduces the `record "new" has no field "id"` failure on every ai_cache write —
do not roll back).

### Addendum C2 — residual function-grant hardening
New migration `20260601000001_c2_function_grant_hardening.sql`:
- `REVOKE EXECUTE ... FROM anon, authenticated, public` on `notify_onboard_employee()`,
  `training_adjustments_event_trigger()`, `training_records_event_trigger()` (trigger-only).
- `REVOKE EXECUTE ON FUNCTION public.storage_obj_in_caller_tenant(text,text) FROM anon`
  (authenticated retained — storage RLS policies invoke it as the caller).
- `REVOKE EXECUTE ... FROM anon, authenticated, public` on `get_my_role()`, `is_admin()`
  — verified no RLS policy or frontend RPC calls them (profiles policies dropped in Epic 5).
**Rollback:** re-grant EXECUTE to the prior roles:
```sql
grant execute on function public.notify_onboard_employee() to anon, authenticated;
grant execute on function public.training_adjustments_event_trigger() to anon, authenticated;
grant execute on function public.training_records_event_trigger() to anon, authenticated;
grant execute on function public.storage_obj_in_caller_tenant(text, text) to anon;
grant execute on function public.get_my_role() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
```
(PUBLIC grants are the Postgres default for new functions; the explicit role grants above
restore the pre-C2 reachability.)

After deploy, `get_advisors(security)` should leave only `respond_to_offer` (intentional
anon offer-response path) and `leaked_password` (owner dashboard toggle).
