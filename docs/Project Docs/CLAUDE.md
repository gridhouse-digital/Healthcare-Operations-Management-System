# CLAUDE.md — HOMS App (prolific-hr-app/)

This file provides detailed guidance for the **HOMS** (Healthcare Operations Management System) application. It is referenced by the root `CLAUDE.md` and should be read before making any changes to this codebase.

## Project Overview

HOMS is a **multi-tenant SaaS** platform for healthcare staffing agencies. It manages the full lifecycle: external ATS/HRIS connectors → hire detection → employee onboarding → training compliance tracking → reporting.

**Current status:** Epics 1-4.5 complete. Epic 5 (Legacy Data Model Cleanup) in progress.

**Tech Stack:**
- Frontend: React 19 + TypeScript + Vite + TailwindCSS v4 + shadcn/ui
- Backend: Supabase (PostgreSQL + Deno Edge Functions)
- External APIs: BambooHR, JazzHR, WordPress/LearnDash, JotForm, Anthropic Claude
- Auth: Supabase Auth with custom JWT hook (tenant_id + role injected into app_metadata)

## Commands

### Development
```bash
cd prolific-hr-app
npm run dev          # Start development server (Vite)
npm run build        # TypeScript compilation + production build
npm run lint         # Run ESLint
npm run preview      # Preview production build
```

### Supabase Edge Functions
```bash
cd prolific-hr-app
supabase functions deploy <function-name>   # Deploy specific function
supabase functions list                      # List all functions
supabase functions logs <function-name>      # View function logs
```

### Database Migrations
```bash
cd prolific-hr-app
supabase db push              # Apply migrations to remote database
supabase db inspect tables    # Inspect database tables
```

## High-Level Architecture

### Multi-Tenancy Model

Every table has a `tenant_id` column. RLS policies enforce tenant isolation using **only** the JWT `app_metadata` claim — never request body, headers, or query parameters.

```sql
-- RLS pattern (canonical — use this everywhere)
using (
  tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
)
```

JWT claims are injected by `custom_access_token_hook` (Postgres function) on every token refresh, reading from `tenant_users` table.

**Non-negotiable:** `tenant_guard()` must be the **first call** in every Edge Function. It reads ONLY from `auth.jwt()` → `app_metadata`.

### Data Flow: Hire Lifecycle

1. **Hire Detection (Epic 2)**
   - Poll BambooHR or JazzHR for new hires
   - Idempotency: `integration_log` UNIQUE on `(tenant_id, source, idempotency_key)`
   - Emit `hire.detected` event → triggers `process-hire`

2. **Process Hire (Epic 3)**
   - Create/update `people` record (type = 'employee', set `hired_at` once — NFR-3: never overwrite)
   - Create WordPress user via WP REST API
   - Enroll in LearnDash groups per `ld_group_mappings`

3. **Training Sync (Epic 4)**
   - Three-layer compliance model:
     - Layer A: `training_records` — raw sync from LearnDash (OVERWRITE on sync)
     - Layer B: `training_adjustments` — HR overrides (append-only, immutable)
     - Layer C: Computed view — Layer B wins over Layer A
   - **NFR-3:** Sync MUST NEVER write to Layer C fields — only Layer A

4. **JotForm Pipeline (Epic 5 — legacy, being migrated)**
   - JotForm webhook → applicant record
   - Files migrated to Supabase Storage (`resumes` bucket)
   - Email-based deduplication

### Frontend Architecture

**Feature-Based Structure:**
```
src/
├── features/
│   ├── applicants/       # Applicant list, details, AI ranking
│   ├── offers/           # Offer creation, public view, signing
│   ├── employees/        # Employee management
│   ├── auth/             # Login, password reset, protected routes
│   ├── dashboard/        # Dashboard with metrics
│   ├── admin/            # Admin-only features (AI logs, settings)
│   ├── profile/          # User profile management
│   └── settings/         # System settings (connectors, LD mappings, users)
├── components/
│   ├── layout/           # MainLayout, Sidebar, TopBar
│   ├── shared/           # Reusable components
│   ├── ui/               # shadcn/ui components (never modify directly)
│   ├── applicants/       # Applicant-specific components
│   └── ai/               # AI feature components
├── lib/                  # Utility functions (Supabase client, AI client)
├── hooks/                # Custom React hooks
├── services/             # API services
└── types/                # TypeScript type definitions
```

**Routing:**
- React Router v7 with nested routes
- Protected routes require authentication (`ProtectedRoute` component)
- Role-based access: `role` from JWT `app_metadata` (`platform_admin`, `tenant_admin`, `hr_admin`)
- Public route: `/offer/:token` for offer acceptance (no auth required)

**User Roles:**
- `platform_admin` — full access across all tenants
- `tenant_admin` — full access within their tenant
- `hr_admin` — standard HR operations within their tenant
- Use `useUserRole()` hook → `isAdmin`, `isPlatformAdmin`, `isTenantAdmin`, `isHRAdmin` booleans

### Backend Architecture

**Shared Edge Function Utilities (`functions/_shared/`):**

| File | Purpose |
|------|---------|
| `tenant-guard.ts` | Extracts tenant_id/role from JWT `app_metadata` ONLY. Call first in every EF. |
| `audit-logger.ts` | Fire-and-forget audit logging. Uses SERVICE ROLE key. Never throws to caller. |
| `error-response.ts` | Typed error envelope. `handleError()` maps `TenantGuardError` → 401/403, unknown → opaque 500. |
| `cors.ts` | Reads `ALLOWED_ORIGIN_1`/`ALLOWED_ORIGIN_2` env vars. Call on every response. |

**Epic 1 Edge Functions (deployed):**
- `test-connector` — validates BambooHR/JazzHR credentials
- `save-connector` — persists encrypted connector settings (calls `pgp_sym_encrypt_text` RPC)
- `save-ld-mappings` — saves LearnDash group→role mappings
- `list-tenant-users` — lists users within caller's tenant
- `invite-tenant-user` — creates Supabase Auth user + tenant_users row
- `update-tenant-user-role` — changes role within tenant
- `deactivate-tenant-user` — sets status = 'deactivated'

**Epic 4/4.5 Edge Functions (deployed):**
- `sync-training` — daily LearnDash course progress sync (7:00 AM UTC cron)
- `sync-wp-users` — daily WP user import into `people` table (6:30 AM UTC cron)
- Both use `cron-or-tenant-guard.ts` — dual-path auth (service_role = cron, user JWT = manual)

**Import pattern — NEW Edge Functions use `jsr:` imports:**
```typescript
import { createClient } from "jsr:@supabase/supabase-js@2"
```
Legacy EFs use `https://esm.sh/` — both coexist, don't mix within the same file.

**Database Schema (Key Tables):**

| Table | Purpose |
|-------|---------|
| `tenants` | One row per tenant. `id` is the universal foreign key. |
| `tenant_settings` | Connector config per tenant. PK = `tenant_id`. Sensitive fields use `_encrypted` suffix. |
| `tenant_users` | Links Supabase auth users to tenants with roles. Source of truth for JWT claims. |
| `people` | All persons (candidates + employees). Dedup key: `(tenant_id, email)`. |
| `integration_log` | Idempotency log. UNIQUE on `(tenant_id, source, idempotency_key)`. |
| `audit_log` | Append-only audit trail. INSERT RLS only — no UPDATE or DELETE for anyone. |
| `applicants` | Legacy JotForm applicant records. **Epic 5: adding tenant_id + source.** |
| `offers` | Job offers linked to applicants. **Epic 5: adding tenant_id.** |
| `profiles` | Legacy user profiles. **Epic 5: deprecating → tenant_users + auth.** |
| `employees` | **LEGACY — being DROPPED in Epic 5.** Replaced by `people` table. |
| Storage: `resumes` | Private, RLS-protected. Never store signed URLs — regenerate on demand. |

**Epic 4 (pending) tables:**
- `training_records` — raw LearnDash sync data (Layer A)
- `training_adjustments` — HR overrides, append-only (Layer B)
- `training_events` — immutable audit trail for training actions

## Critical Implementation Notes

### Multi-Tenancy (Non-Negotiable)

- `tenant_guard()` is the **first call** in every Edge Function — no exceptions
- RLS reads tenant_id from `auth.jwt() -> 'app_metadata' ->> 'tenant_id'` ONLY
- Never read tenant context from request body, query params, or custom headers
- Service role key bypasses RLS — use ONLY in `audit-logger.ts` and admin-seeding scripts
- Platform admins use `(auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'` in RLS SELECT policies only

### Sync Boundaries (NFR-3)

- BambooHR/JazzHR sync MAY write: `people.first_name`, `people.last_name`, `people.job_title`, `people.profile_source`
- Sync MUST NEVER write: `people.hired_at` (if already set), `training_adjustments`, any Layer C computed fields
- `hired_at` is set once on first hire detection — subsequent syncs skip if already populated
- Training Layer B overrides are immutable — sync cannot modify or delete them

### Idempotency (NFR-2)

- All hire events use `integration_log` UNIQUE constraint as the guard
- Pattern: `INSERT ... ON CONFLICT DO NOTHING` then check rows affected
- `idempotency_key` = email for hire events; `run_id` (UUID) for scheduled sync runs
- Never rely on application-level dedup alone — DB constraint is the source of truth

### Audit Logging (NFR-4)

- Every write to `tenants`, `tenant_settings`, `tenant_users`, `people`, `integration_log` must emit to `audit_log`
- Triggers are defined in migrations — do not bypass them
- `audit_log` has INSERT-only RLS — no UPDATE or DELETE possible for any role
- `audit-logger.ts` EF utility uses service role to write from Edge Functions

### When Working with Supabase Edge Functions

- Always use `jsr:@supabase/supabase-js@2` import for new functions (not npm/esm.sh)
- Service role key required for admin operations (RLS bypass)
- CORS headers required on ALL responses — use `cors.ts` utility
- Use `Deno.env.get()` for environment variables
- If `deno.lock` causes deploy errors ("Unsupported lockfile version"), delete the file — it regenerates

### When Working with JotForm Integration (Legacy — Epic 5)

- Never call JotForm API directly — use `JotFormClient` from `_shared/jotform-client.ts`
- Rate limits: 1,000 calls/month (monitor `limit-left` header)
- Email-based matching is the source of truth (not JotForm ID)
- Field mapping is in `mapSubmissionToApplicant()` function

### When Working with File Storage

- Never store signed URLs in database — regenerate on demand (1-hour expiry)
- Use `migrateFileToStorage()` for JotForm → Supabase Storage migration
- Check `isJotFormFileUrl()` before attempting migration
- RLS policies require authentication for all storage operations

### When Working with React Frontend

- Use `@/` alias for imports (configured in vite.config.ts)
- Supabase client: `src/lib/supabase.ts` (export name: `supabase`)
- React Query for data fetching — custom hooks in `src/hooks/` wrap `useQuery`/`useMutation`
- Forms use react-hook-form + zod validation via `zodResolver(schema)`
- UI components from shadcn/ui (`@/components/ui/`) — never modify these directly
- Conditional Tailwind classes: use `cn()` from `@/lib/utils` — never string concatenation
- ALL AI calls go through `aiClient` from `@/lib/aiClient` — never invoke AI Edge Functions directly
- When calling `supabase.functions.invoke()`: check BOTH `error` (network) AND `data.error` (body)

## Environment Variables

**Frontend (`prolific-hr-app/.env`):**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_WP_API_URL=
VITE_WP_USERNAME=
VITE_WP_APP_PASSWORD=
```

**Supabase Edge Functions (set via Supabase Dashboard → Edge Functions → Secrets):**
```
JOTFORM_API_KEY=
ANTHROPIC_API_KEY=
ALLOWED_ORIGIN_1=        # Deployed frontend URL (e.g. https://app.homs.io)
ALLOWED_ORIGIN_2=        # Optional second origin
BAMBOOHR_API_KEY=        # Epic 2+
JAZZHR_API_KEY=          # Epic 2+
```

## Documentation Index

| File | Purpose |
|------|---------|
| `docs/Project Docs/PROJECT_LOG.md` | Living session log — most recent entry at top |
| `docs/Project Docs/SPRINT_PLAN.md` | Full epic/story breakdown with acceptance criteria |
| `docs/Project Docs/DECISIONS.md` | Architecture decision records |
| `docs/Project Docs/INTEGRATIONS.md` | External API specs (BambooHR, JazzHR, WP, JotForm) |
| `docs/Project Docs/SCHEMA.md` | Canonical table reference with RLS notes |
| `docs/Project Docs/RUNBOOK.md` | Local setup, deploy steps, tenant setup, troubleshooting |
