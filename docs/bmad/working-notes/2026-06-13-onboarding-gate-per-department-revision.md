# Dev Handoff — Onboarding Completion Gate, REVISION: per-department (multi-group)

- **Date:** 2026-06-13
- **Supersedes:** `2026-06-07-onboarding-completion-gate-handoff.md` (single-group model — wrong abstraction)
- **Severity:** corrects a domain-model flaw in the shipped gate **before** it is activated (it is currently inert — `onboarding_group_id` is null, no backfill has run, zero employee statuses changed). No production impact; this is a clean design correction.
- **Branch:** `feature/onboarding-gate-per-department` off `main`. Deploy from `main` only.

---

## 1. What changed and why

The shipped gate assumed **one tenant-wide onboarding group** (`tenant_settings.onboarding_group_id`). That is wrong: **onboarding is per-department.** An agency runs multiple departments (Nursing, Caregiving, …), each with its **own** onboarding LearnDash group and curriculum. The tenant has had **two groups from day one** — `54` (Caregivers) and `1428` (Nurses) — precisely because their onboarding paths differ. "Onboarding complete" for an employee = they finished **their department's** onboarding group courses, not one shared group.

**Owner decisions (LOCKED 2026-06-13):**
1. **Per-group `is_onboarding` flag** (Option 2): the admin marks which mapped groups are onboarding groups. Not every group must gate (future-proofs non-onboarding groups).
2. **Recurring/annual training stays a COURSE**, never a group. Recurrence is a *policy attribute* of a requirement (`training_compliance_rules.compliance_track='recurring'` + `recurrence_interval_months`), matching the healthcare-LMS standard (Relias/HealthStream). The onboarding gate **excludes** recurring-tracked courses; the recurring subsystem tracks them independently. **Do not touch the recurring subsystem.**

Note: their annual reviews are already department-specific (Nurse "Module 6 Annual Review" #1472 vs Caregiver #938), so annual courses correctly live inside each department group; the gate excludes them via the recurring rule.

---

## 2. Existing infra this reuses (do NOT rebuild)

- `tenant_settings.ld_group_mappings` (jsonb) — already maps job_title → group_id (`[{group_id, job_title}]`). Caregivers→54, Nurses→1428. **This is where the new `is_onboarding` flag lives.**
- `employee_group_enrollments` — who is actively in which group (hires are already auto-enrolled into their department group by job_title — Epic 3 behavior).
- `learndash_group_courses` (+ `.active`) — group → courses.
- `training_courses` (+ `.active`) — course catalog.
- `training_compliance_rules` (`compliance_track='recurring'`) — the recurring exclusion (already wired into the gate).
- `v_onboarding_training_compliance` — Layer A/B effective status (joined to, never modified).

---

## 3. Undo the single-group pieces from the shipped PR

1. **Drop** `tenant_settings.onboarding_group_id` (new migration; it's null everywhere, unused).
2. **Revert** the `onboarding_group_id` auto-enroll added to `process-hire` and `onboard-employee` — hires are ALREADY enrolled into their department group via the existing job_title→group logic; the single-group enrollment is redundant/wrong. Restore those two functions to their pre-PR enrollment behavior (keep any unrelated fixes).
3. **Rewrite** `v_onboarding_gate` (below) and the resolver's `gatherStatusInput` (below).
4. **Replace** the Settings "Onboarding Group" single-select with a per-row "Onboarding group" checkbox.

Unchanged & kept: `OnboardingGateCard`, `useOnboardingGate`, `scripts/backfill-onboarding-gate.ts` — they read `v_onboarding_gate`'s columns, which stay identical (tenant_id, person_id, course_id, course_name, effective_status, effective_completed_at, has_record). Verify, don't rewrite.

---

## 4. Schema (one migration; rollback block in DECISIONS.md)

```sql
-- 1) Remove the wrong single-group setting.
alter table public.tenant_settings drop column if exists onboarding_group_id;

-- 2) Per-department onboarding gate. The onboarding groups are the entries in
--    ld_group_mappings flagged is_onboarding=true. An employee's gate = the
--    NON-recurring active courses of the onboarding group(s) they are actively
--    enrolled in. One row per (person x onboarding-group course), record or not.
create or replace view public.v_onboarding_gate as
with onboarding_groups as (
  select ts.tenant_id, (g->>'group_id') as group_id
  from public.tenant_settings ts,
       lateral jsonb_array_elements(coalesce(ts.ld_group_mappings, '[]'::jsonb)) as g
  where coalesce((g->>'is_onboarding')::boolean, false) = true
)
select
  og.tenant_id,
  ege.person_id,
  lgc.course_id,
  tc.course_name,
  coalesce(votc.effective_status, 'not_started') as effective_status,
  votc.effective_completed_at,
  (votc.training_record_id is not null)          as has_record
from onboarding_groups og
join public.employee_group_enrollments ege
  on ege.tenant_id = og.tenant_id and ege.group_id = og.group_id and ege.active
join public.learndash_group_courses lgc
  on lgc.tenant_id = og.tenant_id and lgc.group_id = og.group_id and lgc.active
join public.training_courses tc
  on tc.tenant_id = og.tenant_id and tc.course_id = lgc.course_id and tc.active
left join public.v_onboarding_training_compliance votc
  on votc.tenant_id = og.tenant_id
 and votc.person_id = ege.person_id
 and votc.course_id = lgc.course_id
where not exists (                       -- recurring courses are excluded (owned by recurring subsystem)
  select 1 from public.training_compliance_rules tcr
  where tcr.tenant_id = og.tenant_id
    and tcr.course_id = lgc.course_id
    and tcr.group_id  = og.group_id
    and tcr.active
    and tcr.compliance_track = 'recurring'
);

alter view public.v_onboarding_gate set (security_invoker = on);
```

- Default for absent/unset `is_onboarding` = **false → fail closed** (a group only gates once explicitly flagged).
- Data step (optional, this tenant only — both existing groups ARE onboarding): set `is_onboarding=true` on the 54 and 1428 entries. Prefer doing this via the Settings UI after deploy so it goes through the audited EF path; document either way.

---

## 5. Resolver — `_shared/employee-status-resolver.ts` (`gatherStatusInput` only)

Pure `resolveEmployeeStatus` stays byte-identical (Q2 matrix frozen). Rewire inputs:

1. Read the person's `tenant_id` (already does).
2. Read `tenant_settings.ld_group_mappings` (replaces reading `onboarding_group_id`). In JS, derive `onboardingGroupIds = mappings.filter(m => m.is_onboarding === true).map(m => m.group_id)`.
3. `hasActiveTrainingGroups` = the person has ≥1 **active** `employee_group_enrollments` row whose `group_id` is in `onboardingGroupIds`. Empty list → false → fail closed (`configuration_incomplete`).
4. `complianceView` = the person's rows from **`v_onboarding_gate`** (per-department logic lives in the view, so the resolver just reads it). Empty + has groups → `awaiting_training_sync` (fail closed). All `completed` → Active. Any not-completed → Onboarding (`mandatory_course_incomplete`).
5. Keep the raw `training_records` fallback ONLY for the view-missing path (42P01/PGRST205).

Invariants to keep: Terminated absolute; established Active stays Active; `writeEmployeeStatus` is the sole writer; no-op writes skipped.

Redeploy after: `convert-applicant` (bundles the resolver), plus `process-hire`/`onboard-employee` (the enrollment revert), `save-ld-mappings` (below).

---

## 6. Settings UI + save path

- `tenant-settings` type `LdGroupMapping`: add `is_onboarding?: boolean`.
- **Settings → LearnDash mappings page** (`LdGroupMappingsPage.tsx`): remove the single "Onboarding Group" select added in the prior PR; add a per-row **"Onboarding group"** checkbox bound to `is_onboarding`.
- `save-ld-mappings` EF: accept and persist `is_onboarding` per mapping entry (tenant_id from JWT only; validate it's a boolean). Keep the existing audit write.

---

## 7. Backfill (unchanged mechanism, now per-department)

`scripts/backfill-onboarding-gate.ts` already reads `v_onboarding_gate` and reset-then-resolves via `writeEmployeeStatus`. With the new view it automatically evaluates each employee against THEIR department group. After admin flags the onboarding groups:
- Identify (read-only) → expected resets. On current data, with 54 + 1428 both flagged onboarding: **Karimah Moss** (Nurse, 4 of her gate incomplete) resets to Onboarding; Debbra/Allyssa/Quele/Nicole stay Active (complete against their dept's non-recurring courses). Verify before `--apply`.
- Grandfathering + audit-row checks as in the prior handoff §6.

---

## 8. Tests

1. **Resolver/gather** (extend `_shared/tests/`): no onboarding-flagged group → fail closed; person not enrolled in any onboarding group → fail closed; person in dept group with a non-recurring course missing a completed record → `Onboarding`; all non-recurring dept courses complete → `Active`; recurring course excluded.
2. **Gate view contract** (update `onboarding-gate.test.ts` + the RLS contract test): two departments (groups A,B) each flagged onboarding with their own courses + 1 recurring each; person enrolled only in A → gate rows are A's non-recurring courses only (not B's). A person in B is gated by B's courses. Confirms per-department isolation.
3. **RLS**: `v_onboarding_gate` cross-tenant denial stays in the suite (security_invoker; all inputs tenant-scoped). 
4. Existing suites green: `cd supabase/functions && deno test _shared/tests/ --allow-env --allow-net`; `npm run build`; `npm run lint`.

---

## 9. Verification (post-deploy, `peffyuhhlmidldugqalo`)

```sql
-- Probe the per-department gate for Karimah (Nurse, group 1428):
select course_id, course_name, effective_status, has_record
from v_onboarding_gate where person_id = 'a9e02e52-1d13-45d5-961f-1ffc2ce6d8c5';
-- expect: her 1428 non-recurring courses, not-started ones present, Module 6 (recurring) ABSENT.

-- A Caregiver (group 54) should see group-54 courses only — never Nurse courses.
```
After admin flags 54+1428 as onboarding and runs the backfill: Karimah → Onboarding; the four completed employees hold Active; audit_log rows exist.

---

## 10. Out of scope / rollback

- Do not modify the recurring-compliance subsystem, `v_onboarding_training_compliance`, NFR-3 sync boundaries, or the CI tenant-isolation gate (separate Codex follow-up).
- Rollback: additive/idempotent — `create or replace view` reverts to prior def; re-add the dropped column if needed; git revert resolver/UI/EF. Document in DECISIONS.md before `db push`.

## 11. Deliverables (per CLAUDE.md)
- [ ] Migration (drop column + per-department view, security_invoker on, rollback block)
- [ ] `gatherStatusInput` rewired to ld_group_mappings `is_onboarding` + enrollment check
- [ ] Revert single-group auto-enroll in process-hire/onboard-employee
- [ ] Settings checkbox + `save-ld-mappings` persists `is_onboarding`
- [ ] Tests per §8 green incl. two-department contract; RLS case retained
- [ ] PROJECT_LOG, DECISIONS (per-department ruling + recurring-stays-course rationale), SPRINT_PLAN updated
- [ ] Redeploy: migration → convert-applicant, process-hire, onboard-employee, save-ld-mappings
