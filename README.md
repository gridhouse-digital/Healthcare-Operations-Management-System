# HOMS — Healthcare Operations Management System

Multi-tenant, compliance-grade operations platform for healthcare agencies. Automates the hire-to-onboard pipeline: detects hires from BambooHR or JazzHR, creates WordPress users and LearnDash enrollments, tracks training compliance, ingests applications via JotForm, and supports tamper-evident compliance exports.

**Product name:** HOMS (placeholder; final branding at MVP launch)  
**Supabase project:** `peffyuhhlmidldugqalo`

---

## Tech stack


| Layer        | Stack                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| Frontend     | React 19, TypeScript, Vite 7, TailwindCSS v4, shadcn/ui (Radix), React Query v5, react-hook-form + Zod |
| Backend      | Supabase (PostgreSQL, Deno Edge Functions)                                                             |
| External     | BambooHR, JazzHR, WordPress/LearnDash, JotForm, Cloudflare AI Worker                                   |
| Import alias | `@/` → `src/`                                                                                          |


---

## Prerequisites

- **Node.js 22+**
- **Supabase CLI** — `npm install -g supabase`
- **Deno 1.40+** — for Edge Function tests only

---

## Quick start

```bash
cd prolific-hr-app
npm install
# Copy .env.example to .env and fill in values (see Environment variables)
npm run dev
```

App: **[http://localhost:5173](http://localhost:5173)**

---

## Scripts


| Command           | Description                    |
| ----------------- | ------------------------------ |
| `npm run dev`     | Start Vite dev server          |
| `npm run build`   | Type-check + production build  |
| `npm run lint`    | ESLint                         |
| `npm run preview` | Serve production build locally |


---

## Environment variables

**Frontend** (`prolific-hr-app/.env`):

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key (Dashboard → Settings → API)
- `VITE_WP_API_URL`, `VITE_WP_USERNAME`, `VITE_WP_APP_PASSWORD` — WordPress/LearnDash (optional for full onboarding)

**Edge Functions** (Supabase Dashboard → Edge Functions → Manage Secrets):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — usually auto-injected
- `PGCRYPTO_ENCRYPTION_KEY` — used to encrypt/decrypt connector API keys in `tenant_settings`
- `JOTFORM_API_KEY`, `ANTHROPIC_API_KEY` — integrations
- `ALLOWED_ORIGIN_1` — deployed frontend URL (e.g. `https://app.example.com`)

Full list and troubleshooting: `**docs/Project Docs/RUNBOOK.md`**

---

## Project structure

```
prolific-hr-app/
├── src/
│   ├── features/          # Auth, applicants, offers, employees, dashboard, training, settings, admin, profile
│   ├── components/         # layout, ui (shadcn), shared, applicants, ai
│   ├── lib/                # supabase, aiClient, utils
│   ├── hooks/              # useUserRole, useApplicants, useAI, etc.
│   ├── services/           # dashboard, applicant, offer, employee, settings
│   └── types/
├── supabase/
│   ├── functions/          # Deno Edge Functions (+ _shared utilities)
│   └── migrations/         # PostgreSQL migrations
└── docs/Project Docs/      # RUNBOOK, SPRINT_PLAN, DECISIONS, SCHEMA, INTEGRATIONS
```

---

## Edge Functions (summary)


| Function                                                                                       | Purpose                                                                     |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `test-connector`                                                                               | Validate BambooHR/JazzHR credentials                                        |
| `save-connector`                                                                               | Persist encrypted connector settings (BambooHR, JazzHR, WordPress, JotForm) |
| `save-ld-mappings`                                                                             | LearnDash group → role mappings                                             |
| `list-tenant-users`, `invite-tenant-user`, `update-tenant-user-role`, `deactivate-tenant-user` | Tenant user management                                                      |
| `listApplicants`                                                                               | JotForm sync → applicants (tenant-scoped)                                   |
| `detect-hires-bamboohr`, `detect-hires-jazzhr`                                                 | Hire detection (cron or manual trigger)                                     |
| `process-hire`                                                                                 | Create WP user + LearnDash enrollment after hire                            |
| `sync-training`, `sync-wp-users`                                                               | LearnDash/WP sync (cron)                                                    |
| `jotform-webhook`                                                                              | JotForm inbound webhook                                                     |
| `getApplicantDetails`, `sendOffer`, `sendRequirementRequest`, `onboard-employee`               | Applicant/offer/onboarding flows                                            |
| `ai-rank-applicants`, `ai-draft-offer-letter`, `ai-onboarding-logic`, `ai-wp-validation`       | AI features                                                                 |


Deploy: `npx supabase functions deploy <function-name>`  
Logs: `npx supabase functions logs <function-name> --tail`

---

## Database

- **Migrations:** `npx supabase link` (first time), then `npx supabase db push`
- **Inspect:** `npx supabase db inspect tables`
- Schema and RLS: `**docs/Project Docs/SCHEMA.md`**

---

## Main app routes

- `/` — Dashboard  
- `/applicants`, `/applicants/:id` — Applicants  
- `/offers`, `/offers/new` — Offers (public offer view: `/offer/:token`)  
- `/employees` — Employees  
- `/training`, `/training/:employeeId` — Training compliance  
- `/settings/connectors` — Connectors (BambooHR, JazzHR, WordPress, JotForm)  
- `/settings/users` — Tenant user management  
- `/settings/system` — System settings  
- `/admin/ai-dashboard` — AI usage (admin)  
- `/profile` — User profile

Auth: Supabase Auth; tenant and role from JWT `app_metadata` (`tenant_id`, `role`: platform_admin | tenant_admin | hr_admin).

---

## Documentation


| Doc                                             | Purpose                                            |
| ----------------------------------------------- | -------------------------------------------------- |
| **docs/Project Docs/RUNBOOK.md**                | Local setup, deploy, tenant setup, troubleshooting |
| **docs/Project Docs/SPRINT_PLAN.md**            | Epic/story status and acceptance criteria          |
| **docs/Project Docs/PROJECT_LOG.md**            | Change log                                         |
| **docs/Project Docs/DECISIONS.md**              | Architecture and product decisions                 |
| **docs/Project Docs/INTEGRATIONS.md**           | External API specs (BambooHR, JazzHR, WP, JotForm) |
| **docs/Project Docs/SCHEMA.md**                 | Tables and RLS                                     |
| **CLAUDE.md** (repo root)                       | High-level repo guidance                           |
| **prolific-hr-app/docs/Project Docs/CLAUDE.md** | App-level implementation rules                     |


---

## Testing

- **EF shared utilities (Deno):**  
`cd supabase/functions && deno test _shared/tests/ --allow-env --allow-net`
- **RLS isolation:** See RUNBOOK “Running Tests” (local Supabase + seed + test script).

