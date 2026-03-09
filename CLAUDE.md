# CLAUDE.md — HOMS (Healthcare Operations Management System)

This file is the primary guidance file loaded by Claude Code for this repository.

---

## Product Context

HOMS is a **multi-tenant, compliance-grade operations platform for healthcare agencies**. It automates the hire-to-onboard pipeline:
- Detects hires from BambooHR or JazzHR
- Creates WordPress users + enrolls in LearnDash training groups
- Tracks training compliance using a 3-layer immutable model
- Ingests credentials/policies via JotForm
- Generates tamper-evident compliance exports

**Current name:** HOMS (placeholder — final branding at MVP launch)
**Supabase project:** `peffyuhhlmidldugqalo`

---

## Repository Layout

| Directory | Purpose |
|---|---|
| `prolific-hr-app/` | **Main app** — React 19 + Vite frontend + Supabase backend |
| `prolific-hr-app/supabase/functions/` | Deno-based Edge Functions |
| `prolific-hr-app/supabase/migrations/` | PostgreSQL migration history |
| `prolific-hr-app/docs/Project Docs` | Project tracking docs (see below) |
| `ai-summarize-applicant/` | Standalone AI summarization service (separate project) |
| `BMAD/` | AI agent workflow documentation |

---

## Project Tracking Docs (READ BEFORE MAKING CHANGES)

| File | Purpose |
|---|---|
| `prolific-hr-app/docs/Project Docs/SPRINT_PLAN.md` | Current epic/story status and acceptance criteria |
| `prolific-hr-app/docs/Project Docs/PROJECT_LOG.md` | Daily change log — what shipped, what broke, what's next |
| `prolific-hr-app/docs/Project Docs/DECISIONS.md` | Architecture and product decisions with rationale |
| `prolific-hr-app/docs/Project Docs/INTEGRATIONS.md` | Per-integration auth, endpoints, sync cadence, retry rules |
| `prolific-hr-app/docs/Project Docs/SCHEMA.md` | Canonical table reference with RLS notes |
| `prolific-hr-app/docs/Project Docs/RUNBOOK.md` | Local setup, deploy steps, troubleshooting |
| `prolific-hr-app/docs/Project Docs/CLAUDE.md` | Detailed implementation rules for the main app |

**Always update PROJECT_LOG.md and SPRINT_PLAN.md after completing any work.**

---

## Commands

All commands run from inside `prolific-hr-app/`:

```bash
npm run dev          # Start Vite dev server (http://localhost:5173)
npm run build        # Type-check + production build
npm run lint         # ESLint
npm run preview      # Serve production build locally

# Edge Functions
npx supabase functions deploy <function-name>
npx supabase functions logs <function-name> --tail

# Database
npx supabase db push     # Apply migrations to remote DB

# EF Tests (Deno)
cd supabase/functions
deno test _shared/tests/ --allow-env --allow-net
```

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, TailwindCSS v4, shadcn/ui (Radix UI)
- **State/Data:** React Query v5, react-hook-form + Zod
- **Backend:** Supabase (PostgreSQL + Edge Functions on Deno runtime)
- **External APIs:** BambooHR, JazzHR, WordPress/LearnDash, JotForm, Anthropic Claude API
- **Import alias:** `@/` → `src/`
- **EF imports:** New EFs use `jsr:@supabase/supabase-js@2`. Legacy EFs use `https://esm.sh/...`. Both coexist.

---

## Non-Negotiable Rules (ENFORCE ALWAYS)

### Multi-tenancy
- `tenant_guard()` MUST be the FIRST call in every new Edge Function
- `tenant_id` is read ONLY from `JWT -> app_metadata -> tenant_id` — NEVER from request body or headers
- Every new table MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id)`
- Every new table MUST have RLS enabled with a policy filtering on `tenant_id`

### Identity
- `(tenant_id, email)` is the universal deduplication key — enforced via UNIQUE index on `people`
- Email is the idempotency key for hire events in `integration_log`

### Sync boundaries (NFR-3)
- Sync (BambooHR/JazzHR/LearnDash) MUST NEVER overwrite:
  - `people.hired_at` if already set
  - `training_adjustments` (HR override layer — append-only, not touched by sync)
  - Effective compliance values derived from `training_adjustments`
- Sync writes ONLY to raw fields: `training_records`, `people` profile fields (not hired_at)

### Idempotency
- Every hire event handler must be safe to run twice with the same data
- `integration_log` UNIQUE constraint on `(tenant_id, source, idempotency_key)` is the DB-layer guard
- Use `ON CONFLICT DO NOTHING` for hire detection inserts

### Audit
- Every write to a tenant-scoped table must produce a row in `audit_log` via trigger
- `audit_log` is INSERT-only — no UPDATE or DELETE policies exist
- `audit-logger.ts` is fire-and-forget — it NEVER throws to the caller

### Security
- Never store signed URLs in the DB — store the path and regenerate on demand
- Never select encrypted columns (`*_encrypted`) to the frontend
- Never trust tenant_id from request body
- All JotForm API calls go through `_shared/jotform-client.ts`
- All AI calls go through `_shared/aiClient.ts`

### Data safety
- Never delete `Hired`/`Offer` status applicants — archive only
- No breaking schema changes without a migration + documented rollback in DECISIONS.md
- No silent failures — log all integration failures to `integration_log`

---

## Epic Status

| Epic | Status | Description |
|---|---|---|
| Epic 0 | Complete (legacy) | JotForm, applicants, offers, employees, AI features |
| Epic 1 | **COMPLETE** | Multi-tenant foundation, shared EF utilities, settings UI |
| Epic 2 | Not started | Hire detection (BambooHR/JazzHR polling) |
| Epic 3 | Not started | process-hire (WP user + LearnDash enrollment) |
| Epic 4 | Not started | Training sync (3-layer compliance model) |
| Epic 5 | Not started | JotForm ingestion (multi-tenant aware) |
| Epic 6 | Not started | Compliance exports (sha256 tamper-evident) |

---

## MVP Out of Scope

Do NOT implement these unless explicitly instructed:
- Employee self-service portal
- EVV / HHAX / Nursys / E-Verify / Databricks
- WordPress multisite provisioning (FR-18 locked out)
- BambooHR inbound webhooks (polling only in MVP)

---

## Environment Variables

```
# prolific-hr-app/.env (frontend)
VITE_SUPABASE_URL=https://peffyuhhlmidldugqalo.supabase.co
VITE_SUPABASE_ANON_KEY=
VITE_WP_API_URL=
VITE_WP_USERNAME=
VITE_WP_APP_PASSWORD=

# Supabase Dashboard → Edge Function secrets
JOTFORM_API_KEY=
ANTHROPIC_API_KEY=
ALLOWED_ORIGIN_1=          # deployed frontend URL
SUPABASE_SERVICE_ROLE_KEY= # for audit-logger (service role bypasses RLS)
```

---

## Deliverables When Implementing Anything

After every implementation session, produce:
1. Story worked on (e.g. "Story 2.1 — BambooHR hire detector")
2. Files changed (list)
3. Tests added/updated
4. How to verify (manual + automated)
5. PROJECT_LOG.md updated
6. SPRINT_PLAN.md story status updated
7. Any new decisions added to DECISIONS.md
