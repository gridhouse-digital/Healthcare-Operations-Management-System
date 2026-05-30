# HOMS — Current Source of Truth

> **Status**: Active index
> **Purpose**: The authoritative, at-a-glance list of which documents are current and trusted for HOMS, what agents should read first, and what must not be trusted without review.
> **Governed by**: [`docs\bmad\documentation-governance.md`](../bmad/documentation-governance.md)
> **Last updated**: 2026-05-29

---

## ⚠️ BMAD Prerequisite Note

- Phase 0 tenant-guard remediation is **complete, pushed, and merged into `main`**.
- **Phase 0 gate is MET.**
- **Phase 1 has not started.**
- **BMAD is installed and running.** It is scoped to **documentation, brainstorming, review, and handoff planning only**. BMAD must not modify application code unless explicitly instructed.
- Before using BMAD for any task, agents **must** read, in order:
  1. `docs/architecture/homs-platform-expansion-implementation-spec.md`
  2. `docs/current/homs-current-source-of-truth.md`
  3. `docs/bmad/documentation-governance.md`
  4. `docs/bmad/agent-handoff-template.md`
- BMAD is intended for **documentation governance, brainstorming, architecture review, PRD refinement, phase planning, and agent handoff prompts**.
- **BMAD must not modify application code unless explicitly instructed.**
- **Old docs outside the app folder are untrusted until reviewed.**
- **Folk Care is reference only — do not copy code from it.**

---

## 0. Canonical Paths

| Role | Path |
|---|---|
| **Primary app folder** (canonical — always start here) | `C:\dev\Prolific-HR-Command-Centre\prolific-hr-app` |
| **Parent project folder** (fallback only) | `C:\dev\Prolific-HR-Command-Centre` |

**Path lookup rule:** Start every documentation lookup in the **app folder**. Only fall back to the **parent project folder** if a referenced file is not found in the app folder. Do not assume a missing file is deleted until **both** locations have been checked.

**Approved project-docs path:** `docs\Project_Docs\` (underscore). The space-named `docs\Project Docs\` is **not** approved and must not be used in new references.

---

## 1. Master Implementation Spec (Primary Source of Truth)

- **`docs\architecture\homs-platform-expansion-implementation-spec.md`** — the single highest authority. All architecture, ADRs, phasing, scope, and platform-evolution decisions flow from here. When anything conflicts with this spec, **this spec wins.**

---

## 2. Current Phase 0 Status

- **Phase 0 tenant-guard remediation: COMPLETE.** Completed, pushed, and merged into `main`.
- **Phase 0 gate: MET.**
- Authoritative Phase 0 reference: **`docs\audits\phase-0-edge-function-tenant-guard-audit.md`**.
- **Phase 1 has NOT started.**

---

## 3. Current Capability / Domain / Gap Docs

These describe the **current, implemented** state of HOMS:

- **`docs\audits\homs-current-capability-map.md`** — what HOMS can do today.
- **`docs\architecture\homs-current-domain-map.md`** — current domain/structure map.
- **`docs\audits\homs-gap-register.md`** — known gaps between current and planned.
- **`docs\product\homs-existing-platform-summary.md`** — plain-language summary of what exists today.

---

## 4. Current Architecture Docs

- **`docs\architecture\homs-platform-expansion-implementation-spec.md`** (master — see §1).
- **`docs\architecture\homs-current-domain-map.md`** — current domains.
- **`docs\architecture\homs-jotform-replacement-strategy.md`** — JotForm replacement strategy.

---

## 5. Phase-Specific Docs

- **`docs\audits\phase-0-edge-function-tenant-guard-audit.md`** — Phase 0 (complete).
- **`docs\Project_Docs\SPRINT_PLAN.md`** — current epic/story status and acceptance criteria.
- **`docs\Project_Docs\PROJECT_LOG.md`** — authoritative record of what shipped, broke, and is next.

---

## 6. Planned (NOT Implemented)

The following are **planned capabilities only**. They are documented as targets, not as shipped functionality:

- **Care Ops** — planned, not implemented.
- **Staff App** (Care Assistant) — planned, not implemented.
- **EVV** — planned, not implemented.
- **Family Portal** — planned, not implemented.
- **Billing** — planned, not implemented.
- **Payroll** — planned, not implemented.

Reference (target only): **`docs\audits\homs-planned-capability-map.md`**. This document, and any forward-looking section of the master spec, **must not be read as describing implemented features.**

---

## 7. What Agents Should Read First

In order:

1. [`docs\bmad\documentation-governance.md`](../bmad/documentation-governance.md) — the rules.
2. `docs\architecture\homs-platform-expansion-implementation-spec.md` — the master spec.
3. This file (`docs\current\homs-current-source-of-truth.md`) — what's current.
4. `docs\audits\phase-0-edge-function-tenant-guard-audit.md` — Phase 0 state.
5. `docs\Project_Docs\PROJECT_LOG.md` and `docs\Project_Docs\SPRINT_PLAN.md` — what shipped and what's next.
6. The current capability/domain/gap docs (§3) relevant to the task.

---

## 8. What Agents Should NOT Trust Without Review

- **Any document found only in the parent project folder** (`C:\dev\Prolific-HR-Command-Centre`, including its `docs\Project Docs\`, `docs\Archive\`, `docs\plans\`, etc.). Treat as **untrusted until reviewed**.
- **`docs\Archive\`** (app folder) — historical only.
- **`docs\plans\`** (app folder, e.g. epic 4/5/6 plan files) — historical only.
- **`docs\audits\homs-planned-capability-map.md`** — planned, not implemented (§6).
- Any doc that contradicts the master spec — the spec wins; the other is flagged for review.

These may only become trusted/current through the review and promotion process in the governance file (§6–§7 there).

---

## 9. Standing Statements

- **Phase 1 has not started.**
- **Care Ops, Staff App, EVV, Family Portal, Billing, and Payroll are planned, not implemented.**
- **Old docs outside the app folder are untrusted until reviewed.**
- **`docs\Project_Docs\` is the approved project docs path** (not `docs\Project Docs\`).
- **Folk Care is reference only — no code is copied from it.**
