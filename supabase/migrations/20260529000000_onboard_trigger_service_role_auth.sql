-- =============================================================================
-- Migration: Authenticate the on_offer_accepted -> onboard-employee webhook
--
-- Phase 0 tenant-guard remediation.
--
-- Problem: The original on_offer_accepted trigger (20251201000003) invoked the
--   onboard-employee Edge Function with NO Authorization header, via
--   supabase_functions.http_request(...) with literal arguments. The function
--   has now been hardened to require cronOrTenantGuard() (service-role JWT).
--   Without an Authorization header the guard rejects the call and onboarding
--   breaks. The webhook must send the service-role JWT.
--
-- Why a wrapper function (not supabase_functions.http_request):
--   A CREATE TRIGGER ... EXECUTE FUNCTION clause only accepts *literal constant*
--   arguments. It cannot evaluate jsonb_build_object(...) or a subquery, so the
--   service-role key cannot be injected into supabase_functions.http_request's
--   argument list. Instead we attach a dedicated PL/pgSQL trigger function that
--   builds the headers at execution time (reading the key from Vault) and calls
--   net.http_post (pg_net), then returns NEW.
--
-- SECURITY: The service-role key value is NEVER written into this migration or
--   the repo. It is read from vault.decrypted_secrets at execution time, by
--   name only. This mirrors 20260308000001_fix_cron_vault_secrets.sql.
--
-- Prerequisites:
--   - pg_net extension (net.http_post) — Supabase default.
--   - vault extension — Supabase default.
--   - Vault secrets 'project_url' and 'service_role_key' must exist (already
--     required by the cron jobs in 20260308000001). If 'service_role_key' is
--     absent the Authorization header becomes 'Bearer ' (empty) and the guard
--     rejects — the same failure mode as the existing cron jobs, so behavior is
--     consistent with current operations.
--
-- Body shape: the function emits { "record": <new offer row> } so the
--   onboard-employee function's `const { record } = await req.json()` continues
--   to receive the accepted offer row unchanged.
--
-- Rollback: drop this trigger + function and re-create the original trigger from
--   20251201000003 (supabase_functions.http_request with no Authorization).
-- =============================================================================

create or replace function public.notify_onboard_employee()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault
as $$
begin
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
           || '/functions/v1/onboard-employee',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1),
        ''
      )
    ),
    body := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
end;
$$;

drop trigger if exists "on_offer_accepted" on "offers";

create trigger "on_offer_accepted"
after update on "offers"
for each row
when (
  old.status is distinct from 'Accepted'
  and new.status = 'Accepted'
)
execute function public.notify_onboard_employee();
