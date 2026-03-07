-- =============================================================================
-- Migration: Epic 2 — pg_cron scheduler for hire detection (Story 2.3)
--
-- Schedules detect-hires-bamboohr and detect-hires-jazzhr EFs every 15 minutes.
-- Each EF fans out across all tenants with that connector configured.
--
-- Requires: pg_cron extension enabled in Supabase Dashboard → Database → Extensions
-- NOTE: pg_cron.schedule calls are idempotent — safe to re-run.
-- =============================================================================

-- Enable pg_cron if not already enabled
create extension if not exists pg_cron;

grant usage on schema cron to postgres;

-- BambooHR: every 15 minutes
select cron.schedule(
  'detect-hires-bamboohr',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/detect-hires-bamboohr',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- JazzHR: every 15 minutes, offset by ~7 min to stagger load
select cron.schedule(
  'detect-hires-jazzhr',
  '7,22,37,52 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/detect-hires-jazzhr',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
