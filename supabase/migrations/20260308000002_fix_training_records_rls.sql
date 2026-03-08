-- =============================================================================
-- Migration: Fix training_records RLS — block DELETE
--
-- Problem: The original USING-only policy allows all operations (SELECT,
--          INSERT, UPDATE, DELETE) for the tenant. Training records should
--          never be deleted by users — only synced/updated by the system.
--
-- Solution: Replace single policy with 3 explicit policies:
--   - SELECT (read own tenant)
--   - INSERT (create within own tenant)
--   - UPDATE (modify within own tenant — sync needs this)
--   No DELETE policy = DELETE blocked by RLS.
-- =============================================================================

-- Drop the existing permissive policy
drop policy if exists "training_records_own_tenant" on public.training_records;

-- SELECT: read records within own tenant
create policy "training_records_select" on public.training_records
  for select
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

-- INSERT: create records within own tenant
create policy "training_records_insert" on public.training_records
  for insert
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

-- UPDATE: modify records within own tenant (sync-training needs UPDATE)
create policy "training_records_update" on public.training_records
  for update
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

-- No DELETE policy — RLS blocks all deletes for authenticated users.
-- Service role (used by sync-training EF) bypasses RLS and can still
-- perform maintenance deletes if needed in the future.
