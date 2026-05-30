# HOMS Platform Expansion — Implementation Specification

> **Version**: 1.1  
> **Date**: 2026-05-29  
> **Status**: Pre-implementation — awaiting owner approval  
> **Audience**: AI coding agents (Cursor, Codex, Claude), human developers, product owner  
> **Changelog (v1.1)**: Corrected Supabase role migration approach (Admin API, not SQL). Added TypeScript path alias requirement for Phase 2. Clarified Staff App repo strategy for Expo vs PWA. Added AI latency handling. Added active_modules bootstrapping tasks. Added audit_log indexing and partitioning decision. Clarified that `tenant_settings.active_modules` backfill uses a normal SQL migration, while Supabase Auth role renaming must use the Admin API.

---

## 1. Executive Summary

HOMS (Healthcare Operations Management System) is a production tenant-aware React + Supabase application that currently manages applicant intake, offers, employee records, training/compliance sync (LearnDash/WordPress), recurring compliance, and audit logging for healthcare staffing agencies.

This specification defines how HOMS evolves from an HR/compliance control center into a modular healthcare operations platform — without a full rewrite.

**Key decisions locked in this document:**

- HOMS is not rebuilt from scratch. Current code is the foundation.
- The current monolith is reorganized using Feature-Sliced Design into 5 macro-domains, not 19 physical modules.
- Care Assistant / Staff App is the first new field-operations module.
- RBAC starts with 6 practical roles, not 3 and not 10.
- Tenant module flags exist but enforcement is lightweight (JWT claims + frontend router, not deep RLS joins).
- RLS stays simple: `tenant_id` from JWT `app_metadata`. No multi-join permission trees inside Postgres policies.
- AI starts as a minimal Edge Function with mandatory inference logging. No prompt management UI.
- Regulated care data (PHI/ePHI) is blocked until Supabase BAA and HIPAA/PHIPA architecture are confirmed.
- Staff App runs in synthetic/demo-data mode until regulated-data approval.
- EVV governance separation is preserved. Staff App never submits to EVV vendors.
- Folk Care is used only as reference architecture. No code is copied.

---

## 2. Final Architecture Decision

### ADR-001: Platform Evolution, Not Rewrite

**Context**: HOMS is a working production system with 60 database migrations, 31 Edge Functions, 9 feature folders, tenant-aware RLS, JWT-based auth, and active agency tenants.

**Decision**: Evolve incrementally. Reorganize the existing `src/features/` folder structure into macro-domains. Add new domains (care-ops) as new feature folders within the same application. Do not create a monorepo, do not create separate services, do not rebuild the frontend.

**Alternatives rejected**:
- Full rewrite into microservices: Too slow, unnecessary at current scale, loses production stability.
- Separate Care Ops app: Fractures the unified staff record, duplicates auth/tenancy, doubles maintenance.
- Keep current structure forever: Will not scale as care-ops, scheduling, and field workflows are added.

**Consequences**: Requires discipline to maintain folder boundaries. Refactoring will touch import paths across the app. Must be done in a single coordinated phase (Phase 2), not piecemeal.

**Revisit trigger**: If the app exceeds 200+ components per macro-domain, or if specific modules (e.g., EVV broker) require independent scaling or a different runtime.

### ADR-002: Care Assistant as First New Module

**Context**: The platform expansion adds care operations, EVV, scheduling, family portal, and billing. Sequencing matters.

**Decision**: Care Assistant / Staff App is first because it captures field execution data — the prerequisite for EVV, supervisor review, billing, and payroll. You cannot verify visits you never recorded.

**Why before EVV**: EVV vendor integration is a backend compliance pipeline. It consumes Staff App data. Building EVV before the data source exists is backwards.

**Why before billing**: Billing requires verified visit hours. Visit hours come from Staff App + EVV. Build the data pipeline first.

**Why before family portal**: Family visibility requires approved care data. Care data requires HIPAA/PHIPA posture. Staff App MVP runs in non-regulated mode first.

### ADR-003: JotForm to Native Forms

**Context**: JotForm currently powers applicant intake via webhook. The JotForm replacement strategy (already documented) defines the migration path.

**Decision**: Native HOMS forms replace JotForm for applicant intake first, then onboarding and workforce compliance. New strategic modules must not use JotForm as primary workflow engine. JotForm remains as legacy adapter only.

**Hard block**: Native capture of regulated care data (visit notes, clinical notes, incident reports, participant records) is blocked until separate compliance architecture approval. This block applies equally to JotForm and native forms.

---

## 3. Current HOMS Stabilization Priorities

Before any expansion, these gaps from the current gap register must be addressed:

### Priority 1: Lifecycle Consistency (High)

**Current state**: Applicant → offer → employee conversion works but spans multiple paths. Status depends on sync timing.

**Required fix**: Consolidate into one deterministic conversion service. Employee status must reflect explicit business rules, not accidental sync order.

**Files affected**:
- `src/services/employeeService.ts`
- `src/features/applicants/ApplicantDetailsPage.tsx`
- `supabase/functions/onboard-employee/index.ts`
- `supabase/functions/sync-wp-users/index.ts`

### Priority 2: WordPress/LearnDash Reconciliation (High)

**Current state**: Users originating in WordPress before clean applicant context exists cause edge cases. Recent normalized-email uniqueness migration helps but doesn't eliminate timing sensitivity.

**Required fix**: Formalize identity precedence rules. Document or enforce a single reconciliation service around normalized email + applicant linkage.

### Priority 3: Recurring Compliance Visibility (High)

**Current state**: Recurring compliance obligations depend on active group enrollment, primary group, and rule alignment. Empty/partial views happen when these are misaligned.

**Required fix**: Stronger configuration validation. Clearer diagnostics. Operator guidance when group, rule, or anchor conditions are missing.

### Priority 4: Audit Review UI (Medium)

**Current state**: Audit data exists via `audit-logger.ts` and DB triggers. No dedicated review UI.

**Required fix**: Admin audit log viewer scoped to high-value operational tables. This becomes critical infrastructure before care-ops goes live.

### Priority 5: RLS Test Coverage (Phase 0 deliverable)

**Current state**: RLS policies exist on tenant-scoped tables. No automated tests confirm cross-tenant isolation.

**Required fix**: Automated tests (pgTAP or integration-level) that prove Tenant A cannot read Tenant B's data. Must be green before any new tables are added.

---

## 4. Simplified Folder Structure

### Current structure (actual filesystem)

```
prolific-hr-app/src/
├── features/
│   ├── admin/           # Access requests, AI dashboard
│   ├── applicants/      # Applicant list, details, timeline
│   ├── auth/            # Login, forgot password, request access, protected route
│   ├── dashboard/       # Dashboard page
│   ├── employees/       # Employee list
│   ├── offers/          # Offer list, editor, public view
│   ├── profile/         # Profile page
│   ├── settings/        # Connectors, training rules, user management, system
│   └── training/        # Training page, employee detail, recurring compliance
├── components/          # Shared UI (layout, AI panels, theme)
├── hooks/               # useApplicants, useApplicantDetails
├── lib/                 # aiClient, supabase client
├── services/            # employeeService, offerService
├── types/               # TypeScript types
├── data/                # Static data
├── pages/               # (mostly empty, routes in App.tsx)
└── assets/              # Static assets
```

### Target structure (after Phase 2 refactor)

```
prolific-hr-app/src/
├── features/
│   ├── core/
│   │   ├── auth/            ← moved from features/auth
│   │   ├── profile/         ← moved from features/profile
│   │   ├── dashboard/       ← moved from features/dashboard
│   │   └── module-registry/ ← NEW: tenant module check utilities
│   │
│   ├── hr-compliance/
│   │   ├── applicants/      ← moved from features/applicants
│   │   ├── offers/          ← moved from features/offers
│   │   ├── employees/       ← moved from features/employees
│   │   ├── training/        ← moved from features/training (includes recurring compliance)
│   │   └── connectors/      ← extracted from features/settings
│   │
│   ├── care-ops/            ← NEW (Phase 5+)
│   │   ├── clients/
│   │   ├── care-plans/
│   │   ├── visits/
│   │   ├── staff-app/
│   │   ├── incidents/
│   │   └── supervisor-review/
│   │
│   └── admin/
│       ├── settings/        ← moved from features/settings (system, users)
│       ├── access-requests/ ← moved from features/admin
│       └── ai-dashboard/    ← moved from features/admin
│
├── shared/                  ← NEW: replaces scattered components/, hooks/, lib/, services/
│   ├── components/          ← moved from components/
│   ├── hooks/               ← moved from hooks/
│   ├── lib/                 ← moved from lib/
│   ├── services/            ← moved from services/
│   └── types/               ← moved from types/
│
└── assets/
```

### Refactor rules

- This is a folder move + import path update. No logic changes.
- Every file keeps its current implementation.
- `App.tsx` route definitions update import paths but keep the same route structure.
- No new packages, no new build tools, no monorepo.
- Barrel exports (`index.ts`) at each macro-domain root for clean imports.

### TypeScript path aliases — required before moving files

Before any files are moved, configure path aliases in both `tsconfig.json` and `vite.config.ts`. This prevents deep relative imports (`../../../../shared/`) and makes future refactoring safe.

**`tsconfig.json` (inside `compilerOptions`):**
```json
"paths": {
  "@shared/*": ["./src/shared/*"],
  "@core/*": ["./src/features/core/*"],
  "@hr-compliance/*": ["./src/features/hr-compliance/*"],
  "@care-ops/*": ["./src/features/care-ops/*"],
  "@admin/*": ["./src/features/admin/*"]
}
```

**`vite.config.ts` (inside `resolve.alias`):**
```typescript
import path from 'path';
// ...
resolve: {
  alias: {
    '@shared': path.resolve(__dirname, './src/shared'),
    '@core': path.resolve(__dirname, './src/features/core'),
    '@hr-compliance': path.resolve(__dirname, './src/features/hr-compliance'),
    '@care-ops': path.resolve(__dirname, './src/features/care-ops'),
    '@admin': path.resolve(__dirname, './src/features/admin'),
  }
}
```

All new imports written after Phase 2 must use these aliases. Deep relative imports are banned. The Phase 2 task prompt must include this requirement.

---

## 5. Macro-Domain Boundaries

### core

| Attribute | Value |
|---|---|
| **Purpose** | Authentication, tenancy, routing, UI shell, module registry, profile |
| **Status** | Implemented (needs folder consolidation) |
| **Owned data** | `tenants`, `tenant_settings`, `tenant_users`, `tenant_access_requests`, `auth.users` |
| **Owned workflows** | Login, signup, access requests, tenant routing, module resolution |
| **Dependencies** | Supabase Auth |
| **Must not own** | Any domain-specific business logic (hiring, training, care) |

### hr-compliance

| Attribute | Value |
|---|---|
| **Purpose** | Full HR lifecycle: applicant → offer → employee → training → recurring compliance |
| **Status** | Implemented (strongest current domain) |
| **Owned data** | `applicants`, `offers`, `people`, `training_records`, `training_adjustments`, `training_events`, `training_courses`, `training_compliance_rules`, `employee_group_enrollments`, `employee_compliance_instances`, `employee_compliance_instance_actions`, `compliance_notification_log`, `learndash_group_courses`, `integration_log` |
| **Owned workflows** | Applicant intake, offer creation/sending/signing, employee conversion, WP/LearnDash sync, training compliance, recurring compliance cycles, connector management |
| **Dependencies** | core (tenancy, auth) |
| **Must not own** | Client/participant records, care plans, visits, field workflows |

### care-ops (Phase 5+)

| Attribute | Value |
|---|---|
| **Purpose** | Client management, care planning, visit scheduling, field execution, incident reporting, supervisor review |
| **Status** | Not implemented. Planned. |
| **Owned data** | `clients`, `client_contacts`, `care_plans`, `care_plan_tasks`, `visits`, `visit_assignments`, `visit_tasks`, `visit_notes`, `incidents`, `supervisor_reviews` |
| **Owned workflows** | Client intake, care plan creation, visit scheduling, task completion, note drafting, incident submission, supervisor approval |
| **Dependencies** | core (tenancy, auth, RBAC), hr-compliance (employee records via `people` table) |
| **Must not own** | Employee HR lifecycle, training/compliance, EVV vendor submission |

### admin

| Attribute | Value |
|---|---|
| **Purpose** | System configuration, tenant admin, AI observability |
| **Status** | Partially implemented |
| **Owned data** | Global settings, AI logs/cache |
| **Owned workflows** | System settings, user management, access request review, AI dashboard |
| **Dependencies** | core |
| **Must not own** | Day-to-day HR or care workflows |

### shared

| Attribute | Value |
|---|---|
| **Purpose** | Cross-cutting utilities: UI components, hooks, services, types, AI client |
| **Status** | Exists (scattered across components/, hooks/, lib/, services/, types/) |
| **Owned data** | None |
| **Owned workflows** | None (utility layer only) |
| **Dependencies** | None (leaf dependency) |
| **Must not own** | Business logic, domain state, API calls to specific domain tables |

---

## 6. Refactor Sequence

The refactor from current structure to target structure happens in Phase 2 as one coordinated change.

### Step 1: Create macro-domain folders
Create `src/features/core/`, `src/features/hr-compliance/`, `src/features/care-ops/` (empty initially), `src/features/admin/`, and `src/shared/`.

### Step 2: Move files (no logic changes)

| Current Location | Target Location |
|---|---|
| `features/auth/` | `features/core/auth/` |
| `features/profile/` | `features/core/profile/` |
| `features/dashboard/` | `features/core/dashboard/` |
| `features/applicants/` | `features/hr-compliance/applicants/` |
| `features/offers/` | `features/hr-compliance/offers/` |
| `features/employees/` | `features/hr-compliance/employees/` |
| `features/training/` | `features/hr-compliance/training/` |
| `features/settings/components/ConnectorSettingsPage.tsx` | `features/hr-compliance/connectors/` |
| `features/settings/components/LdGroupMappingsPage.tsx` | `features/hr-compliance/connectors/` |
| `features/settings/` (remaining) | `features/admin/settings/` |
| `features/admin/pages/AccessRequestsPage.tsx` | `features/admin/access-requests/` |
| `features/admin/pages/AIDashboardPage.tsx` | `features/admin/ai-dashboard/` |
| `components/` | `shared/components/` |
| `hooks/` | `shared/hooks/` |
| `lib/` | `shared/lib/` |
| `services/` | `shared/services/` |
| `types/` | `shared/types/` |

### Step 3: Update imports in App.tsx and all affected files

### Step 4: Add barrel exports (`index.ts`) at each macro-domain root

### Step 5: Verify app builds and all routes work

### Cross-import rules (enforced by convention, later by lint)
- `shared/` may be imported by any macro-domain.
- `core/` may be imported by any macro-domain.
- `hr-compliance/` must not import from `care-ops/` or `admin/`.
- `care-ops/` must not import from `hr-compliance/` except through `shared/` types for the `people` table.
- `admin/` may import from `core/` and `shared/` only.

---

## 7. Tenant Module Strategy

### Concept

Not all agencies will use all macro-domains. An HR-only agency should not see care-ops navigation. A care agency should see both.

### Implementation: Lightweight JWT Claims

**Do not** create a `tenant_modules` table that is joined in every RLS policy. Instead:

1. Add an `active_modules` array to the tenant's configuration in `tenant_settings` (JSONB field):
   ```json
   { "active_modules": ["hr-compliance", "care-ops"] }
   ```

2. When the user logs in, the Supabase Auth hook (or admin API call that sets `app_metadata`) includes this array:
   ```json
   {
     "tenant_id": "uuid",
     "role": "agency_admin",
     "active_modules": ["hr-compliance", "care-ops"]
   }
   ```

3. The frontend router reads `active_modules` from the session JWT and conditionally renders navigation and route guards.

4. Edge Functions read `active_modules` from the tenant guard context and return 403 if a request targets a disabled module.

5. RLS does **not** check module access. RLS only checks `tenant_id`. Module gating is an application-layer concern.

### Module granularity

Only macro-domain-level modules exist for now:

| Module Key | What It Gates |
|---|---|
| `hr-compliance` | Applicants, offers, employees, training, recurring compliance, connectors |
| `care-ops` | Clients, care plans, visits, staff app, incidents, supervisor review |

`core` and `admin` are always active. They are not gatable.

### Tenant module settings

Per-module configuration (e.g., "require photo for incident report") lives in `tenant_settings` JSONB under a namespaced key:

```json
{
  "active_modules": ["hr-compliance", "care-ops"],
  "module_config": {
    "care-ops": {
      "require_incident_photo": true,
      "supervisor_review_required": true
    }
  }
}
```

No separate `tenant_module_settings` table is needed yet.

---

## 8. RBAC Strategy

### Current state

The current `tenant-guard.ts` defines three roles:
```typescript
export type TenantRole = "platform_admin" | "tenant_admin" | "hr_admin";
```

These are extracted from `app_metadata.role` in the JWT.

### Phase 1-4 roles (6 practical roles)

| Role | Purpose | Maps to current |
|---|---|---|
| `platform_owner` | Superadmin across all tenants | `platform_admin` (rename) |
| `agency_admin` | Full access within a tenant | `tenant_admin` (rename) |
| `hr_manager` | Manages hiring, employees, training, compliance | `hr_admin` (rename) |
| `supervisor` | Reviews care notes, manages incidents, approves field work | NEW |
| `caregiver` | Field staff: views assigned visits, submits notes, reports issues | NEW |
| `auditor` | Read-only compliance and audit log access | NEW |

### Implementation approach

1. Update `TenantRole` type in `tenant-guard.ts` to include all 6 roles.
2. Update `ProtectedRoute` component to accept the new role names.
3. Update `App.tsx` route guards to use new role names.
4. New roles (`supervisor`, `caregiver`, `auditor`) are added to the type but no users are assigned these roles until care-ops is built.

### ⚠️ Role migration — Admin API only, not a SQL migration

**Do not** write a standard Postgres migration to update `auth.users.raw_app_meta_data`. That column is owned by GoTrue and bypassing it via SQL will not invalidate existing JWTs, breaks token refresh, and can corrupt the auth state.

Instead, write a one-off **Admin API script** (Node.js/TypeScript, run manually against the production project) using the service-role key:

```typescript
// scripts/migrate-roles.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // service role only — never commit
);

const ROLE_MAP: Record<string, string> = {
  platform_admin: 'platform_owner',
  tenant_admin: 'agency_admin',
  hr_admin: 'hr_manager',
};

// Fetch all users, update those with old role names
// Run with: npx tsx scripts/migrate-roles.ts
async function migrateRoles() {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error || !data.users.length) break;
    for (const user of data.users) {
      const currentRole = user.app_metadata?.role;
      const newRole = ROLE_MAP[currentRole];
      if (!newRole) continue;
      await supabase.auth.admin.updateUserById(user.id, {
        app_metadata: { ...user.app_metadata, role: newRole },
      });
      console.log(`${user.email}: ${currentRole} → ${newRole}`);
    }
    page++;
  }
}

migrateRoles();
```

**Execution rules:**
- Run in a staging environment first.
- Capture the current role distribution before running (`SELECT app_metadata->>'role', COUNT(*) FROM auth.users GROUP BY 1`).
- Have a rollback script ready that reverses the map.
- Users must re-login after migration to receive updated JWT claims.
- The script is placed in `prolific-hr-app/scripts/migrate-roles.ts` and must NOT be included in the Supabase migration folder.

### Future role expansion (not built yet)

| Role | When | Purpose |
|---|---|---|
| `scheduler` | When scheduling module is built | Manages visit assignments |
| `nurse` | When clinical roles are differentiated | Field staff with clinical scope |
| `compliance_manager` | When compliance module matures | Dedicated compliance auditing |
| `family_member` | When family portal is built | Limited read-only portal access |

### Permission strings

Permissions follow `domain.action` format. They are checked in application code (tenant guard, frontend route guards), not in RLS.

**HR-Compliance permissions:**
- `staff.view`, `staff.manage`
- `applicants.view`, `applicants.manage`
- `offers.manage`
- `training.view`, `training.manage`
- `recurring_compliance.manage`
- `connectors.manage`

**Care-Ops permissions (Phase 5+):**
- `clients.view`, `clients.manage`
- `care_plans.view`, `care_plans.manage`
- `visits.view`, `visits.manage`
- `notes.submit`, `notes.review`
- `incidents.create`, `incidents.review`

**Cross-cutting permissions:**
- `audit.view`
- `reports.view`
- `settings.manage`

**Future permissions (not implemented yet):**
- `evv.use`, `evv.manage`
- `billing.view`, `billing.manage`

### Role-to-permission mapping

| Permission | platform_owner | agency_admin | hr_manager | supervisor | caregiver | auditor |
|---|---|---|---|---|---|---|
| `staff.view` | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| `staff.manage` | ✓ | ✓ | ✓ | — | — | — |
| `applicants.view` | ✓ | ✓ | ✓ | — | — | ✓ |
| `applicants.manage` | ✓ | ✓ | ✓ | — | — | — |
| `offers.manage` | ✓ | ✓ | ✓ | — | — | — |
| `training.view` | ✓ | ✓ | ✓ | ✓ | ✓ (own) | ✓ |
| `training.manage` | ✓ | ✓ | ✓ | — | — | — |
| `recurring_compliance.manage` | ✓ | ✓ | ✓ | — | — | — |
| `connectors.manage` | ✓ | ✓ | — | — | — | — |
| `clients.view` | ✓ | ✓ | — | ✓ | ✓ (assigned) | ✓ |
| `clients.manage` | ✓ | ✓ | — | ✓ | — | — |
| `care_plans.view` | ✓ | ✓ | — | ✓ | ✓ (assigned) | ✓ |
| `care_plans.manage` | ✓ | ✓ | — | ✓ | — | — |
| `visits.view` | ✓ | ✓ | — | ✓ | ✓ (own) | ✓ |
| `visits.manage` | ✓ | ✓ | — | ✓ | — | — |
| `notes.submit` | — | — | — | — | ✓ | — |
| `notes.review` | ✓ | ✓ | — | ✓ | — | ✓ |
| `incidents.create` | — | — | — | ✓ | ✓ | — |
| `incidents.review` | ✓ | ✓ | — | ✓ | — | ✓ |
| `audit.view` | ✓ | ✓ | — | — | — | ✓ |
| `settings.manage` | ✓ | ✓ | — | — | — | — |

### Implementation note

For Phase 1-4, permission checking can be a simple utility function that maps `role → Set<permission>` (similar to Folk Care's `PermissionService` pattern). This does not require a database table. The mapping lives in code.

When role expansion happens later, migrate the mapping to a `role_permissions` database table if needed.

---

## 9. RLS / JWT Strategy

### Current state (working correctly)

`tenant-guard.ts` extracts `tenant_id`, `userId`, and `role` from `app_metadata` in the JWT. It creates a Supabase client scoped to the user's RLS context. RLS policies on tables enforce `tenant_id` matching.

### Rules for all new tables

1. Every domain table must include a `tenant_id UUID NOT NULL` column.
2. Every domain table must have an RLS policy:
   ```sql
   CREATE POLICY "tenant_isolation" ON table_name
     USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);
   ```
3. RLS policies must not join to `tenant_modules`, `role_permissions`, or any other table. Keep them flat.
4. Module access checks happen in the tenant guard (Edge Functions) and frontend router, not in Postgres.
5. Row-level permission scoping (e.g., "caregiver can only see their own visits") is handled via additional simple RLS policies:
   ```sql
   CREATE POLICY "caregiver_own_visits" ON visits
     USING (
       tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
       AND (
         (auth.jwt() -> 'app_metadata' ->> 'role') != 'caregiver'
         OR assigned_employee_id = auth.uid()
       )
     );
   ```

### JWT app_metadata target shape

```json
{
  "tenant_id": "uuid-here",
  "role": "caregiver",
  "active_modules": ["hr-compliance", "care-ops"]
}
```

### Tenant guard extension

Update `tenant-guard.ts` to:
1. Accept the expanded `TenantRole` union type (6 roles).
2. Parse `active_modules` from `app_metadata`.
3. Expose a `requireModule(moduleName: string)` method that throws if the module is not in `active_modules`.
4. Expose a `hasPermission(permission: string)` method using the in-code role-to-permission map.

---

## 10. RLS Testing Plan (Phase 0 Deliverable)

### Approach

Use integration tests that create two test tenants, insert data under each, and assert cross-tenant reads return zero rows.

### Test matrix

| Test | Assertion |
|---|---|
| Tenant A inserts employee, Tenant B queries employees | Tenant B sees 0 rows |
| Tenant A inserts applicant, Tenant B queries applicants | Tenant B sees 0 rows |
| Tenant A inserts training record, Tenant B queries training | Tenant B sees 0 rows |
| Tenant A inserts offer, Tenant B queries offers | Tenant B sees 0 rows |
| Tenant A inserts compliance instance, Tenant B queries compliance | Tenant B sees 0 rows |
| Tenant A inserts audit log, Tenant B queries audit logs | Tenant B sees 0 rows |
| Anonymous user (no JWT) queries any table | 0 rows |

### Implementation

Option A: pgTAP tests running inside Supabase (preferred if supported by Supabase CLI).

Option B: Integration tests using two separate Supabase service-role clients impersonating different tenants via `auth.admin.updateUserById()` to set different `app_metadata.tenant_id` values.

### Acceptance criteria

- All tests pass green.
- Tests run in CI or can be run via `npm test:rls`.
- Tests must pass before any new migration is merged.

---

## 11. Supabase BAA / HIPAA / PHIPA Compliance Checkpoint

### Why this matters

The moment HOMS stores real client names, visit notes, or health-related data, it becomes subject to HIPAA (US) and/or PHIPA (Ontario, Canada). The Supabase instance must be covered by a Business Associate Agreement (BAA).

### Required validations before regulated data

| Requirement | Status | Action Required |
|---|---|---|
| Supabase plan supports BAA | **Unknown — must verify** | Check if current plan is Pro/Enterprise. Contact Supabase support for BAA. |
| Supabase HIPAA add-on enabled | **Unknown — must verify** | Supabase offers a HIPAA add-on on Team/Enterprise. Confirm availability and cost. |
| Encryption at rest | Supabase encrypts at rest by default (AES-256) | Confirm this meets requirements. |
| Encryption in transit | Supabase uses TLS by default | Confirm. |
| Audit logging for PHI access | Current `audit-logger.ts` exists | Must be extended to perform asynchronous batch-writes to a cold-storage table to prevent IO bottlenecking. |
| Data residency (PHIPA) | **Unknown** | Canadian tenants may require Canadian-region Supabase project. Verify region options. |
| Access controls | JWT + RLS exist | Must be verified via RLS test suite (Section 10). |
| Backup and retention | Supabase provides automatic backups | Verify backup frequency meets compliance requirements. |
| Breach notification process | **Not defined** | Must be defined before regulated data goes live. |

### Hard rule

**Do not store real client/participant names, real visit notes, real clinical observations, real incident reports, or any PHI/ePHI in the Supabase database until every row in the table above is confirmed.**

Until then, care-ops tables may only contain synthetic/demo data clearly labeled as such.

---

## 12. Staff App Technology Decision Framework

### Decision required before Phase 6

The Staff App is mobile-first. The technology choice cascades into offline support, GPS, push notifications, distribution, and repository structure.

### Options

| Option | Offline | GPS Background | Push Notifications | App Store | Dev Speed | Code Sharing with HOMS |
|---|---|---|---|---|---|---|
| **PWA (same React app)** | Limited (Service Worker) | No | Limited (Web Push) | No | Fastest | Maximum |
| **Expo / React Native** | Strong (WatermelonDB, AsyncStorage) | Yes | Yes (native) | Yes (review required) | Moderate | Types/API contracts only |
| **Capacitor (Ionic)** | Moderate (SQLite plugin) | Yes (plugin) | Yes (plugin) | Yes | Moderate | Shared web components |

### Repository structure consequence — decide with technology

| Staff App Choice | Repo Strategy | Shared Code |
|---|---|---|
| **PWA (route group in existing app)** | No monorepo needed. Staff app lives at `src/features/care-ops/staff-app/`. Shares all path aliases, components, and types naturally. | Full sharing |
| **Expo / React Native (separate app)** | Requires **lightweight workspace setup** (npm/yarn/pnpm workspaces). A `packages/types` or `packages/shared` folder exports the Supabase `database.types.ts`, `TenantRole` enum, and validation schemas. The web app and Expo app are siblings in the workspace root. This is NOT a full Turborepo — just a minimal `package.json` workspaces configuration. | Types + contracts only |

**If Expo is chosen**, the workspace structure becomes:
```
/                           ← workspace root (new package.json with "workspaces")
├── packages/
│   └── types/              ← shared: database.types.ts, TenantRole, Zod schemas
├── prolific-hr-app/        ← existing web app (unchanged internally)
└── prolific-staff-app/     ← new Expo app
```

The "no monorepo yet" decision applies only if Staff App is a PWA. If Expo is selected, a minimal workspace is the minimum viable shared-types strategy.

### ADR required

This decision must be formally documented as `docs/decisions/adr-004-staff-app-technology.md` before Phase 6 begins. The product owner must sign off. The ADR must include the repository structure consequence.

---

## 13. Offline Support Strategy

### Why required

Caregivers work in clients' homes — basements, rural areas, poor cell coverage. If the Staff App requires a live Supabase connection to function, it will fail in the field.

### Minimum viable offline support

| Capability | Offline Behavior |
|---|---|
| View today's assigned visits | Cached locally on app open |
| View care plan summary | Cached locally when visit is loaded |
| Complete task checklist | Saved to local storage, synced when online |
| Draft visit note | Saved to local storage, synced when online |
| Submit incident report | Saved to local queue, synced when online |
| AI note assistance | **Not available offline** (requires API call) |

### Implementation approach (varies by technology)

**If Expo/React Native**: Use AsyncStorage or WatermelonDB for local cache. Background sync queue that retries on connectivity restore.

**If PWA**: Use IndexedDB + Service Worker. More limited but functional for basic caching.

### Sync conflict resolution

Simple last-write-wins for MVP. If a note is drafted offline and synced later, the synced version becomes the record. Supervisor review catches any issues.

### Data that must NOT be cached locally without encryption

If operating in regulated mode (post-BAA approval), any cached PHI must be encrypted at rest on the device. This is another reason to defer regulated data until the compliance architecture is confirmed.

---

## 14. Care Operations Foundation Scope

### Purpose

Build the relational scaffolding that links staff to the work they perform. This is the database layer that the Staff App reads and writes to.

### New tables (all require `tenant_id` + RLS)

| Table | Purpose | Key Columns |
|---|---|---|
| `clients` | Participants receiving care | `id`, `tenant_id`, `first_name`, `last_name`, `date_of_birth`, `address`, `phone`, `status`, `notes` |
| `client_contacts` | Emergency and family contacts | `id`, `tenant_id`, `client_id`, `name`, `relationship`, `phone`, `is_emergency` |
| `care_plans` | Goals and requirements for a client | `id`, `tenant_id`, `client_id`, `title`, `start_date`, `end_date`, `status`, `created_by` |
| `care_plan_tasks` | Recurring tasks in a care plan | `id`, `tenant_id`, `care_plan_id`, `description`, `category`, `frequency`, `is_required` |
| `visits` | Scheduled blocks of care | `id`, `tenant_id`, `client_id`, `care_plan_id`, `scheduled_start`, `scheduled_end`, `status`, `location` |
| `visit_assignments` | Staff assigned to visits | `id`, `tenant_id`, `visit_id`, `employee_id`, `role`, `status` |
| `visit_tasks` | Task instances for a specific visit | `id`, `tenant_id`, `visit_id`, `care_plan_task_id`, `completed`, `completed_at`, `completed_by` |
| `visit_notes` | Narratives drafted by staff | `id`, `tenant_id`, `visit_id`, `author_id`, `content`, `ai_assisted`, `status` (draft/submitted/approved/rejected), `submitted_at`, `reviewed_by`, `reviewed_at` |
| `incidents` | Issues reported during shifts | `id`, `tenant_id`, `visit_id`, `reported_by`, `severity`, `description`, `status`, `reviewed_by`, `reviewed_at` |

### Regulated vs. non-regulated data boundary

**Non-regulated (can build now):**
- Client first name, last name (operational contact info)
- Visit schedules, assignments, task checklists
- Incident category and severity (operational)
- Note status and workflow state

**Regulated (blocked until BAA/HIPAA approval):**
- Clinical observations in visit notes
- Diagnosis or condition details in care plans
- Medication information
- Detailed health-related incident descriptions
- Any data that constitutes PHI/ePHI

### Practical consequence

The care-ops tables can be created and the Staff App can be built. But the `visit_notes.content` and `incidents.description` fields must only contain synthetic/demo data until the compliance checkpoint (Section 11) is cleared.

The UI should include a visible banner: "Demo Mode — Do not enter real patient information" until regulated mode is approved.

---

## 15. Care Assistant / Staff App MVP Scope

### In scope

| Feature | Description |
|---|---|
| **My Shifts Today** | Mobile-first dashboard showing today's assigned visits for the logged-in caregiver |
| **Visit Detail** | View assigned visit with client summary, location, scheduled time |
| **Care Plan Summary** | Read-only view of the care plan and required tasks for this visit |
| **Task Checklist** | Check off ADLs and visit tasks. Mark as complete with timestamp. |
| **Visit Note Drafting** | Free-text entry for visit narrative |
| **AI Note Assistance** | "Improve Note" button that sends draft to an Edge Function → LLM → returns formatted text. Flags missing tasks. |
| **Incident Reporting Lite** | Submit a basic issue report (severity, description, optional photo) |
| **Supervisor Review Queue** | Office-side UI for supervisors to view submitted notes, approve or reject, add comments |
| **Audit Trail** | All note submissions, edits, approvals, and rejections logged to `audit_log` |

### Out of scope (MVP)

| Not Building | Why |
|---|---|
| EVV vendor submission | Backend governance, not MVP |
| GPS-based clock-in/out | Requires technology ADR and EVV foundation |
| State-specific EVV overlays | Far-future compliance work |
| Full scheduling UI | Visits are created by admin/scheduler, not by caregiver |
| Full billing/payroll | Downstream of verified visits |
| Family portal | Requires regulated-data approval |
| Medication tracking | Requires clinical data approval |
| Real PHI/ePHI collection | Blocked until Section 11 is cleared |

### User flows

**Caregiver flow:**
1. Login → see "My Shifts Today"
2. Tap visit → see client info, care plan tasks
3. Complete tasks → check off each one
4. Write visit note → optionally tap "Improve with AI"
5. Submit note → note moves to "Submitted" status
6. If issue occurs → tap "Report Issue" → fill lite form → submit

**Supervisor flow:**
1. Login → see "Notes Pending Review" queue
2. Tap note → see visit context, task completion, and note text
3. Approve or reject with optional comment
4. View incident reports → acknowledge or escalate

---

## 16. AI Note Assistant — Minimal Implementation Design

### Architecture

One Supabase Edge Function: `ai-improve-note`

**Input:**
```json
{
  "visit_id": "uuid",
  "draft_text": "pt was good today did all tasks fed lunch bathed",
  "care_plan_tasks": ["Assist with feeding", "Assist with bathing", "Medication reminder"]
}
```

**Processing:**
1. Tenant guard validates JWT.
2. Module check confirms `care-ops` is active for this tenant.
3. **Auto-save draft locally before calling the Edge Function** (see UX handling below).
4. Send prompt to LLM (OpenAI/Anthropic via existing `aiClient.ts` pattern).
5. Prompt instructs the model to:
   - Fix grammar and expand shorthand
   - Format into professional care documentation style
   - Flag any care plan tasks not mentioned in the note
   - **Not invent care facts**
   - **Not add clinical observations not present in the draft**
6. Log the inference (see Section 17).
7. Return improved text + list of missing tasks.

**Output:**
```json
{
  "improved_text": "The patient was in good spirits today. All scheduled tasks were completed. Lunch was prepared and served. Bathing assistance was provided.",
  "missing_tasks": ["Medication reminder"],
  "inference_id": "uuid"
}
```

### Latency and UX requirements

LLM inference routinely takes 3–10 seconds. On a mobile device with spotty cellular, this is a likely timeout path. The following must be implemented regardless of technology choice:

| Requirement | Implementation |
|---|---|
| **Draft autosave before AI call** | The caregiver's current draft text is saved to `visit_notes` (status: `draft`) before the Edge Function is invoked. If the AI call fails, the draft is not lost. |
| **Loading state** | "Improve with AI" button shows a spinner and disabled state while the request is in flight. |
| **Client-side timeout** | The frontend sets a 15-second fetch timeout. If the Edge Function has not responded in 15 seconds, the request is aborted. |
| **User-facing timeout message** | On timeout: "AI improvement is taking longer than expected. Your draft has been saved. Try again." |
| **Retry** | A single manual retry is available. No automatic retry loops (avoids billing abuse). |
| **Edge Function hard timeout** | Set `--timeout 20s` in Edge Function config. Ensures Supabase terminates the function before the client gives up. |

### MVP vs. async future path

**MVP**: Synchronous Edge Function is acceptable if median response time in testing is under 5 seconds on a 4G connection. Validate this during Phase 6 integration testing.

**If latency is unacceptable**: Migrate to an async pattern:
1. Client POSTs draft → Edge Function enqueues a job → returns immediately with `{ job_id }`.
2. Client polls `GET /ai-job-status/{job_id}` every 2 seconds.
3. When status is `complete`, client fetches result.
4. Alternative: Supabase Realtime subscription on `ai_inference_log` row for the `inference_id`.

This async migration should not be built speculatively — only if synchronous MVP proves unacceptably slow.

### Prohibited AI actions

- AI must not invent care facts (e.g., adding "vital signs were normal" when not mentioned).
- AI must not generate diagnoses or clinical assessments.
- AI must not auto-submit notes. Human must review and submit.
- AI must not access other patients' data for context.

### What is NOT built yet

- Prompt management UI
- A/B testing of prompts
- Model selection UI
- Batch processing
- Supervisor copilot (future)
- Compliance risk agent (future)
- Scheduling assistant (future)

---

## 17. AI Inference Logging Requirements

### Why required

Healthcare AI outputs may be reviewed in compliance audits, legal proceedings, or quality reviews. Every AI interaction must be traceable.

### Table: `ai_inference_log`

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `tenant_id` | UUID | Tenant isolation |
| `user_id` | UUID | Who triggered the inference |
| `function_name` | TEXT | e.g., `ai-improve-note` |
| `model` | TEXT | e.g., `gpt-4o`, `claude-sonnet-4-20250514` |
| `input_text` | TEXT | The draft text sent to the model |
| `input_context` | JSONB | Additional context (care plan tasks, visit ID) |
| `output_text` | TEXT | The model's response |
| `output_metadata` | JSONB | Missing tasks, flags, etc. |
| `prompt_version` | TEXT | Version identifier for the prompt template |
| `latency_ms` | INTEGER | Response time |
| `status` | TEXT | `success`, `error`, `timeout` |
| `error_message` | TEXT | Error details if failed |
| `created_at` | TIMESTAMPTZ | When the inference occurred |

### Rules

- Every call to `ai-improve-note` (and any future AI Edge Function) must write to this table before returning.
- This table is append-only. No updates or deletes.
- RLS: tenant-scoped reads for `auditor` and `agency_admin` roles.
- No dedicated UI for now. Accessible via the existing AI Dashboard page (extended) or direct database query.

### Existing AI tables

The current migrations (`20251203000000_create_ai_tables.sql`, `20260310000001_epic5_offers_aicache_tenant.sql`) created `ai_logs` and `ai_cache` tables. The new `ai_inference_log` table should follow the same pattern but be explicitly designed for care-ops traceability. Evaluate whether to extend `ai_logs` or create a new table during implementation.

---

## 18. EVV Governance Separation

### The five-layer model

```
┌─────────────────────────────────────────────────┐
│  Layer 1: Staff App Field UX                    │
│  (Caregiver taps "Start Visit" / "End Visit")   │
│  Captures: device time, GPS coordinates          │
│  Writes to: HOMS database only                   │
├─────────────────────────────────────────────────┤
│  Layer 2: AI-Powered EVV Logic                  │
│  (Validates check-in against geofence/schedule)  │
│  Flags: anomalies, late arrivals, GPS mismatch   │
│  Writes to: HOMS database only                   │
├─────────────────────────────────────────────────┤
│  Layer 3: Official EVV Ledger                   │
│  (Immutable record of finalized visit evidence)  │
│  Source of truth for billing and compliance       │
├─────────────────────────────────────────────────┤
│  Layer 4: EVV Integration Broker                │
│  (Backend worker transforms ledger data)         │
│  Formats: XML/JSON per vendor specification      │
│  Handles: retries, rejections, reconciliation    │
├─────────────────────────────────────────────────┤
│  Layer 5: Vendor / State Adapters               │
│  (Sandata, HHAeXchange, state aggregators)       │
│  HOMS does not build these yet                   │
└─────────────────────────────────────────────────┘
```

### Hard rules

- **Staff App must NEVER call EVV vendor APIs directly.** It only writes to HOMS tables.
- **Layers 3-5 are not MVP.** They are Phase 9+ deliverables.
- **Layer 2 is not MVP.** Basic check-in/out UX is Phase 6. AI validation is Phase 9.
- **Layer 1 (basic time capture) is part of Staff App MVP** only if the technology supports it (GPS requires Expo/React Native, not PWA).

### What Staff App MVP includes (EVV-related)

- A "Start Visit" and "End Visit" button that records timestamps.
- If native app: device GPS coordinates captured at start/end.
- If PWA: GPS via browser Geolocation API (less reliable, no background).
- All data written to `visits` table (`actual_start`, `actual_end`, `start_lat`, `start_lng`, `end_lat`, `end_lng`).

### What Staff App MVP does NOT include

- Geofence validation
- Real-time anomaly detection
- Official EVV ledger
- Any vendor submission
- Any state-specific formatting

---

## 19. What Not to Build Yet

| Capability | Why Not Yet | When |
|---|---|---|
| Full scheduling UI | Requires client base, care plans, and staff availability model | Phase 8+ |
| Open shift recovery | Requires scheduling foundation | Phase 10 |
| Family portal | Requires regulated-data approval and client data maturity | Phase 11 |
| Billing / payroll prep | Requires verified visit data from EVV | Phase 12 |
| Sandata adapter | EVV vendor integration, not MVP | Phase 9+ |
| HHAeXchange adapter | EVV vendor integration, not MVP | Phase 9+ |
| State EVV overlays | Requires vendor adapters | Phase 9+ |
| Prompt management UI | Over-engineering for current AI usage | When 5+ AI functions exist |
| Full monorepo (Turborepo) | Premature optimization | When Staff App is a separate Expo app |
| Microservices | Unnecessary at current scale | If specific module needs independent scaling |
| `role_permissions` database table | In-code mapping is sufficient for 6 roles | When roles exceed 8-10 |
| Medication tracking | Clinical data, requires HIPAA approval | After compliance checkpoint |
| Real client/patient data | Blocked until BAA is confirmed | After Section 11 is cleared |

---

## 20. Phased Roadmap with Acceptance Criteria

### Phase 0: Preserve and Audit Current HOMS

**Objective**: Baseline the current system. Ensure nothing is broken before changing anything.

**Scope**:
- Complete RLS test suite (Section 10)
- Audit all 31 Edge Functions for correct tenant guard usage
- Document current JotForm field inventory
- Verify all 60 migrations are consistent
- Fix any broken tests

**Dependencies**: None

**Deliverables**:
- RLS test suite passing
- Edge Function audit report
- JotForm field mapping document

**Acceptance criteria**:
- All RLS tests pass
- Every Edge Function uses `tenantGuard()` or `cronOrTenantGuard()` as first call
- No known data leakage paths between tenants

---

### Phase 1: Stabilize Lifecycle Gaps

**Objective**: Fix the highest-severity gaps in the current system.

**Scope**:
- Consolidate applicant → offer → employee conversion into one deterministic service
- Fix employee status to reflect business rules, not sync timing
- Formalize WordPress/LearnDash identity reconciliation
- Add configuration validation for recurring compliance

**Dependencies**: Phase 0 complete

**Deliverables**:
- Updated `employeeService.ts` with deterministic conversion
- Updated `onboard-employee` Edge Function
- Identity reconciliation documentation
- Compliance diagnostics improvements

**Acceptance criteria**:
- Applicant → employee conversion produces consistent results regardless of sync order
- Employee status is set by explicit business rules, verified by tests
- Recurring compliance shows clear diagnostics when groups/rules are misaligned

---

### Phase 2: Reorganize into Macro-Domains

**Objective**: Implement the Feature-Sliced Design folder structure from Section 4.

**Scope**:
- Create macro-domain folders
- Move all files per the mapping in Section 6
- Update all import paths
- Update App.tsx routes
- Add barrel exports
- Verify app builds and all routes work

**Dependencies**: Phase 1 complete

**Deliverables**:
- Reorganized codebase matching target structure
- All tests passing
- App functioning identically to pre-refactor

**Acceptance criteria**:
- `npm run build` succeeds
- All existing features work without regression
- No cross-macro-domain import violations

---

### Phase 3: Formalize Tenant Module Access + RBAC Extension

**Objective**: Implement lightweight module gating and expanded roles.

**Scope**:
- Add `active_modules` to `tenant_settings` JSONB
- **Backfill all existing tenant rows** with `{"active_modules": ["hr-compliance"]}` (migration script)
- Update tenant guard to parse `active_modules` from JWT
- Add `requireModule()` to tenant guard
- Expand `TenantRole` to 6 roles
- Implement in-code role-to-permission mapping
- Update `ProtectedRoute` for new roles
- Run Admin API role migration script (`scripts/migrate-roles.ts`) — **not a SQL migration** (see Section 8)
- Add `platform_owner` admin UI to enable/disable macro-modules per tenant

**Dependencies**: Phase 2 complete

**Deliverables**:
- Updated `tenant-guard.ts`
- Updated `ProtectedRoute`
- `scripts/migrate-roles.ts` Admin API script (executed manually, not in migration folder)
- Database migration to backfill `active_modules` in `tenant_settings` for existing tenants
- Module toggle UI in admin settings (for `platform_owner` role)
- Module-gated navigation in frontend

**Acceptance criteria**:
- Tenant with only `hr-compliance` does not see care-ops navigation
- Edge Functions return 403 for disabled modules
- All 6 roles are recognized by the system
- Existing users retain correct access after role rename
- All existing tenants have `active_modules` populated (not null/empty)
- `platform_owner` can enable/disable `care-ops` module per tenant from admin UI

---

### Phase 4: Native Applicant Intake / JotForm Reduction

**Objective**: Move core applicant intake to native HOMS forms.

**Scope**:
- Build native applicant intake form (React)
- Direct write to `applicants` table (no webhook)
- Tenant-aware routing and audit
- Keep JotForm as adapter for unmigrated tenants
- Stop designing new features around JotForm

**Dependencies**: Phase 3 complete, JotForm field mapping from Phase 0

**Deliverables**:
- Native applicant intake page
- Updated applicant list to show both native and JotForm-origin applicants
- JotForm adapter mode documentation

**Acceptance criteria**:
- New applicants can be submitted via native form
- Existing JotForm webhook continues to work for legacy tenants
- No new feature depends on JotForm-specific fields

---

### Phase 5: Care Operations Foundation

**Objective**: Build the database tables and basic admin UI for care operations.

**Scope**:
- Create all care-ops tables from Section 14
- RLS policies for all new tables
- RLS tests for all new tables
- Basic admin UI for managing clients, care plans, and visits
- Seed with synthetic/demo data

**Dependencies**: Phase 3 complete (module gating), Section 11 compliance checkpoint initiated

**Deliverables**:
- Database migrations for care-ops tables
- `ai_inference_log` table
- Admin pages for client list, care plan editor, visit scheduler
- Demo data seed script

**Risks**:
- Temptation to store real client data before BAA is confirmed

**Acceptance criteria**:
- All care-ops tables have `tenant_id` + RLS
- RLS tests cover all new tables
- Admin can create clients, care plans, and visits
- "Demo Mode" banner visible when regulated-data approval is not confirmed

---

### Phase 6: Care Assistant / Staff App MVP

**Objective**: Build and deploy the caregiver-facing field workflow.

**Scope**: Everything in Section 15 (In scope)

**Dependencies**:
- Phase 5 complete (tables exist)
- ADR-004: Staff App technology decision made
- If Expo: separate package bootstrapped

**Deliverables**:
- Staff App (PWA or native app)
- "My Shifts Today" dashboard
- Visit detail with task checklist
- Note drafting with AI assistance
- Incident reporting lite
- Supervisor review queue (office UI)
- `ai-improve-note` Edge Function
- `ai_inference_log` writes

**Risks**:
- Field staff adoption
- Offline connectivity issues (if PWA chosen)

**Acceptance criteria**:
- Caregiver can view assigned visits, complete tasks, draft notes, and submit
- AI note improvement returns formatted text and flags missing tasks
- Supervisor can review, approve, and reject notes
- All actions logged to audit_log
- All AI calls logged to ai_inference_log

---

### Phase 7: AI Documentation and Supervisor Review Enhancement

**Objective**: Improve AI capabilities for care documentation.

**Scope**:
- Supervisor copilot: AI highlights high-risk notes across the tenant
- Batch note quality scoring
- Enhanced missing-task detection
- Note template suggestions based on care plan

**Dependencies**: Phase 6 complete, real usage data from MVP

**Deliverables**: Enhanced AI Edge Functions, supervisor dashboard improvements

**Acceptance criteria**: Supervisors report reduced review time, AI flags are actionable

---

### Phase 8: Compliance-Aware Assignments and Shift Readiness

**Objective**: Prevent scheduling of non-compliant staff.

**Scope**:
- Cross-reference `visit_assignments` with recurring compliance status
- Block assignment of staff with expired credentials
- Pre-shift readiness check (confirmation, "on my way")

**Dependencies**: Phase 6 complete, recurring compliance data mature

---

### Audit Log — Indexing and Scaling

> This is not a separate phase. It is a technical requirement that applies from Phase 0 onward and must be revisited before Care Ops goes to production scale.

**Required indexes (apply at migration time):**

```sql
-- All existing and future audit_log tables must carry these indexes
CREATE INDEX idx_audit_log_tenant_id       ON audit_log (tenant_id);
CREATE INDEX idx_audit_log_created_at      ON audit_log (created_at DESC);
CREATE INDEX idx_audit_log_entity          ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_log_actor           ON audit_log (actor_id);
CREATE INDEX idx_audit_log_tenant_created  ON audit_log (tenant_id, created_at DESC);
```

Verify existing `audit_log` (and `ai_logs`) tables carry these before Phase 5.

**Future decision point — partitioning/archive strategy:**

Before Care Ops goes to production scale (i.e., before Phase 9), evaluate whether `audit_log` requires:

| Option | When to Choose |
|---|---|
| **Monthly Postgres partitioning** (`PARTITION BY RANGE (created_at)`) | If the table exceeds 5M rows/month or query times degrade above 200ms |
| **Archive to cold storage** (export to S3/GCS after 90 days, truncate old partitions) | If retention cost on Supabase becomes significant |
| **Separate `care_ops_audit_log` table** with partitioning | If care-ops audit volume is an order of magnitude higher than HR audit volume |

Document the chosen strategy in a new ADR before Phase 9 begins.

---

### Phase 9: EVV Workflow and Governance Foundation

**Objective**: Build internal EVV ledger and validation (Layers 2-3).

**Scope**:
- Official EVV ledger table
- Geofence validation logic
- Anomaly detection (late arrival, GPS mismatch)
- EVV audit trail

**Dependencies**: Phase 6 complete, GPS capture working in Staff App

---

### Phase 10: Open Shift Recovery

**Objective**: Automated broadcasting and reassignment of cancelled shifts.

### Phase 11: Family Portal

**Objective**: Read-only transparency for client families. Requires regulated-data approval.

### Phase 12: Billing / Payroll Prep

**Objective**: Export verified visit data to financial systems.

---

## 21. Implementation Tasks for Cursor / Codex / Claude

When handing individual phases to an AI coding agent, use these task specifications:

### Phase 0 task prompt

```
You are working on an existing React + Supabase application at prolific-hr-app/.
The app uses Supabase Edge Functions (Deno) at supabase/functions/.
Tenant isolation uses JWT app_metadata claims. See supabase/functions/_shared/tenant-guard.ts.

Task: Create an RLS integration test suite.
- Create tests that verify cross-tenant data isolation.
- Use two test tenants with different tenant_id values.
- Test tables: applicants, offers, people, training_records, employee_compliance_instances, audit_log.
- Assert that Tenant A's data is invisible to Tenant B's authenticated session.
- Assert that unauthenticated requests return zero rows.
- Place tests in prolific-hr-app/tests/rls/ or supabase/tests/rls/.

Do not modify any existing source code. Only create test files.
```

### Phase 2 task prompt

```
You are working on an existing React + Supabase application at prolific-hr-app/.
The current src/features/ structure has: admin, applicants, auth, dashboard, employees, offers, profile, settings, training.

Task: Reorganize into macro-domains using Feature-Sliced Design.

STEP 1 — Add TypeScript path aliases BEFORE moving any files.
  In tsconfig.json compilerOptions.paths:
    "@shared/*": ["./src/shared/*"]
    "@core/*": ["./src/features/core/*"]
    "@hr-compliance/*": ["./src/features/hr-compliance/*"]
    "@care-ops/*": ["./src/features/care-ops/*"]
    "@admin/*": ["./src/features/admin/*"]
  In vite.config.ts resolve.alias:
    '@shared': path.resolve(__dirname, './src/shared')
    '@core': path.resolve(__dirname, './src/features/core')
    '@hr-compliance': path.resolve(__dirname, './src/features/hr-compliance')
    '@care-ops': path.resolve(__dirname, './src/features/care-ops')
    '@admin': path.resolve(__dirname, './src/features/admin')
  Verify build passes with aliases in place before touching any other files.

STEP 2 — Move files to the target structure:
- src/features/core/ → auth, profile, dashboard
- src/features/hr-compliance/ → applicants, offers, employees, training, connectors
- src/features/admin/ → settings (system, users), access-requests, ai-dashboard
- src/shared/ → components, hooks, lib, services, types

STEP 3 — Update all imports to use path aliases. No deep relative imports (../../..) allowed.
STEP 4 — Update App.tsx route imports.
STEP 5 — Add index.ts barrel exports at each macro-domain root.
STEP 6 — Verify: npm run build must succeed with zero errors and zero TypeScript errors.

Rules:
- Move files only. Do not change any component logic.
- All new and updated imports must use @shared/*, @core/*, etc. aliases.
- Deep relative imports (more than 2 levels) are banned after this phase.
- Do not create new features. Do not modify business logic. This is purely a structural refactor.
```

### Phase 3 task prompt

```
You are working on prolific-hr-app/supabase/functions/_shared/tenant-guard.ts.
Current TenantRole type: "platform_admin" | "tenant_admin" | "hr_admin"

Task: Extend the tenant guard and RBAC system.
1. Expand TenantRole to: "platform_owner" | "agency_admin" | "hr_manager" | "supervisor" | "caregiver" | "auditor"
2. Parse active_modules string array from app_metadata.
3. Add requireModule(moduleName: string) that throws TenantGuardError if module not in active_modules.
4. Create src/shared/lib/permissions.ts with:
   - Role-to-permission mapping (see implementation spec Section 8)
   - hasPermission(role, permission) function
   - Permission type union
5. Update ProtectedRoute to accept new role names.
6. Create a one-off Admin API script at `scripts/migrate-roles.ts` using
   `supabase.auth.admin.updateUserById()` to rename existing user roles:
     platform_admin → platform_owner
     tenant_admin   → agency_admin
     hr_admin       → hr_manager

   Do not create a SQL migration for `auth.users` role updates.
   Do not update `auth.users.raw_app_meta_data` directly through SQL.
   Run the script in staging first, capture role counts before and after,
   and keep a rollback script ready.

Do not create new UI pages. Do not modify business logic beyond auth/RBAC.
```

> **Important distinction for Phase 3 implementors:**
> - Backfilling `active_modules` in `tenant_settings` **is allowed as a normal SQL migration** because `tenant_settings` is an application-owned table under standard RLS.
> - Renaming roles in Supabase Auth `app_metadata` **must be done through the Supabase Admin API** (`supabase.auth.admin.updateUserById()`) because those values are stored in `auth.users.raw_app_meta_data`, which is managed by GoTrue. Updating it via SQL bypasses JWT cache invalidation, breaks token refresh, and can corrupt auth state.

### Phase 5 task prompt

```
You are working on prolific-hr-app/supabase/migrations/.

Task: Create care operations foundation tables.
Create a migration file with these tables (all require tenant_id UUID NOT NULL):
- clients, client_contacts, care_plans, care_plan_tasks
- visits, visit_assignments, visit_tasks, visit_notes, incidents
- ai_inference_log

All tables must have:
- UUID primary key (gen_random_uuid())
- tenant_id column with NOT NULL constraint
- created_at and updated_at timestamps
- RLS enabled with tenant isolation policy

See implementation spec Section 14 for column definitions.
See implementation spec Section 17 for ai_inference_log columns.

Do not create UI. Do not create Edge Functions. Only create the migration.
```

### Phase 6 Edge Function task prompt

```
You are working on prolific-hr-app/supabase/functions/.

Task: Create the ai-improve-note Edge Function.
- Path: supabase/functions/ai-improve-note/index.ts
- Uses tenantGuard() from _shared/tenant-guard.ts
- Uses requireModule("care-ops")
- Accepts POST with: visit_id, draft_text, care_plan_tasks[]
- Calls LLM via _shared/aiClient.ts pattern
- Prompt: format grammar, expand shorthand, flag missing care plan tasks
- Prompt must include: "Do not invent care facts. Do not add observations not present in the draft."
- Logs to ai_inference_log table (all fields from Section 17)
- Returns: improved_text, missing_tasks[], inference_id

Do not build a prompt management system. Do not build a UI. Only the Edge Function.
```

---

## 22. Risks and Open Questions

### Critical Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **PHI in demo mode**: Caregivers will type real patient info into a "Demo Mode" text box | Critical | Do not deploy Staff App to real agencies until BAA is confirmed. Pilot only with synthetic data and internal testers. |
| **Supabase BAA unavailable**: If current Supabase plan does not support BAA, all regulated data work is blocked at vendor level | Critical | Verify immediately. This is a Phase 0 action item. If BAA is not available, evaluate Supabase Enterprise or alternative hosting. |
| **RLS performance**: Adding care-ops tables with tenant isolation increases RLS policy evaluation load | High | Keep policies flat (single `tenant_id` check). Benchmark query performance after care-ops tables are created. |
| **Staff App adoption**: Caregivers may resist a new app, especially if it is slow or unreliable | High | Prioritize UX speed. Ensure offline support. Pilot with friendly agency first. |
| **Scope creep into EVV**: Pressure to add GPS/EVV features before governance layer exists | High | Hard block: EVV vendor submission is Phase 9+. Staff App captures timestamps only. |
| **Folder refactor regression**: Moving files in Phase 2 could break imports | Medium | Run full build + test suite after every batch of moves. Do it in one PR. |
| **Role migration breaking existing users**: Renaming roles in JWT could log out or lock out users | Medium | Test migration with a single tenant first. Have rollback migration ready. |

### Open Questions Requiring Product Owner Decision

| Question | Impact | Deadline |
|---|---|---|
| **Staff App technology: PWA vs Expo?** | Cascades into offline, GPS, push, distribution | Before Phase 6 planning |
| **Which agency pilots Staff App first?** | Affects rollout timeline and feedback loop | Before Phase 6 launch |
| **Canadian tenants: is PHIPA in scope for MVP?** | Determines if Canadian-region Supabase project is needed | Before Phase 5 |
| **AI model provider: OpenAI vs Anthropic vs both?** | Affects Edge Function implementation and cost | Before Phase 6 |
| **Is the existing `ai_logs` table sufficient or do we need `ai_inference_log` as a new table?** | Affects migration complexity | During Phase 5 implementation |
| **Offline note drafting: required for MVP or deferred?** | Affects technology choice and implementation complexity | Before Phase 6 planning |

### Folk Care Reference Notes

Folk Care was analyzed as a reference architecture only. No code will be copied. Key observations:

| Folk Care Feature | HOMS Relevance | Classification |
|---|---|---|
| Turborepo monorepo (`packages/app`, `packages/core`, `packages/web`, `packages/mobile`) | Useful architecture reference for future monorepo if needed | Reference only |
| `PermissionService` with `resource:action` pattern and wildcard matching | Validates HOMS permission string design. Similar approach. | Confirmed pattern |
| `scoped-database.ts` and `scoped-queries.ts` (tenant scoping) | HOMS uses RLS + JWT instead. Different but equivalent. | No action |
| Mobile app screens: `careplan/`, `incidents/`, `visits/`, `schedule/`, `shiftswap/` | Validates Staff App feature scope. Similar domain boundaries. | Reference for UX |
| `ClientIntakeWorkflow.tsx` (49KB) | Complex form. Validates need for native forms but warns about complexity. | Reference only |
| `billing-repository.ts`, `stripe.service.ts` | Future reference for Phase 12. Not needed now. | Build Later |
| FHIR and HL7 support (`packages/core/src/fhir/`, `packages/core/src/hl7/`) | Healthcare interoperability. Not needed for MVP. | Do Not Build Yet |
| `white-label.service.ts`, `branding-repository.ts` | Multi-tenant branding. Nice-to-have, not priority. | Build Later |

---

## Appendix A: Document Cross-References

This specification supersedes and consolidates guidance from:

| Document | Status | Relationship |
|---|---|---|
| [homs-existing-platform-summary.md](file:///c:/Users/oyiny/OneDrive/2025/manueltech/Projects/Prolific%20Homecare%20LLC/Prolific%20HR%20-%20Command%20Centre/docs/product/homs-existing-platform-summary.md) | Current | Source of truth for what HOMS does today |
| [homs-current-capability-map.md](file:///c:/Users/oyiny/OneDrive/2025/manueltech/Projects/Prolific%20Homecare%20LLC/Prolific%20HR%20-%20Command%20Centre/docs/audits/homs-current-capability-map.md) | Current | Evidence-based inventory of current capabilities |
| [homs-current-domain-map.md](file:///c:/Users/oyiny/OneDrive/2025/manueltech/Projects/Prolific%20Homecare%20LLC/Prolific%20HR%20-%20Command%20Centre/docs/architecture/homs-current-domain-map.md) | Current | Logical domain boundaries in current code |
| [homs-gap-register.md](file:///c:/Users/oyiny/OneDrive/2025/manueltech/Projects/Prolific%20Homecare%20LLC/Prolific%20HR%20-%20Command%20Centre/docs/audits/homs-gap-register.md) | Current | Known gaps driving Phase 0-1 priorities |
| [homs-planned-capability-map.md](file:///c:/Users/oyiny/OneDrive/2025/manueltech/Projects/Prolific%20Homecare%20LLC/Prolific%20HR%20-%20Command%20Centre/docs/audits/homs-planned-capability-map.md) | Current | Future capability aspirations (not shipped) |
| [homs-jotform-replacement-strategy.md](file:///c:/Users/oyiny/OneDrive/2025/manueltech/Projects/Prolific%20Homecare%20LLC/Prolific%20HR%20-%20Command%20Centre/docs/architecture/homs-jotform-replacement-strategy.md) | Current | JotForm migration governance |
| homs-platform-evolution-plan.md | Superseded by this document | Original evolution plan (partial) |

## Appendix B: Glossary

| Term | Definition |
|---|---|
| **ADL** | Activities of Daily Living — standard care tasks (feeding, bathing, dressing) |
| **BAA** | Business Associate Agreement — HIPAA requirement for vendors handling PHI |
| **EVV** | Electronic Visit Verification — federally mandated proof of home care visits |
| **ePHI** | Electronic Protected Health Information |
| **HIPAA** | Health Insurance Portability and Accountability Act (US) |
| **PHIPA** | Personal Health Information Protection Act (Ontario, Canada) |
| **PHI** | Protected Health Information |
| **RLS** | Row Level Security — Postgres feature enforcing data isolation |
| **Macro-domain** | Top-level organizational boundary in Feature-Sliced Design (core, hr-compliance, care-ops, admin) |
