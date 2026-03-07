# AGENTS.md

## Cursor Cloud specific instructions

### Overview

HOMS (Healthcare Operations Management System) is a React 19 + TypeScript + Vite SPA that connects to a hosted Supabase backend. The only local service is the Vite dev server. See `docs/Project Docs/CLAUDE.md` for full architecture and coding guidelines.

### Running the app

```bash
npm run dev   # Vite dev server on http://localhost:5173
```

### Lint / Build / Test

- `npm run lint` — ESLint (pre-existing warnings/errors exist in the codebase)
- `npm run build` — `tsc -b && vite build` (pre-existing TS errors cause build to fail; Vite dev server still works fine since it skips full TS checking)
- No frontend test framework is configured (no Vitest/Jest). Deno tests exist for Supabase Edge Functions under `supabase/functions/_shared/tests/` but require Deno runtime.

### Environment

- `.env` contains `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (required for the app to connect to backend).
- All backend logic runs on hosted Supabase — no local database or Docker needed.
- Login requires valid Supabase Auth credentials for the connected project.

### Gotchas

- The `emails/` sub-directory is a separate React Email project with its own `package-lock.json`. Install separately with `cd emails && npm install` if you need to work on email templates.
- Edge Function deploys may fail with "Unsupported lockfile version" — delete `supabase/functions/deno.lock` and retry.
