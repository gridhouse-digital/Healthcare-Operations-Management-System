-- =============================================================================
-- Migration: Normalize email uniqueness at the database layer
--
-- Purpose:
--   - prevent case-only duplicate people/applicant records
--   - make DB uniqueness match application email normalization
--   - preserve tenant-scoped uniqueness semantics
-- =============================================================================

-- Normalize stored values so the visible email text matches the enforced key.
update public.people
set email = lower(btrim(email)),
    updated_at = now()
where email is not null
  and email <> lower(btrim(email));

update public.applicants
set email = lower(btrim(email)),
    updated_at = now()
where email is not null
  and email <> lower(btrim(email));

alter table public.people
  add column if not exists email_normalized text
  generated always as (lower(btrim(email))) stored;

alter table public.applicants
  add column if not exists email_normalized text
  generated always as (lower(btrim(email))) stored;

comment on column public.people.email_normalized is
  'Normalized email key used for tenant-scoped uniqueness and case-insensitive deduplication.';

comment on column public.applicants.email_normalized is
  'Normalized email key used for tenant-scoped uniqueness and case-insensitive deduplication.';

alter table public.applicants
  drop constraint if exists applicants_email_key;

drop index if exists public.applicants_email_key;
drop index if exists public.applicants_tenant_email_idx;
drop index if exists public.people_tenant_email_idx;

create unique index if not exists people_tenant_email_normalized_idx
  on public.people (tenant_id, email_normalized);

create unique index if not exists applicants_tenant_email_normalized_idx
  on public.applicants (tenant_id, email_normalized);
