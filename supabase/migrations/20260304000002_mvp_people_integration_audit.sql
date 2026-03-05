-- =============================================================================
-- Migration 002 (MVP): people, integration_log, audit_log + JWT custom claims
-- Story 1.1 — Multi-tenant DB schema & RLS foundation (continued)
-- Story 1.2 — JWT tenant/role claims setup
--
-- FR-1: tenant_id on every table, enforced via RLS.
-- NFR-1: 100% RLS enforcement.
-- NFR-2: Sync idempotency — integration_log UNIQUE constraint.
-- NFR-4: Every write emits to audit_log (append-only via RLS).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- audit_log  (created first — referenced by triggers below)
-- ---------------------------------------------------------------------------

create table if not exists public.audit_log (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references public.tenants(id),
  actor_id   uuid,                          -- null for system-generated entries
  action     text        not null,
  table_name text        not null,
  record_id  uuid,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_log is
  'Append-only audit trail. NFR-4: every write operation must produce a row here.';

-- RLS: append-only — INSERT for any authenticated user; NO UPDATE or DELETE for anyone
alter table public.audit_log enable row level security;

create policy "audit_log_insert" on public.audit_log
  for insert
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

create policy "audit_log_select_own" on public.audit_log
  for select
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

-- No UPDATE policy → UPDATE is denied for all roles.
-- No DELETE policy → DELETE is denied for all roles.

-- Now attach the audit trigger for tenant_settings that was defined in migration 001
create trigger audit_tenant_settings_trigger
  after insert or update on public.tenant_settings
  for each row execute function public.audit_tenant_settings();

-- ---------------------------------------------------------------------------
-- integration_log
-- ---------------------------------------------------------------------------

create table if not exists public.integration_log (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references public.tenants(id),
  source           text        not null,   -- 'bamboohr' | 'jazzhr' | 'learndash' | 'jotform'
  idempotency_key  text        not null,   -- email for hire events; run_id for sync runs
  status           text        not null,   -- 'hire_detected' | 'processed' | 'failed' | 'skipped' | etc.
  payload          jsonb,
  last_received_at timestamptz,            -- for webhook health tracking (Jotform)
  started_at       timestamptz,            -- for sync run observability
  completed_at     timestamptz,            -- for sync run observability
  rows_processed   integer,
  error_count      integer,
  created_at       timestamptz not null default now()
);

comment on table public.integration_log is
  'Idempotency log for all external integrations. UNIQUE constraint on (tenant_id, source, idempotency_key) is the primary guard against duplicate hire events.';

-- NFR-2: Idempotency enforced at DB layer
create unique index integration_log_idempotency_idx
  on public.integration_log (tenant_id, source, idempotency_key);

-- RLS
alter table public.integration_log enable row level security;

create policy "integration_log_own_tenant" on public.integration_log
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

-- ---------------------------------------------------------------------------
-- people
-- ---------------------------------------------------------------------------

create table if not exists public.people (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references public.tenants(id),
  email          text        not null,
  first_name     text,
  last_name      text,
  job_title      text,
  -- 'candidate' | 'employee'
  type           text        not null default 'candidate'
                             check (type in ('candidate', 'employee')),
  -- FR-22: which connector is authoritative for this person's profile fields
  profile_source text        check (profile_source in ('bamboohr', 'jazzhr')),
  hired_at       timestamptz,             -- NFR-3: never overwritten once set
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.people is
  'All persons associated with a tenant — candidates and employees. (tenant_id, email) is the universal deduplication key.';

comment on column public.people.hired_at is
  'NFR-3: Set once when hire is first detected. Sync NEVER overwrites this if already populated.';

-- FR-1: (tenant_id, email) universal deduplication key
create unique index people_tenant_email_idx
  on public.people (tenant_id, email);

-- RLS
alter table public.people enable row level security;

create policy "people_own_tenant" on public.people
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

-- ---------------------------------------------------------------------------
-- Audit triggers — people + audit_log itself
-- ---------------------------------------------------------------------------

create or replace function public.audit_people()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (
    tenant_id, actor_id, action, table_name, record_id, before, after
  ) values (
    new.tenant_id,
    (auth.jwt() ->> 'sub')::uuid,
    tg_op,
    'people',
    new.id,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;

create trigger audit_people_trigger
  after insert or update on public.people
  for each row execute function public.audit_people();

-- ---------------------------------------------------------------------------
-- JWT custom claims function (Story 1.2)
--
-- Called by Supabase Auth hook: sets app_metadata.tenant_id + app_metadata.role
-- from the tenant_users table on every token refresh.
-- This function is registered in supabase/config.toml as the custom_access_token_hook.
-- ---------------------------------------------------------------------------

create table if not exists public.tenant_users (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references public.tenants(id),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  role         text        not null check (role in ('platform_admin', 'tenant_admin', 'hr_admin')),
  status       text        not null default 'active' check (status in ('active', 'pending', 'deactivated')),
  invited_by   uuid        references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, user_id)
);

comment on table public.tenant_users is
  'Links Supabase auth users to tenants with roles. The source of truth for JWT app_metadata claims.';

-- RLS
alter table public.tenant_users enable row level security;

create policy "tenant_users_own_tenant" on public.tenant_users
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

-- Audit trigger
create or replace function public.audit_tenant_users()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (
    tenant_id, actor_id, action, table_name, record_id, before, after
  ) values (
    new.tenant_id,
    (auth.jwt() ->> 'sub')::uuid,
    tg_op,
    'tenant_users',
    new.id,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;

create trigger audit_tenant_users_trigger
  after insert or update on public.tenant_users
  for each row execute function public.audit_tenant_users();

-- ---------------------------------------------------------------------------
-- Custom access token hook: inject tenant_id + role into JWT app_metadata
-- ---------------------------------------------------------------------------

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer as $$
declare
  claims       jsonb;
  tu           record;
  user_id_val  uuid;
begin
  user_id_val := (event ->> 'user_id')::uuid;
  claims := event -> 'claims';

  select tenant_id, role
  into tu
  from public.tenant_users
  where user_id = user_id_val
    and status = 'active'
  limit 1;

  if found then
    claims := jsonb_set(claims, '{app_metadata}',
      coalesce(claims -> 'app_metadata', '{}') ||
      jsonb_build_object(
        'tenant_id', tu.tenant_id,
        'role',      tu.role
      )
    );
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Grant execute to supabase_auth_admin role (required for hook)
grant execute on function public.custom_access_token_hook to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- audit-tables.json registry (enforced by CI — check-audit-triggers.ts)
-- ---------------------------------------------------------------------------
-- NOTE: The JSON file is maintained at supabase/audit-tables.json.
-- Tables registered here: tenants (read-only, no trigger needed),
-- tenant_settings, audit_log (insert-only, no trigger needed),
-- integration_log, people, tenant_users
