-- =============================================================================
-- Migration: Epic 4.5 — pg_cron scheduler for WordPress user sync (Story 4.5.1)
--
-- Schedules sync-wp-users EF daily at 6:30 AM UTC (30 min before sync-training
-- at 7:00 AM). This ensures new WP users have wp_user_id set in the people
-- table before sync-training pulls their LearnDash course progress.
--
-- Uses vault.decrypted_secrets for project_url and service_role_key.
-- =============================================================================

select cron.schedule(
  'sync-wp-users',
  '30 6 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
           || '/functions/v1/sync-wp-users',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
