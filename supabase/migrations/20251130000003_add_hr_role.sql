-- Add 'hr' as a valid role option
-- This migration extends the user_role enum to include 'hr'.
-- The previous version attempted a CHECK constraint on an enum column,
-- which fails on db reset. The correct fix is ALTER TYPE.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'hr';
