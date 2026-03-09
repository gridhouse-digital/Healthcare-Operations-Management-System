-- =============================================================================
-- Migration: Epic 5 Story 5.7
-- Add tenant_id + RLS + audit triggers to offers and ai_cache
-- =============================================================================

alter table public.offers
  add column if not exists tenant_id uuid references public.tenants(id);

alter table public.ai_cache
  add column if not exists tenant_id uuid references public.tenants(id);

do $$
declare
  v_tenant_id uuid;
begin
  select id into v_tenant_id from public.tenants order by created_at asc limit 1;

  if v_tenant_id is null then
    raise exception 'No tenant row found for backfill in Epic 5.7 migration';
  end if;

  update public.offers
  set tenant_id = v_tenant_id
  where tenant_id is null;

  update public.ai_cache
  set tenant_id = v_tenant_id
  where tenant_id is null;
end $$;

alter table public.offers
  alter column tenant_id set not null;

alter table public.ai_cache
  alter column tenant_id set not null;

alter table public.offers enable row level security;
alter table public.ai_cache enable row level security;

drop policy if exists "offers_select_own_tenant" on public.offers;
drop policy if exists "offers_insert_own_tenant" on public.offers;
drop policy if exists "offers_update_own_tenant" on public.offers;

create policy "offers_select_own_tenant" on public.offers
  for select
  using (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid));

create policy "offers_insert_own_tenant" on public.offers
  for insert
  with check (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid));

create policy "offers_update_own_tenant" on public.offers
  for update
  using (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid));

drop policy if exists "ai_cache_select_own_tenant" on public.ai_cache;
drop policy if exists "ai_cache_insert_own_tenant" on public.ai_cache;
drop policy if exists "ai_cache_update_own_tenant" on public.ai_cache;
drop policy if exists "ai_cache_delete_own_tenant" on public.ai_cache;

create policy "ai_cache_select_own_tenant" on public.ai_cache
  for select
  using (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid));

create policy "ai_cache_insert_own_tenant" on public.ai_cache
  for insert
  with check (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid));

create policy "ai_cache_update_own_tenant" on public.ai_cache
  for update
  using (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))
  with check (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid));

create policy "ai_cache_delete_own_tenant" on public.ai_cache
  for delete
  using (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid));

create or replace function public.audit_offers()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (
    tenant_id, actor_id, action, table_name, record_id, before, after
  ) values (
    coalesce(new.tenant_id, old.tenant_id),
    (auth.jwt() ->> 'sub')::uuid,
    tg_op,
    'offers',
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_offers_trigger on public.offers;
create trigger audit_offers_trigger
  after insert or update on public.offers
  for each row execute function public.audit_offers();

create or replace function public.audit_ai_cache()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (
    tenant_id, actor_id, action, table_name, record_id, before, after
  ) values (
    coalesce(new.tenant_id, old.tenant_id),
    (auth.jwt() ->> 'sub')::uuid,
    tg_op,
    'ai_cache',
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_ai_cache_trigger on public.ai_cache;
create trigger audit_ai_cache_trigger
  after insert or update or delete on public.ai_cache
  for each row execute function public.audit_ai_cache();
