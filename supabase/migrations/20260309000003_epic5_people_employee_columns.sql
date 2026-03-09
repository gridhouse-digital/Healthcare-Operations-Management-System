-- =============================================================================
-- Migration: Epic 5 Story 5.3 — Add employee-specific columns to people
--
-- The `people` table now serves as the unified person record for both
-- candidates and employees. These columns were previously on `employees`.
-- =============================================================================

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS employee_id TEXT,
  ADD COLUMN IF NOT EXISTS employee_status TEXT DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS applicant_id UUID;

-- employee_status: Active, Onboarding, Terminated (idempotent — skip if exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'people_employee_status_check'
  ) THEN
    ALTER TABLE people ADD CONSTRAINT people_employee_status_check
      CHECK (employee_status IS NULL OR employee_status = ANY (ARRAY['Active'::text, 'Onboarding'::text, 'Terminated'::text]));
  END IF;
END $$;
