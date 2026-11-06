-- Invite activation. Rollback: see DECISIONS.md, 2026-11-06.
--
-- An invited user's tenant_users row starts as 'pending', and the token hook
-- only reads 'active' rows. Supabase Auth sets auth.users.email_confirmed_at
-- once it has verified the invite token, so that is the activation point: the
-- browser cannot reach it, and the tenant comes from the row the inviting admin
-- created, never from a request.

-- The status change and its audit row share the Auth transaction, so a token
-- issued after it sees 'active' and the change can never go unrecorded.
create or replace function public.activate_invited_tenant_users()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  activated record;
begin
  -- 'pending' only: a deactivated row must stay deactivated.
  for activated in
    update public.tenant_users
    set status = 'active',
        updated_at = now()
    where user_id = new.id
      and status = 'pending'
    returning id, tenant_id, role, invited_by
  loop
    insert into public.audit_log (tenant_id, actor_id, action, table_name, record_id, before, after)
    values (
      activated.tenant_id,
      new.id,
      'user.activated',
      'tenant_users',
      activated.id,
      jsonb_build_object('status', 'pending'),
      jsonb_build_object(
        'status', 'active',
        'role', activated.role,
        'invited_by', activated.invited_by
      )
    );
  end loop;

  return new;
end;
$function$;

revoke execute on function public.activate_invited_tenant_users() from public, anon, authenticated;

-- Confirmation alone is not proof of the inbox. With Auth's autoconfirm on,
-- signUp confirms an unconfirmed invited user and returns a session to whoever
-- called it. Auth leaves a mark only when an emailed link was used: it sets a
-- generated password before confirming through an invite link, and clears the
-- recovery token before confirming through a recovery link (an invitee whose
-- invite expired will use Forgot password). The integration test pins both.
drop trigger if exists on_invited_user_confirmed on auth.users;
create trigger on_invited_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (
    old.email_confirmed_at is null
    and new.email_confirmed_at is not null
    and new.invited_at is not null
    and (
      coalesce(new.encrypted_password, '') <> ''
      or (new.recovery_sent_at is not null and coalesce(new.recovery_token, '') = '')
    )
  )
  execute function public.activate_invited_tenant_users();

-- Lets invite-tenant-user refuse an email before any invite is sent.
create or replace function public.tenant_memberships_for_email(p_email text)
returns table (tenant_id uuid, status text)
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $function$
  select tenant_users.tenant_id, tenant_users.status
  from auth.users
  join public.tenant_users on tenant_users.user_id = users.id
  where lower(users.email) = lower(p_email);
$function$;

revoke execute on function public.tenant_memberships_for_email(text) from public, anon, authenticated;
grant execute on function public.tenant_memberships_for_email(text) to service_role;

-- Same as tenants: the browser only reads this table, and every write goes
-- through an Edge Function with the service role.
revoke insert, update, delete, truncate, references, trigger
  on public.tenant_users from anon, authenticated;
