-- =============================================================================
-- MVP request-access intake
-- Public onboarding requests are intentionally stored outside the tenant model
-- because a tenant does not exist yet at submission time.
-- =============================================================================

create table if not exists public.tenant_access_requests (
  id                           uuid primary key default gen_random_uuid(),
  organization_name            text not null,
  organization_name_normalized text generated always as (lower(btrim(organization_name))) stored,
  primary_contact_name         text not null,
  work_email                   text not null,
  work_email_normalized        text generated always as (lower(btrim(work_email))) stored,
  phone                        text,
  team_size                    text not null
                               check (team_size in ('1-10', '11-25', '26-50', '51-100', '100+')),
  integration_needs            text,
  notes                        text,
  status                       text not null default 'submitted'
                               check (status in ('submitted', 'under_review', 'approved', 'rejected', 'provisioned')),
  notification_status          text not null default 'pending'
                               check (notification_status in ('pending', 'sent', 'failed')),
  notification_error           text,
  notification_sent_at         timestamptz,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

comment on table public.tenant_access_requests is
  'Public onboarding intake for organizations requesting HOMS access before any tenant exists.';

comment on column public.tenant_access_requests.notification_status is
  'Tracks whether ops notification email was sent. Failed notifications retain the request row for manual recovery.';

create index if not exists tenant_access_requests_lookup_idx
  on public.tenant_access_requests (organization_name_normalized, work_email_normalized);

create index if not exists tenant_access_requests_status_created_idx
  on public.tenant_access_requests (status, created_at desc);

create unique index if not exists tenant_access_requests_open_request_unique
  on public.tenant_access_requests (organization_name_normalized, work_email_normalized)
  where status in ('submitted', 'under_review');

alter table public.tenant_access_requests enable row level security;

drop policy if exists "tenant_access_requests_platform_admin_select" on public.tenant_access_requests;
create policy "tenant_access_requests_platform_admin_select" on public.tenant_access_requests
  for select
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin');

drop policy if exists "tenant_access_requests_platform_admin_update" on public.tenant_access_requests;
create policy "tenant_access_requests_platform_admin_update" on public.tenant_access_requests
  for update
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin');

create or replace function public.set_tenant_access_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_tenant_access_requests_updated_at on public.tenant_access_requests;
create trigger set_tenant_access_requests_updated_at
  before update on public.tenant_access_requests
  for each row execute function public.set_tenant_access_requests_updated_at();
