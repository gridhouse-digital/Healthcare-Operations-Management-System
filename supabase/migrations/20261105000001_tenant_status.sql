-- Agency suspension (platform admin). Rollback: see DECISIONS.md, 2026-11-05.
--
-- Suspending keeps every record. It refuses new tokens through
-- custom_access_token_hook, and scheduled jobs skip the agency.

alter table public.tenants
  add column if not exists status text not null default 'active',
  add column if not exists status_reason text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid;

alter table public.tenants
  drop constraint if exists tenants_status_check;
alter table public.tenants
  add constraint tenants_status_check check (status in ('active', 'suspended'));

-- The browser only reads this table. Without this, a platform_admin token could
-- change status through the Data API and skip manage-tenant's checks and audit.
revoke insert, update, delete, truncate, references, trigger
  on public.tenants from anon, authenticated;

-- Changes the status and writes its audit row in one transaction, so a status
-- change can never go unrecorded. Called only by the manage-tenant Edge Function.
create or replace function public.set_tenant_status(
  p_tenant_id uuid,
  p_status text,
  p_reason text,
  p_actor uuid
) returns text
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  current_status text;
begin
  select status into current_status
  from public.tenants
  where id = p_tenant_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if current_status = p_status then
    return 'unchanged';
  end if;

  update public.tenants
  set status = p_status,
      status_reason = case when p_status = 'suspended' then p_reason end,
      status_changed_at = now(),
      status_changed_by = p_actor
  where id = p_tenant_id;

  insert into public.audit_log (tenant_id, actor_id, action, table_name, record_id, before, after)
  values (
    p_tenant_id,
    p_actor,
    case when p_status = 'suspended' then 'agency.suspended' else 'agency.reactivated' end,
    'tenants',
    p_tenant_id,
    jsonb_build_object('status', current_status),
    jsonb_build_object('status', p_status, 'reason', p_reason)
  );

  return 'changed';
end;
$function$;

revoke execute on function public.set_tenant_status(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.set_tenant_status(uuid, text, text, uuid) to service_role;

-- Same claims as before, plus: refuse a token for a suspended agency. Platform
-- admins are exempt so the operator can never be locked out.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  claims       jsonb;
  tu           record;
  user_id_val  uuid;
begin
  user_id_val := (event ->> 'user_id')::uuid;
  claims := event -> 'claims';

  select tenant_users.tenant_id, tenant_users.role, tenants.status as tenant_status
  into tu
  from public.tenant_users
  join public.tenants on tenants.id = tenant_users.tenant_id
  where tenant_users.user_id = user_id_val
    and tenant_users.status = 'active'
  limit 1;

  if found then
    if tu.tenant_status = 'suspended' and tu.role <> 'platform_admin' then
      return jsonb_build_object(
        'error',
        jsonb_build_object(
          'http_code', 403,
          'message', 'Access to this agency is suspended. Please contact your administrator.'
        )
      );
    end if;

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
$function$;
