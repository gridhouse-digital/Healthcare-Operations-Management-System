-- Epic 4 — Training ledger
-- Add enrolled_at to training_records so we can surface the true LearnDash enrollment date.

alter table public.training_records
  add column if not exists enrolled_at timestamptz;

comment on column public.training_records.enrolled_at is
  'Enrollment/first activity timestamp from LearnDash (date_started). Used for timeline "Enrolled" events.';

