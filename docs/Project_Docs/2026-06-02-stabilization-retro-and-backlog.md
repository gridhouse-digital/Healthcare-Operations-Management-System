# Stabilization Retro + Prioritized Backlog (2026-06-02)

> Orienting doc for the next session. Captures the foundation-stabilization arc that ran
> 2026-05-30 → 06-02, the verified end-state, the guardrails now in place, and the prioritized
> backlog. Phase status: **Phase 1 (Lifecycle Stabilization) is DONE and DEPLOYED.** Phase 2
> (macro-domain refactor) not started.

---

## 1. What shipped (the arc)

What began as "validate one RLS hotfix" uncovered — and fixed — a stack of foundational gaps.
In order:

1. **Phase 0.1 — cross-tenant RLS leak (DEPLOYED, advisor-verified, 5 ERRORs → 0).**
   Dropped surviving Epic-0 allow-all policies on `applicants`/`offers`/`ai_cache`/`ai_logs`
   (permissive-OR defeated tenant isolation); tenant-scoped the `resumes` + `compliance-documents`
   storage reads. Migrations `20260530000000/1/2`.
2. **SECURITY DEFINER view leak (in 0.1 B).** 5 compliance views (`v_training_compliance`,
   `v_active_training_compliance`, `v_onboarding_training_compliance`, `v_recurring_compliance_status`,
   `v_recurring_compliance_audit`) bypassed RLS → set `security_invoker = on`.
3. **Function-grant hardening (0.1 C + C2).** Revoked anon/authenticated EXECUTE on pgcrypto
   wrappers, audit/trigger functions, and role helpers; pinned `search_path` on 17 SECURITY DEFINER
   functions. Migration `20260530000002`.
4. **Trunk reconciliation.** `main` was **14 migrations behind production** (prod deployed from a
   feature branch, never merged back). Fast-forwarded `main` to `f6d4216`. `main == prod`.
5. **Fresh-DB bootstrap fixes.** Epic-5.7 backfill `raise`d on empty `tenants`; `audit_ai_cache()`
   referenced `NEW.id` (PK is `input_hash`). Both fixed → a clean DB now boots from scratch (DR/CI
   insurance). Migrations `20260601000000/1`.
6. **P0 — `ai-summarize-applicant` cross-tenant write + SSRF (FIXED, deployed v30).** Tenant came
   from a spoofable `x-tenant-id` header; service-role `UPDATE` filtered by `id` only; `fetch()` of a
   body-supplied `resume_url`. Now: JWT-only tenant, `(id, tenant_id)`-verified, scoped write,
   DB-sourced URL + host allowlist. Confirmed via a systemic service-role-write audit (it was the
   lone genuine same-class bug).
7. **Orphan EF cleanup.** Undeployed `cleanup-old-submissions` (a re-armable cross-tenant
   mass-delete invisible to every gate) + 3 dead legacy EFs (`admin-update-user`, `invite-user`,
   `approve-profile-request`).
8. **CI established (there was NONE).** New `.github/workflows/ci.yml` — 4 gates: Frontend
   (lint advisory + build), Edge Functions (deno check + tests), **Tenant Isolation** (fresh-DB
   apply + RLS suite), **Migration Parity** (local migrations == deployed ledger).
9. **Phase 1 — Lifecycle Stabilization (DEPLOYED).** Single server-side conversion authority
   (`convert-applicant`), one identity-reconciliation service, fail-closed `employee-status-resolver`,
   separate `compliance_state` column, narrowed `onboard-employee`, read-only P3 diagnostics.
   Migrations renumbered `…0530000001/2` → **`20260601000002/3`** to dodge the silent-skip collision.

## 2. Verified end-state (the consistency triangle)

**source (`main`) == database (ledger) == deployed functions** — machine-verified:
- Ledger latest `20260601000003`; `identity_collisions` table + `people.compliance_state` exist.
- Deployed: `convert-applicant` v1, `onboard-employee` v22, `sync-wp-users` v11, `ai-summarize-applicant` v30.
- `get_advisors(security)`: **0 ERRORs**; residual WARNs are intentional (`respond_to_offer` anon),
  required (`storage_obj_in_caller_tenant` authenticated), or an owner toggle (leaked-password).
- CI green on `main`, **Migration Parity truthful** (red-after-merge → deploy → green confirmed the deploy).

## 3. Guardrails now in place (durable — don't regress these)

- **CI is the gate.** Every push runs lint/build + deno tests + fresh-DB RLS isolation + migration parity.
- **Deploy only from `main`;** every migration merges before/with `db push`; `migration list` parity
  is a pre-deploy gate; `get_advisors` ERROR-clean before declaring isolation done.
- **Deploy-follows-merge:** a red parity gate after merge is the system working — deploy to clear it.
- **Verify against reality, not reports.** This session killed a unanimous-but-wrong P0 (CV-1) and
  confirmed three real ones by reading the live code/DB. Keep that discipline.
- **`.gitignore` blind spot:** `ai-summarize-applicant/` is git-ignored → `rg`/Grep silently skip it.
  Audit security with `rg --no-ignore`.

## 4. Prioritized backlog (none urgent; all tracked)

| # | Item | Type | Priority | Effort | Notes |
|---|---|---|---|---|---|
| 1 | **`compliance_state` enforcement** | Feature / compliance | **High (next milestone)** | M–L | Column is **inert** today — nothing computes or gates on it. Compute it (recurring-compliance engine) + make it the "cleared to work" gate. Lifecycle (`employee_status`) ≠ clearance (`compliance_state`) — contract confirmed 2026-06-02. |
| 2 | **Smoke-test convert→onboard trigger chain** | Verification | High | S | Accept an offer → `on_offer_accepted` fires `convert-applicant` → tenant-scoped `people` row → `onboard-employee` provisions. Only thing between "deployed" and "deploy-verified" for Phase 1. |
| 3 | `sync-training` sole-writer check | Correctness | Med | S | `sync-training/index.ts:663` writes `employee_status` inline; Q2 makes the resolver the sole writer. Confirm it routes via `writeEmployeeStatus()`. |
| 4 | EF-list-vs-repo reconciliation check in CI | Safety / hygiene | Med | S | Closes the "deployed-only artifact invisible to gates" blind spot that hid the orphan EFs. |
| 5 | Lint cleanup (79 `src/` violations) → make lint blocking | Hygiene | Med | M | Lint is `continue-on-error` in CI; clean then enforce. |
| 6 | `jotform-webhook` HMAC/secret verification | Hardening | Med | S | Spoofing gap (anyone with a form ID can forge into that tenant) — not an isolation break. |
| 7 | Delete `_shared/context.ts` (`getContext` / `x-tenant-id`) | Cleanup | Low | XS | Now unused after the P0 fix; remove the footgun. |
| 8 | Bump Node-20 GitHub Actions (`checkout@v4` etc.) | Hygiene | Low | XS | Cosmetic until the June-2026 deadline. |
| 9 | Existing-employee `employee_status`/`hired_at` backfill (§5 stale-Active) | Data | Low (pre-launch) | M | Separate risk-managed task; only if real existing rows need re-resolution. |
| 10 | **Pre-launch compliance gate** | Compliance / infra | **Blocks launch, not dev** | L | BAA, HIPAA/PHIPA posture, **Supabase Pro upgrade** (unlocks preview-branch validation + **PITR backups** — currently none), encryption/retention/access/breach review. |

## 5. How the next session should start

1. Read this doc + `docs/Project_Docs/DECISIONS.md` + the source-of-truth (`docs/architecture/…`,
   `docs/current/…`).
2. State of play: **Phase 1 done/deployed; Phase 2 not started.** CI is the gate; deploy from `main` only.
3. Recommended next phase: **`compliance_state` enforcement** (backlog #1) — it turns the
   lifecycle/clearance model from scaffolding into an enforced healthcare control. Do the smoke
   test (#2) first to close out Phase 1.
