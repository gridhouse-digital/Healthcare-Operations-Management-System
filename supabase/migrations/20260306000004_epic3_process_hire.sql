-- Migration: Epic 3 -- process-hire pg_cron scheduler (Story 3.3)

select cron.schedule(
  'process-hire',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/process-hire',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
