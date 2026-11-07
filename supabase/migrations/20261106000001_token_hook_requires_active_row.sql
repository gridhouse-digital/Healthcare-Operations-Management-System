-- Tenant and role claims now come only from an active tenant_users row.
--
-- Before this, a user with no active row kept whatever tenant_id and role were
-- stored in auth.users app_metadata. update-tenant-user-role writes those values,
-- so a deactivated user, or one with no row, could still pass tenantGuard after a
-- refresh, and suspension did not reach them.
--
-- Rollback: re-create the function from 20261105000001_tenant_status.sql.

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
  else
    -- Other app_metadata, such as the auth provider, stays. The top-level "role"
    -- claim is the Postgres role and is not touched.
    claims := claims #- '{app_metadata,tenant_id}' #- '{app_metadata,role}';
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$function$;
