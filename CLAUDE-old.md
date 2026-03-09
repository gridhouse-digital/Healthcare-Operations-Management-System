# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

The primary application lives in `prolific-hr-app/`. All other top-level directories are reference material or prototypes:

| Directory | Purpose |
|---|---|
| `prolific-hr-app/` | **Main app** — React 19 + Vite frontend + Supabase backend |
| `prolific-hr-app/supabase/functions/` | Deno-based Edge Functions (backend logic) |
| `prolific-hr-app/supabase/migrations/` | PostgreSQL migration history |
| `ai-summarize-applicant/` | Standalone AI summarization service (separate project) |
| `Figma Design/` | Design-to-code export from Figma (reference only) |
| `Offer Form/` | Offer form prototype (reference only) |
| `BMAD/` | AI agent workflow documentation |

> **Detailed guidance** for the main app (commands, architecture, critical implementation rules) is in [`prolific-hr-app/docs/CLAUDE.md`](prolific-hr-app/docs/CLAUDE.md). Read it before making changes.

## Commands

All commands run from inside `prolific-hr-app/`:

```bash
npm run dev          # Start Vite dev server
npm run build        # Type-check + production build
npm run lint         # ESLint
npm run preview      # Serve production build locally

# Supabase Edge Functions
supabase functions deploy <function-name>
supabase functions logs <function-name>

# Database
supabase db push     # Apply migrations to remote DB
```

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, TailwindCSS v4, shadcn/ui (Radix UI)
- **State/Data:** React Query v5, react-hook-form + Zod
- **Backend:** Supabase (PostgreSQL + Edge Functions on Deno runtime)
- **External APIs:** JotForm, WordPress/LearnDash, Anthropic Claude API
- **Import alias:** `@/` → `src/`

## Architecture at a Glance

The app manages a homecare staffing pipeline: **JotForm application → applicant record → offer → employee onboarding**.

**Frontend** is feature-based (`src/features/`): `applicants`, `offers`, `employees`, `auth`, `dashboard`, `admin`, `profile`, `settings`. Shared UI components live in `src/components/ui/` (shadcn/ui) and `src/components/ai/` (AI panels).

**Backend** is 17 Supabase Edge Functions. The two most critical shared utilities are:
- `_shared/jotform-client.ts` — all JotForm API calls must go through this (rate-limit tracking, retry logic, logging)
- `_shared/file-manager.ts` — handles JotForm CDN → Supabase Storage migration

**Key invariants:**
- Email is the deduplication key for applicants (not JotForm ID)
- Manual sync never overwrites applicant `status` (preserves HR edits)
- Never store signed URLs in the DB — store the path and regenerate on demand
- Never delete `Hired`/`Offer` status applicants — archive only
- All AI and JotForm API calls are logged to the `ai_logs` table

## Environment Variables

```
# prolific-hr-app/.env (frontend)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_WP_API_URL=
VITE_WP_USERNAME=
VITE_WP_APP_PASSWORD=

# Supabase Dashboard → Edge Function secrets
JOTFORM_API_KEY=
ANTHROPIC_API_KEY=
```
