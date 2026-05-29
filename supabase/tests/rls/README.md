# RLS Integration Test Suite (Phase 0)

Proves **tenant isolation**: data written under one tenant is invisible to
another tenant's authenticated session, and to unauthenticated callers.

Source of truth: `docs/architecture/homs-platform-expansion-implementation-spec.md` §10.

## What it does

1. Creates **two test tenants** (A and B), each with one authenticated user whose
   JWT `app_metadata.tenant_id` differs (set via the Supabase Admin API —
   mirroring how `tenant-guard.ts` reads tenancy).
2. Seeds one row per target table under each tenant using a **service-role**
   client (setup only — bypasses RLS).
3. Asserts, through **RLS-active** clients, that:
   - Tenant B cannot read Tenant A's rows (and vice-versa) → **0 rows**
   - An anonymous (no-JWT) client cannot read any rows → **0 rows**
   - Each tenant **can** read its own row → **1 row** (positive control, so a
     blanket "deny all" policy can't pass as a false green)

Target tables (spec §10 matrix): `people`, `applicants`, `offers`,
`training_records`, `employee_compliance_instances`, `audit_log`.

## Files

| File | Purpose |
|---|---|
| `rls.test.ts` | The test matrix. |
| `_harness.ts` | Env loading, tenant/user provisioning, teardown. |
| `_seed.ts` | One-row-per-table seeders. |
| `deno.json` | `test:rls` task + import map. |

These are **test-only**. No application or business logic is imported or modified.

## Requirements

A running Supabase project. **Use a local stack or a disposable staging project —
never production** (the suite creates and deletes users, tenants, and rows).

Set three environment variables (the suite **skips cleanly** if any are missing):

```
SUPABASE_URL=...                # e.g. http://127.0.0.1:54321 for a local stack
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # service role — required to provision test users
```

`RLS_TEST_SUPABASE_URL` / `RLS_TEST_SUPABASE_ANON_KEY` /
`RLS_TEST_SUPABASE_SERVICE_ROLE_KEY` are accepted as alternatives, so you can point
at a dedicated test DB without disturbing other tooling.

The target tables and their RLS policies must already exist (apply migrations
first: `npx supabase db push`, or `supabase start` which applies them locally).

## Run

### Local Supabase (recommended)

```bash
# from prolific-hr-app/
npx supabase start                  # boots local stack, applies migrations
# grab the keys it prints (anon + service_role) and the API URL

cd supabase/tests/rls
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY=<local anon key> \
SUPABASE_SERVICE_ROLE_KEY=<local service_role key> \
deno task test:rls
```

PowerShell:

```powershell
$env:SUPABASE_URL="http://127.0.0.1:54321"
$env:SUPABASE_ANON_KEY="<local anon key>"
$env:SUPABASE_SERVICE_ROLE_KEY="<local service_role key>"
deno task test:rls
```

### npm-style shortcut

A convenience script is wired into `prolific-hr-app/package.json`:

```bash
npm run test:rls        # runs: deno task --cwd supabase/tests/rls test:rls
```

(Requires Deno on PATH and the three env vars above set in the shell.)

## Acceptance criteria (spec §10)

- All tests pass green.
- Tests can be run via `npm run test:rls`.
- Must pass before any new tenant-scoped migration is merged.

## Notes

- Cross-tenant denial surfaces as **zero rows**, not an error — that's how RLS
  `SELECT` policies behave. A thrown error (bad column/table) fails the test loudly.
- Teardown removes everything the run created. Rows are namespaced with a random
  `runId`, so a crashed run leaves only clearly-labelled `rls-test-*` artifacts.
