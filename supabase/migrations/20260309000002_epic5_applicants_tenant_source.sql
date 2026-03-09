-- =============================================================================
-- Migration: Epic 5 Story 5.2 — Add tenant_id + source to applicants
--
-- Makes the applicants table multi-tenant aware and source-agnostic.
-- Backfills existing rows with the single known tenant and source='jotform'.
-- =============================================================================

-- 1. Add columns
ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id),
  ADD COLUMN IF NOT EXISTS source TEXT;

-- 2. Backfill existing rows (all belong to Prolific Homecare, all from JotForm)
UPDATE applicants
SET tenant_id = '11111111-1111-1111-1111-111111111111',
    source = 'jotform'
WHERE tenant_id IS NULL;

-- 3. Make tenant_id NOT NULL after backfill
ALTER TABLE applicants ALTER COLUMN tenant_id SET NOT NULL;

-- 4. Add CHECK constraint for source (idempotent — skip if exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'applicants_source_check'
  ) THEN
    ALTER TABLE applicants ADD CONSTRAINT applicants_source_check
      CHECK (source = ANY (ARRAY['jotform'::text, 'bamboohr'::text, 'jazzhr'::text]));
  END IF;
END $$;

-- 5. Add index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS applicants_tenant_id_idx ON applicants(tenant_id);

-- 6. Add unique constraint for dedup within tenant
CREATE UNIQUE INDEX IF NOT EXISTS applicants_tenant_email_idx ON applicants(tenant_id, email);

-- 7. Enable RLS
ALTER TABLE applicants ENABLE ROW LEVEL SECURITY;

-- 8. RLS policies (same pattern as people table, idempotent — drop if exists first)
DROP POLICY IF EXISTS applicants_select_own_tenant ON applicants;
CREATE POLICY applicants_select_own_tenant ON applicants
  FOR SELECT USING (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

DROP POLICY IF EXISTS applicants_insert_own_tenant ON applicants;
CREATE POLICY applicants_insert_own_tenant ON applicants
  FOR INSERT WITH CHECK (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

DROP POLICY IF EXISTS applicants_update_own_tenant ON applicants;
CREATE POLICY applicants_update_own_tenant ON applicants
  FOR UPDATE USING (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

-- No DELETE policy — applicants should be archived, not deleted
