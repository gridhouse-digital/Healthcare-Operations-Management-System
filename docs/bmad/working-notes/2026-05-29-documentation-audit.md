# HOMS Documentation Audit — Working Note

> [!IMPORTANT]
> **STATUS: WORKING NOTE — AWAITING OWNER PROMOTION**
> Per `documentation-governance.md` §6, this BMAD output is a working note by default and is
> **not** official until the product owner reviews and approves it. Promotion requires placement in
> the correct canonical location, a hierarchy update if authority changes, and a `PROJECT_LOG.md` entry.

> **Date:** 2026-05-29
> **Author:** BMAD party-mode roundtable (Paige, Mary, John, Winston) — orchestrated
> **Mode:** Documentation-governance only. No application code touched.
> **Owner:** Mr Grid
> **Governed by:** `docs/bmad/documentation-governance.md` · `docs/current/homs-current-source-of-truth.md`

---

## 1. Executive Summary

The HOMS documentation corpus was audited across the two physical locations defined by governance:
the **canonical app folder** (`prolific-hr-app/docs/`) and the **parent workspace folder**
(`Prolific-HR-Command-Centre/docs/`).

**Headline finding:** ~95% of the audit was already settled by the source-of-truth hierarchy. The
canonical tree is correctly classified. The parent-folder tree is a **near-total stale mirror** of the
canonical tree — 8 "current" docs are MD5 byte-identical; the rest are older-dated duplicates. The
**only unique content** in the parent folder was two recurring-compliance planning drafts, now confirmed
as the shipped design baseline and rescued into canonical.

**Net actions taken (all inside the governance fence):**
1. Copied the 2 unique drafts into `prolific-hr-app/docs/plans/` with provenance headers.
2. Created a stale-mirror warning pointer at the parent `docs/` root (`SUPERSEDED.md`).
3. Authored this audit memo (working note).

**Decisions still requiring owner ruling:** see §6.

---

## 2. Evidence Base

| Check | Result |
|---|---|
| App-folder `docs/` file count | 50 markdown files (canonical tree) |
| Parent "current" architecture/audit/product docs vs canonical | **8 of 8 MD5 byte-identical** |
| Parent `Project Docs/` (space-named), `Archive/`, `plans/` | older-dated or identical duplicates of canonical |
| Files unique to parent folder (exist nowhere in canonical) | **2** (the Epic 5.9 recurring-compliance drafts) |
| Epic 5.9 implementation claims verified in live codebase | **All confirmed** (see §4) |

---

## 3. Final Disposition

| Item | Disposition | Action |
|---|---|---|
| App-folder canonical tree (hierarchy rank 1–7) | **Current** | No change |
| `Project_Docs/` DECISIONS.md, SCHEMA.md, ISSUES.md (2026-05-28) | **Current** | *Propose* adding to hierarchy as rank-5 companions (owner ranks) |
| `Project_Docs/` RUNBOOK.md, INTEGRATIONS.md, CLAUDE.md, DESIGN_SYSTEM.md | **Current-but-stale** | *Propose* `[FRESHNESS REVIEW REQUIRED]` header tag |
| `Project_Docs/BADIDEAS_PITCH_HOM.md` | **Archive** (rejected-ideas scratchpad) | *Propose* (owner confirms) |
| App-folder `Archive/` (16 files) + `plans/` (15 files) | **Confirm Archived** | No-op (already governance-classified historical) |
| **2 Epic-5.9 drafts** (parent-only) | **Rescued → canonical `docs/plans/`** | ✅ **Done** — copied with provenance headers |
| Parent `docs/` tree (stale mirror) | **Retained local + warning pointer** | ✅ **Done** — `SUPERSEDED.md` created (owner: files remain local, no delete) |
| Master spec Appendix A OneDrive `file:///` paths | **Conflict — owner decision** | *Propose* rewrite to canonical relative paths |

---

## 4. Epic 5.9 Drafts — Verification of Shipped Status

The two parent-only drafts (`2026-03-11-annual-review-recurring-compliance-spec.md` and
`2026-03-11-epic59-recurring-compliance-implementation-plan.md`) were confirmed by the owner, and
**independently verified against the live codebase**, as the design baseline of a shipped, hardened
subsystem. The "Epic 5.9" label was a placeholder; the work was renumbered and shipped across
**Stories 5.11–5.17 of Epic 5**.

| Claimed artifact | Verified present |
|---|---|
| Schema migration `20260311000007_epic59_recurring_compliance_schema.sql` | ✅ |
| Hardening migration `20260528000001_story511_story512_reentry_supersession.sql` (adds `v_recurring_compliance_audit`) | ✅ |
| EF `rebuild-compliance-instances` | ✅ |
| EF `backfill-recurring-compliance-anchors` | ✅ |
| EF `manage-recurring-compliance-instance` (Story 5.17 manual overrides) | ✅ |
| `TrainingComplianceRulesPage.tsx` (route `/settings/training-rules`) | ✅ |
| `RecurringComplianceDashboard.tsx` (route `/training`) | ✅ |

Disposition: **historical design baseline**, re-homed into canonical `docs/plans/` alongside the
epic-4/epic-5 plan siblings. Each canonical copy carries a provenance/historical-baseline header.

---

## 5. Roundtable Positions (for the record)

- **📚 Paige (Tech Writer):** Parent folder is an "echo," not a second opinion. Handle at the folder
  level with one superseded pointer rather than tagging 50 duplicates. Rank the three fresh
  `Project_Docs` files; freshness-flag the four stale ones; archive the pitch doc.
- **📊 Mary (Analyst):** The duplicate mirror is a *trap* — byte-identical copies defeat freshness
  heuristics, so an agent could cite the older parent copy as current. Recommended escalating parent
  from "untrusted" to "quarantined w/ pointer." Surfaced (not resolved) the OneDrive Appendix-A conflict
  and the unranked `Project_Docs` files.
- **📋 John (PM):** Don't dress re-classification up as audit. Two real deliverables only: neutralize the
  duplicate trap, and decide the 2 orphan drafts (framed as a Phase-1 scope question — now answered: in scope, shipped).
- **🏗️ Winston (Architect):** Root cause is most likely a copy-paste subdir migration, with OneDrive as a
  resurrection risk. The load-bearing unknown was whether a parent-level `.git` exists (divergent-history
  hazard). With the owner's decision that the mirror **stays local**, the durable "collapse to one tree" fix
  is off the table; the warning pointer becomes the durable handling for a permanent mirror.

---

## 6. Open Decisions for Owner — ALL APPROVED & EXECUTED 2026-05-29

The owner approved all five. Executed as logged governance actions:

1. ✅ **Hierarchy placement** — `DECISIONS.md`, `SCHEMA.md`, `ISSUES.md` tagged **rank-5** via header notes.
2. ✅ **Freshness review** — `[FRESHNESS REVIEW REQUIRED]` `[!CAUTION]` headers added to `RUNBOOK.md`, `INTEGRATIONS.md`, `Project_Docs/CLAUDE.md`, `DESIGN_SYSTEM.md`. (Verification pass still to be scheduled.)
3. ✅ **Archive** — `BADIDEAS_PITCH_HOM.md` moved `Project_Docs/ → Archive/` via `git mv` (history preserved) + archival note added.
4. ✅ **Master spec Appendix A** — six OneDrive `file:///` links rewritten to canonical relative paths.
5. ✅ **BMAD status corrections** — `homs-current-source-of-truth.md` (§0) and `documentation-governance.md` (§10) updated to "BMAD installed and running, doc-governance-scoped." (Root + app `CLAUDE.md` already corrected previously.)

**Still open (follow-up, not blocking):** schedule the actual freshness-verification pass for the four flagged docs.

---

## 7. Promotion Checklist

- [x] Owner reviews and approves this memo (all 5 decisions approved 2026-05-29)
- [x] Tag the three fresh `Project_Docs` files as rank-5 (header notes added; governance §4 table update still pending — see below)
- [x] Apply `[FRESHNESS REVIEW REQUIRED]` tags to the four stale docs
- [x] Confirm/execute `BADIDEAS_PITCH_HOM.md` archive
- [x] Rewrite master spec Appendix A paths
- [x] Apply BMAD-status corrections across governance / source-of-truth / CLAUDE.md
- [x] **Update the governance §4 hierarchy TABLE** to list DECISIONS/SCHEMA/ISSUES at rank 5 (done by owner — table authority line widened to "schemas, and core decisions")
- [x] Record the promotion + these edits in `docs/Project_Docs/PROJECT_LOG.md` (done by owner)
- [ ] Schedule the freshness-verification pass for RUNBOOK / INTEGRATIONS / Project_Docs CLAUDE / DESIGN_SYSTEM — **only remaining follow-up**

> **Promotion complete (2026-05-29):** This working note is now fully promoted per governance §6
> (owner-approved, canonical placement, §4 hierarchy updated, PROJECT_LOG recorded). The sole open
> item is the content freshness pass on the four flagged docs.
