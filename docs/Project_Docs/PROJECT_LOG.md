# PROJECT LOG — HOMS (Healthcare Operations Management System)

> Living document. Updated every session. Most recent entry at top.

---
## 2026-06-20 - Offers feature completion - Phase 2: per-tenant template foundation

Second phased PR for the offers feature completion. Branch `feat/offers-template-foundation` off current `main` after confirming latest commits `#25`, `#24`, and `#23`. **Not deployed; migration not pushed; Phase 3 send delivery not started.**

### What changed

- **Migration `20260620000001_offer_letter_template_settings.sql`** - adds `tenant_settings.offer_company_name`, `offer_signatory_name`, `offer_signatory_title`, and `offer_letter_template`; adds token-based `get_public_offer(token_arg)` RPC that returns only non-sensitive offer/applicant-display/template fields for unexpired public candidate pages and does not return `secure_token`, applicant email, or applicant phone.
- **Settings -> System** - adds an "Offer Letter" section with company/signatory/template fields and merge-field legend. Saves through the real `tenant_settings` row, not the legacy `settingsService` stub.
- **Settings compatibility** - shared tenant settings reads remain connector-safe and do not request Phase 2 offer columns. The System Settings "Offer Letter" section uses an explicit offer-settings hook; if the Phase 2 migration is missing, only that section shows a disabled migration-required state.
- **Offer rendering** - adds `src/features/offers/renderOfferLetter.ts` with neutral defaults, merge-field rendering, and escaping before HTML preview injection.
- **Offer surfaces de-hardcoded** - `OfferList`, `OfferPublicView`, `OfferLetterDraftPanel`, AI offer prompt, `sendOffer`, and `OfferEmail` now use tenant-configured values or neutral fallback values. `sendOffer` no longer supplies a manual `secure_token`; the DB default remains authoritative.
- **CI guard** - `.github/workflows/ci.yml` now fails if forbidden tenant literals appear in offer-related paths.

### Tests + verification

- `npm run build` -> clean (Vite chunk-size/dynamic-import warnings only, pre-existing pattern).
- `npm run lint` -> still blocked by the repo-wide pre-existing lint backlog (86 problems, including `.agent/.agents/.claude` plugin-rule failures and legacy `any`/React Compiler findings). Targeted ESLint on changed offer/settings files -> 0 errors, 1 pre-existing `autoDraft` effect warning in `OfferLetterDraftPanel`.
- `npm run test:rls` -> command exits 0, but live assertions skipped because local Supabase env keys are not configured in this workspace (68 ignored / 1 skip-control pass).
- `cd supabase/functions && deno task check` -> clean.
- `cd supabase/functions && deno test _shared/tests/ --allow-env --allow-net` -> 131 passed / 0 failed.
- Static guards -> no forbidden offer tenant literals and no manual `secure_token: crypto.randomUUID` generation.
- Direct `deno check sendOffer/index.ts` -> not a reliable gate in current repo config; fails on existing React Email JSX intrinsic typing for `OfferEmail.tsx` and existing Supabase generic RPC typing in `sendOffer`.

### Follow-ups

- Phase 3 remains separate: wire real Brevo delivery, store the sent letter, and remove the current UI status-only send behavior.

---
## 2026-06-20 - Offers feature completion — Phase 1: edit route (PR 1)

First of four phased PRs completing the half-built offers feature (per `docs/bmad/working-notes/2026-06-20-offers-feature-completion-handoff.md`). **Local only; no DB or EF changes; not merged.** Branch `feat/offers-edit-route` off `main`.

### What changed

- **`src/App.tsx`** — added the missing `offers/:id/edit` route (`<Route path="offers/:id/edit" element={<OfferEditor />} />`) next to `offers/new`. `OfferList.handleEdit` already navigates to `/offers/:id/edit` and `OfferEditor` already supports edit mode (`useParams id` → `loadOffer` → `updateOffer`); only the route registration was missing, so the edit button was a dead route.

### Tests + verification

- `npm run build` (tsc -b + vite build) → clean, 2371 modules, no new errors (chunk-size/dynamic-import warnings are pre-existing).
- `npx eslint src/App.tsx` → clean (exit 0).

### Follow-ups

- Phases 2–4 (per-tenant template foundation, real Brevo delivery, AI reconnect) tracked in the handoff doc; each ships as its own PR after review.

---
## 2026-06-18 - Training Compliance dashboard rebuild (onboarding directory)

Rebuilds the onboarding tab of the Training Compliance page into a richer compliance directory. Authored in the working tree by another tool/session; reviewed, verified (clean `npm run build`), and committed to branch `feat/training-compliance-dashboard` (commit `365048f`). **Not deployed; not merged to `main`; no DB or EF changes.**

### What changed

- **`TrainingPage.tsx`** - replaces the search + flat `TrainingEmployeeTable` with: `TrainingComplianceSummary` cards (clickable summary filters), `TrainingComplianceToolbar` (status/course/onboarding-gate/adjustments facets), client-side pagination (`PAGE_SIZE = 25`), a `TrainingComplianceMobileList`, and an `EmployeeComplianceDrawer` overlay. Active onboarding/recurring tab is now URL-driven via the `mode` search param.
- **Onboarding-gate integration** - new `useOnboardingGateSummaries(personIds)` hook fetches per-person gate state from `v_onboarding_gate`; `utils/compliancePresentation.ts` centralizes gate/adjustment/needs-action presentation helpers. Reuses the per-department gate from the 2026-06-13 work.
- **`EmployeeTrainingDetailPage.tsx`** - adds an embedded mode (props `embedded` / `employeeId` / `onClose`) so it renders both as a full page and inside the drawer; route param remains the fallback when no prop is supplied.
- **Routing (`App.tsx`)** - split into `/training/:employeeId?` (list with optional drawer overlay) and `/training/employee/:employeeId` (full detail page).
- **New components** - `ComplianceStatusBadge`, `EmployeeComplianceDrawer`, `TrainingComplianceSkeleton`, `TrainingComplianceSummary`, `TrainingComplianceTable` (+ mobile list), `TrainingComplianceToolbar`.
- **Now unused** - `TrainingStatsCards.tsx` and `TrainingEmployeeTable.tsx` are no longer imported anywhere (kept in tree for now; the latter still references the old `/training/<id>` route, but is dead code).

### Tests + verification

- `npm run build` (tsc -b + vite build) -> clean, 2371 modules, no new errors.
- Grepped for `/training/<id>` links affected by the route split -> only live caller is the intended drawer-opening `navigate()` in `TrainingPage.tsx`; the stale link sits in orphaned `TrainingEmployeeTable.tsx`.

### Follow-ups

- Delete dead `TrainingStatsCards.tsx` / `TrainingEmployeeTable.tsx` in a cleanup pass.
- Push branch / open PR pending sign-off.

---
## 2026-06-15 - Explicit Data API grants fresh-reset validation (PR #21)

Continued draft branch `chore/explicit-data-api-grants` to replace the temporary `api.auto_expose_new_tables = true` workaround with an explicit grants migration. **Local only; no `db push`, deploy, or merge.**

### Finding

The leading hypothesis was false for tables: after a fresh `supabase db reset` without `auto_expose_new_tables`, the explicit migration's table grants survived (`service_role` retained `INSERT`/`SELECT` on `public.tenants`, and `anon`/`authenticated` retained SELECT reachability for Data API tables). The draft PR failure was instead caused by the migration's broad `GRANT EXECUTE ON ALL FUNCTIONS`, which ran after the earlier function-hardening migrations and reopened `pgp_sym_encrypt_text(text,text)` to `anon`/`authenticated`.

### What changed

- Updated migration `20260615000001_explicit_data_api_grants.sql` to keep broad table/sequence grants and function default reachability, then re-apply the existing function `EXECUTE` exceptions for sensitive/internal RPCs: `pgp_sym_*`, audit trigger functions, trigger-only helper functions, `storage_obj_in_caller_tenant` for `anon`, and legacy role helpers.
- Left `supabase/config.toml` with `auto_expose_new_tables` unset; the durable path now passes locally without the temporary flag.
- Did not touch feature code, onboarding/recurring-compliance behavior, or other migrations.

### Tests + verification

- Clean validation checkout + `npx supabase db reset` with `auto_expose_new_tables` unset -> reset completed through `20260615000001_explicit_data_api_grants.sql`.
- Post-reset grant probe: `has_table_privilege('service_role','public.tenants','INSERT') = true`; `anon`/`authenticated` cannot execute `pgp_sym_encrypt_text(text,text)`; `service_role` still can.
- `deno task test:rls` with local Supabase env mapped from CLI status -> **68 passed / 0 failed**.

---
## 2026-06-13 - Onboarding completion gate revision (per-department / multi-group)

Implements `docs/bmad/working-notes/2026-06-13-onboarding-gate-per-department-revision.md` §§3-7, superseding the 2026-06-12 single-group design before activation. Branch `feature/onboarding-gate-per-department` off `main`. **Not deployed; migration NOT pushed; backfill NOT executed.**

### Root cause

The 2026-06-12 gate used one tenant-wide `tenant_settings.onboarding_group_id`. That was the wrong model: onboarding is per-department, with each department owning its LearnDash onboarding group and curriculum. Production impact is safe because the shipped gate was inert (`onboarding_group_id` was null, no backfill was run, and no statuses were changed).

### What shipped

- **Migration `20260613000001_onboarding_gate_per_department.sql`** - rewrites `v_onboarding_gate` to derive gating groups from `tenant_settings.ld_group_mappings[].is_onboarding = true`, keeps the same output columns, excludes recurring-tracked courses by `(tenant_id, group_id, course_id)`, leaves `v_onboarding_training_compliance` untouched, sets `security_invoker = on`, and drops obsolete `tenant_settings.onboarding_group_id`.
- **Resolver** - `gatherStatusInput` now reads onboarding-flagged LearnDash mappings, requires active enrollment in any flagged group, and reads `complianceView` from `v_onboarding_gate`. Missing flags, no enrollment, or missing rows fail closed to `Onboarding`. The pure `resolveEmployeeStatus` matrix is unchanged and `writeEmployeeStatus` remains the only status writer.
- **Hire paths** - reverted the single-group auto-enroll from `process-hire` and `onboard-employee`; job-title department enrollment remains the only enrollment path.
- **Settings** - `LdGroupMapping` now supports `is_onboarding?: boolean`; Settings -> LearnDash uses a per-row "Onboarding group" checkbox instead of a tenant-wide dropdown; `save-ld-mappings` validates/persists the flag per entry with `tenant_id` from JWT only and default false when absent.
- **Gate card / hook / backfill** - `OnboardingGateCard` and `useOnboardingGate` still consume the same `v_onboarding_gate` columns. The backfill script still uses reset-then-resolve through `writeEmployeeStatus`, but preflights onboarding-flagged mappings instead of `onboarding_group_id`.

### Tests + verification

- `cd supabase/functions && deno test _shared/tests/ --allow-env --allow-net` -> **131 passed / 0 failed**, including the new two-department contract coverage: person in group A sees only group A non-recurring courses, never group B.
- RLS suite updated to retain `v_onboarding_gate` cross-tenant coverage and the two-department gate contract. Local `npm run test:rls` type-checked the suite but skipped live assertions because Supabase test env vars are not configured in this workspace.
- `npm run build` -> clean.
- `npm run lint` -> still blocked by the repo-wide pre-existing lint backlog (86 problems on unrelated files). Targeted ESLint for touched frontend files -> **0 errors**, with one pre-existing React Compiler warning in `ConnectorSettingsPage.tsx` for `react-hook-form` `watch()`.
- Static guard: no runtime `onboarding_group_id` references remain under `src`, `supabase/functions`, or `scripts`.

### Karimah probe (run after migration/config sign-off; do not backfill first)

```sql
-- Probe the per-department gate for Karimah (Nurse, group 1428):
select course_id, course_name, effective_status, has_record
from v_onboarding_gate where person_id = 'a9e02e52-1d13-45d5-961f-1ffc2ce6d8c5';
-- expect: her 1428 non-recurring courses, not-started ones present, Module 6 (recurring) ABSENT.

-- A Caregiver (group 54) should see group-54 courses only - never Nurse courses.
```

Expected after owner flags groups `54` and `1428` as onboarding: Karimah's non-recurring group `1428` courses appear; recurring Module 6 is absent.

### Next (pending owner sign-off - deploy from `main` only)

1. Merge PR into `main`.
2. Deploy order: migration -> `convert-applicant`, `process-hire`, `onboard-employee`, `save-ld-mappings`.
3. Owner flags LearnDash groups `54` (Caregivers) and `1428` (Nurses) as onboarding groups in Settings.
4. Run `scripts/backfill-onboarding-gate.ts` read-only first; run `--apply` only after explicit approval.

---
## 2026-06-12 - Onboarding completion gate (fix fail-open Active) — P1 compliance correctness

Implements `docs/bmad/working-notes/2026-06-07-onboarding-completion-gate-handoff.md` §4–§7. Branch `feature/onboarding-completion-gate` off `main`. **Not deployed; migration NOT pushed; backfill NOT executed** (owner runs it after configuring the Onboarding Group in Settings). Owner re-confirmed the **single** `onboarding_group_id` ruling (vs multi-select `text[]`) on 2026-06-12 before the migration was written.

### Root cause (verified in handoff)

`v_onboarding_training_compliance` is record-driven (built FROM `training_records`), so a mandatory course with no synced record vanishes from the resolver's completeness check — `rows.every(completed)` over only existing rows = fail-open `Active`. Karimah Moss: 8 mapped courses, 2 completed, 6 invisible → falsely `Active`.

### What shipped

- **Migration `20260612000001_onboarding_completion_gate.sql`** — `tenant_settings.onboarding_group_id text` (NULL = gate unconfigured → resolver fails closed) + NEW requirement-driven `v_onboarding_gate` (`security_invoker = on`): one row per (person × active course mapped to the designated group) whether or not a record exists; recurring-tracked courses excluded; effective status joined from `v_onboarding_training_compliance` (Layer B overrides apply). `v_onboarding_training_compliance` NOT modified. One deliberate refinement vs the spec's SQL block: `and lgc.active` on the `learndash_group_courses` join (see DECISIONS 2026-06-12 — validated live: course 135 was deactivated on group 1428 and must not gate).
- **`_shared/employee-status-resolver.ts`** — `gatherStatusInput` rewired (§5a): reads the tenant's `onboarding_group_id` (unset → `hasActiveTrainingGroups:false` → `configuration_incomplete`); `hasActiveTrainingGroups` = active enrollment in the DESIGNATED group; `complianceView` = the person's `v_onboarding_gate` rows; raw `training_records` fallback kept ONLY for the view-missing path (42P01/PGRST205), semantics unchanged. **The pure `resolveEmployeeStatus` (Q2 matrix) is untouched**; `writeEmployeeStatus` remains the sole status writer.
- **Settings UI + save path (§5b)** — "Onboarding Group" select on Settings → LearnDash (`OnboardingGroupCard` in `LdGroupMappingsPage.tsx`; options = union of `ld_group_mappings` and distinct active `learndash_group_courses.group_id`, label fallback = id). Persisted by extending `save-ld-mappings` EF (tenant_id from JWT only; absent field leaves stored value untouched; audit row includes the new value).
- **Hire-path auto-enroll (§5c)** — `process-hire`: after job-title-mapped enrollment, ALSO enrolls into the designated onboarding group — idempotent (skips when an active `employee_group_enrollments` row exists), anchor via the existing `upsertGroupEnrollmentAnchor` (`anchor_source='process_hire'` — the spec's `'group_enrollment'` parenthetical is not a legal `anchor_source` CHECK value; see DECISIONS). `onboard-employee`: designated group appended to the WP LearnDash enrollment list (additive POST = idempotent); anchors converge via `sync-training` reconciliation (interim state resolves fail-closed to `Onboarding`, correct for a new hire).
- **Employee-detail gate visibility (§5d)** — read-only `OnboardingGateCard` (new `useOnboardingGate` hook) on the employee training detail page: renders every gating course incl. `not_started` ("X of Y complete"); renders nothing when the gate is unconfigured or the person isn't enrolled.
- **Backfill script (§6) — written, NOT executed**: `scripts/backfill-onboarding-gate.ts`. Default run = read-only identify; `--apply` = reset-then-resolve ONLY identified people via `writeEmployeeStatus` (never raw SQL for the resolve step); verifies `audit_log` rows; grandfathering = Active employees with zero gate rows are untouched.

### Tests + verification

- `cd supabase/functions && deno test _shared/tests/ --allow-env --allow-net` → **130 passed / 0 failed** (13 new in `onboarding-gate.test.ts`: fail-closed unset-setting / not-enrolled / no-record cases, all-complete → Active, view-missing fallback semantics, Terminated absolute, established-Active-stays-Active, **named Karimah regression** (8 mapped / 1 recurring-excluded / 2 completed → `Onboarding`), and a guard that `gatherStatusInput` reads `v_onboarding_gate` not the record-driven view).
- RLS live suite extended: `v_onboarding_gate` added to the cross-tenant/anon/dashboard-safety view matrix + a gate contract test (seed: 4 mapped courses, 1 recurring-excluded, 1 completed record → exactly 3 rows, two `not_started` with `has_record=false`). Seeder + harness teardown extended (`employee_group_enrollments`, `learndash_group_courses`, `tenant_settings`).
- `npm run build` → clean. `npm run lint` → 0 problems in every file touched by this change (the repo-wide 86 pre-existing problems on `main` are untouched legacy files).
- **§6 step-1 identify (read-only, live `peffyuhhlmidldugqalo`)**: today's expected resets = **Karimah Moss only** (6 gating / 2 completed / 4 incomplete). Delta vs the spec's 2026-06-07 snapshot is explained by live data: (a) course 135 deactivated on group 1428 (8→7→6 gating after recurring exclusion); (b) **Debbra Deo's** single gap was course 938 — the *recurring* Annual Employee Review, which the gate excludes per locked owner decision #2; her 4 non-recurring gating courses were completed in Jan 2026 → she is legitimately `Active`, not reset. Recorded in DECISIONS 2026-06-12.

### Next (pending owner sign-off — deploy from `main` only)

1. Merge PR → `npx supabase db push` (migration BEFORE function deploys).
2. `npx supabase functions deploy save-ld-mappings process-hire onboard-employee` + any EF bundling `_shared/employee-status-resolver.ts` (`convert-applicant`).
3. Owner: create the universal New-Hires group in WP → sync → select it in Settings → LearnDash.
4. Owner runs `scripts/backfill-onboarding-gate.ts` (read-only first, then `--apply`); verify Karimah → `Onboarding` and audit rows.

---
## 2026-06-07 - Hotfix: onConflict target on people/applicants upserts (`tenant_id,email` → `tenant_id,email_normalized`)

P1 correctness regression fix. Branch `hotfix/onconflict-email-normalized` off `main`. **Application-layer only — no migration, no schema change. Not deployed (deploy pending sign-off).**

### Root cause

Migration `20260528000002_normalized_email_uniqueness.sql` (landed 2026-05-28) replaced the unique index on `people` and `applicants` from `(tenant_id, email)` with `(tenant_id, email_normalized)` (generated `lower(btrim(email))`). Four Edge Functions still upserted with `onConflict: "tenant_id,email"`, which no longer matches any unique index → Postgres `42P10`. `_shared/conversion.ts` had been migrated correctly; these four sites were missed. Since 2026-05-28 no WP-direct insert into `people` succeeded (triggering case: applicant "Ida", WP id 293, added to WordPress 2026-06-06 — `Hired` in `applicants`, never created in `people`).

- `sync-wp-users`: the upsert `{ error }` was discarded → the `42P10` was swallowed; the follow-up `UPDATE … WHERE email=` matched 0 rows for a new user (not an error) → `synced++` fired = **silent data loss reported as success** (`synced:16`, `errors:0`).
- `detect-hires-bamboohr` / `detect-hires-jazzhr`: `if (peopleUpsertErr) throw` → latent hard-throw on the next real hire.
- `listApplicants`: same latent throw on the email-conflict branch.

### What shipped

- **Fix A** — corrected the conflict target at 6 sites (4 files): `sync-wp-users` (people, line 302), `detect-hires-bamboohr` (people 252 + applicants 271), `detect-hires-jazzhr` (people 266 + applicants 285), `listApplicants` (applicants 241). Other `onConflict` targets (`id`, `jotform_id`, `tenant_id,source,idempotency_key`, `tenant_id,user_id`, `tenant_id,applicant_id,normalized_email`, etc.) left untouched.
- **Fix B** — `sync-wp-users` now captures the insert-ignore `{ error }`; on error it logs, `errors++`, and `continue`s (no fall-through to the `UPDATE` / `synced++`). The `synced` count now reflects real writes, so a future target mismatch cannot masquerade as success.
- Added `supabase/functions/_shared/tests/onconflict-email-normalized.test.ts` (7 tests): a Postgres-like fake client that raises `42P10` on a mismatched `ON CONFLICT` target; pins the corrected target, the swallow-guard contract (failed insert → counted as `error`, not `synced`; `UPDATE` not reached), and case-insensitive dedup. The four EF `index.ts` modules call `Deno.serve` at top level (not importable) and the prescribed test command grants no `--allow-read`, so this is a contract test that fails on reversion to `tenant_id,email`. Follow-up (out of scope): extract the `sync-wp-users` loop body to an importable handler (as `ai-summarize-applicant/handler.ts` did) for direct behavioural coverage.

### Verification

- `deno test _shared/tests/ --allow-env --allow-net` → **118 passed / 0 failed**.
- `npm run build` → clean (`tsc -b` + `vite build`; pre-existing chunk-size warning only).
- Live-schema zero-write probe (`peffyuhhlmidldugqalo`, `where false`): old `on conflict (tenant_id, email)` → `42P10`; corrected `on conflict (tenant_id, email_normalized)` → success. **Flip confirmed.**

### Next (pending sign-off — deploy from `main` only)

- `npx supabase functions deploy sync-wp-users detect-hires-bamboohr detect-hires-jazzhr listApplicants`.
- Force-run WP sync; confirm Ida (`wp_user_id=293` / `idalwsbnl@gmail.com`) lands as one linked `people` row (`profile_source='wordpress'`, `applicant_id` set) and appears in **Employees**.

---
## 2026-06-06 - BMAD AI architect review: enterprise AI gateway upgrade plan

Produced a BMAD working-note review of the current HOMS AI implementation against the master spec, the supplied enterprise AI gateway upgrade plan, and Folk Care as reference architecture only. **Documentation only - no application code changed.**

### What shipped (docs)

- Created `docs/audits/homs-ai-architect-review-enterprise-gateway.md`.
- Evaluated current AI surfaces: `ai-summarize-applicant`, `ai-rank-applicants`, `ai-draft-offer-letter`, `ai-onboarding-logic`, `ai-wp-validation`, `_shared/aiClient.ts`, `ai_logs`, `ai_cache`, AI dashboard telemetry, and AI-related tests.
- Classified findings by current/planned/compliance-blocked status, including caller-supplied `messages` risk, prompt-only JSON parsing, gateway black-box dependency, partial PII minimization, AI log/cache telemetry gaps, and reliability gaps.
- Reviewed the supplied `docs/architecture/enterprise-ai-gateway-upgrade-plan.md` as a draft input, not a promoted architecture decision.
- Confirmed Folk Care is useful for provider abstraction, model tiers, Zod `generateJSON`, and AI usage telemetry patterns, but also has direct Anthropic services and prompt-only JSON parsing in several verticals.

### Next

- Owner decision: revise/promote/supersede the supplied enterprise AI gateway plan.
- Current-fix candidate: remove public `messages` mode from AI Edge Functions and add server-side schema validation before caching output.
- Compliance gate: no PHI/ePHI, Staff App note AI, safety-critical routing, RAG, or AI-Powered EVV until regulated-data architecture and vendor BAA posture are approved.

---
## 2026-06-02 - Phase 1 lifecycle stabilization — REBASED onto stabilized main + migrations renumbered (PREPARE-AND-VALIDATE, not deployed)

Rebased the Phase 1 WIP (`99f5d7a`, authored on pre-reconciliation `f6d4216`) onto
**current `main`** (post Phase 0.1 RLS remediation + fresh-DB bootstrap + ai-summarize P0)
on branch `phase-1/lifecycle-stabilization`. **Not deployed — deploy is a separate
credentialed step.**

### What was done

- **Cherry-picked `99f5d7a`** onto main. Two real conflicts, both resolved keeping the
  Phase 1 intent layered on top of main (no reconciliation/0.1/bootstrap work reverted):
  - `PROJECT_LOG.md` — additive log entries from both sides kept in chronological order.
  - `supabase/tests/rls/rls.test.ts` — kept the Phase 1 **ID-5** cross-tenant identity test
    AND main's new `ai_cache`/`ai_logs`/storage RLS sections (phase-0.1); dropped the WIP's
    now-misplaced teardown comment (main's teardown moved below the new sections).
  - The four files the brief flagged (onboard-employee, sync-wp-users, eslint.config.js,
    employeeService.ts) auto-merged cleanly — main had **not** touched them since `f6d4216`.
  - `supabase/config.toml` + `supabase/.gitignore` were already on main → the WIP's adds
    merged to no-ops (present in tree, not in the commit).
- **🔑 Renumbered the two Phase 1 migrations to avoid a silent-skip collision.** The WIP had
  stamped them `20260530000001/2`, but main reconciled DIFFERENT migrations into those exact
  versions (`phase01_security_definer_views`, `phase01_function_grants_search_path`). Supabase
  tracks applied migrations by version prefix, so a different file at an already-applied version
  is **silently skipped**. Verified the **live ledger tip = `20260601000001`** (linked project
  `peffyuhhlmidldugqalo`) and renumbered strictly after it AND the bootstrap fixes:
  - `…0001_phase1_compliance_state_and_identity_collisions` → **`20260601000002`**
  - `…0002_repoint_offer_accepted_to_convert_applicant` → **`20260601000003`**
  Updated all Phase-1 cross-references (SPRINT_PLAN/SCHEMA/DECISIONS/PROJECT_LOG); left the
  phase01 view/grant references (RLS suite, `_seed.ts`, DECISIONS 0.1 entry) at their original
  numbers. Corrected the stale Phase 0.1 note that had planned `0530…0003/4` (it predated the
  `0601` bootstrap migrations).
- **CV-2 (real):** the convert-applicant authority already logged onboard-employee provisioning
  failures to a durable `integration_log` `failed` row (not just `console.error`), but the logger
  was trapped in `index.ts` (un-testable — `Deno.serve` on import). Extracted
  `logProvisioningFailure` into testable `_shared/conversion.ts` (behavior unchanged) + added unit
  tests (failed row, idempotency, no-tenant no-op).
- **CV-1 (optional):** already implemented in the WIP (none-path adopts a pre-existing same-email
  row and flips its type instead of throwing `CONVERSION_ROW_MISSING`) + already tested. Confirmed.
- **CV-3 (owner decision):** recorded in DECISIONS.md — rehire-via-row-reuse stays `Active` with
  fresh unmet onboarding (literal Q2; lifecycle ≠ compliance). Kept as-is; no rehire branch added.

### Validation (in progress)

- `deno test _shared/tests/` → **105 passed / 0 failed** (was 91 at WIP authoring; base grew via
  main's added test files incl. the 8 ai-summarize tests; +3 new CV-2 provisioning-failure tests).
- `deno check` on the touched EF modules → clean.
- `supabase db reset` (fresh-from-scratch incl. renumbered Phase 1) + RLS suite + `npm run build`
  + the GitHub Actions gate → run and recorded in the PR (see below).

### Next

- Open the PR; the Actions gate (frontend / edge-functions / rls-isolation / migration-parity)
  must be GREEN before merge.
- **Deploy (separate credentialed step):** `supabase db push` then
  `supabase functions deploy convert-applicant onboard-employee sync-wp-users`; then a trigger
  smoke-test (accept an offer → convert-applicant fires → tenant-scoped person created →
  onboard-employee provisions). Ensure the Vault `service_role_key`/`project_url` secrets exist.

---
## 2026-06-01 - P0 fix: ai-summarize-applicant tenant isolation + SSRF

Closed the live cross-tenant write + SSRF in the deployed `ai-summarize-applicant`
Edge Function (the 3rd isolation gap found). Branch:
`fix/ai-summarize-applicant-tenant-isolation` (off `main`). **Not yet deployed —
deploy is a separate credentialed step.**

### What shipped (code)

- `supabase/functions/ai-summarize-applicant/handler.ts` (new) — handler extracted
  from `index.ts` for unit testing. Now:
  1. Derives tenant from the JWT via `tenantGuard(req)` (was `getContext` →
     `x-tenant-id` header). The `x-tenant-id` header is ignored and removed from
     the advertised CORS allow-headers. Missing/invalid JWT → 401/403.
  2. Fetches the applicant scoped by `(id, JWT tenant_id)` before any work; a row
     outside the caller's tenant → 404, no further processing.
  3. Scopes the `resume_text` write with `.eq('tenant_id').eq('id')`.
  4. Sources `resume_url`/`resume_text` from the verified DB row, never the request
     body — kills the SSRF + forged-input vector. Added an `isAllowedResumeUrl()`
     guard (https-only, host allowlist incl. Supabase + JotForm, rejects
     loopback/link-local/private ranges).
- `supabase/functions/ai-summarize-applicant/index.ts` — now just wires
  `serve()` → `handleSummarize()`.
- `supabase/functions/_shared/tests/ai-summarize-applicant.test.ts` (new) — 8 tests
  using the real `tenantGuard`: (a) spoofed `x-tenant-id` ignored, (b) cross-tenant
  id → 404 + no write, (c) own-tenant happy path, (d) `resume_url` sourced from DB +
  tenant-scoped write, (e) missing JWT → 401, plus 3 `isAllowedResumeUrl` cases.

### Systemic audit (grep gotcha: `.gitignore:78 ai-summarize-applicant/` hides the
folder from ripgrep — audited with `--no-ignore`)

- **A (header-derived tenant):** Among EFs only `ai-summarize-applicant` still used
  `getContext`/`x-tenant-id`; the other 4 AI EFs were remediated in Phase 0.
  `aiClient.ts` keys `ai_cache`/`ai_logs` on the caller-passed `tenantId` — correct
  now that the only header-tenant caller is fixed. No change to `aiClient.ts`.
- **B (service-role writes filtered by id alone):** All mutations acting on a
  user-supplied id are tenant-scoped (`admin-update-user`, `deactivate-tenant-user`,
  `update-tenant-user-role`, `manage-recurring-compliance-instance`, `sendOffer`,
  `save-connector`, invites). Cron/sync/webhook EFs (`detect-hires-*`,
  `process-hire`, `sync-training`, `sync-wp-users`, compliance backfill/rebuild,
  `jotform-webhook`, `onboard-employee`) update ids drawn from tenant-scoped queries
  / server-derived tenant, not request input. `request-access` updates a
  platform-level table by id by design. `ai-summarize-applicant` was the lone genuine
  same-class bug.
- Follow-up flagged: `_shared/context.ts` (`getContext`) is now unused and a known
  header-trusting footgun — candidate for deletion in a separate PR.

### How to verify

- `cd supabase/functions && deno task check` → clean.
- `deno test _shared/tests/ --allow-env --allow-net` → 60 passed / 0 failed
  (includes the 8 new tests).
- `npm run build` → clean.
- CI: edge-functions (check + tests), rls-isolation (fresh DB + RLS suite, unchanged
  by this PR — no migrations), frontend lint/build.

### Files changed

- `supabase/functions/ai-summarize-applicant/handler.ts` (new)
- `supabase/functions/ai-summarize-applicant/index.ts`
- `supabase/functions/_shared/tests/ai-summarize-applicant.test.ts` (new)
- `docs/Project_Docs/PROJECT_LOG.md`

---
## 2026-05-30 - 🔴 SECURITY FINDING (handed off) — cross-tenant RLS leak on `applicants` + `offers`

Surfaced by the **live** Phase 0 RLS suite run during Phase 1 verification (local disposable Supabase stack). **Pre-existing — NOT introduced by Phase 1** (no Phase 1 migration touches these policies). **Assigned to a separate dev agent** for the fix; recorded here so it is not buried and the fixer has an exact repro. This branch intentionally does **not** modify these policies (out of lifecycle scope).

**Finding:** `applicants` and `offers` each still carry allow-all RLS policies from the Epic-0 table-creation migrations, which **OR-override** the later tenant-scoped policies (multiple permissive policies are OR-ed in Postgres RLS), defeating tenant isolation:
- `applicants`: policy `"Allow all access for authenticated users"` `USING (true)` — from `20251128000000_create_applicants_table.sql`. (Correct policies `applicants_select_own_tenant` etc. exist but are overridden.)
- `offers`: policy `"Allow full access for authenticated users"` `USING (true)` and `"Everyone can view offers"` `USING (auth.role() = 'authenticated')` — from `20251128000001_create_offers_table.sql`.

**Impact:** any authenticated user (any tenant) can SELECT another tenant's `applicants`/`offers` rows. **Repro:** `deno test --allow-env --allow-net rls.test.ts` in `supabase/tests/rls/` against a live DB → 4 failures (`Tenant B cannot see Tenant A's applicants/offers`, reciprocal, + `anonymous cannot see offers`). `people`, `training_records`, `employee_compliance_instances`, `audit_log` all isolate correctly; **Phase 1 ID-5 cross-tenant identity non-match is GREEN.**

**Suggested fix (for the assigned agent):** a migration dropping the three stale allow-all policies (keep `offers`' `secure_token` anon-read policy and the tenant-scoped policies). Then the full RLS suite goes green.

**Merge-gate note:** the *full* RLS suite is a merge gate and is currently red on applicants/offers pending that fix — blocked on the other agent, not on Phase 1. Phase 1's own gate item (ID-5) passes.

**Update — formal handoff locked + scope expanded:** brief at [`docs/bmad/working-notes/2026-05-30-phase-0.1-rls-legacy-policy-remediation-handoff.md`](../bmad/working-notes/2026-05-30-phase-0.1-rls-legacy-policy-remediation-handoff.md). Architect verification widened the blast radius beyond the gate's two flagged tables: the same permissive-OR pattern also affects `ai_cache` (`"Authenticated users can read cache"` `USING(true)`) and legacy `ai_logs`, plus **tenant-unscoped `resumes`/compliance-docs storage buckets (PHI-class — I9/vaccination/license/background — and NOT covered by the table RLS suite).** Owner decision: full-scope fix in a dedicated `phase-0.1/rls-legacy-policy-remediation` branch off `main`, landed first, with the Phase 1 lifecycle branch rebased on top; RLS suite extended to cover ai_cache/ai_logs/storage.

---
## 2026-05-30 - Phase 1 lifecycle stabilization — IMPLEMENTED (P1/P2/P3)

Implemented the Phase 1 lifecycle stabilization code task per the locked handoff and the Q1–Q5 owner decisions. Collapsed the divergent applicant→employee conversion paths into one server-side authority, extracted one identity reconciliation service, introduced a deterministic fail-closed status resolver with a separate compliance state, narrowed `onboard-employee` to provisioning, and added read-only recurring-compliance diagnostics. **Recurring-compliance engine (5.11–5.17) unchanged. No Phase 2 refactor. No existing-employee backfill. No Folk Care code copied.**

### What shipped (code)

- **P2 — identity (extracted first):** new `supabase/functions/_shared/identity.ts` centralizes `normalizeEmail()` (`trim(lowercase)`) + tenant-scoped, fail-safe `findEmployeeMatch()` (applicant_id wins → exactly one email match → none → **collision, never guess**; cross-tenant non-match). Repointed `sync-wp-users` to `normalizeEmail`; the frontend's inline matcher was **deleted** (conversion is now server-side), satisfying "0 duplicate definitions".
- **Migration `20260601000002`** (renumbered from `20260530000001` during the 2026-06-02 rebase — see top entry)**:** adds `people.compliance_state` (separate from lifecycle), drops the `employee_status` default so the resolver is the sole writer, and adds the `identity_collisions` ledger (RLS + audit trigger). Rollback documented in the migration + DECISIONS.md.
- **P1 — status resolver:** new `_shared/employee-status-resolver.ts` — a **pure, idempotent, fail-closed** `resolveEmployeeStatus()` implementing the exact Q2 matrix (+ `writeEmployeeStatus` as the sole DB writer, re-invoked after conversion/training writes). Lifecycle ≠ compliance; `Terminated` never auto-reversed; established `Active` never reverts.
- **P1 — conversion authority:** new `convert-applicant` EF (`index.ts` + testable `_shared/conversion.ts` core). Sets `hired_at`=accepted `offer.start_date` (missing ⇒ fail), `job_title`=`offer.position_title` (missing ⇒ fail, no `'To Be Assigned'`), idempotent on `(tenant_id, email_normalized)`, preserves existing `hired_at`, records collisions instead of guessing, then invokes `onboard-employee` as a **separate** provisioning step. Frontend `employeeService` collapsed to one thin caller (`convertApplicantToEmployee`); `createEmployeeFromApplicant`/`moveApplicantToEmployee` **deleted** (0 callers); `OfferList` + `ApplicantDetailsPage` repointed.
- **Narrowed `onboard-employee`:** provisioning-only; **fixed the read-side bug** `record.position` → reads persisted `offers.position_title`; update-only on `people` (no duplicate row on retry); logs success/partial/failure to `integration_log` (no silent failure). The `sendOffer` `position` request param was **NOT** renamed.
- **Trigger repoint (`20260601000003`, renumbered from `20260530000002`):** `on_offer_accepted` now enters `convert-applicant` (which calls `onboard-employee`), per the Q4 split.
- **P3 — diagnostics (read-only):** new `_shared/compliance-diagnostics.ts` surfaces missing group/rule/course-mapping/anchor/sync conditions. No engine behavior changed.
- **RLS suite:** added the Phase 1 ID-5 cross-tenant identity non-match assertion to `supabase/tests/rls/rls.test.ts` (merge gate).
- **ESLint config:** scoped Deno Edge Functions out of the browser ESLint run (they use `deno lint`/`deno check`/`deno test`), removing 86 false legacy errors.

### Tests / validation

- `deno test _shared/tests/` → **91 passed / 0 failed** (39 new: identity 11, resolver 11, conversion 8, diagnostics 9 + existing 52). `deno check` on new modules clean. `npm run build` → 0 type errors. RLS suite type-checks + collects ID-5 (runs on a live DB; skips without env).

### Files changed

NEW: `_shared/identity.ts`, `_shared/employee-status-resolver.ts`, `_shared/conversion.ts`, `_shared/compliance-diagnostics.ts`, `convert-applicant/index.ts`, 4 `_shared/tests/*.test.ts`, migrations `20260601000002` + `20260601000003` (renumbered from `20260530000001`/`2` on 2026-06-02).
MODIFIED: `_shared`-importing `sync-wp-users/index.ts`, `onboard-employee/index.ts`, `src/services/employeeService.ts`, `src/features/offers/OfferList.tsx`, `src/features/applicants/ApplicantDetailsPage.tsx`, `supabase/tests/rls/rls.test.ts`, `supabase/audit-tables.json`, `eslint.config.js`, `SCHEMA.md`, `DECISIONS.md`, `SPRINT_PLAN.md`.

### Next

- Deploy migrations (`supabase db push`) + EFs (`convert-applicant`, `onboard-employee`, `sync-wp-users`); ensure the Vault `service_role_key`/`project_url` secrets exist (trigger reuses them).
- Run the Phase 0 RLS suite (incl. new ID-5) against a disposable DB as the merge gate.
- Future: admin UI to resolve `identity_collisions`; existing-employee status backfill (separate risk-managed task).

---
## 2026-05-30 - Phase 1 lifecycle stabilization — decisions + handoff promoted

Recorded the Phase 1 lifecycle owner decisions (Q1–Q5) and promoted the implementation handoff to an official, coding-agent-ready brief. **Documentation only — no application code changed.** Phase 1 is now decision-complete but **not yet started** (implementation is the future task this handoff describes).

### What shipped (docs)

- Recorded 5 owner decisions in `DECISIONS.md` (2026-05-30 entry): **Q1** `hired_at` = accepted offer `start_date` (immutable to sync/retry); **Q2** deterministic fail-closed `employee_status` resolver ({Onboarding, Active, Terminated}) with a *separate* compliance state; **Q3** `job_title` = offer `position_title` (read-side bug fix, no `sendOffer` param rename); **Q4** mandatory conversion↔provisioning responsibility split (preferred `convert-applicant` → `onboard-employee`); **Q5** tenant-scoped fail-safe identity reconciliation (collision record, never guess).
- Promoted `docs/bmad/working-notes/2026-05-29-phase-1-lifecycle-stabilization-handoff.md` to LOCKED status: all 13 ACs authorable, `pending Q2` placeholder replaced with explicit fail-closed resolver outcomes, ID-3 identity test rewritten to mandate manual collision handling and forbid tie-breaking.
- Verified two asserted code-facts before recording: offers column is `position_title` (not `position`); `onboard-employee:41` reads `record.position` → `undefined`.

### Files changed

- `docs/Project_Docs/DECISIONS.md` (Q1–Q5 entry)
- `docs/bmad/working-notes/2026-05-29-phase-1-lifecycle-stabilization-handoff.md` (locked + scrubbed)
- `docs/Project_Docs/PROJECT_LOG.md` (this entry)

### Next

- Implementation (future code task): sequence is extract `_shared/identity.ts` first, then `convert-applicant` + status resolver, narrow `onboard-employee` to provisioning, P3 diagnostics in parallel.
- Open follow-up: schedule the freshness-verification pass for the 4 docs flagged on 2026-05-29.

---
## 2026-05-29 - Documentation governance audit promotion

Promoted the documentation governance audit decisions, establishing a strict canonical hierarchy and clearing out stale mirrors.

### What shipped

- Promoted `DECISIONS.md`, `SCHEMA.md`, and `ISSUES.md` to Rank-5 authority in the documentation hierarchy.
- Flagged stale parent-folder documents (`RUNBOOK.md`, `INTEGRATIONS.md`, `CLAUDE.md`, `DESIGN_SYSTEM.md`) with `[FRESHNESS REVIEW REQUIRED]`.
- Archived the rejected pitch document (`BADIDEAS_PITCH_HOM.md`) to preserve active context cleanliness.
- Rewrote 6 absolute OneDrive paths in the master specification to use canonical relative workspace paths.
- Updated BMAD status across all governance documents to accurately reflect its installed and running state.

### Files changed

- `docs/Project_Docs/DECISIONS.md`
- `docs/Project_Docs/SCHEMA.md`
- `docs/Project_Docs/ISSUES.md`
- `docs/Project_Docs/RUNBOOK.md`
- `docs/Project_Docs/INTEGRATIONS.md`
- `docs/Project_Docs/CLAUDE.md`
- `docs/Project_Docs/DESIGN_SYSTEM.md`
- `docs/Archive/BADIDEAS_PITCH_HOM.md`
- `docs/architecture/homs-platform-expansion-implementation-spec.md`
- `docs/bmad/documentation-governance.md`
- `docs/Project_Docs/PROJECT_LOG.md`

---
## 2026-05-29 - Phase 0 remediation: tenant-guard hardening of 5 Edge Functions

Remediated the 5 non-compliant Edge Functions from the Phase 0 audit. Source of truth:
`docs/architecture/homs-platform-expansion-implementation-spec.md` and
`docs/audits/phase-0-edge-function-tenant-guard-audit.md`. Scope limited to tenant-guard
hardening — no folder refactor, no RBAC change, no Care Ops, no Staff App.

### What shipped

- **4 AI functions** (`ai-rank-applicants`, `ai-draft-offer-letter`, `ai-onboarding-logic`,
  `ai-wp-validation`): replaced `getContext(req)` (which read `tenant_id` from the `x-tenant-id`
  header) with `tenantGuard(req)` as the first statement after `OPTIONS`; removed `x-tenant-id`
  from CORS allow-headers; `tenantId`/`userId` now come from the JWT context; `catch` returns the
  guard's status (401) for auth failures. AI behavior, prompts, and response shape unchanged.
  These functions now require an authenticated tenant JWT (previously allowed anonymous).
- **`onboard-employee`**: added `cronOrTenantGuard(req)` as the first statement after `OPTIONS`.
  Tenant is now derived from the server-trusted `applicant.tenant_id` (looked up by
  `record.applicant_id`); `record.tenant_id` is validated to match (reject on mismatch);
  user-mode caller tenant is validated; the hardcoded `'11111111-…'` fallback is removed.
  Conversion behavior (WP user, LearnDash, `people.wp_user_id`, Brevo email) unchanged.
- **Migration** `20260529000000_onboard_trigger_service_role_auth.sql`: recreates the
  `on_offer_accepted` trigger so the webhook sends `Authorization: Bearer <service_role_key>`
  read from `vault.decrypted_secrets` at execution time. No secret value is written into the
  migration. Required because the function now rejects unauthenticated calls; the legacy no-auth
  trigger would otherwise break onboarding. **Design note:** a `CREATE TRIGGER ... EXECUTE
  FUNCTION` clause only accepts literal constant args, so `supabase_functions.http_request(...)`
  cannot take a Vault lookup (confirmed: raises a syntax error). The migration therefore uses a
  `security definer` wrapper function `public.notify_onboard_employee()` that builds the headers
  from Vault and calls `net.http_post` with body `{ record: to_jsonb(new) }`, returning `NEW`.

### Files changed

- `supabase/functions/ai-rank-applicants/index.ts`
- `supabase/functions/ai-draft-offer-letter/index.ts`
- `supabase/functions/ai-onboarding-logic/index.ts`
- `supabase/functions/ai-wp-validation/index.ts`
- `supabase/functions/onboard-employee/index.ts`
- `supabase/migrations/20260529000000_onboard_trigger_service_role_auth.sql` (new)
- `docs/audits/phase-0-edge-function-tenant-guard-audit.md` (tallies → 26/0/2/28)
- `docs/Project Docs/PROJECT_LOG.md`, `docs/Project Docs/SPRINT_PLAN.md`

### Verified (static)

- All 5 call a guard as the first statement after `OPTIONS`; no function references `x-tenant-id`
  or imports `getContext`; `onboard-employee` has no `11111111-…` literal; migration uses Vault
  with no literal secret. (grep assertions)
- `deno lint`: 18 problems before = 18 after — zero new lint issues (all pre-existing legacy
  rules). `deno check` blocked by environment TLS interception on remote imports (`zod`/esm.sh);
  shared `cron-or-tenant-guard.ts` type-checks clean, confirming the new `auth.mode`/`auth.tenantId`
  usage is type-correct.

### Verified (DB) — migration validated against local Supabase

- Migration applies cleanly; `notify_onboard_employee()` returns `trigger` (`security definer`);
  `on_offer_accepted` recreated with the original `WHEN` condition. Idempotent (re-apply leaves
  one trigger).
- End-to-end fire (rolled-back tx, throwaway local Vault secrets): flipping an offer to
  `Accepted` enqueued a pg_net POST to `/functions/v1/onboard-employee` with
  `Authorization: Bearer <key from Vault>` present and body
  `{ record: { id, status: "Accepted", applicant_id, tenant_id, … } }`. No test data/secrets
  persisted.

### Phase 0 gate: MET. Outstanding = deployment-only

- **Deploy ordering:** deploy the migration and `onboard-employee` together; the `service_role_key`
  Vault secret must exist in the target project (already used by `process-hire`). Redeploy all 5
  functions.
- **Cleanup (separate task):** `_shared/context.ts` is now unused by these 5; delete after
  confirming no other callers.
- **Minor observation (not in scope):** `onboard-employee` reads `record.position`, but the
  `offers` table column is `position_title`. The webhook body now carries `position_title` (not
  `position`), so LearnDash group mapping by position may not resolve. Pre-existing behavior
  (the legacy webhook also forwarded the raw row) — flag for Phase 1 lifecycle review.

---
## 2026-05-29 - Phase 0: RLS test suite + Edge Function tenant-guard audit

Platform expansion Phase 0 (Preserve and Audit). Source of truth:
`docs/architecture/homs-platform-expansion-implementation-spec.md` §10, §20.
**No business logic, folder structure, RBAC, or Staff App code was modified — audit + tests only.**

### What shipped

- **RLS integration test suite** (spec §10, Option B). Two test tenants with distinct
  `app_metadata.tenant_id`, seeded via service-role, asserted through RLS-active clients.
  Covers the full §10 matrix across `people`, `applicants`, `offers`, `training_records`,
  `employee_compliance_instances`, `audit_log`: cross-tenant reads (both directions) → 0 rows,
  anonymous reads → 0 rows, plus positive controls (own row visible) to catch deny-all false greens.
  Skips cleanly when DB env vars are absent. Runnable via `npm run test:rls` / `deno task test:rls`.
- **Edge Function tenant-guard audit** of all 28 deployable functions. Result: **21 compliant**,
  **5 non-compliant**, **2 intentionally unauthenticated**, 0 unclear. Report at
  `docs/audits/phase-0-edge-function-tenant-guard-audit.md`.

### Key finding (Phase 0 gate BLOCKED)

5 functions do not use a tenant guard and trust client-supplied tenant identity:
- `ai-rank-applicants`, `ai-draft-offer-letter`, `ai-onboarding-logic`, `ai-wp-validation` —
  all use `_shared/context.ts` `getContext()`, which reads `tenant_id` from the **`x-tenant-id`
  header** (direct violation of the non-negotiable JWT-only rule).
- `onboard-employee` — no guard, service-role client, derives tenant from request **body**
  (`record.tenant_id`) with a **hardcoded fallback UUID**.

Remediation is deferred to Phase 1 (lifecycle stabilization already owns `onboard-employee`)
and a follow-up AI-functions hardening item. Not fixed here per task scope.

### Files changed

- `supabase/tests/rls/rls.test.ts` (new)
- `supabase/tests/rls/_harness.ts` (new)
- `supabase/tests/rls/_seed.ts` (new)
- `supabase/tests/rls/deno.json` (new)
- `supabase/tests/rls/README.md` (new)
- `package.json` — added `test:rls` script
- `docs/audits/phase-0-edge-function-tenant-guard-audit.md` (new)
- `docs/Project Docs/PROJECT_LOG.md`, `docs/Project Docs/SPRINT_PLAN.md`

### Verified

- `deno check` passes on all three RLS test files.
- `npm run test:rls` runs end-to-end; with no DB env it correctly skips (1 passed, 25 ignored, 0 failed).
- Live green run against a DB is gated on a local/disposable Supabase stack (not run against
  production — the suite creates/deletes users and tenants). Instructions in the suite README.

---
## 2026-05-28 - JotForm applicant sync fix

### What shipped

- Diagnosed `listApplicants` 400: JotForm API key configured but `jotform_form_id_application` missing after Epic 5 column migration
- Backfilled legacy JotForm form IDs for Prolific Homecare tenant in remote DB
- Added migration `20260528000000_backfill_jotform_form_ids.sql`
- Surfaced real Edge Function error messages in applicant sync (replaces generic non-2xx toast)
- Added Application Form ID field to Settings → JotForm connector
- Updated `save-connector` to persist form ID without requiring API key re-entry

### Files changed

- `supabase/migrations/20260528000000_backfill_jotform_form_ids.sql`
- `supabase/functions/save-connector/index.ts`
- `src/lib/edgeFunctionError.ts`
- `src/hooks/useApplicants.ts`
- `src/features/applicants/ApplicantList.tsx`
- `src/features/settings/components/ConnectorSettingsPage.tsx`
- `src/features/settings/hooks/useTenantSettings.ts`
- `src/features/settings/types/tenant-settings.ts`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- `npm run build` — pass (exit 0)

### How to verify manually

1. Applicants → **Sync JotForm** — should succeed for Prolific Homecare
2. If misconfigured, toast shows specific message (e.g. missing form ID) not generic non-2xx
3. Settings → JotForm — Application Form ID visible/editable

### Deploy note

- Run `npx supabase db push` for migration
- Deploy `save-connector` Edge Function for settings UI form ID save path

---
## 2026-05-28 - Story 5.11 / 5.12 closeout: re-entry supersession + audit visibility

### What shipped

- Implemented explicit LearnDash group re-entry handling so returning to a previously removed group starts a fresh active recurring-compliance series when no newer assignment evidence exists
- Added supersession behavior for removed-group recurring instances so open old-group obligations no longer leak back into active recurring dashboards
- Rebuilt active recurring status logic to hide:
  - inactive-group rows
  - explicit `superseded` rows
  - pre-reentry historical cycles
  - rows filtered out by `primary_compliance_group_id`
- Added a recurring audit view so historical and superseded cycles remain queryable for admin review
- Added employee training-detail visibility for:
  - historical/superseded training rows outside the active group context
  - recurring compliance history rows hidden from active dashboards
- Added shared recurring-compliance series tests covering:
  - date normalization
  - re-entry anchor resolution
  - post-reentry cycle numbering
  - completion-to-cycle mapping

### Files changed

- `supabase/functions/_shared/recurring-compliance-series.ts`
- `supabase/functions/_shared/tests/recurring-compliance-series.test.ts`
- `supabase/functions/sync-training/index.ts`
- `supabase/functions/rebuild-compliance-instances/index.ts`
- `supabase/functions/manage-recurring-compliance-instance/index.ts`
- `supabase/migrations/20260528000001_story511_story512_reentry_supersession.sql`
- `src/features/training/hooks/useEmployeeTrainingDetail.ts`
- `src/features/training/EmployeeTrainingDetailPage.tsx`
- `src/features/training/types.ts`
- `docs/Project Docs/DECISIONS.md`
- `docs/Project Docs/SCHEMA.md`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- `deno test --allow-env --allow-net _shared/tests/recurring-compliance-series.test.ts`
- `deno check sync-training/index.ts rebuild-compliance-instances/index.ts manage-recurring-compliance-instance/index.ts`
- `npm run build`

### Notes

- Re-entry now defaults to a fresh active series unless a newer training-record-derived anchor exists; manual anchors remain untouched
- Historical recurring rows are preserved for audit through `v_recurring_compliance_audit` instead of being reused as active obligations

---
## 2026-03-26 - Recurring compliance calendar-date hardening

### What shipped

- Standardized recurring compliance business dates on calendar-date semantics instead of timestamp semantics
- Added migration `20260326000001_recurring_compliance_calendar_dates.sql` to convert:
  - `employee_group_enrollments.anchor_date` -> `DATE`
  - `employee_compliance_instances.cycle_start_at` -> `DATE`
  - `employee_compliance_instances.due_at` -> `DATE`
- Recreated `v_recurring_compliance_status` so status comparisons use `current_date` instead of `now()`
- Updated recurring compliance write paths (`process-hire`, `sync-training`, `backfill-recurring-compliance-anchors`, `manage-recurring-compliance-instance`, `rebuild-compliance-instances`) to write and compute date-only values consistently
- Updated recurring compliance UI paths to render and sort date-only values without local-time backshifts

### Why

- Anchor dates and due dates are business calendar values, not event timestamps
- The previous `timestamptz` model caused the recurring compliance drawer to display one day earlier after manual anchor overrides in timezones behind UTC

### Files changed

- `supabase/migrations/20260326000001_recurring_compliance_calendar_dates.sql`
- `supabase/functions/process-hire/index.ts`
- `supabase/functions/sync-training/index.ts`
- `supabase/functions/backfill-recurring-compliance-anchors/index.ts`
- `supabase/functions/manage-recurring-compliance-instance/index.ts`
- `supabase/functions/rebuild-compliance-instances/index.ts`
- `src/features/training/components/RecurringComplianceDashboard.tsx`
- `src/features/training/hooks/useRecurringComplianceDashboard.ts`
- `src/features/employees/EmployeeList.tsx`
- `docs/Project Docs/DECISIONS.md`
- `docs/Project Docs/SCHEMA.md`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- `deno check supabase/functions/manage-recurring-compliance-instance/index.ts`
- `deno check supabase/functions/rebuild-compliance-instances/index.ts`
- `deno check supabase/functions/backfill-recurring-compliance-anchors/index.ts`
- `deno check supabase/functions/sync-training/index.ts`
- `npm run build`

---
## 2026-03-15 - Pre-Epic 6 restructure planning

### What shipped

- Added a pre-Epic 6 restructuring plan covering dynamic JotForm compliance forms, ATS applicant-source restructuring, offer flow audit, and AI intelligence audit
- Split the work into proposed stories 5.18 through 5.21 so Epic 6 exports are not started on top of unstable upstream assumptions
- Updated sprint follow-up order to gate Epic 6 behind the restructure tranche

### Files changed

- `docs/plans/2026-03-15-pre-epic6-restructure-plan.md`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- Planning/doc review against current JotForm, applicant, offer, and AI implementation paths
- No runtime code changed in this slice

---
## 2026-03-15 - Recurring compliance manual cycle actions

### What shipped

- Added recurring compliance operator actions so HR can mark a cycle complete, reopen a cycle, suppress or resume reminders, and override anchor dates without manual SQL
- Added the `manage-recurring-compliance-instance` Edge Function to validate actions, persist updates, recalculate linked due dates after anchor overrides, and write audit rows
- Extended recurring dashboard hooks and types so action results invalidate and refresh the dashboard cleanly after each change

### Files changed

- `supabase/functions/manage-recurring-compliance-instance/index.ts`
- `src/features/training/hooks/useRecurringComplianceDashboard.ts`
- `src/features/training/components/RecurringComplianceDashboard.tsx`
- `src/features/training/types/recurring-compliance.ts`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/ISSUES.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- `npx tsc --noEmit`
- `deno check supabase/functions/manage-recurring-compliance-instance/index.ts`
- `npm run build`

---
## 2026-03-12 - Platform-admin applicant tenant filter

### What shipped

- Added a platform-admin-only tenant filter to the applicants page
- Updated the applicant read hook to support tenant-scoped queries while preserving tenant-admin and HR-admin behavior
- Added tenant option loading from `public.tenants` for the platform-admin filter control

### Files changed

- `src/hooks/useApplicants.ts`
- `src/features/applicants/ApplicantList.tsx`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/ISSUES.md`

### Verified

- `npx tsc --noEmit`
- `npm run build`

---

## 2026-03-12 - Shared dropdown standardization + design-system green hover state

### What shipped

- Standardized all app dropdowns under `src` onto the shared `AppSelect` component instead of mixing native `<select>` elements with custom dropdowns
- Updated form-backed pages to use the same dropdown style through controlled `react-hook-form` integrations
- Updated the shared dropdown-menu primitive so highlighted and mouse-over states use the design-system green (`--severity-low`)

### Files changed

- `src/components/ui/AppSelect.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/features/employees/EmployeeList.tsx`
- `src/features/training/TrainingPage.tsx`
- `src/features/training/components/RecurringComplianceDashboard.tsx`
- `src/features/training/components/TrainingAdjustmentModal.tsx`
- `src/features/settings/components/TrainingComplianceRulesPage.tsx`
- `src/features/auth/RequestAccessPage.tsx`
- `src/features/offers/OfferEditor.tsx`
- `src/features/settings/components/users/UserManagementPage.tsx`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- `rg -n -F "<select" src` returns no matches
- `npx tsc --noEmit`
- `npm run build`

---

## 2026-03-12 - Primary compliance group override

### What shipped

- Added `people.primary_compliance_group_id` so HR can choose one active LearnDash group as the compliance-driving group for intentional multi-group employees
- Updated active training and recurring compliance views to prefer the primary compliance group when it points to an active group
- Updated `rebuild-compliance-instances` so recurring cycles are generated only for the selected primary compliance group when one is set
- Added a simple employee-profile control to review active LearnDash groups and choose a primary compliance group when multiple groups are active

### Files changed

- `supabase/migrations/20260312000003_primary_compliance_group.sql`
- `supabase/functions/rebuild-compliance-instances/index.ts`
- `src/types/index.ts`
- `src/features/employees/EmployeeList.tsx`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- `npx tsc --noEmit`
- `deno check supabase/functions/rebuild-compliance-instances/index.ts`
- `npm run build`

---

## 2026-03-12 — LearnDash group reconciliation slice + multi-rule recurring validation

### What shipped

- Added a new migration to create `learndash_group_courses` and derive active training from current LearnDash group context instead of showing every historical synced course as active
- Updated `sync-training` to:
  - fetch current LearnDash groups per user
  - reconcile `employee_group_enrollments` when users leave or re-enter groups
  - sync group-to-course mappings from LearnDash
- Updated active training UI paths to read the reconciled onboarding-safe view instead of raw `training_records`
- Confirmed the second recurring compliance rule path works end-to-end after production backfill/rebuild:
  - rule visible in UI
  - anchors created
  - compliance instances created
  - correct employees see the rule and unrelated employees do not

### Design decisions

- Historical training records remain in `training_records`; the new behavior only changes which courses count as active in admin views
- Group re-entry currently behaves like `resume_previous_series` because `employee_group_enrollments` is reactivated in place and preserves the original anchor
- Recurring compliance status now hides rows tied to inactive group enrollments instead of deleting old cycles

### Files changed

- `supabase/migrations/20260312000002_story511_group_reconciliation.sql`
- `supabase/functions/sync-training/index.ts`
- `src/features/employees/EmployeeList.tsx`
- `src/features/training/hooks/useEmployeeTrainingDetail.ts`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`
- `docs/Project Docs/ISSUES.md`

### Verified

- `npx tsc --noEmit`
- `deno check supabase/functions/sync-training/index.ts`
- `npm run build`

---

## 2026-03-12 — Multi-group compliance assignment policy spec

### What shipped

- Added a small implementation spec for intentional multi-group users such as supervisors or group leaders who need LearnDash access across multiple groups without inheriting every group's compliance obligations
- Recommended an HR-owned `primary_compliance_group_id` model as the first implementation cut

### Files changed

- `docs/plans/2026-03-12-epic5-multi-group-compliance-policy-plan.md`
- `docs/Project Docs/ISSUES.md`
- `docs/Project Docs/PROJECT_LOG.md`

---

## 2026-03-11 — Auth user creation fix (profiles trigger cleanup)

### What shipped

- Dropped legacy `auth.users` trigger `on_auth_user_created` and `public.handle_new_user()` which still tried inserting into `public.profiles` after Epic 5 removed the table
- This unblocks creating users in Supabase Authentication (signup/admin create) on the linked project

### Files changed

- `supabase/migrations/20260311000006_drop_legacy_profiles_auth_trigger.sql`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- Confirmed trigger removed from `auth.users` and `public.handle_new_user` no longer exists on project `peffyuhhlmidldugqalo`

---

## 2026-03-11 — Public request-access intake MVP

### What shipped

- Added a public `/request-access` route and a new auth-shell intake page for organizations that do not yet have a workspace
- Added the `request-access` Supabase Edge Function to validate submissions, persist them in `tenant_access_requests`, and notify ops/admin through platform-level Brevo configuration
- Added `tenant_access_requests` as an intentionally non-tenant-scoped table with RLS, operational status fields, and notification recovery fields
- Added a new login-page CTA for organizations that need onboarding rather than direct sign-in
- Documented the manual handoff from request submission into tenant seeding and first-user setup

### Design decisions

- Request rows are retained even when the notification email fails; the EF returns a clear error and marks `notification_status = 'failed'` so ops can recover the submission manually
- Public notification uses platform-level secrets instead of `tenant_settings` because no tenant exists at intake time
- Open requests are deduplicated by normalized organization name plus work email so repeated submissions update the same in-flight request instead of spamming duplicate rows

### Files changed

- `src/App.tsx`
- `src/features/auth/LoginPage.tsx`
- `src/features/auth/RequestAccessPage.tsx`
- `supabase/migrations/20260311000004_mvp_tenant_access_requests.sql`
- `supabase/functions/request-access/index.ts`
- `supabase/functions/_shared/emails/AccessRequestNotificationEmail.tsx`
- `docs/Project Docs/RUNBOOK.md`
- `docs/Project Docs/SCHEMA.md`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- `deno check` run for the new request-access Edge Function
- Frontend TypeScript validation attempted, but the repo already has unrelated errors in `src/features/auth/ProtectedRoute.tsx`, `src/features/auth/UpdatePasswordPage.tsx`, `src/features/training/hooks/useTrainingCompliance.ts`, `src/hooks/useUserRole.ts`, `src/lib/supabase.ts`, and `src/services/dashboardService.ts`

---

## 2026-03-11 — Request-access guardrails + platform-admin review page

### What shipped

- Added lightweight anti-spam controls to the public `request-access` EF:
  - honeypot field
  - rate limiting by recent email submissions
  - rate limiting by recent request IP
- Added applicant-facing confirmation email delivery after ops notification succeeds
- Added request metadata and confirmation tracking fields on `tenant_access_requests`
- Added a platform-admin-only internal page for reviewing `tenant_access_requests`, inspecting delivery state, and updating request status

### Design decisions

- Internal ops notification remains the hard requirement; requester confirmation failure is recorded but does not fail the submission after ops has already been notified
- Tenant provisioning is still manual. The new admin page makes that explicit instead of pretending the workflow is automated
- Platform-admin review uses direct table access under RLS rather than a dedicated read EF because the table already has platform-admin select/update policies

### Files changed

- `src/App.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/features/auth/RequestAccessPage.tsx`
- `src/features/admin/hooks/useAccessRequests.ts`
- `src/features/admin/pages/AccessRequestsPage.tsx`
- `supabase/migrations/20260311000005_request_access_guardrails.sql`
- `supabase/functions/request-access/index.ts`
- `supabase/functions/_shared/emails/AccessRequestConfirmationEmail.tsx`
- `docs/Project Docs/RUNBOOK.md`
- `docs/Project Docs/SCHEMA.md`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- `deno check request-access/index.ts` run after the guardrail and confirmation-email changes

---

## 2026-03-10 — Applicants read path decoupled from JotForm sync

### What shipped

- Replaced remaining frontend read-time calls to `listApplicants` with direct `applicants` table queries
- `dashboardService.getStats()` now counts applicants from the DB instead of invoking the JotForm sync EF
- `dashboardService.getRecentActivity()` now reads recent applicants directly from `applicants`
- `applicantService.getApplicants()` now reads directly from `applicants`
- `listApplicants` remains available for explicit manual JotForm sync via `useSyncApplicants`

### Why

- `listApplicants` is a JotForm sync EF, not a general-purpose read endpoint
- It returns `400` when JotForm credentials or form ID are not configured
- Dashboard and applicant views should still work even when JotForm is not configured

### Files changed

- `src/services/dashboardService.ts`
- `src/services/applicantService.ts`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- Local TypeScript build run after implementation

---

## 2026-03-10 — JazzHR hire detector endpoint fix

### What shipped

- Fixed `detect-hires-jazzhr` to call the same JazzHR applicants endpoint as `test-connector`
- Changed the detector base URL from `api.jazz.co` to `api.resumatorapi.com`
- This resolves the case where connector test passes but manual sync returns `JazzHR API error: 404`

### Files changed

- `supabase/functions/detect-hires-jazzhr/index.ts`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- Local TypeScript check run after implementation
- Endpoint mismatch confirmed from runtime error and code comparison

---

## 2026-03-10 — JazzHR connector manual sync button

### What shipped

- Added a manual `Sync Hires` action to the JazzHR connector card in settings
- The button invokes the existing `detect-hires-jazzhr` EF with the signed-in user JWT, so the EF runs only for the caller’s tenant
- Added explicit UI copy clarifying that the JazzHR integration imports hired-stage applicants only, not the full applicant pipeline
- Reused the same cooldown pattern as the WordPress sync buttons to prevent rapid repeat clicks

### Files changed

- `src/features/settings/components/ConnectorSettingsPage.tsx`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- The existing `detect-hires-jazzhr` EF already supports authenticated manual invocation via `cronOrTenantGuard`
- Local TypeScript build run after implementation

---

## 2026-03-10 — Connector status persistence fix for BambooHR/JazzHR/WordPress/JotForm

### What shipped

- Added migration `20260310000003_connector_configured_flags.sql`
- `tenant_settings` now exposes generated connector status booleans:
  - `bamboohr_key_configured`
  - `jazzhr_key_configured`
  - `wp_key_configured`
  - `jotform_key_configured`
- `useTenantSettings.ts` now selects those safe derived fields directly instead of trying to infer status from encrypted columns that are intentionally never returned to the frontend
- This fixes the connector settings page showing JazzHR/BambooHR/JotForm as "Not configured" after refresh even though the credentials were saved successfully

### Files changed

- `supabase/migrations/20260310000003_connector_configured_flags.sql` (new)
- `src/features/settings/hooks/useTenantSettings.ts`
- `docs/Project Docs/SCHEMA.md`
- `docs/Project Docs/SPRINT_PLAN.md`
- `docs/Project Docs/PROJECT_LOG.md`

### Verified

- Implementation is additive only; no secret-returning behavior changed
- Frontend continues to consume the same `TenantSettings` shape
- Local production build run after implementation

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

## 2026-03-10 — Epic 5 Stories 5.6–5.8: Verification Closeout

### Implementation plan used
- Verify linked DB migration state for Stories 5.7 and 5.8
- Confirm live schema shape for `offers`, `ai_cache`, and `profiles`
- Verify the affected EFs against the post-migration schema and patch any breakage
- Update project tracking docs to reflect the closed state accurately

### What was verified
- Linked Supabase project already had migrations `20260310000001_epic5_offers_aicache_tenant.sql` and `20260310000002_epic5_drop_profiles.sql` applied
- Remote schema dump confirms:
  - `offers.tenant_id` exists and is `NOT NULL`
  - `ai_cache.tenant_id` exists and is `NOT NULL`
  - `profiles` table is absent
- Hire detectors already satisfy Story 5.6:
  - `detect-hires-bamboohr` writes hired records to `applicants`
  - `detect-hires-jazzhr` writes hired records to `applicants`
- Affected EFs were verified/aligned for the post-`profiles` model:
  - `admin-update-user` now uses `tenant_users` + auth admin update flow
  - `invite-user` now uses `tenant_users` + auth invite flow
  - `_shared/aiClient` now reads/writes `ai_cache` with tenant scoping
- `deno check` passes for:
  - `supabase/functions/_shared/aiClient.ts`
  - `supabase/functions/admin-update-user/index.ts`
  - `supabase/functions/invite-user/index.ts`

### Residual non-blocking follow-up
- `src/services/userService.ts` still contains legacy `profiles` references, but it is not imported by current app code
- Remote deployment status of all changed EFs can still be audited explicitly if needed

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

### Verification checklist (closed 2026-03-10)

- [x] Verify linked DB already has Story 5.7/5.8 migrations applied
- [x] Verify live schema has `tenant_id` on `offers` and `ai_cache`
- [x] Verify live schema no longer contains `profiles`
- [x] Verify affected EF code paths against the post-migration schema
- [x] Run `deno check` on `aiClient`, `admin-update-user`, and `invite-user`
- [ ] Optional follow-up: audit remote deployment status of all changed EFs
- [ ] Optional follow-up: remove unused `src/services/userService.ts` legacy `profiles` references

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
