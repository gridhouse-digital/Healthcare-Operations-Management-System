# BMAD Agent Handoff Template

> **Purpose**: A reusable task brief for handing work to an AI agent (Claude, Cursor, Codex, or a BMAD agent). Copy this file, fill in every section, and remove the guidance notes in _italics_ before handoff.
> **Governed by**: [`docs\bmad\documentation-governance.md`](./documentation-governance.md)
> **Read first**: [`docs\current\homs-current-source-of-truth.md`](../current/homs-current-source-of-truth.md)

---

## Task Name
_A short, unique, descriptive name. e.g. "Phase 1 — PRD refinement for Care Ops module"._

## Phase
_Which phase this belongs to (e.g. Phase 0, Phase 1). State explicitly if the phase has not started._

## Objective
_One or two sentences. What outcome does success produce?_

## Source-of-Truth Docs
_List the exact docs the agent must read, in priority order. Use the hierarchy in the governance file. Always use `docs\Project_Docs\` (underscore), never `docs\Project Docs\`._
- Primary: `docs\architecture\homs-platform-expansion-implementation-spec.md`
- Current state index: `docs\current\homs-current-source-of-truth.md`
- _(add task-specific docs, e.g. `docs\Project_Docs\SPRINT_PLAN.md`, `docs\Project_Docs\PROJECT_LOG.md`)_

## Workspace Path
_Canonical app folder — always start lookups here._
`C:\dev\Prolific-HR-Command-Centre\prolific-hr-app`

## Fallback Project Path
_Only use if a referenced file is not found in the app folder. Do not assume a file is deleted until both are checked. Docs found only here are untrusted until reviewed._
`C:\dev\Prolific-HR-Command-Centre`

## Context
_Background the agent needs: what just happened, why this task exists, dependencies, current status (e.g. "Phase 0 gate is MET; Phase 1 has not started"). Note that Care Ops, Staff App, EVV, Family Portal, Billing, and Payroll are planned, not implemented._

## Scope
_Exactly what the agent IS allowed to do. Be specific and bounded._

## Out-of-Scope
_Exactly what the agent must NOT do. Defaults below — keep unless the task explicitly overrides:_
- Do **not** modify application code (unless this brief explicitly authorizes it).
- Do **not** start a new phase that hasn't been approved.
- Do **not** delete or move old docs.
- Do **not** copy any code from Folk Care (reference only).
- Do **not** treat planned capabilities as implemented.
- Do **not** promote outputs to official docs without owner approval (see governance §6).

## Files Likely Affected
_Best-guess list of files/folders the task will touch. For doc-only tasks, list the doc paths. For "none," say none._

## Implementation Constraints
_Coding/structure rules if any code is in scope. Otherwise state "Documentation only — no code changes." Reference relevant project rules (multi-tenancy, RLS, idempotency, audit) from CLAUDE.md and the master spec when applicable._

## Security / Compliance Constraints
_HOMS is compliance-grade and multi-tenant. Note any that apply, e.g.:_
- `tenant_guard()` must be the first call in every Edge Function; `tenant_id` only from JWT `app_metadata`.
- No PHI/ePHI handling until BAA/HIPAA-PHIPA posture is confirmed.
- Never expose `*_encrypted` columns or store signed URLs in the DB.
- All writes to tenant-scoped tables must be audit-logged.
- _(add task-specific constraints)_

## Validation Commands
_Exact commands to prove the work is correct. For doc tasks, this may be a review checklist. Examples:_
```bash
# From inside prolific-hr-app/
npm run build      # type-check + production build
npm run lint       # ESLint
# Edge Function tests (Deno):
cd supabase/functions && deno test _shared/tests/ --allow-env --allow-net
```
_For documentation-only tasks: confirm no `docs\Project Docs\` (space) references were introduced, confirm path lookup rule was honored, confirm planned ≠ implemented framing._

## Acceptance Criteria
_Checklist that defines "done". Each item must be objectively verifiable._
- [ ] Objective met.
- [ ] Source-of-truth hierarchy respected; conflicts surfaced, not silently resolved.
- [ ] Only `docs\Project_Docs\` (underscore) used in references.
- [ ] No application code changed (unless explicitly authorized above).
- [ ] No old docs deleted or moved.
- [ ] Validation commands run and passing (paste output).

## Rollback Notes
_How to undo this work if needed. For doc tasks: which files to revert/remove. For code: migration rollback steps and the documented rollback entry in DECISIONS.md._

## Required Final Report Format
_The agent must end with a report in this exact shape:_
1. **Task** — name and phase.
2. **Files changed** — explicit list (created / modified / deleted).
3. **What was done** — concise summary.
4. **Validation** — commands run and their output/result.
5. **Conflicts or missing docs** — anything that disagreed with the master spec, or referenced docs not found in either location.
6. **Out-of-scope confirmations** — explicit confirmation that no application code was changed (if applicable), no old docs deleted/moved, Folk Care not copied, planned not treated as implemented.
7. **Follow-ups** — anything that should be reviewed, promoted, or scheduled next.
