-- =============================================================================
-- Migration: Epic 4 -- pg_cron scheduler for LearnDash training sync (Story 4.2)
--
-- Schedules sync-training EF daily at 7:00 AM UTC (2:00 AM EST).
-- The EF fans out across all tenants with WP configured.
--
-- Requires: pg_cron extension enabled in Supabase Dashboard -> Database -> Extensions
-- NOTE: cron.schedule calls are idempotent -- safe to re-run.
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
