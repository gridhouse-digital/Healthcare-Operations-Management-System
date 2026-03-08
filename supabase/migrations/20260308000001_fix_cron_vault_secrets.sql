-- =============================================================================
-- Migration: Fix pg_cron jobs to use vault.decrypted_secrets
--
-- Problem: Previous migrations used current_setting('app.supabase_url') and
--          current_setting('app.service_role_key') which don't persist across
--          sessions. Cron jobs silently fail because GUC vars are not set.
--
-- Solution: Store project_url and service_role_key in vault.secrets, then
--           reference via vault.decrypted_secrets in cron job SQL.
--
-- The service_role_key is required (not anon_key) because the
-- cron-or-tenant-guard utility detects mode="cron" from the JWT's
-- top-level role="service_role" claim.
--
-- Prerequisites:
--   - vault extension enabled (Supabase enables by default)
--   - Vault secrets 'project_url' and 'service_role_key' must be created
--     via Supabase Dashboard > Project Settings > Vault, or via SQL:
--
--     select vault.create_secret('<YOUR_PROJECT_URL>', 'project_url');
--     select vault.create_secret('<YOUR_SERVICE_ROLE_KEY>', 'service_role_key');
--
-- IMPORTANT: This migration does NOT insert vault secrets (they contain
-- sensitive values). Secrets must be set via Dashboard or manual SQL
-- before this migration runs.
-- =============================================================================

-- ── Step 1: Unschedule all existing cron jobs ────────────────────────────────
-- Wrap in DO block so missing jobs don't cause errors.
do $$
begin
  perform cron.unschedule('detect-hires-bamboohr');
exception when others then null;
end;
$$;

do $$
begin
  perform cron.unschedule('detect-hires-jazzhr');
exception when others then null;
end;
$$;

do $$
begin
  perform cron.unschedule('process-hire');
exception when others then null;
end;
$$;

do $$
begin
  perform cron.unschedule('sync-training-daily');
exception when others then null;
end;
$$;

-- Also try alternate name used in some environments
do $$
begin
  perform cron.unschedule('sync-training');
exception when others then null;
end;
$$;

do $$
begin
  perform cron.unschedule('cleanup-old-submissions');
exception when others then null;
end;
$$;

-- ── Step 2: Recreate cron jobs using vault.decrypted_secrets ─────────────────

-- BambooHR hire detection: every 15 minutes
select cron.schedule(
  'detect-hires-bamboohr',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
           || '/functions/v1/detect-hires-bamboohr',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- JazzHR hire detection: every 15 minutes, offset by ~7 min
select cron.schedule(
  'detect-hires-jazzhr',
  '7,22,37,52 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
           || '/functions/v1/detect-hires-jazzhr',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Process hire: every 5 minutes
select cron.schedule(
  'process-hire',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
           || '/functions/v1/process-hire',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- LearnDash training sync: daily at 7:00 AM UTC (2:00 AM EST)
select cron.schedule(
  'sync-training-daily',
  '0 7 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
           || '/functions/v1/sync-training',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
