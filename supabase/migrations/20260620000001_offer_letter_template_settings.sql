-- Offers Phase 2: per-tenant offer-letter template foundation.
-- Adds tenant-configured identity/template fields to the existing audited
-- tenant_settings row. RLS and audit triggers already apply to tenant_settings.

alter table public.tenant_settings
  add column if not exists offer_company_name text,
  add column if not exists offer_signatory_name text,
  add column if not exists offer_signatory_title text,
  add column if not exists offer_letter_template text;

comment on column public.tenant_settings.offer_company_name is
  'Tenant-configured company name used when rendering offer letters.';
comment on column public.tenant_settings.offer_signatory_name is
  'Tenant-configured signatory name used when rendering offer letters.';
comment on column public.tenant_settings.offer_signatory_title is
  'Tenant-configured signatory title used when rendering offer letters.';
comment on column public.tenant_settings.offer_letter_template is
  'Tenant-configured offer-letter template using merge fields: {{candidate}}, {{position}}, {{rate}}, {{start_date}}, {{company}}, {{signatory}}, {{signatory_title}}, {{accept_url}}.';

create or replace function public.get_public_offer(token_arg text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'id', o.id,
    'applicant_id', o.applicant_id,
    'status', o.status,
    'position_title', o.position_title,
    'start_date', o.start_date,
    'salary', o.salary,
    'offer_letter_url', o.offer_letter_url,
    'secure_token', o.secure_token,
    'created_at', o.created_at,
    'updated_at', o.updated_at,
    'expires_at', o.expires_at,
    'applicant', jsonb_build_object(
      'id', a.id,
      'first_name', a.first_name,
      'last_name', a.last_name,
      'email', a.email,
      'phone', a.phone,
      'position_applied', a.position_applied,
      'status', a.status,
      'created_at', a.created_at,
      'updated_at', a.updated_at
    ),
    'offer_settings', jsonb_build_object(
      'offer_company_name', ts.offer_company_name,
      'offer_signatory_name', ts.offer_signatory_name,
      'offer_signatory_title', ts.offer_signatory_title,
      'offer_letter_template', ts.offer_letter_template,
      'logo_light', ts.logo_light
    )
  )
  into result
  from public.offers o
  join public.applicants a
    on a.id = o.applicant_id
   and a.tenant_id = o.tenant_id
  left join public.tenant_settings ts
    on ts.tenant_id = o.tenant_id
  where o.secure_token = token_arg;

  return result;
end;
$$;

comment on function public.get_public_offer(text) is
  'Public token-based offer reader. Returns only non-sensitive offer, applicant, and offer-letter settings fields for candidate acceptance pages.';

revoke all on function public.get_public_offer(text) from public;
grant execute on function public.get_public_offer(text) to anon, authenticated, service_role;
