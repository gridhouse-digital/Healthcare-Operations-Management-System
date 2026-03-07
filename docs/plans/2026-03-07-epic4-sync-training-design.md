# Epic 4 Story 4.2 — LearnDash Training Sync EF Design

> Approved 2026-03-07. Reviewed by Winston (Architect) and Amelia (Dev) via BMAD party mode.

## Goal

Build a Supabase Edge Function (`sync-training`) that fetches course progress from LearnDash REST API for all employees with a `wp_user_id`, upserts `training_records` (Layer A only), and logs sync runs to `integration_log`.

## Architecture

- **Pattern:** Follows `detect-hires-bamboohr` EF — multi-tenant fan-out, `Promise.allSettled` at tenant level, per-employee error handling continues to next.
- **Trigger:** pg_cron daily at 7:00 AM UTC (2:00 AM EST) + manual POST with optional `tenant_id` filter.
- **Data flow:** LearnDash REST API → UPSERT `training_records` (Layer A). Never touches `training_adjustments` (Layer B) or effective compliance values (Layer C).

## LearnDash API

- **Endpoint:** `GET {wp_site_url}/wp-json/ldlms/v2/users/{wp_user_id}/course-progress`
- **Auth:** WP Application Password (Basic Auth) — same credentials as `process-hire`.
- **Pagination:** `per_page=100` (max), loop via `x-wp-totalpages` header (lowercase).
- **Course name resolution:** `GET {wp_site_url}/wp-json/ldlms/v2/courses/{course_id}` — extract `title.rendered` only. Cached in a `Map<string, string>` scoped per `processTenant()` call (not global).

## Status Mapping

```typescript
const LD_STATUS_MAP: Record<string, string> = {
  "not-started": "not_started",
  "in-progress": "in_progress",
  "completed": "completed",
};
```

Unmapped statuses default to `null` (stored as-is in `training_records.status`).

## UPSERT Strategy

```sql
ON CONFLICT (tenant_id, person_id, course_id) DO UPDATE SET
  course_name, status, completion_pct, completed_at, last_synced_at, updated_at
```

**NFR-3 critical:** The UPSERT intentionally omits `training_hours` and `expires_at` from the SET clause. These fields are set only on initial INSERT (from LearnDash if available) and are never overwritten by subsequent syncs. This protects HR overrides in Layer B from being undermined by a sync that zeros out the raw value.

```typescript
// INTENTIONAL OMISSION: training_hours and expires_at are NOT in the upsert
// update set. They are populated on first insert only. HR overrides (Layer B)
// for these fields must not be undermined by sync resetting Layer A to null.
```

## Completion Percentage

```typescript
const completionPct = stepsTotal > 0
  ? Math.round((stepsCompleted / stepsTotal) * 100)
  : 0;
```

## Run Deduplication

Before processing, check `integration_log` for an existing `running` row for this tenant + source:

1. **Running < 1 hour old** → skip tenant entirely (previous run still active).
2. **Running >= 1 hour old** → mark as `stale`, proceed with new run. Include `{ replaced_stale_run: "<old_run_id>" }` in new run's payload.
3. **No running row** → proceed normally.

Each run inserts an `integration_log` row with:
- `source: "learndash"`
- `idempotency_key: "run:<uuid>"`
- `status: "running"` → updated to `"completed"` or `"failed"` at end

## Rate Limiting

If a tenant has > 50 employees with `wp_user_id`, insert a 200ms delay between employee API calls to avoid WP rate limits.

## Manual Trigger

POST body (all fields optional):
```json
{
  "tenant_id": "uuid",       // filter to single tenant
  "force": true               // skip run dedup check
}
```

When called without body (e.g., by pg_cron), processes all tenants with WP configured.

## Error Handling

- **Tenant level:** `Promise.allSettled` — one tenant failure doesn't block others.
- **Employee level:** try/catch per employee — errors logged, processing continues to next employee.
- **API errors:** Logged to integration_log `payload.errors[]`. Non-200 responses from LearnDash are caught and counted but don't abort the run.
- **No silent failures:** All errors surface in integration_log (Story 3.3 pattern).

## Files

| File | Action |
|------|--------|
| `supabase/functions/sync-training/index.ts` | Create — main EF |
| `supabase/migrations/20260307000002_epic4_training_sync_cron.sql` | Create — pg_cron schedule |
| `docs/Project Docs/SPRINT_PLAN.md` | Update — Story 4.2 status |
| `docs/Project Docs/PROJECT_LOG.md` | Update — session entry |
| `docs/Project Docs/INTEGRATIONS.md` | Update — LearnDash sync details |

## Review Findings (Incorporated)

1. **Winston (Architect):** UPSERT must omit `training_hours` + `expires_at` with explicit code comment explaining intentional omission. ✅ Included above.
2. **Winston:** Stale run replacement must include `replaced_stale_run` in payload for operational traceability. ✅ Included above.
3. **Amelia (Dev):** Pagination header is lowercase (`x-wp-totalpages`), not `X-WP-TotalPages`. ✅ Noted above.
4. **Amelia:** Course name cache must extract only `title.rendered` from course API response (not full object). ✅ Noted above.
5. **Both:** NFR-3 boundary is the critical invariant — sync must never write to Layer B or undermine Layer C. ✅ Core design constraint.
