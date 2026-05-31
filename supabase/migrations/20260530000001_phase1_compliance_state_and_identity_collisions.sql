-- =============================================================================
-- Migration: Phase 1 lifecycle stabilization
--   (a) people.compliance_state  — compliance state, SEPARATE from lifecycle
--   (b) identity_collisions       — durable unresolved-collision ledger (Q5)
--   (c) people.employee_status    — make the resolver the authoritative writer
--
-- Decisions: DECISIONS.md 2026-05-30 Q2 (lifecycle ≠ compliance; fail-closed
--   resolver is the sole writer of employee_status) and Q5 (fail-safe identity
--   reconciliation records unresolved collisions for manual HR review — never
--   auto-merges/guesses).
--
-- NOTE: people.employee_status already exists (20260309000003) as TEXT DEFAULT
--   'Active' with a CHECK in {Active,Onboarding,Terminated}. Phase 1 does NOT
--   re-create it. We (1) add the SEPARATE compliance_state column, (2) add the
--   collision ledger, and (3) drop the 'Active' default so the resolver — not a
--   column default — decides lifecycle state on insert (fail-closed: a row with
--   no resolver run is NULL, never falsely 'Active'). Existing rows are NOT
--   backfilled (NFR-3 / out-of-scope: no existing-employee status backfill).
--
-- ROLLBACK (documented in DECISIONS.md before `supabase db push`):
--   alter table public.people alter column employee_status set default 'Active';
--   drop trigger if exists audit_identity_collisions_trigger on public.identity_collisions;
--   drop table if exists public.identity_collisions;
--   alter table public.people drop column if exists compliance_state;
--   (compliance_state backfill is NULL-only, so the drop is non-destructive.)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- (a) compliance_state — distinct from employee_status (lifecycle).
--     compliant      : current obligations met & safely evaluable
--     non_compliant  : an obligation is overdue / failed
--     unknown        : not yet evaluable (e.g. training sync not run)
--     configuration_error : required rule/group/anchor config missing
-- NULL-only backfill: existing rows stay NULL until evaluated. No default —
-- the resolver/diagnostics own this value (fail-closed, never a false green).
-- ---------------------------------------------------------------------------

alter table public.people
  add column if not exists compliance_state text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'people_compliance_state_check'
  ) then
    alter table public.people add constraint people_compliance_state_check
      check (
        compliance_state is null
        or compliance_state = any (array[
          'compliant'::text,
          'non_compliant'::text,
          'unknown'::text,
          'configuration_error'::text
        ])
      );
  end if;
end $$;

comment on column public.people.compliance_state is
  'Compliance state, SEPARATE from employee_status (lifecycle). Q2: an established Active employee whose credential later expires becomes non_compliant WITHOUT reverting to Onboarding. compliant|non_compliant|unknown|configuration_error. NULL until evaluated.';

-- ---------------------------------------------------------------------------
-- (c) employee_status: drop the 'Active' default so the fail-closed resolver
--     (not a column default) is the authoritative writer. Existing rows keep
--     their current value (no backfill — out of scope per the handoff).
-- ---------------------------------------------------------------------------

alter table public.people
  alter column employee_status drop default;

comment on column public.people.employee_status is
  'Lifecycle state in {Onboarding, Active, Terminated}. Q2: written ONLY by the fail-closed employee-status resolver (_shared/employee-status-resolver.ts) — never inline-computed at conversion time, never by a column default. Terminated is HR-controlled and never auto-reversed.';

-- ---------------------------------------------------------------------------
-- (b) identity_collisions — durable ledger of unresolved identity collisions.
-- Q5: when reconciliation finds ambiguous/conflicting evidence it writes a row
-- here for manual HR review and does NOT link/merge/create. Tenant-scoped, RLS,
-- audited. INSERT + SELECT + UPDATE (to resolve) by owning tenant.
-- ---------------------------------------------------------------------------

create table if not exists public.identity_collisions (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references public.tenants(id),
  -- the source workflow that detected the collision
  source           text        not null,    -- 'convert-applicant' | 'sync-wp-users' | ...
  applicant_id     uuid,                     -- the applicant being reconciled (if any)
  normalized_email text        not null,     -- trim(lower(email)) at detection time
  -- candidate people.id values implicated (≥1)
  candidate_ids    uuid[]      not null default '{}',
  reason_code      text        not null check (
                      reason_code in ('multiple_email_matches', 'applicant_email_conflict')
                    ),
  resolution_status text       not null default 'unresolved' check (
                      resolution_status in ('unresolved', 'resolved', 'dismissed')
                    ),
  resolved_by      uuid        references auth.users(id),  -- resolving actor
  resolved_at      timestamptz,
  resolution_note  text,
  detail           jsonb       not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.identity_collisions is
  'Durable unresolved-identity-collision ledger (Q5). Recorded when reconciliation finds ambiguous/conflicting evidence; the reconciler NEVER auto-links or guesses. One row per detected collision for manual HR review.';

create index if not exists identity_collisions_tenant_status_idx
  on public.identity_collisions (tenant_id, resolution_status, created_at desc);

-- Avoid piling up duplicate open collisions for the same applicant+email while
-- one is still unresolved. (Partial unique index over the open state only.)
create unique index if not exists identity_collisions_open_unique_idx
  on public.identity_collisions (tenant_id, applicant_id, normalized_email)
  where resolution_status = 'unresolved';

alter table public.identity_collisions enable row level security;

create policy "identity_collisions_select_own" on public.identity_collisions
  for select
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin'
  );

create policy "identity_collisions_insert_own" on public.identity_collisions
  for insert
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

create policy "identity_collisions_update_own" on public.identity_collisions
  for update
  using (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  )
  with check (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  );

-- Audit trigger (NFR-4): every write to this tenant-scoped table is logged.
create or replace function public.audit_identity_collisions()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (
    tenant_id, actor_id, action, table_name, record_id, before, after
  ) values (
    coalesce(new.tenant_id, old.tenant_id),
    nullif(auth.jwt() ->> 'sub', '')::uuid,
    tg_op,
    'identity_collisions',
    coalesce(new.id, old.id),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_identity_collisions_trigger
  after insert or update on public.identity_collisions
  for each row execute function public.audit_identity_collisions();
