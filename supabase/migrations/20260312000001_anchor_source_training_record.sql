-- Allow anchor_source 'training_record' and 'job_title_legacy' for backfill
-- that prefers LearnDash evidence (training_records) over job-title inference.

alter table public.employee_group_enrollments
  drop constraint if exists employee_group_enrollments_anchor_source_check;

alter table public.employee_group_enrollments
  add constraint employee_group_enrollments_anchor_source_check
  check (anchor_source in (
    'process_hire',
    'backfill',
    'hired_at_fallback',
    'manual',
    'training_record',
    'job_title_legacy'
  ));

comment on column public.employee_group_enrollments.anchor_source is
  'Source of the anchor: process_hire (from process-hire EF), backfill (from integration_log), hired_at_fallback, manual, training_record (from training_records/course assignment), job_title_legacy (job-title match only).';
