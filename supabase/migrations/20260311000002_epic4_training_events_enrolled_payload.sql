-- Epic 4 — Training ledger
-- Ensure training_events "enrolled" payload carries the true enrolled_at timestamp.

create or replace function public.training_records_event_trigger()
returns trigger
language plpgsql
security definer as $$
begin
  if tg_op = 'INSERT' then
    insert into public.training_events (tenant_id, person_id, course_id, event_type, payload)
    values (
      new.tenant_id,
      new.person_id,
      new.course_id,
      'enrolled',
      jsonb_build_object(
        'course_name', new.course_name,
        'enrolled_at', new.enrolled_at,
        'source', 'learndash_sync'
      )
    );
  elsif tg_op = 'UPDATE'
    and new.status = 'completed'
    and (old.status is distinct from 'completed')
  then
    insert into public.training_events (tenant_id, person_id, course_id, event_type, payload)
    values (
      new.tenant_id,
      new.person_id,
      new.course_id,
      'completed',
      jsonb_build_object(
        'course_name', new.course_name,
        'completed_at', new.completed_at,
        'completion_pct', new.completion_pct,
        'source', 'learndash_sync'
      )
    );
  end if;
  return new;
end;
$$;

