# HOMS Documentation Governance

> **Status**: Active
> **Owner**: Product owner / lead maintainer
> **Applies to**: All human contributors and all AI agents (Claude, Cursor, Codex, BMAD agents)
> **Last updated**: 2026-05-29

---

## 1. Purpose

This document defines how documentation is governed for HOMS (Healthcare Operations Management System). Its job is to establish a **single, unambiguous source of truth** for the BMAD framework, which is now installed and running.

HOMS has accumulated documentation across multiple locations and dates. Some of it is current and trusted, some is stale, some describes *planned* capabilities that do not yet exist, and some lives outside the canonical app folder. Without governance, AI agents and humans will treat conflicting or aspirational docs as fact.

This governance file exists to prevent that. It tells every reader — human or agent — **which documents to trust, in what order, and under what conditions.**

BMAD is scoped to: documentation governance, brainstorming, architecture review, PRD refinement, phase planning, and agent handoff prompts. **BMAD must NOT modify application code unless explicitly instructed.** Code-writing BMAD skills (e.g. `bmad-dev-story`, `bmad-quick-dev`, `bmad-create-story`, `bmad-dev` agent implementation) are out of scope unless the user explicitly directs a code change.

---

## 2. Canonical Locations & Path Lookup Rule

There are two physical locations involved:

| Role | Path |
|---|---|
| **Primary app folder** (canonical) | `C:\dev\Prolific-HR-Command-Centre\prolific-hr-app` |
| **Parent project folder** (fallback / historical) | `C:\dev\Prolific-HR-Command-Centre` |

**Path lookup rule (mandatory for all agents):**

1. Start **all** documentation lookups inside the **app folder**: `C:\dev\Prolific-HR-Command-Centre\prolific-hr-app\docs`.
2. Only if a referenced folder, document, archive, old planning artifact, or Folk Care reference is **not found** in the app folder, then check the **parent project folder**: `C:\dev\Prolific-HR-Command-Centre`.
3. **Do not assume a missing file has been deleted until both locations have been checked.**

Documents found *only* in the parent folder are **untrusted until reviewed** (see §7).

---

## 3. Folder Naming Rule

The project documentation folder was renamed:

- ❌ Old (do not use): `docs\Project Docs\` (with a space)
- ✅ Approved (use this): `docs\Project_Docs\` (with an underscore)

**All new documentation references must use `docs\Project_Docs\`.** Do not introduce the space-named folder in any new file, reference, or path. The approved app-folder docs (`PROJECT_LOG.md`, `SPRINT_PLAN.md`, etc.) live under `docs\Project_Docs\`.

> Note: A legacy `docs\Project Docs\` (space) folder may still exist under the **parent** project folder. It is historical only and must not be referenced going forward.

---

## 4. Source-of-Truth Document Hierarchy

When two documents conflict, the **higher** entry wins.

| Rank | Document | Path (relative to app folder) | Authority |
|---|---|---|---|
| 1 | **Master implementation spec** | `docs\architecture\homs-platform-expansion-implementation-spec.md` | **Primary source of truth.** Architecture, ADRs, phasing, and scope decisions. |
| 2 | Phase 0 tenant-guard audit | `docs\audits\phase-0-edge-function-tenant-guard-audit.md` | Authoritative for Phase 0 security/remediation state. |
| 3 | Project log | `docs\Project_Docs\PROJECT_LOG.md` | Authoritative record of what actually shipped/broke. |
| 4 | Sprint plan | `docs\Project_Docs\SPRINT_PLAN.md` | Authoritative for current epic/story status. |
| 5 | Current capabilities & core project docs | `docs\Project_Docs\DECISIONS.md`, `docs\Project_Docs\SCHEMA.md`, `docs\Project_Docs\ISSUES.md`, `docs\audits\homs-current-capability-map.md`, `docs\architecture\homs-current-domain-map.md`, `docs\audits\homs-gap-register.md` | Authoritative for *current* (implemented) state, schemas, and core decisions. |
| 6 | Planned capability map | `docs\audits\homs-planned-capability-map.md` | Describes **planned**, not implemented, capabilities. Read as a target, never as fact. |
| 7 | Strategy / supporting architecture | `docs\architecture\homs-jotform-replacement-strategy.md`, `docs\product\homs-existing-platform-summary.md` | Supporting context. |
| — | Everything else (Archive, old plans, parent-folder duplicates) | see §6, §7 | Historical / untrusted until revalidated. |

When the master spec (rank 1) and any lower document disagree, **the master spec wins** and the lower document is flagged for review.

---

## 5. Document Classification

Every doc falls into exactly one of these classes:

### Current (trusted)
Lives in the app folder, is referenced in §4, and reflects the present implemented or formally-approved-planned state. Safe to read and rely on (subject to the planned-vs-implemented warning in §8).

### Working notes (in progress)
Drafts, brainstorms, and BMAD outputs that have **not** been promoted (see §9). Useful but not authoritative. Must be visibly marked as draft/working.

### Archived (historical)
Superseded by a newer current doc but kept for history. In the app folder this includes `docs\Archive\` and `docs\plans\`. **Historical only** — see §8.

### Superseded (replaced)
A document explicitly replaced by a newer one. Must carry a pointer to its replacement. **Historical only** — see §8.

---

## 6. How BMAD Outputs Become Official Documentation

BMAD produces brainstorms, PRDs, architecture reviews, phase plans, and handoff prompts. These are **working notes by default** and are **not** official until promoted.

Promotion rules:

1. A BMAD output starts as a **working note** (clearly labeled draft).
2. It becomes **official** only when:
   - the product owner / maintainer reviews and approves it, **and**
   - it is placed in the correct canonical app-folder location, **and**
   - the source-of-truth hierarchy (§4) is updated if the new doc changes authority, **and**
   - `docs\Project_Docs\PROJECT_LOG.md` records the promotion.
3. If a BMAD output contradicts a higher-ranked current doc, it **cannot** be promoted until the conflict is resolved in favor of the hierarchy (or the hierarchy is deliberately changed by the owner).
4. BMAD outputs must **never** silently overwrite a current doc. Replacement is an explicit, logged action that marks the old doc **superseded** (§5) with a pointer to the new one.

---

## 7. Rules for Reviewing Old Documentation

1. Old docs are reviewed, never trusted on sight.
2. A doc found **only** in the parent project folder is **untrusted until reviewed**, even if its name matches a current doc.
3. When an old doc agrees with the master spec and current docs, it may be promoted to **current** or left as **archived** (owner's call) — and the decision is logged.
4. When an old doc conflicts with the master spec, the **master spec wins**; the old doc is marked **superseded** with a pointer.
5. Reviewing is a deliberate, logged action. Do not move, rename, or delete old docs as a side effect of review during this governance phase (see §10).

---

## 8. Mandatory Warnings

**⚠️ Planned ≠ implemented.**
Documents describing planned capabilities (notably `docs\audits\homs-planned-capability-map.md` and forward-looking sections of the master spec) describe a *target*. They must **never** be treated as describing shipped functionality. Care Ops, Staff App, EVV, Family Portal, Billing, and Payroll are **planned, not implemented.**

**⚠️ Archived and superseded docs are historical only.**
Anything classified Archived or Superseded (including `docs\Archive\`, `docs\plans\`, and any parent-folder duplicates) is historical context **only**. It must **not** be cited as current truth unless it has been **explicitly revalidated** and re-promoted under §6/§7.

**⚠️ Folk Care is reference only.**
Folk Care (located at `C:\dev\Prolific-HR-Command-Centre\folk care\`) is used **only as reference architecture**. **No code may be copied from Folk Care into HOMS.** This matches ADR scope in the master spec ("Folk Care is used only as reference architecture. No code is copied."). Folk Care docs are not part of the HOMS source-of-truth hierarchy.

---

## 9. Rules for AI Agents Reading Docs

All agents (including BMAD agents) must:

1. **Read in hierarchy order.** Start with the master implementation spec (§4 rank 1), then the relevant current docs for the task.
2. **Apply the path lookup rule** (§2): app folder first, parent folder only as fallback, and never assume deletion before checking both.
3. **Use `docs\Project_Docs\`** in every reference (§3). Never emit the space-named path.
4. **Never treat planned capabilities as implemented** (§8). When unsure whether something exists, check `PROJECT_LOG.md` and the current capability map, not the planned map.
5. **Treat parent-folder-only and Archive/plans docs as untrusted/historical** until reviewed (§7, §8).
6. **Never copy code from Folk Care** (§8).
7. **Do not modify application code** unless the task explicitly authorizes it. BMAD's default mode is documentation/governance, not implementation.
8. **Produce outputs as working notes** unless explicitly told to promote (§6).
9. When a conflict is found, **stop and surface it** (cite both documents and the hierarchy rank) rather than silently picking one.

---

## 10. Standing Constraints During This Governance Phase

Until further notice:

- Do **not** modify application code.
- Do **not** move old docs (the only allowed move — the `docs\Project Docs` → `docs\Project_Docs` rename — is already complete in the app folder).
- Do **not** delete old docs.
- Do **not** start Phase 1.
- BMAD **is installed and running**, scoped to documentation, brainstorming, review, and handoff planning only. It must **not** modify application code unless explicitly instructed. (These governance files were the prerequisite and are now in force.)

---

## 11. Related Documents

- Current source of truth index: [`docs\current\homs-current-source-of-truth.md`](../current/homs-current-source-of-truth.md)
- Agent handoff template: [`docs\bmad\agent-handoff-template.md`](./agent-handoff-template.md)
- Master spec: [`docs\architecture\homs-platform-expansion-implementation-spec.md`](../architecture/homs-platform-expansion-implementation-spec.md)
