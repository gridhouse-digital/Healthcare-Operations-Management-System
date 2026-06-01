-- =============================================================================
-- Migration: Phase 0.1 — RLS legacy-policy remediation (cross-tenant leak hotfix)
--
-- Brief: docs/bmad/working-notes/2026-05-30-phase-0.1-rls-legacy-policy-remediation-handoff.md
--
-- ROOT CAUSE: PostgreSQL combines multiple *permissive* policies with OR. Epic 5
-- ADDED tenant-scoped policies but never DROPPED the Epic-0 allow-all policies,
-- so OR(USING(true), tenant_match) collapses to `true` → zero isolation. The fix
-- is to DROP the stale permissive policies (not to add more permissive ones).
-- The correct tenant-scoped policies created by Epic 5 (20260309000002,
-- 20260310000001) and the people/training/etc. suites remain in place.
--
-- Tenant-scoping pattern (tenant_id sourced ONLY from JWT app_metadata):
--   tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
-- ai_logs.tenant_id is legacy TEXT (no FK), so it is compared text-to-text.
--
-- All statements are idempotent (drop ... if exists / create ... if not exists).
-- A ROLLBACK block recreating the dropped definitions is recorded in
-- docs/Project_Docs/DECISIONS.md. Rolling back re-opens the leak — disposable
-- environments only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. applicants — drop the Epic-0 allow-all SELECT/ALL policy (candidate PII).
--    Tenant-scoped applicants_select/insert/update_own_tenant remain.
-- -----------------------------------------------------------------------------
drop policy if exists "Allow all access for authenticated users" on public.applicants;

-- -----------------------------------------------------------------------------
-- 2. offers — drop the permissive leak policies (offer / comp data).
--    "Allow full access for authenticated users"  : FOR ALL USING(true)
--    "Everyone can view offers"                    : SELECT auth.role()='authenticated'
--    The profiles-based admin write policies ("Admins can insert/update/delete
--    offers") are ALSO permissive and NOT tenant-scoped — under permissive-OR
--    they let a tenant-A admin write tenant-B offers alongside the correct
--    offers_insert/update_own_tenant policies. Same root cause → drop them too.
--    Tenant-scoped offers_select/insert/update_own_tenant (20260310000001) remain.
-- -----------------------------------------------------------------------------
drop policy if exists "Allow full access for authenticated users" on public.offers;
drop policy if exists "Everyone can view offers" on public.offers;
drop policy if exists "Admins can insert offers" on public.offers;
drop policy if exists "Admins can update offers" on public.offers;
drop policy if exists "Admins can delete offers" on public.offers;

-- offers anon read path: the legacy
--   "Allow public read access via secure_token" USING (secure_token IS NOT NULL)
-- returned EVERY offer to any unauthenticated caller (tenant-wide leak), and
-- plain RLS cannot bind it to a per-request token. Verification confirmed no app
-- path relies on an anon SELECT of offers (offerService.getOfferByToken runs as
-- an authenticated tenant session; candidate accept/decline uses the
-- SECURITY DEFINER respond_to_offer RPC). Drop it.
drop policy if exists "Allow public read access via secure_token" on public.offers;

-- -----------------------------------------------------------------------------
-- 3. ai_cache — drop the Epic-0 allow-all authenticated SELECT (cached AI
--    output may embed applicant data). Tenant-scoped ai_cache_*_own_tenant
--    (20260310000001) remain.
-- -----------------------------------------------------------------------------
drop policy if exists "Authenticated users can read cache" on public.ai_cache;

-- -----------------------------------------------------------------------------
-- 4. ai_logs — STILL WRITTEN AND READ (supabase/functions/_shared/aiClient.ts:
--    rate-limit reads + usage/error inserts) via the service-role client, and
--    read by the authenticated AI Dashboard. tenant_id is legacy TEXT (no FK).
--    Replace the allow-all authenticated SELECT with a tenant-scoped SELECT
--    (text-to-text compare). service_role full access + insert policies remain,
--    so aiClient rate-limiting/logging is unaffected; the dashboard now sees
--    only its own tenant's logs.
-- -----------------------------------------------------------------------------
drop policy if exists "Authenticated users can read logs" on public.ai_logs;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_logs'
      and policyname = 'ai_logs_select_own_tenant'
  ) then
    create policy "ai_logs_select_own_tenant" on public.ai_logs
      for select
      to authenticated
      using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 5. STORAGE (top priority — PHI). The resumes + compliance-documents buckets
--    had bare `TO authenticated USING (bucket_id = '...')` read policies: any
--    authenticated user of ANY tenant could download any object (I9 /
--    vaccination / license / background → PHI-class). storage.objects has no
--    tenant_id column, so scope by joining the object's first path segment back
--    to its owning tenant:
--      resumes/{applicant_id}/...          → applicants.tenant_id   (file-manager.ts convention)
--      compliance-documents/{person_id}/...→ people.tenant_id       (provisional — no production writer exists yet)
--    The join subqueries are wrapped in SECURITY DEFINER helpers so the storage
--    role can evaluate them regardless of table-level grants, and so the
--    convention lives in one place. Bare authenticated read is removed.
-- -----------------------------------------------------------------------------

-- Helper: does the given uuid (first path segment) belong to the JWT's tenant?
create or replace function public.storage_obj_in_caller_tenant(
  p_first_segment text,
  p_kind text  -- 'applicant' | 'person'
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
  v_id uuid;
begin
  if v_tenant is null or p_first_segment is null then
    return false;
  end if;

  -- Reject non-uuid path segments rather than erroring the whole query.
  begin
    v_id := p_first_segment::uuid;
  exception when others then
    return false;
  end;

  if p_kind = 'applicant' then
    return exists (
      select 1 from public.applicants a
      where a.id = v_id and a.tenant_id = v_tenant
    );
  elsif p_kind = 'person' then
    return exists (
      select 1 from public.people pe
      where pe.id = v_id and pe.tenant_id = v_tenant
    );
  end if;

  return false;
end;
$$;

revoke all on function public.storage_obj_in_caller_tenant(text, text) from public;
grant execute on function public.storage_obj_in_caller_tenant(text, text) to authenticated;

-- resumes: replace bare authenticated read with a tenant-scoped read.
drop policy if exists "Authenticated users can view resumes" on storage.objects;
create policy "Tenant can view own resumes"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'resumes'
  and public.storage_obj_in_caller_tenant((storage.foldername(name))[1], 'applicant')
);

-- compliance-documents: replace bare authenticated read with a tenant-scoped read.
drop policy if exists "Authenticated users can view compliance docs" on storage.objects;
create policy "Tenant can view own compliance docs"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'compliance-documents'
  and public.storage_obj_in_caller_tenant((storage.foldername(name))[1], 'person')
);

-- NOTE on uploads: the existing INSERT policies ("Authenticated users can upload
-- resumes/compliance docs") only check bucket_id. They are NOT broadened here
-- (out of scope: this hotfix targets the cross-tenant READ leak). Production
-- uploads run through the service-role Edge Function (file-manager.ts), which
-- bypasses RLS. Tightening upload WITH CHECK to the tenant path prefix is a
-- recommended Phase 1 follow-up once a tenant-aware upload path is wired.
