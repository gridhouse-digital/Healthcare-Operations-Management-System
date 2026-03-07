# Epic 4 Story 4.2 — LearnDash Training Sync EF Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Supabase Edge Function that syncs LearnDash course progress into `training_records` (Layer A) for all WP-connected employees, with pg_cron daily scheduling.

**Architecture:** Multi-tenant fan-out EF following the `detect-hires-bamboohr` pattern. Fetches course progress per employee from LearnDash REST API, upserts `training_records` using ON CONFLICT, logs sync runs to `integration_log`. Run dedup prevents overlapping syncs. pg_cron triggers daily at 7 AM UTC.

**Tech Stack:** Deno (Supabase Edge Functions), Supabase JS v2 (jsr:), LearnDash REST API, pg_cron + pg_net

**Design doc:** `docs/plans/2026-03-07-epic4-sync-training-design.md`

**Reference EFs:**
- `supabase/functions/detect-hires-bamboohr/index.ts` — tenant fan-out, integration_log run tracking
- `supabase/functions/process-hire/index.ts` — WP auth, decryptKey, wpAuth patterns

---

### Task 1: Create sync-training EF scaffold with imports and constants

**Files:**
- Create: `supabase/functions/sync-training/index.ts`

**Step 1: Create the EF directory and file with imports, interfaces, and constants**

```typescript
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleError } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";

// Story 4.2 — LearnDash Training Sync
//
// Called by pg_cron daily at 7 AM UTC (2 AM EST).
// Also callable manually via POST with optional { tenant_id, force } body.
//
// Invariants enforced:
//   NFR-2: Idempotent — UPSERT ON CONFLICT (tenant_id, person_id, course_id).
//   NFR-3: Sync writes Layer A (training_records) ONLY. Never touches
//          training_adjustments (Layer B) or effective compliance values (Layer C).
//   NFR-4: Audit via DB trigger on training_records updates.
//   Story 3.3: All failures written to integration_log — no silent failures.

// ---------------------------------------------------------------------------
// Status mapping: LearnDash API values → DB CHECK constraint values
// ---------------------------------------------------------------------------
const LD_STATUS_MAP: Record<string, string> = {
  "not-started": "not_started",
  "in-progress": "in_progress",
  "completed": "completed",
};

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface LdCourseProgress {
  course: { id: number };
  progress_status: string;
  steps_completed: number;
  steps_total: number;
  date_started: string;
  date_completed: string;
}

interface TenantWpConfig {
  tenant_id: string;
  wp_site_url: string;
  wp_username_encrypted: string;
  wp_app_password_encrypted: string;
}

interface PersonWithWp {
  id: string;
  tenant_id: string;
  email: string;
  wp_user_id: number;
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PGCRYPTO_KEY = Deno.env.get("PGCRYPTO_ENCRYPTION_KEY") ?? "";
```

**Step 2: Verify the file was created**

Run: `ls supabase/functions/sync-training/index.ts`
Expected: File exists

**Step 3: Commit**

```bash
git add supabase/functions/sync-training/index.ts
git commit -m "feat(epic4): scaffold sync-training EF with imports and constants"
```

---

### Task 2: Add utility functions (decryptKey, wpAuth, course name cache, pagination)

**Files:**
- Modify: `supabase/functions/sync-training/index.ts`

**Step 1: Add the utility functions after the constants block**

Append after the `PGCRYPTO_KEY` line:

```typescript
// ---------------------------------------------------------------------------
// Shared helpers (same pattern as detect-hires-bamboohr + process-hire)
// ---------------------------------------------------------------------------

async function decryptKey(
  admin: ReturnType<typeof createClient>,
  encrypted: string,
): Promise<string> {
  const { data, error } = await admin.rpc("pgp_sym_decrypt_text", {
    ciphertext: encrypted,
    passphrase: PGCRYPTO_KEY,
  });
  if (error) throw new Error(`Decrypt failed: ${error.message}`);
  return data as string;
}

function wpAuth(username: string, appPassword: string): string {
  return `Basic ${btoa(`${username}:${appPassword}`)}`;
}

// ---------------------------------------------------------------------------
// LearnDash API helpers
// ---------------------------------------------------------------------------

/** Fetch course name by ID. Returns title.rendered only. */
async function fetchCourseName(
  siteUrl: string,
  auth: string,
  courseId: number,
  cache: Map<number, string>,
): Promise<string | null> {
  if (cache.has(courseId)) return cache.get(courseId)!;

  try {
    const res = await fetch(
      `${siteUrl}/wp-json/ldlms/v2/courses/${courseId}`,
      { headers: { Authorization: auth, Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const body = await res.json();
    const name = body?.title?.rendered ?? null;
    if (name) cache.set(courseId, name);
    return name;
  } catch {
    return null;
  }
}

/** Fetch all course progress for a WP user, handling pagination. */
async function fetchAllCourseProgress(
  siteUrl: string,
  auth: string,
  wpUserId: number,
): Promise<LdCourseProgress[]> {
  const allItems: LdCourseProgress[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `${siteUrl}/wp-json/ldlms/v2/users/${wpUserId}/course-progress?per_page=100&page=${page}`,
      { headers: { Authorization: auth, Accept: "application/json" } },
    );

    if (!res.ok) {
      throw new Error(
        `LD course-progress API error: ${res.status} ${await res.text()}`,
      );
    }

    const items = (await res.json()) as LdCourseProgress[];
    allItems.push(...items);

    const totalPages = parseInt(
      res.headers.get("x-wp-totalpages") ?? "1",
      10,
    );
    if (page >= totalPages) break;
    page++;
  }

  return allItems;
}
```

**Step 2: Verify no syntax errors**

Run: `cd supabase/functions && deno check sync-training/index.ts`
Expected: No errors (or only type errors for unresolved Supabase types which is normal for standalone check)

**Step 3: Commit**

```bash
git add supabase/functions/sync-training/index.ts
git commit -m "feat(epic4): add utility functions for sync-training EF"
```

---

### Task 3: Add run deduplication logic

**Files:**
- Modify: `supabase/functions/sync-training/index.ts`

**Step 1: Add the run dedup function after the fetchAllCourseProgress function**

```typescript
// ---------------------------------------------------------------------------
// Run deduplication
// ---------------------------------------------------------------------------

/**
 * Check if a sync run is already active for this tenant.
 * Returns: "proceed" | "skip" | { staleRunId: string }
 */
async function checkRunDedup(
  admin: ReturnType<typeof createClient>,
  tenantId: string,
): Promise<"proceed" | "skip" | { staleRunId: string }> {
  const { data: existing } = await admin
    .from("integration_log")
    .select("id, started_at")
    .eq("tenant_id", tenantId)
    .eq("source", "learndash")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1);

  if (!existing || existing.length === 0) return "proceed";

  const run = existing[0];
  const startedAt = new Date(run.started_at as string).getTime();
  const ageMs = Date.now() - startedAt;
  const ONE_HOUR = 60 * 60 * 1000;

  if (ageMs < ONE_HOUR) {
    // Recent run still active — skip
    return "skip";
  }

  // Stale run — mark it and proceed
  await admin
    .from("integration_log")
    .update({
      status: "stale",
      completed_at: new Date().toISOString(),
      payload: { error: "Marked stale by newer run" },
    })
    .eq("id", run.id);

  return { staleRunId: run.id as string };
}
```

**Step 2: Commit**

```bash
git add supabase/functions/sync-training/index.ts
git commit -m "feat(epic4): add run deduplication for sync-training"
```

---

### Task 4: Add processTenant function (core sync logic)

**Files:**
- Modify: `supabase/functions/sync-training/index.ts`

**Step 1: Add the processTenant function after checkRunDedup**

```typescript
// ---------------------------------------------------------------------------
// Per-tenant sync
// ---------------------------------------------------------------------------

async function processTenant(
  admin: ReturnType<typeof createClient>,
  config: TenantWpConfig,
  force: boolean,
): Promise<{
  synced: number;
  skipped: number;
  errors: number;
  run_skipped?: boolean;
}> {
  // Run dedup check (unless force=true)
  if (!force) {
    const dedup = await checkRunDedup(admin, config.tenant_id);
    if (dedup === "skip") {
      return { synced: 0, skipped: 0, errors: 0, run_skipped: true };
    }
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  let synced = 0;
  let skipped = 0;
  let errors = 0;

  // Determine if we replaced a stale run (for payload)
  let replacedStaleRun: string | undefined;
  if (!force) {
    const dedup = await checkRunDedup(admin, config.tenant_id);
    if (typeof dedup === "object" && "staleRunId" in dedup) {
      replacedStaleRun = dedup.staleRunId;
    }
  }

  // Log sync run start
  await admin.from("integration_log").insert({
    tenant_id: config.tenant_id,
    source: "learndash",
    idempotency_key: `run:${runId}`,
    status: "running",
    started_at: startedAt,
    payload: {
      run_id: runId,
      ...(replacedStaleRun ? { replaced_stale_run: replacedStaleRun } : {}),
    },
  });

  try {
    // Decrypt WP credentials
    const wpUsername = await decryptKey(admin, config.wp_username_encrypted);
    const wpPassword = await decryptKey(admin, config.wp_app_password_encrypted);
    const auth = wpAuth(wpUsername, wpPassword);
    const siteUrl = config.wp_site_url.replace(/\/$/, "");

    // Fetch all employees with wp_user_id for this tenant
    const { data: employees, error: empErr } = await admin
      .from("people")
      .select("id, tenant_id, email, wp_user_id")
      .eq("tenant_id", config.tenant_id)
      .not("wp_user_id", "is", null);

    if (empErr) throw empErr;
    if (!employees || employees.length === 0) {
      // No WP-connected employees — mark completed
      await admin
        .from("integration_log")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          rows_processed: 0,
          error_count: 0,
        })
        .eq("tenant_id", config.tenant_id)
        .eq("idempotency_key", `run:${runId}`);

      return { synced: 0, skipped: 0, errors: 0 };
    }

    // Course name cache — scoped to this tenant run
    const courseNameCache = new Map<number, string>();

    // Rate limiting: 200ms delay if >50 employees
    const needsThrottle = employees.length > 50;

    for (const emp of employees as PersonWithWp[]) {
      try {
        // Fetch all course progress for this employee
        const progress = await fetchAllCourseProgress(
          siteUrl,
          auth,
          emp.wp_user_id,
        );

        if (progress.length === 0) {
          skipped++;
          continue;
        }

        for (const cp of progress) {
          const courseId = String(cp.course.id);
          const courseName = await fetchCourseName(
            siteUrl,
            auth,
            cp.course.id,
            courseNameCache,
          );

          const mappedStatus = LD_STATUS_MAP[cp.progress_status] ?? null;
          const completionPct =
            cp.steps_total > 0
              ? Math.round((cp.steps_completed / cp.steps_total) * 100)
              : 0;

          // UPSERT training_records (Layer A only)
          // INTENTIONAL OMISSION: training_hours and expires_at are NOT in the upsert
          // update set. They are populated on first insert only. HR overrides (Layer B)
          // for these fields must not be undermined by sync resetting Layer A to null.
          const { error: upsertErr } = await admin
            .from("training_records")
            .upsert(
              {
                tenant_id: config.tenant_id,
                person_id: emp.id,
                course_id: courseId,
                course_name: courseName,
                status: mappedStatus,
                completion_pct: completionPct,
                completed_at: cp.date_completed || null,
                last_synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              {
                onConflict: "tenant_id,person_id,course_id",
                ignoreDuplicates: false,
              },
            );

          if (upsertErr) {
            errors++;
          } else {
            synced++;
          }
        }
      } catch (e) {
        errors++;
        // Per-employee error — continue to next employee
        console.error(
          `sync-training: error for employee ${emp.email}:`,
          e instanceof Error ? e.message : String(e),
        );
      }

      // Rate limiting
      if (needsThrottle) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // Update run log to completed
    await admin
      .from("integration_log")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        rows_processed: synced + skipped,
        error_count: errors,
      })
      .eq("tenant_id", config.tenant_id)
      .eq("idempotency_key", `run:${runId}`);

    void logAudit({
      tenantId: config.tenant_id,
      actorId: undefined,
      action: "training_sync.completed",
      tableName: "integration_log",
      recordId: undefined,
      after: {
        source: "learndash",
        run_id: runId,
        synced,
        skipped,
        errors,
      },
    });
  } catch (err) {
    errors++;
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("integration_log")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_count: 1,
        payload: { run_id: runId, error: message },
      })
      .eq("tenant_id", config.tenant_id)
      .eq("idempotency_key", `run:${runId}`);
  }

  return { synced, skipped, errors };
}
```

**Step 2: Commit**

```bash
git add supabase/functions/sync-training/index.ts
git commit -m "feat(epic4): add processTenant core sync logic"
```

---

### Task 5: Add Deno.serve handler (HTTP entrypoint)

**Files:**
- Modify: `supabase/functions/sync-training/index.ts`

**Step 1: Add the Deno.serve handler at the end of the file**

```typescript
// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Parse optional body (manual trigger may pass tenant_id / force)
    let filterTenantId: string | undefined;
    let force = false;
    try {
      if (req.method === "POST") {
        const body = await req.json();
        filterTenantId = body?.tenant_id;
        force = body?.force === true;
      }
    } catch {
      // Empty body from pg_cron — fine
    }

    // Fetch all tenants with WP configured
    let query = admin
      .from("tenant_settings")
      .select(
        "tenant_id, wp_site_url, wp_username_encrypted, wp_app_password_encrypted",
      )
      .not("wp_site_url", "is", null)
      .not("wp_username_encrypted", "is", null)
      .not("wp_app_password_encrypted", "is", null);

    if (filterTenantId) {
      query = query.eq("tenant_id", filterTenantId);
    }

    const { data: settings, error: settingsErr } = await query;

    if (settingsErr) throw settingsErr;
    if (!settings || settings.length === 0) {
      return withCors(
        new Response(
          JSON.stringify({
            ok: true,
            message: "No WP-configured tenants found",
            tenants: 0,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
        req,
      );
    }

    const results = await Promise.allSettled(
      settings.map((s) =>
        processTenant(
          admin,
          {
            tenant_id: s.tenant_id as string,
            wp_site_url: s.wp_site_url as string,
            wp_username_encrypted: s.wp_username_encrypted as string,
            wp_app_password_encrypted: s.wp_app_password_encrypted as string,
          },
          force,
        )
      ),
    );

    const summary = results.map((r, i) => ({
      tenant_id: settings[i].tenant_id,
      ...(r.status === "fulfilled"
        ? r.value
        : {
            synced: 0,
            skipped: 0,
            errors: 1,
            error: (r.reason as Error).message,
          }),
    }));

    return withCors(
      new Response(
        JSON.stringify({ ok: true, tenants: summary.length, summary }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
      req,
    );
  } catch (err) {
    return withCors(handleError(err), req);
  }
});
```

**Step 2: Verify no syntax errors**

Run: `cd supabase/functions && deno check sync-training/index.ts`
Expected: No errors (type errors for Supabase runtime are acceptable)

**Step 3: Commit**

```bash
git add supabase/functions/sync-training/index.ts
git commit -m "feat(epic4): add Deno.serve HTTP handler for sync-training"
```

---

### Task 6: Fix the double-dedup-check bug in processTenant

**Files:**
- Modify: `supabase/functions/sync-training/index.ts`

**Context:** The processTenant function in Task 4 has a bug — it calls `checkRunDedup` twice (once for skip check, once for stale run detection). This should be a single call with the result stored.

**Step 1: Refactor the top of processTenant to call checkRunDedup once**

Replace the run dedup section (from `// Run dedup check` through the `replacedStaleRun` block) with:

```typescript
  // Run dedup check (unless force=true)
  let replacedStaleRun: string | undefined;
  if (!force) {
    const dedup = await checkRunDedup(admin, config.tenant_id);
    if (dedup === "skip") {
      return { synced: 0, skipped: 0, errors: 0, run_skipped: true };
    }
    if (typeof dedup === "object" && "staleRunId" in dedup) {
      replacedStaleRun = dedup.staleRunId;
    }
  }
```

**Step 2: Commit**

```bash
git add supabase/functions/sync-training/index.ts
git commit -m "fix(epic4): single dedup check call in processTenant"
```

---

### Task 7: Create pg_cron migration for daily sync

**Files:**
- Create: `supabase/migrations/20260307000002_epic4_training_sync_cron.sql`

**Step 1: Write the migration file**

Reference pattern: `supabase/migrations/20260306000001_epic2_hire_detection_cron.sql`

```sql
-- =============================================================================
-- Migration: Epic 4 — pg_cron scheduler for LearnDash training sync (Story 4.2)
--
-- Schedules sync-training EF daily at 7:00 AM UTC (2:00 AM EST).
-- The EF fans out across all tenants with WP configured.
--
-- Requires: pg_cron extension enabled in Supabase Dashboard → Database → Extensions
-- NOTE: cron.schedule calls are idempotent — safe to re-run.
-- =============================================================================

-- pg_cron should already be enabled from Epic 2 migration, but be safe
create extension if not exists pg_cron;

-- LearnDash training sync: daily at 7:00 AM UTC
select cron.schedule(
  'sync-training-daily',
  '0 7 * * *',
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/sync-training',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

**Step 2: Verify migration file exists**

Run: `ls supabase/migrations/20260307000002_epic4_training_sync_cron.sql`
Expected: File exists

**Step 3: Commit**

```bash
git add supabase/migrations/20260307000002_epic4_training_sync_cron.sql
git commit -m "feat(epic4): add pg_cron migration for daily training sync"
```

---

### Task 8: Deploy the Edge Function and apply migration

**Step 1: Deploy the sync-training EF**

Run from `prolific-hr-app/`:
```bash
npx supabase functions deploy sync-training
```
Expected: Deployed successfully

**Step 2: Apply the pg_cron migration**

Run from `prolific-hr-app/`:
```bash
npx supabase db push
```
Expected: Migration applied

**Step 3: Verify EF is listed**

Run: `npx supabase functions list`
Expected: `sync-training` appears in the list

**Step 4: Commit (no code changes, just confirm deploy)**

No commit needed — code already committed in Tasks 1-7.

---

### Task 9: Update project documentation

**Files:**
- Modify: `docs/Project Docs/SPRINT_PLAN.md` — mark Story 4.2 as complete
- Modify: `docs/Project Docs/PROJECT_LOG.md` — add session entry at top
- Modify: `docs/Project Docs/INTEGRATIONS.md` — update LearnDash section with sync details

**Step 1: Update SPRINT_PLAN.md**

Find Story 4.2 and change from `[ ]` to `[x] Complete — DEPLOYED 2026-03-07`. Add the acceptance criteria checkmarks.

**Step 2: Update PROJECT_LOG.md**

Add new entry at top (below the `---` separator after the header):

```markdown
## 2026-03-07 (session 2) -- Epic 4 Story 4.2: LearnDash Training Sync EF

### What shipped

- sync-training Edge Function deployed to production
  - Fetches course progress from LearnDash REST API per employee with wp_user_id
  - UPSERTS training_records (Layer A) using ON CONFLICT (tenant_id, person_id, course_id)
  - Intentionally omits training_hours + expires_at from upsert (NFR-3 — protects Layer B overrides)
  - Course name resolution via GET /ldlms/v2/courses/{id} with per-run Map cache
  - Pagination via per_page=100 + x-wp-totalpages header
  - Run dedup: checks integration_log for running status, marks stale if >1hr old
  - 200ms rate limiting for tenants with >50 employees
  - Manual trigger with optional tenant_id and force params
  - Promise.allSettled at tenant level, per-employee error handling
  - Status mapping: not-started->not_started, in-progress->in_progress, completed->completed
- Migration 20260307000002: pg_cron daily at 7:00 AM UTC for sync-training

### Design decisions

- Single EF handles both cron and manual triggers (same code path per design doc)
- Course name cache scoped to processTenant() — not global (prevents cross-tenant leaks)
- Run dedup with 1-hour stale threshold (matching detect-hires pattern)

### Files changed

- supabase/functions/sync-training/index.ts (new)
- supabase/migrations/20260307000002_epic4_training_sync_cron.sql (new)
- docs/plans/2026-03-07-epic4-sync-training-design.md (new -- approved design)
- docs/plans/2026-03-07-epic4-story42-plan.md (new -- implementation plan)
- docs/Project Docs/SPRINT_PLAN.md (Story 4.2 marked complete)
- docs/Project Docs/PROJECT_LOG.md (this entry)
- docs/Project Docs/INTEGRATIONS.md (LearnDash sync details added)

### Next

- Story 4.3 -- Training compliance dashboard UI
```

**Step 3: Update INTEGRATIONS.md**

In the WordPress + LearnDash section, update:
- Change `Edge Functions | ... sync-training (Epic 4) — not yet built` to `sync-training (Epic 4, deployed)`
- Add a new `**Training sync details:**` subsection after Notes:

```markdown
**Training sync details (Story 4.2):**
- Endpoint: `GET {wp_site_url}/wp-json/ldlms/v2/users/{wp_user_id}/course-progress`
- Course name: `GET {wp_site_url}/wp-json/ldlms/v2/courses/{course_id}` → `title.rendered`
- Pagination: `per_page=100`, loop via `x-wp-totalpages` header
- UPSERT: `ON CONFLICT (tenant_id, person_id, course_id) DO UPDATE SET course_name, status, completion_pct, completed_at, last_synced_at, updated_at`
- Omitted from upsert: `training_hours`, `expires_at` (NFR-3 protection)
- Status mapping: `not-started`→`not_started`, `in-progress`→`in_progress`, `completed`→`completed`
- Schedule: Daily 7:00 AM UTC via pg_cron
- Run dedup: integration_log `running` status check, 1hr stale threshold
- Rate limit: 200ms delay between employees if >50 per tenant
```

**Step 4: Commit**

```bash
git add "docs/Project Docs/SPRINT_PLAN.md" "docs/Project Docs/PROJECT_LOG.md" "docs/Project Docs/INTEGRATIONS.md"
git commit -m "docs(epic4): update project docs for Story 4.2 completion"
```

---

### Task 10: Final verification

**Step 1: Verify EF responds to manual trigger**

Run:
```bash
curl -s -X POST \
  "https://peffyuhhlmidldugqalo.supabase.co/functions/v1/sync-training" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `{"ok":true,"tenants":0,"message":"No WP-configured tenants found"}` or similar (depends on whether any tenant has WP configured).

**Step 2: Verify pg_cron job is registered**

Run via Supabase SQL editor or `psql`:
```sql
SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'sync-training-daily';
```

Expected: One row with schedule `0 7 * * *`

**Step 3: Verify integration_log accepts learndash source**

Run via Supabase SQL editor:
```sql
SELECT DISTINCT source FROM integration_log;
```

Expected: `learndash` should appear after first run (or confirm the source text column accepts it — no CHECK constraint on source).

---

## Summary of all files

| File | Action |
|------|--------|
| `supabase/functions/sync-training/index.ts` | **Create** — main EF (~250 lines) |
| `supabase/migrations/20260307000002_epic4_training_sync_cron.sql` | **Create** — pg_cron daily schedule |
| `docs/plans/2026-03-07-epic4-sync-training-design.md` | Already created (design doc) |
| `docs/plans/2026-03-07-epic4-story42-plan.md` | This file (implementation plan) |
| `docs/Project Docs/SPRINT_PLAN.md` | **Modify** — Story 4.2 → complete |
| `docs/Project Docs/PROJECT_LOG.md` | **Modify** — add session entry |
| `docs/Project Docs/INTEGRATIONS.md` | **Modify** — add sync details |
