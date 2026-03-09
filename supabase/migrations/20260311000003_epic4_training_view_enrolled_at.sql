-- Epic 4 — Training ledger
-- Expose enrolled_at from training_records via v_training_compliance so the UI
-- can show true enrollment dates even for older training_events rows.

create or replace view public.v_training_compliance as
with latest_adjustments as (
  select distinct on (tenant_id, person_id, course_id, field)
    tenant_id,
    person_id,
    course_id,
    field,
    value,
    created_at as adjusted_at
  from public.training_adjustments
  order by tenant_id, person_id, course_id, field, created_at desc
),
pivoted as (
  select
    tenant_id,
    person_id,
    course_id,
    max(case when field = 'status' then value end)          as adj_status,
    max(case when field = 'completion_pct' then value end)  as adj_completion_pct,
    max(case when field = 'completed_at' then value end)    as adj_completed_at,
    max(case when field = 'training_hours' then value end)  as adj_training_hours,
    max(adjusted_at)                                         as last_adjusted_at
  from latest_adjustments
  group by tenant_id, person_id, course_id
)
select
  tr.id              as training_record_id,
  tr.tenant_id,
  tr.person_id,
  tr.course_id,
  tr.course_name,
  -- Effective values: Layer B wins over Layer A
  coalesce(p.adj_status, tr.status)                          as effective_status,
  coalesce(p.adj_completion_pct::integer, tr.completion_pct) as effective_completion_pct,
  coalesce(p.adj_completed_at::timestamptz, tr.completed_at) as effective_completed_at,
  coalesce(p.adj_training_hours::integer, tr.training_hours) as effective_training_hours,
  -- Raw Layer A values (for reference/comparison)
  tr.status              as raw_status,
  tr.completion_pct      as raw_completion_pct,
  tr.completed_at        as raw_completed_at,
  tr.training_hours      as raw_training_hours,
  -- Metadata
  tr.expires_at,
  tr.last_synced_at,
  p.last_adjusted_at,
  (p.adj_status is not null
   or p.adj_completion_pct is not null
   or p.adj_completed_at is not null
   or p.adj_training_hours is not null)  as has_overrides,
  -- New: enrolled_at from training_records (no HR override layer)
  tr.enrolled_at
from public.training_records tr
left join pivoted p
  on  p.tenant_id = tr.tenant_id
  and p.person_id = tr.person_id
  and p.course_id = tr.course_id;

comment on view public.v_training_compliance is
  'Layer C: Effective training compliance values. Latest HR override (Layer B) wins over raw sync data (Layer A). Query this view for all compliance reporting.';

