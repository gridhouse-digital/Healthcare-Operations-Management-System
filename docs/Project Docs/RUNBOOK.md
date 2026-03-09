# RUNBOOK — HOMS

> How to run, test, deploy, and troubleshoot. Updated: 2026-03-06.

---

## Local Development

### Prerequisites
- Node.js 22+
- Supabase CLI (`npm install -g supabase`)
- Deno 1.40+ (for EF tests)

### Start dev server
```bash
cd prolific-hr-app
npm install
npm run dev
# App runs at http://localhost:5173
```

### Environment variables (prolific-hr-app/.env)
```
VITE_SUPABASE_URL=https://peffyuhhlmidldugqalo.supabase.co
VITE_SUPABASE_ANON_KEY=<from Supabase Dashboard → Settings → API>
VITE_WP_API_URL=https://onboard.prolificcaregroup.com/wp-json
VITE_WP_USERNAME=<wp username>
VITE_WP_APP_PASSWORD=<wp application password>
```

### Supabase Edge Function secrets (set via Dashboard → Edge Functions → Manage Secrets)
```
JOTFORM_API_KEY=<JotForm API key>
ANTHROPIC_API_KEY=<Anthropic API key>
ALLOWED_ORIGIN_1=<your deployed frontend URL>
SUPABASE_SERVICE_ROLE_KEY=<from Dashboard → Settings → API>
```

---

## Database

### Apply migrations to remote
```bash
cd prolific-hr-app
npx supabase link    # first time only — select project peffyuhhlmidldugqalo
npx supabase db push
```

### If migration history is out of sync
```bash
# Mark remote-only migrations as applied (adjust IDs as needed)
npx supabase migration repair --status applied <migration_id_1> <migration_id_2>
npx supabase db push
```

### Inspect tables
```bash
npx supabase db inspect tables
```

---

## Edge Functions

### Deploy all MVP functions
```bash
cd prolific-hr-app
npx supabase functions deploy test-connector save-connector save-ld-mappings \
  list-tenant-users invite-tenant-user update-tenant-user-role deactivate-tenant-user
```

### Deploy a single function
```bash
npx supabase functions deploy <function-name>
```

### View logs
```bash
npx supabase functions logs <function-name> --tail
```

### If deploy fails with "Unsupported lockfile version"
```bash
rm prolific-hr-app/supabase/functions/deno.lock
npx supabase functions deploy <function-name>
```

---

## Running Tests

### Shared EF utility tests (Deno)
```bash
cd prolific-hr-app/supabase/functions
deno test _shared/tests/ --allow-env --allow-net --coverage=coverage_profile
```

### Coverage report
```bash
deno coverage coverage_profile --lcov > coverage.lcov
# Check: tenant-guard ≥100%, cors ≥100%, audit-logger ≥100%, error-response ≥100%
```

### RLS isolation test
```bash
cd prolific-hr-app
# Requires local Supabase running
npx supabase start
deno run --allow-env --allow-net scripts/seed-rls-test-tenants.ts
# Export JWTs printed to stdout, then:
deno run --allow-env --allow-net scripts/test-rls-isolation.ts
```

---

## Tenant Setup (Production)

### Seed a new tenant
```sql
-- Run in Supabase Dashboard SQL editor
INSERT INTO public.tenants (id, name, slug)
VALUES (gen_random_uuid(), 'Agency Name', 'agency-slug');

INSERT INTO public.tenant_settings (tenant_id)
VALUES (<new_tenant_id>);
```

### Assign a user to a tenant
```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data ||
  '{"tenant_id": "<tenant_id>", "role": "tenant_admin"}'::jsonb
WHERE email = 'user@example.com';
```

**Then user must sign out and sign back in** to get a fresh JWT with the new app_metadata.

---

## Troubleshooting

### 406 on /rest/v1/tenant_settings
- Cause: User's JWT does not have `tenant_id` in `app_metadata`, so RLS returns 0 rows and `.single()` fails.
- Fix: Update `raw_app_meta_data` on auth.users (see Tenant Setup above). User must re-login.

### Edge Function returns 401 "Missing or invalid tenant"
- Cause: `tenant_guard()` could not extract `tenant_id` from JWT.
- Fix: Verify user has `tenant_id` in `app_metadata`. Check JWT at jwt.io.

### Edge Function CORS error in browser
- Cause: `ALLOWED_ORIGIN_1` secret not set, or set to wrong URL.
- Fix: Supabase Dashboard → Edge Functions → Manage Secrets → set `ALLOWED_ORIGIN_1` to exact frontend URL (no trailing slash).
- Local dev note: loopback origins like `http://localhost:5173`, `http://localhost:5174`, and `http://127.0.0.1:*` should be allowed by the shared CORS helper after redeploying the function code.

### BambooHR/JazzHR connector test fails
- Check: API key is correct and has read permissions.
- Check: Subdomain is correct (e.g. `yourcompany` not `yourcompany.bamboohr.com`).
- Check: EF logs: `npx supabase functions logs test-connector --tail`.

### WordPress API timeout from localhost
- Expected: `onboard.prolificcaregroup.com` is not accessible from local machine.
- Not a bug. WordPress calls work in production (from Supabase Edge Functions).

### Sync overwrote HR-adjusted training data
- This is a critical compliance bug if it happens post-Epic 4.
- Check: `sync-training` EF must only write to `training_records`, never `training_adjustments`.
- Recovery: Restore from `audit_log` (before JSONB field contains pre-sync state).

### deno.lock version error on deploy
```bash
rm prolific-hr-app/supabase/functions/deno.lock
npx supabase functions deploy <function-name>
```
