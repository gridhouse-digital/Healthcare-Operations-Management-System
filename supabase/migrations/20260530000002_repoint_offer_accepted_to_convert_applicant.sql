-- =============================================================================
-- Migration: Repoint the on_offer_accepted webhook to convert-applicant
--
-- Phase 1 lifecycle stabilization (Q4). The accepted-offer trigger previously
-- called onboard-employee directly (20260529000000). Under the Q4 split,
-- conversion (the people row + status) is the responsibility of the
-- convert-applicant authority, which then invokes onboard-employee for external
-- WordPress/LearnDash provisioning as a SEPARATE idempotent step. So the trigger
-- must now enter convert-applicant, not onboard-employee.
--
-- Mechanics mirror 20260529000000: a SECURITY DEFINER PL/pgSQL function builds
-- the Authorization header from the Vault 'service_role_key' at execution time
-- (never written to the repo) and POSTs via pg_net. Body shape stays
-- { "record": <new offer row> } so convert-applicant can read record.applicant_id
-- / record.id / record.status. convert-applicant then calls onboard-employee.
--
-- Rollback: drop this trigger + re-create notify_onboard_employee trigger from
--   20260529000000 (which posts directly to /functions/v1/onboard-employee).
-- =============================================================================

create or replace function public.notify_convert_applicant()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault
as $$
begin
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
           || '/functions/v1/convert-applicant',
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
execute function public.notify_convert_applicant();
