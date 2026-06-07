# Phase 1 — Lifecycle Stabilization — Implementation Handoff

> [!IMPORTANT]
> **STATUS: LOCKED & PROMOTED — ready for the coding agent (2026-05-30).**
> Owner decisions Q1–Q5 are **answered and recorded** in `docs/Project_Docs/DECISIONS.md` (2026-05-30). All
> ACs are authorable with explicit expected outcomes; no `pending` placeholders remain; all test outcomes
> align with the locked rulings (fail-closed status resolver; fail-safe identity reconciliation with **no
> tie-breaking**). Promotion logged in `docs/Project_Docs/PROJECT_LOG.md`. This is a documentation-only
> deliverable describing a *future* code task. **No application code has been written or changed.**

> **Date:** 2026-05-29 · **Author:** BMAD party-mode roundtable (Winston, John, Amelia, Murat), orchestrated
> **Follows:** `docs/bmad/agent-handoff-template.md` · **Governed by:** `docs/bmad/documentation-governance.md`

---

## Task Name
`phase-1/lifecycle-stabilization-conversion-identity-diagnostics`

## Phase
**Phase 1 — Stabilize Lifecycle Gaps.** Phase 0 gate is MET (merged). **Phase 1 has not started.**
This handoff is the planning artifact; it does not start implementation.

## Objective
Collapse the divergent applicant→offer→employee conversion paths into **one deterministic conversion
authority** with **one status model**; extract **one identity reconciliation service**; and add
**recurring-compliance visibility diagnostics + config validation** (the recurring-compliance engine
already shipped in Epic 5 Stories 5.11–5.17 — **do not rebuild it**).

## Source-of-Truth Docs (read in this order)
1. `docs/architecture/homs-platform-expansion-implementation-spec.md` — §3 (Stabilization Priorities 1–3), §20 (Phase 1), §9 (RLS/JWT). **Rank 1.**
2. `docs/current/homs-current-source-of-truth.md` — current-state index.
3. `docs/bmad/documentation-governance.md` — the rules.
4. `docs/audits/homs-gap-register.md` — the three High-severity Phase 1 gaps (rank 5).
5. `docs/Project_Docs/SPRINT_PLAN.md`, `docs/Project_Docs/PROJECT_LOG.md`, `docs/Project_Docs/DECISIONS.md`, `docs/Project_Docs/SCHEMA.md` — current status + where decisions/schema land.

## Workspace Path (canonical — start here)
`C:\dev\Prolific-HR-Command-Centre\prolific-hr-app`

## Fallback Project Path (untrusted until reviewed)
`C:\dev\Prolific-HR-Command-Centre`

## Context
HOMS is a production multi-tenant healthcare ops platform. The applicant→offer→employee→onboarding
lifecycle works but spans **at least three write paths into `people`** that disagree on details:

- **Client path A** — `src/services/employeeService.ts` → `createEmployeeFromApplicant(applicantId, offerDetails)` (~L115): sets `hired_at = offer.start_date`, `job_title = offer position`.
- **Client path B** — same file → `moveApplicantToEmployee(applicantId)` (~L188): **near-duplicate** of A but `hired_at = today`, `job_title = 'To Be Assigned'`. Divergent rules, same find→upsert→mark-'Hired' dance.
- **Server path C** — `supabase/functions/onboard-employee/index.ts` (offer-accepted DB webhook, `cronOrTenantGuard`, service role): derives tenant from the applicant record, creates WP user + LearnDash enrollment, writes `people`.

Status (`Onboarding`/`Active`) is computed **at conversion time** by `getEmployeeOnboardingStatus` (~L45)
from view `v_onboarding_training_compliance` with a raw-`training_records` fallback — so status is a
snapshot taken by one path against a view that may not exist yet. Identity matching already exists as
`findEmployeeMatch` (~L80: applicant_id → normalized-email `ilike`) but is trapped in `employeeService`
where path C can't reach it.

**Planned ≠ implemented:** Care Ops, Staff App, EVV, Family Portal, Billing, Payroll are NOT in scope.
**Folk Care is reference only — copy no code.**

---

## ✅ DECISIONS BLOCK — ANSWERED by owner 2026-05-30 (recorded in `docs/Project_Docs/DECISIONS.md`)

> All five gating decisions are ruled and recorded. The full text + rationale lives in
> `DECISIONS.md` (2026-05-30 entry). Summary below; the rulings also introduce architectural refinements
> folded into Scope / Files / ACs (notably the **conversion↔provisioning split** and the **separate compliance state**).

| # | Decision (summary) | Unblocks |
|---|---|---|
| **Q1** | `hired_at` = accepted offer's `start_date` (legal start). Immutable to sync/retry. Missing start_date ⇒ conversion fails. Corrections = explicit audited HR action. | AC-2 |
| **Q2** | `employee_status` ∈ {Onboarding, Active, Terminated}, written only by an idempotent **fail-closed** resolver. `Active` = mandatory onboarding complete & safely evaluable. Compliance failures do NOT revert to Onboarding — a **separate compliance state** handles that. `Terminated` never auto-reversed. | AC-6, status migration, resolver tests |
| **Q3** | `job_title` = accepted offer's `position_title`. Missing ⇒ conversion fails (no `'To Be Assigned'`). **Verified bug:** `onboard-employee:41` reads `record.position` but the offer row has only `position_title` ⇒ undefined. Phase 1 fixes the **read side** to `record.position_title` + adds a regression test on the **persisted offer-row shape**. **Do NOT rename the `sendOffer` `position` request param** (API-boundary detail; targeted lifecycle bug, not a schema change). | AC-3 |
| **Q4** | One **server-side** conversion authority; client = thin caller. **MANDATORY:** internal conversion and external WP/LearnDash provisioning MUST be **separate idempotent steps** with independent failure/retry. Preferred structure = `convert-applicant` EF invoking `onboard-employee`; an alternative is OK **only if** it preserves the same transactional boundary, retry semantics, and single-writer authority. (Responsibility split mandatory; two deployed EFs not mandated.) | AC-1, file shape |
| **Q5** | Tenant-scoped, fail-safe reconciliation: applicant_id wins → else exactly one normalized-email (`trim(lowercase)`) match auto-links → else create → **multiple/conflicting ⇒ record an unresolved collision, never guess**. No recency tie-break, no provider-specific normalization. | AC-4, AC-9, identity collision test |

---

## Scope (what the FUTURE code task may do)
- **P2 first (zero-decision slice):** Extract `findEmployeeMatch` + email normalization into a shared
  `supabase/functions/_shared/identity.ts`; repoint `employeeService.ts` and `sync-wp-users` to it. Pure refactor, no behavior change.
- **P1:** Consolidate conversion to **one server-side authority** (per Q4); collapse the two duplicate
  client methods to a thin caller; introduce a **pure, idempotent status resolver** that solely writes a
  stored `people.employee_status` column, re-invoked after every relevant write (never inlined in conversion).
- **P3 (parallel track):** Add recurring-compliance **diagnostics + config validation** surfacing why a
  view is empty (missing group/rule/anchor). **Read-side only.**

## Out-of-Scope (defer on sight → Phase 2+)
- Do **not** modify application code as part of *this* handoff (it is documentation only).
- Macro-domain / Feature-Sliced refactor (that is Phase 2).
- **Backfill / migration of existing employees** to the new status rule (separate risk-managed task; NFR-3 forbids rewriting existing `hired_at`).
- Any **recurring-compliance engine change** (engine shipped 5.11–5.17; P3 is diagnostics only). A finding is not a fix.
- Connector behavior / sync cadence / webhook model changes; new identity sources/connectors.
- Folk Care code copying. Treating planned capabilities as implemented.

---

## Files Likely Affected (FUTURE code task — none touched by this doc)

**NEW**
- `supabase/functions/_shared/identity.ts` — `findEmployeeMatch` + `normalizeEmail` (P2 authority). **Extract FIRST.**
- `supabase/functions/_shared/employee-status-resolver.ts` — pure `resolveStatus(input)` + writer of `people.employee_status`.
- `supabase/migrations/<timestamp>_add_employee_status.sql` — stored `employee_status` column ({Onboarding,Active,Terminated} check, default, null-only backfill) + separate **compliance-state** representation + **identity-collision** table (tenant, candidate IDs, source, normalized email, reason code, status, actor). *(Q2, Q5 — now decided)*
- `supabase/functions/convert-applicant/index.ts` — **canonical internal conversion EF** — the *preferred* structure of the **mandatory** conversion≠provisioning split (Q4). Invoked by the accepted-offer trigger + authorized UI actions; calls `onboard-employee` for provisioning. An alternative structure is acceptable only if it preserves the same transactional boundary, retry semantics, and single-writer authority.
- `supabase/functions/_shared/tests/identity.test.ts` · `..._tests/employee-status-resolver.test.ts` (Deno).
- *(if FE test harness exists)* `src/services/__tests__/employeeService.test.ts`.

**MODIFIED**
- `src/services/employeeService.ts` — delete one duplicate method (Q4 picks survivor); remaining becomes thin caller; `getEmployeeOnboardingStatus` reads stored `employee_status`; drop local `findEmployeeMatch` in favor of shared module.
- `src/features/applicants/ApplicantDetailsPage.tsx` — call the single conversion method; remove path branching.
- `supabase/functions/onboard-employee/index.ts` — narrows to **idempotent external WP/LearnDash provisioning + onboarding notifications** (Q4 split); fix the `record.position` → `position_title` read (Q3); invoked *by* conversion, supports authorized retry without creating a `people` row.
- `supabase/functions/sync-wp-users/index.ts` — use shared `identity.ts`.
- `src/services/offerService.ts`, `applicantService.ts` — only if the conversion contract changes.
- `docs/Project_Docs/DECISIONS.md`, `PROJECT_LOG.md`, `SPRINT_PLAN.md`, `SCHEMA.md` — mandatory updates.

---

## Implementation Constraints (binding on every slice)
- `tenant_guard()` (or `cronOrTenantGuard` for the webhook path) is the **FIRST call** in every EF.
- `tenant_id` from `JWT → app_metadata → tenant_id` **only**; webhook path derives tenant from the applicant record — **never** from body/headers.
- `people` upsert uses **`ON CONFLICT (tenant_id, email)`** — `(tenant_id, email)` is the idempotency key. Conversion must be safe to run twice.
- Every write to a tenant-scoped table produces an `audit_log` row via trigger (do not bypass); `audit-logger.ts` stays fire-and-forget, never throws to caller; `audit_log` stays INSERT-only.
- **NFR-3:** conversion/resolver/sync MUST NOT overwrite `people.hired_at` once set, MUST NOT touch `training_adjustments` or derived effective compliance. Conversion may *set* `hired_at`; sync may not *overwrite* it.
- The status resolver is the **only** writer of `people.employee_status`; conversion must not inline-compute status.
- New EF/shared modules import `jsr:@supabase/supabase-js@2` (no `esm.sh` in new files). `@/` alias is frontend-only.
- Never select `*_encrypted` to the frontend; never store signed URLs.

## Security / Compliance Constraints
- Multi-tenant isolation via RLS on `tenant_id` (flat policies). The consolidated conversion EF runs under service role for the webhook path — **cross-tenant identity matching is a critical risk** (see test ID-5).
- No PHI/ePHI handling (not applicable to this phase, but keep the boundary).
- Any new column ships with a migration + documented rollback in DECISIONS.md.

---

## Validation

**Code (future task):**
```bash
# from inside prolific-hr-app/
npm run build      # type-check + production build — 0 errors
npm run lint       # ESLint clean
cd supabase/functions && deno test _shared/tests/ --allow-env --allow-net   # all pass
# cross-tenant identity re-asserted inside the Phase 0 RLS suite (must stay green)
```

**Doc-only (this handoff note):**
- [x] No new reference uses the space-named `docs/Project Docs/` path (underscore only).
- [x] Every NEW file framed as planned, not implemented — no claim code exists.
- [x] Hierarchy respected; no contradiction with master spec Phase 1; conflicts surfaced not buried.
- [x] Recurring-compliance engine referenced as shipped (5.11–5.17), not rebuilt.
- [x] Decisions Block (Q1–Q5) precedes all code-task ACs.

---

## Acceptance Criteria (future code task)

> **Q1–Q5 ANSWERED (DECISIONS.md, 2026-05-30) — all ACs now authorable.** Expected values below derive from those rulings.

- **AC-1** Exactly ONE conversion authority; FE is a thin caller; both duplicate client methods deleted with 0 remaining callers (`grep`). *(Q4)*
- **AC-2** Conversion sets `hired_at = accepted offer.start_date`; a missing start_date fails conversion with an actionable error; converting twice never changes `hired_at`. *(Q1)*
- **AC-3** `job_title = offer.position_title`; missing fails conversion (no `'To Be Assigned'`); `onboard-employee` reads `record.position_title` (not `record.position`); a regression test asserts against the **persisted offer-row shape**; the `sendOffer` request param is **not** renamed. *(Q3)*
- **AC-4** `findEmployeeMatch`/`normalizeEmail` (`trim(lowercase)`) live only in `_shared/identity.ts`; `employeeService.ts` + `sync-wp-users` + the conversion authority import it; 0 duplicate definitions. *(Q5)*
- **AC-5** Conversion is idempotent: second run → no new `people` row, `ON CONFLICT (tenant_id, normalized_email)` exercised, no duplicate create audit row. *(Q4)*
- **AC-6** `people.employee_status` ∈ {Onboarding, Active, Terminated} written solely by the **fail-closed** resolver; FE reads the stored column; Onboarding↔Active boundary = "mandatory onboarding complete & safely evaluable"; missing config ⇒ Onboarding + reason code; `Terminated` never auto-reversed; compliance failure does NOT revert to Onboarding. *(Q2)*
- **AC-7** Resolver is idempotent and re-invoked after conversion and after relevant training/group writes; same inputs → same status (convergence across sync orderings). *(Q2)*
- **AC-8** Conversion and external WP/LearnDash provisioning are **separate idempotent steps**; an authorized provisioning retry re-runs without creating another `people` row; integration failures remain visible in `integration_log` (no silent failure). *(Q4)*
- **AC-9** Reconciliation is fail-safe: ambiguous/conflicting evidence records an **unresolved identity collision** (tenant, candidate IDs, source, normalized email, reason code, timestamp, resolution status, actor) — never auto-merges. *(Q5)*
- **AC-10** A **separate compliance state** (`compliant`/`non_compliant`/`unknown`/`configuration_error`) is distinct from `employee_status`; P3 diagnostics surface engine config validity; engine files (5.11–5.17) unchanged (`git diff` clean on engine). *(Q2, P3)*
- **AC-11** NFR-3 proven: `hired_at` not overwritten when preset; `training_adjustments` untouched by conversion/resolver/sync.
- **AC-12** `tenant_guard`/`cronOrTenantGuard` is first call in every touched EF; tenant derived from JWT (or trusted applicant/offer record for the trigger), never from body/headers; cross-tenant identity non-match asserted in the Phase 0 RLS suite.
- **AC-13** Docs updated: DECISIONS.md (done — Q1–Q5), SCHEMA.md (`employee_status` + compliance-state + collision table + rollback), PROJECT_LOG.md, SPRINT_PLAN.md story status.

---

## Test Strategy (mandated; scaffold now, verdicts after Q1–Q5)

**Ordering matrix (integration, seeded test tenant) — assert STATE CONVERGENCE (byte-identical terminal `(employee_id, hired_at, job_title, status, audit count)`):**

| ID | Ordering | Assertion |
|---|---|---|
| ORD-1 | convert → sync | one employee, status = resolver output |
| ORD-2 | sync → convert | identical terminal row to ORD-1 |
| ORD-3 | sync-partial (records present, view not materialized) → convert | fallback used, no crash, converges |
| ORD-4 | convert → convert | idempotent (see idempotency test) |
| ORD-5 | webhook ↔ UI convert interleaved | invariant: exactly one employee row; loser is no-op |
| ORD-6 | sync → convert → sync-again | second sync does NOT mutate hired_at/status (NFR-3) |

**Status resolver — PURE unit tests** (inputs object: `complianceView | null`, `rawTrainingRecords[]`, `hiredAt`, `hasActiveTrainingGroups`, `isTerminated`). Expected outputs follow the **Q2 ruling (fail-closed)** — the resolver writes `employee_status ∈ {Onboarding, Active, Terminated}` and never guesses:

| Case | Inputs | Expected `employee_status` (+ reason code) |
|---|---|---|
| Onboarding obligations complete, safely evaluable | view present, all mandatory complete | `Active` |
| Mandatory onboarding incomplete | view present, ≥1 mandatory not complete | `Onboarding` (`mandatory_course_incomplete`) |
| View missing, raw fallback shows all complete | `complianceView=null`, raw all complete | `Active` |
| View missing, raw fallback incomplete | `complianceView=null`, raw incomplete | `Onboarding` (`mandatory_course_incomplete`) |
| Config incomplete (no rule / no group mapping / no anchor) | required config absent | `Onboarding` (`configuration_incomplete`) — **fail closed** |
| Training sync not yet run / not safely evaluable | obligations indeterminate | `Onboarding` (`awaiting_training_sync`) — **fail closed** |
| Explicit terminal state | `isTerminated=true` | `Terminated` — **never auto-reversed** by the resolver |
| Established `Active` employee, credential later expires | was `Active`, compliance now fails | **stays `Active`**; compliance handled by the separate compliance state — resolver does NOT revert to `Onboarding` |

The resolver is idempotent (same inputs → same output) and emits machine-readable reason codes. **A coding agent must implement exactly these outcomes; it must not invent or relax the rule.**

**Idempotency:** same applicant twice → 1 row, fields byte-identical, `ON CONFLICT` exercised, audit-create delta 0.

**Identity precedence (P2)** — expected outcomes follow the **Q5 ruling (fail-safe, no guessing)**:
- **ID-1** exact `applicant_id` linkage present → links to that employee (wins even if an email also matches a different row).
- **ID-2** no `applicant_id`, exactly one normalized-email (`trim(lowercase)`) match within tenant → auto-links.
- **ID-3** ambiguous: ≥2 normalized-email matches in-tenant, OR `applicant_id` points to A while email matches B (conflicting evidence) → **records an unresolved identity collision and does NOT link or create.** The test MUST assert: (a) zero auto-link/merge occurred, (b) no `people` row was created or mutated, (c) a collision record was written (tenant, candidate IDs, source, normalized email, reason code, timestamp, status `unresolved`, actor). **It must NOT assert a tie-break, "most-recent wins," or any deterministic pick — guessing is forbidden by Q5.**
- **ID-4** WP-first user, applicant arrives later, exactly one match → converges to a single employee (unambiguous auto-link); if ambiguous, falls to ID-3.
- **ID-5** same normalized email in tenant A & tenant B → **MUST NOT match across tenants** — place inside the Phase 0 RLS suite, not an isolated unit.

**Regression gate-within-the-gate:** NFR-3 invariants green; `audit_log` UPDATE/DELETE still rejected; **Phase 0 cross-tenant RLS suite re-run and green — no Phase 1 merge if any RLS test regresses.**

---

## Rollback Notes (future code task)
- **Identity extract** (do first/separately): `_shared/identity.ts` is additive — revert by restoring inline `findEmployeeMatch` and deleting the module. P2 rolls back without touching P1.
- **Conversion consolidation:** keep as its own atomic commit, separate from the identity-extract commit. Revert = restore the deleted duplicate method (from git) + repoint `ApplicantDetailsPage.tsx`.
- **Status migration:** rollback = `ALTER TABLE people DROP COLUMN employee_status;` documented in DECISIONS.md before `db push`. Backfill is null-only → drop is clean (no destructive data move; no existing-employee backfill — out of scope).
- **Resolver:** additive module + post-write call sites; revert = remove call sites, restore inlined computation. Column may remain inert if resolver reverted; drop only if migration also reverted.
- **P3 diagnostics:** read-only/additive; revert independently, no engine impact.

## Required Final Report Format (the future coding agent must return)
1. **Task** — name and phase.
2. **Files changed** — created / modified / deleted (exact paths).
3. **What was done** — concise summary; which of Q1–Q5 each decision implemented.
4. **Validation** — the 3 commands + their output, plus the convert-twice manual check.
5. **Conflicts or missing docs** — anything disagreeing with the master spec, or referenced docs not found in either location.
6. **Out-of-scope confirmations** — no Phase 2 refactor, no existing-employee backfill, no engine change, Folk Care not copied, planned not treated as implemented.
7. **Doc updates** — PROJECT_LOG.md / SPRINT_PLAN.md / DECISIONS.md / SCHEMA.md confirmation.

---

## Promotion / Next Steps (for the owner)
1. ✅ **Q1–Q5 answered** (DECISIONS.md, 2026-05-30) — all ACs now authorable; status/compliance/collision migration unblocked.
2. Review & promote this handoff per governance §6 (owner approval → canonical placement → PROJECT_LOG entry).
3. Sequence: **extract `_shared/identity.ts` first** (lowest-risk slice), then `convert-applicant` + resolver, then narrow `onboard-employee` to provisioning, with P3 diagnostics in parallel.
4. This remains a **documentation-only** deliverable. No application code in this repo was created or modified — only docs (this handoff + the DECISIONS.md rulings).
