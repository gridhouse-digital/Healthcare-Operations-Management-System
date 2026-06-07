# Runbook — Reconcile `main` with Production (trunk drift fix)

> **Status**: BMAD working note (not promoted). Doc-only; this runbook *describes* git steps for a human/agent to run — it changes nothing by itself.
> **Authored**: 2026-05-30 · HOMS Platform Architect
> **Read first**: this file, then `docs/bmad/working-notes/2026-05-30-phase-0.1-rls-legacy-policy-remediation-handoff.md`

## Why this exists
`main` is **14 migrations behind production**. Production was deployed from the feature
branch `phase-0/rls-and-tenant-guard-audit`, but those migration files were never merged
back into `main`. Any branch cut from `main` (including the current `phase-0.1` hotfix)
inherits a stale, wrong picture of prod. This runbook brings `main` back in sync **before**
anything else ships. The leak work is latent severity (one data tenant + a platform_admin),
so there is no time pressure — do this cleanly.

## Verified facts (established 2026-05-30, read-only)
- `main` = `cb7afd1`; migration files stop at `20260311000003`.
- Production migration ledger latest = `20260529000000` (confirmed via `supabase_migrations.schema_migrations`).
- `f6d4216` (on `phase-0/rls-and-tenant-guard-audit`) contains **exactly** the 14 prod
  migrations `20260311000004 → 20260529000000` + the Phase 0 EF tenant-guard work (`bf340bb`),
  and **none** of the Phase 1 code.
- `99f5d7a` (the tip of that branch, one commit above `f6d4216`) is the **Phase 1 WIP**
  snapshot — the ONLY commit touching `convert-applicant`, `_shared/identity.ts`,
  `_shared/conversion.ts`, and migrations `20260530000001/2`. It must stay OUT of `main`.
- **`main` is a clean ancestor of `f6d4216` with ZERO divergent commits** → reconciliation is
  a trivially safe fast-forward, no merge, no conflicts.

So: **fast-forward `main` to `f6d4216`.** That is the whole reconciliation.

## Preconditions
- Current branch is `phase-0.1/rls-legacy-policy-remediation` with **uncommitted** 0.1 work
  (the migration `20260530000000_…`, `supabase/tests/`, and doc edits). Preserve it first.
- All commands run from `prolific-hr-app/`.

---

## Step 0 — Safety net (non-destructive; do this first)
Create backup tags so every current branch tip is recoverable no matter what:
```bash
git tag backup/main-pre-reconcile main
git tag backup/phase0-pre-reconcile phase-0/rls-and-tenant-guard-audit
git tag backup/phase01-pre-reconcile phase-0.1/rls-legacy-policy-remediation
git tag --list 'backup/*'   # confirm 3 tags exist
```

## Step 1 — Preserve the uncommitted 0.1 work (so nothing is lost on checkout)
The hotfix is currently untracked. Commit it to its own branch before switching away:
```bash
git add supabase/migrations/20260530000000_phase01_rls_legacy_policy_remediation.sql \
        supabase/tests/
# Decide per the 0.1 handoff whether to keep the `supabase init` scaffolding:
#   supabase/config.toml, supabase/.gitignore  (flagged as "retain?" by the implementer)
git commit -m "wip(phase-0.1): RLS legacy-policy remediation migration + RLS suite (pre-reconcile snapshot)"
git status   # working tree should now be clean except possibly the space-folder doc edits (Step 4)
```
> NOTE: the doc edits the implementer made live in the **space** folder `docs/Project Docs/`.
> Leave them for Step 4 — they get relocated to the underscore folder after reconciliation.

## Step 2 — Reconcile `main` (the fast-forward)
```bash
git checkout main
git merge --ff-only f6d4216      # fast-forward ONLY; aborts if it can't (it can — verified)
git log --oneline -1             # expect: f6d4216 ... documentation audit promotion
```
> Do **NOT** merge `99f5d7a` and do **NOT** merge the whole `phase-0/...` branch — either
> would drag Phase 1 WIP into `main`. The target is `f6d4216`, nothing above it.

## Step 3 — Verify `main` now matches production (the gate)
```bash
# (a) main must NOT contain Phase 1 code:
git ls-files supabase/functions/convert-applicant supabase/functions/_shared/identity.ts
#     → expect EMPTY output.

# (b) main's newest migration must be 20260529000000:
ls supabase/migrations | tail -3
#     → newest = 20260529000000_onboard_trigger_service_role_auth.sql (NO 20260530000001/2)

# (c) AUTHORITATIVE: local migrations vs the remote prod ledger must align:
supabase migration list
#     → every migration through 20260529000000 shows in BOTH Local and Remote columns,
#       with no "local only" / "remote only" gaps. THIS is the proof main == prod.

# (d) app still builds:
npm run build
```
If (c) shows any mismatch, STOP and reconcile the specific gap before pushing — do not force.

## Step 4 — Resolve the duplicate docs folder
Reconciled `main` (`f6d4216`) carries the documentation-governance rename → the canonical
folder is `docs/Project_Docs/` (underscore). The space folder `docs/Project Docs/` is legacy.
- Move any still-relevant 0.1 doc edits from `docs/Project Docs/` (space) into
  `docs/Project_Docs/` (underscore), then remove the space folder.
- This satisfies the governance path rule (underscore only) and ends the duplication.

## Step 5 — Publish the reconciled trunk (git push — NOT db push)
```bash
git push origin main             # fast-forward push; safe (main only moved forward)
```
> No `supabase db push` is needed here: production already has every one of these migrations
> applied. Reconciliation aligns the *source* to the *database*, not the other way around.

---

## After reconciliation (separate, sequenced — see the security backlog)
1. **Re-base `phase-0.1` onto the reconciled `main`**, then **rebuild its disposable-DB test
   from the full schema** (it was validated against stale `main`, missing 14 migrations) and
   re-run green + `get_advisors(security)` ERROR-clean. Then deploy 0.1.
2. **Deploy the Phase 0 EF code** (`supabase functions deploy …`) so prod's running functions
   match `main` (retires the latent `onboard-employee` hardcoded-tenant fallback).
3. **Phase 1**: re-base the `99f5d7a` WIP onto reconciled `main` + 0.1; deploy `…530000001/2` last.

## Guardrails / do-NOT
- Do **not** fast-forward/merge to `99f5d7a` or merge the whole `phase-0/...` branch (pulls in Phase 1).
- Do **not** run `supabase db push` during reconciliation (no DB change is intended).
- Do **not** force-push `main`.
- Do **not** start building features on `main` until Step 3 (c) passes.
- Keep the `backup/*` tags until 0.1 + Phase 1 are safely deployed.

## Going-forward discipline (prevents recurrence)
- Production is deployed **only from `main`**.
- Every migration merges to `main` **before/with** its `db push`.
- `supabase migration list` (local == remote) and `get_advisors(security)` (ERROR-clean) are
  **mandatory pre-deploy gates**.
- No long-lived feature branch as a deploy source; reconcile `main` continuously.
