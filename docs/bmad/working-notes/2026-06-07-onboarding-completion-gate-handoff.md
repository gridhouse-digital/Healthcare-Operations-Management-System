# Dev Handoff — Onboarding Completion Gate (requirement-driven, tenant-configured)

- **Date:** 2026-06-07 (converged with owner 2026-06-11; supersedes the pre-discussion draft of the same name)
- **Author:** Architecture (root cause + blast radius verified live against `peffyuhhlmidldugqalo`)
- **Severity:** P1 — compliance-grade correctness: employees are marked training-cleared (`Active`) while mandatory onboarding courses have **no completion evidence**
- **Phase:** First concrete slice of the per-tenant compliance rule engine (backlog #1)
- **Branch:** `feature/onboarding-completion-gate` off `main`. Deploy from `main` only.

---

## 1. Problem (verified, not hypothesized)

`people.employee_status` is resolved by `_shared/employee-status-resolver.ts`, which evaluates
completeness over rows in `v_onboarding_training_compliance`. That view is **record-driven**:
built FROM `training_records`, so a mandatory course with **no synced record** (auto-enrolled in
LearnDash but never started → sync writes nothing) simply **vanishes** from the completeness
check. `rows.every(completed)` over only the rows that exist = **fail-open**.

### Live evidence (tenant `11111111-1111-1111-1111-111111111111`, 2026-06-07)

Every `Active` employee measured against the courses actually mapped to their enrolled group(s)
(`learndash_group_courses`, active courses only):

| Employee | Mapped (required) | Completed records | Gap | Verdict |
|---|---|---|---|---|
| Karimah Moss | 8 | 2 | **6** | 🔴 falsely Active |
| Debbra Deo | 5 | 4 | **1** | 🔴 falsely Active |
| Allyssa Wooden | 5 | 5 | 0 | ✅ legitimately Active |
| Quele Lyons | 5 | 5 | 0 | ✅ legitimately Active |
| Nicole Fetzer | 5 | 6 | −1 | ✅ Active (completed an unmapped course — mapping drift, harmless) |

**2 of 5 Active employees are falsely cleared.** Karimah is enrolled in all 8 of group 1428's
courses (auto-enroll on group add — owner-confirmed); 6 are not-started → no `training_records`
rows → invisible to the view → resolver computes `onboarding_complete`.

### Why a manual status edit is NOT the fix
`resolveEmployeeStatus` (`employee-status-resolver.ts:83`) never reverts `Active → Onboarding`
("established Active stays Active"; ongoing compliance lapses are the separate `compliance_state`
axis — by design). A hand-set `Onboarding` is overwritten back to `Active` on the next
`writeEmployeeStatus` run. The status field is a symptom; the completeness logic is the bug, and
the currently-wrong rows additionally need an explicit reset (§6).

---

## 2. Owner decisions (LOCKED 2026-06-11 — do not relitigate in implementation)

1. **Explicit tenant setting, not inference.** *"Each tenant selects their official Onboarding
   LearnDash Group in settings. That group becomes the source of truth for onboarding assignment
   and onboarding compliance anchors."* No per-person "first group" inference.
2. **Group-as-gate.** Onboarding complete = every **active course mapped to the designated
   onboarding group** has a completed record — EXCEPT courses with an active `recurring` rule in
   `training_compliance_rules` (e.g. group 1428's course 1472 "Ns-MODULE 6 ANNUAL EMPLOYEE
   REVIEW", 12-mo recurrence — cannot be done on day 1; the recurring subsystem owns it).
3. **Fail-closed.** Gating course with no completed record (including NO record at all) =
   incomplete → `Onboarding`. Setting unset, or person not actively enrolled in the designated
   group → not safely evaluable → `Onboarding` (`configuration_incomplete`). Never guess Active.
4. **Manual completion stays in WordPress/LearnDash** for this slice. HR marks completion in
   LearnDash; `sync-training` ingests it (daily cron, or manual Sync for immediate). No HOMS-side
   mark-complete UI now. Future: Layer B `training_adjustments` is the designed mechanism —
   additive, nothing in this slice blocks it.
5. **One-time corrective backfill** (reset-then-resolve) for currently-Active employees who fail
   a requirement-driven check, with grandfathering (§6).

### ⚠️ One flagged item to confirm with the owner BEFORE the migration is written

Current WP data is **role-based**: `ld_group_mappings` = group `54` "Caregivers", group `1428`
"Nurses", each with its own onboarding curriculum (CAREGIVER-MODULE-* vs Ns-MODULE-*). The
single-group rule reflects the owner's **planned WP restructure** (2026-06-11): a universal
New-Hires group that every new user joins first. Consequences:

- Do not set the Settings field until the New-Hires group exists in WP and has synced into HOMS.
- If the owner later keeps role-based onboarding groups instead, the setting becomes a
  **multi-select** (`onboarding_group_ids text[]`; a person's gate = the designated groups they
  are actively enrolled in). One column type + one `= ANY()` difference — confirm single vs multi
  before coding. **Default per current ruling: single.**

---

## 3. Existing infrastructure (use it — do not rebuild)

- **`training_compliance_rules`** (per-tenant rules, already live): `compliance_track` CHECK is
  `'recurring' | 'assignment'`; this tenant has 2 rules, both recurring; group 1428 has exactly
  one (course 1472, 12-mo). The gate EXCLUDES recurring-tracked courses via this table. No new
  rule rows or CHECK changes are required for this slice.
- **`v_onboarding_training_compliance`** — record-driven effective-status view (Layer A/B merge,
  recurring excluded). Other features consume it; **do not modify it** — the new gate view joins
  to it for effective status.
- **`employee_group_enrollments`** — active group membership + anchors (`anchor_source`).
- **`tenant_settings`** — PK `tenant_id`, already RLS-scoped; `ld_group_mappings jsonb` holds
  `[{group_id, job_title}]` (current: 54→Caregivers, 1428→Nurses) — source for the Settings
  dropdown labels.
- **Resolver/writer** — `resolveEmployeeStatus` (pure, Q2 matrix) + `writeEmployeeStatus` (sole
  persister of `employee_status`). Keep both invariants intact.

---

## 4. Schema changes (one migration; rollback block in DECISIONS.md before `db push`)

```sql
-- 1) Tenant setting: designated onboarding group (LearnDash group id; text matches
--    learndash_group_courses.group_id / employee_group_enrollments.group_id)
alter table tenant_settings add column onboarding_group_id text;

comment on column tenant_settings.onboarding_group_id is
  'LearnDash group id designated as the official onboarding group. Source of truth for onboarding assignment and the onboarding completion gate. NULL = gate not configured (resolver fails closed).';
```

```sql
-- 2) NEW requirement-driven gate view (alongside, not replacing, the record-driven view).
--    security_invoker per the Phase 0.1 SECURITY DEFINER ruling.
create view v_onboarding_gate as
select
  ts.tenant_id,
  ege.person_id,
  lgc.course_id,
  tc.course_name,
  coalesce(votc.effective_status, 'not_started') as effective_status,
  votc.effective_completed_at,
  (votc.training_record_id is not null)          as has_record
from tenant_settings ts
join employee_group_enrollments ege
  on ege.tenant_id = ts.tenant_id
 and ege.group_id  = ts.onboarding_group_id
 and ege.active
join learndash_group_courses lgc
  on lgc.tenant_id = ts.tenant_id
 and lgc.group_id  = ts.onboarding_group_id
join training_courses tc
  on tc.tenant_id = ts.tenant_id
 and tc.course_id = lgc.course_id
 and tc.active
left join v_onboarding_training_compliance votc
  on votc.tenant_id = ts.tenant_id
 and votc.person_id = ege.person_id
 and votc.course_id = lgc.course_id
where ts.onboarding_group_id is not null
  and not exists (                          -- recurring courses belong to the recurring subsystem
    select 1 from training_compliance_rules tcr
    where tcr.tenant_id = ts.tenant_id
      and tcr.course_id = lgc.course_id
      and tcr.group_id  = ts.onboarding_group_id
      and tcr.active
      and tcr.compliance_track = 'recurring'
  );

alter view v_onboarding_gate set (security_invoker = on);
```

**Key property:** one row per (person × gating course) **whether or not a training record
exists** — a missing record surfaces as `effective_status='not_started'`. The fail-open is
structurally closed. Layer B overrides still apply because effective status comes from
`v_onboarding_training_compliance` when a record exists.

---

## 5. Code changes

### 5a. Resolver input (`_shared/employee-status-resolver.ts` — `gatherStatusInput` only)

The pure resolver (`resolveEmployeeStatus`) does **not** change — the Q2 matrix stays exactly
as-is. Rewire what feeds it:

1. Read `tenant_settings.onboarding_group_id` for the person's tenant. `NULL` → set
   `hasActiveTrainingGroups: false` (→ `Onboarding` / `configuration_incomplete`).
2. `hasActiveTrainingGroups` = active enrollment **in the designated onboarding group**
   (not "any active enrollment").
3. `complianceView` = this person's rows from **`v_onboarding_gate`** (not
   `v_onboarding_training_compliance`). Empty + group configured → `rows.length === 0` →
   `awaiting_training_sync` (fail closed; correct for not-yet-enrolled people).
4. Keep the raw `training_records` fallback ONLY for the view-missing path (42P01/PGRST205),
   semantics unchanged.

Unchanged invariants to verify in review: Terminated absolute; established Active stays Active;
`writeEmployeeStatus` remains the sole persister; no-op writes skipped.

### 5b. Settings UI + save path

Settings → LearnDash/Training (beside the existing group mappings): "Onboarding Group" select.
Options = union of `ld_group_mappings[].{group_id, job_title}` and distinct
`learndash_group_courses.group_id` (label fallback = the id). Persist by extending the EF that
saves `ld_group_mappings` (`save-ld-mappings`) — tenant-guarded, tenant_id from JWT ONLY.

### 5c. Onboarding assignment (owner ruling: group is the assignment source of truth)

In the hire path's LearnDash enrollment step (`onboard-employee` / `process-hire`), ALSO enroll
the new hire into the designated onboarding group when set — idempotent (skip if already
enrolled). Anchor via existing `employee_group_enrollments` conventions
(`anchor_source='group_enrollment'`).

### 5d. Visibility (small, high-value)

Employee detail → training section renders the person's `v_onboarding_gate` rows (including
`not_started`) so HR sees "2 of 6 onboarding courses complete" instead of only synced records.
Read-only.

---

## 6. One-time corrective backfill (reset-then-resolve)

Resolver rule 2 means falsely-Active rows will NOT self-heal after the logic ships. After the
owner creates the New-Hires group in WP, it syncs, and they select it in Settings:

1. **Identify (read-only first; paste output in PR):** Active employees with ≥1 gating course
   not completed, via `v_onboarding_gate`.
2. **Reset-then-resolve ONLY those people:** set `employee_status = null`, then call
   `writeEmployeeStatus(admin, personId)` per person (guarded admin script/EF — NOT raw SQL for
   the resolve step; the resolver must remain the only status writer).
3. **Grandfathering (owner-approved):** during the WP-restructure window, employees complete
   against their CURRENT role group's curriculum (verified 2026-06-07: Allyssa Wooden, Quele
   Lyons, Nicole Fetzer) are NOT reset even if not yet enrolled in the New-Hires group. Record
   names + proof query in DECISIONS.md. Expected resets on 2026-06-07 data: **Karimah Moss,
   Debbra Deo** only.
4. Verify `audit_log` rows exist for every status change (existing trigger).

---

## 7. Tests

1. **gatherStatusInput/resolver cases** (extend `_shared/tests/`): setting unset → fail closed;
   not enrolled in gate group → fail closed; gating course with NO record → `Onboarding` /
   `mandatory_course_incomplete`; all gating complete → `Active` / `onboarding_complete`;
   recurring course excluded from gate; Terminated absolute; established Active stays Active.
2. **Gate-view contract test:** person enrolled + 3 mapped courses + 1 record → 3 rows, two
   `not_started`.
3. **Karimah regression, named:** 8 mapped, 1 recurring-excluded, 2 completed → `Onboarding`.
4. **RLS:** cross-tenant read on `v_onboarding_gate` returns zero rows (live suite).
5. Existing suites green: `cd supabase/functions && deno test _shared/tests/ --allow-env --allow-net`;
   `npm run build`; `npm run lint`.

---

## 8. Verification (post-deploy, `peffyuhhlmidldugqalo`)

Pre-req: New-Hires group exists in WP, synced, selected in Settings.

```sql
-- 1) Gate sanity for Karimah:
select course_id, course_name, effective_status, has_record
from v_onboarding_gate
where person_id = 'a9e02e52-1d13-45d5-961f-1ffc2ce6d8c5';
-- expect: one row per gating course; not_started rows PRESENT

-- 2) After backfill: Karimah + Debbra = 'Onboarding'; Allyssa, Quele, Nicole remain 'Active'.

-- 3) audit_log rows exist for both status changes.
```

E2E: complete one of Karimah's remaining courses in LearnDash → Sync Training → re-resolve →
stays `Onboarding` until ALL gating courses complete → flips `Active` (`onboarding_complete`).

---

## 9. Out of scope

- HOMS-side manual completion UI (Layer B `training_adjustments` exists; future additive slice).
- WP suspension → HOMS offboarding sync (separate backlog note, 2026-06-07).
- Generalized rule-engine UI beyond the single Onboarding Group setting.
- Any change to `v_onboarding_training_compliance` or its consumers, `sync-training` write
  behavior, or NFR-3 sync boundaries.

## 10. Rollback

- Additive schema: `drop view v_onboarding_gate; alter table tenant_settings drop column onboarding_group_id;`
- Resolver: git revert (`gatherStatusInput` changes only).
- Backfill: `audit_log` preserves prior values; restorable by guarded script. Document the
  rollback block in DECISIONS.md before `db push`.

## 11. Deliverables checklist (per root CLAUDE.md)

- [ ] Migration (column + gate view, `security_invoker = on`, rollback documented)
- [ ] `gatherStatusInput` rewired (gate view + designated-group enrollment check)
- [ ] Settings UI + tenant-guarded save path
- [ ] Hire-path idempotent auto-enroll into the onboarding group
- [ ] Backfill script + grandfathering proof pasted in PR
- [ ] Tests per §7 green, incl. RLS case for the new view
- [ ] PROJECT_LOG.md, DECISIONS.md (grandfathering + single-vs-multi ruling), SPRINT_PLAN.md updated
