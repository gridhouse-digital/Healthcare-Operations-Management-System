-- =============================================================================
-- Migration 001 (MVP): tenants + tenant_settings
-- Story 1.1 — Multi-tenant DB schema & RLS foundation
--
-- FR-1: Multi-tenant platform with complete data isolation per tenant.
-- NFR-1: 100% RLS enforcement — no cross-tenant reads under any circumstance.
-- NFR-7: API keys stored encrypted via pgcrypto.
-- =============================================================================

-- Enable required extensions
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------

create table if not exists public.tenants (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  slug       text        not null unique,
  created_at timestamptz not null default now()
);

comment on table public.tenants is
  'One row per client organisation. slug is used in WP sub-site URLs (post-MVP).';

-- RLS
alter table public.tenants enable row level security;

-- platform_admin can read/write all tenants
create policy "platform_admin_all" on public.tenants
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

-- tenant_admin and hr_admin can read their own tenant only
create policy "tenant_read_own" on public.tenants
  for select
  using (
    id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

-- ---------------------------------------------------------------------------
-- tenant_settings
-- ---------------------------------------------------------------------------

create table if not exists public.tenant_settings (
  tenant_id                    uuid        primary key references public.tenants(id) on delete cascade,
  -- WordPress integration (MVP: standalone sites only — FR-18 WP provisioning deferred)
  wp_site_url                  text,
  wp_username_encrypted        text,
  wp_app_password_encrypted    text,
  -- BambooHR connector (NFR-7: encrypted at rest via pgcrypto)
  bamboohr_subdomain           text,
  bamboohr_api_key_encrypted   text,
  -- JazzHR connector (NFR-7)
  jazzhr_api_key_encrypted     text,
  -- Which connectors are active: e.g. ARRAY['bamboohr'] or ARRAY['jazzhr']
  active_connectors            text[]      not null default '{}',
  -- LearnDash group mappings: [{ "job_title": "...", "group_id": "..." }]
  ld_group_mappings            jsonb       not null default '[]',
  -- FR-22: profile_source set once at connector setup — 'bamboohr' | 'jazzhr'
  profile_source               text        check (profile_source in ('bamboohr', 'jazzhr')),
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

comment on table public.tenant_settings is
  'Per-tenant configuration: connector credentials (encrypted), LearnDash mappings, profile source priority.';

comment on column public.tenant_settings.bamboohr_api_key_encrypted is
  'Encrypted with pgcrypto. Decrypted ONLY inside Edge Functions. Never transmitted to frontend.';

comment on column public.tenant_settings.jazzhr_api_key_encrypted is
  'Encrypted with pgcrypto. Decrypted ONLY inside Edge Functions. Never transmitted to frontend.';

comment on column public.tenant_settings.profile_source is
  'Set once at connector setup. Sync respects this — only the priority source overwrites profile fields. FR-22.';

-- RLS
alter table public.tenant_settings enable row level security;

create policy "tenant_settings_own_tenant" on public.tenant_settings
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

-- Audit trigger for tenant_settings
create or replace function public.audit_tenant_settings()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (
    tenant_id, actor_id, action, table_name, record_id, before, after
  ) values (
    new.tenant_id,
    (auth.jwt() ->> 'sub')::uuid,
    tg_op,
    'tenant_settings',
    new.tenant_id,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;

-- Note: audit_log table is created in migration 002 — trigger is attached there
-- to avoid forward reference issues.
