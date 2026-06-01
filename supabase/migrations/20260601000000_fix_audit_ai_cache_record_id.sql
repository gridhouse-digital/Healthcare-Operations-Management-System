-- =============================================================================
-- Migration: Fix audit_ai_cache() — ai_cache's PK is input_hash, not id
--
-- BUG (pre-existing): audit_ai_cache() (created in 20260310000001) inserted
--   record_id = coalesce(new.id, old.id), but public.ai_cache has NO `id` column
--   (its primary key is `input_hash` text). Every INSERT/UPDATE/DELETE on ai_cache
--   therefore raised  `record "new" has no field "id"`  and the write failed —
--   crashing the RLS-suite seed on a clean schema and (silently) breaking ai_cache
--   writes wherever the trigger fires.
--
-- FIX: audit_log.record_id is uuid (nullable) and ai_cache.input_hash is text, so
--   record_id cannot hold input_hash. Set record_id = NULL and rely on the full row
--   payload captured in before/after via to_jsonb(...) — which includes input_hash —
--   to preserve the audit intent (which cache row changed) without crashing.
--
-- Keeps SECURITY DEFINER + a pinned search_path (matches the 0.1-C hardening). The
--   C-era EXECUTE revokes (anon/authenticated/public) are PRESERVED across
--   CREATE OR REPLACE (replace does not reset grants). Idempotent.
--
-- Forward-only fix: editing the historical creating migration is unnecessary (this
--   replaces the function for both fresh applies and already-applied environments).
--   Rollback documented in docs/Project_Docs/DECISIONS.md (2026-06-01).
-- =============================================================================

create or replace function public.audit_ai_cache()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.audit_log (
    tenant_id, actor_id, action, table_name, record_id, before, after
  ) values (
    coalesce(new.tenant_id, old.tenant_id),
    (auth.jwt() ->> 'sub')::uuid,
    tg_op,
    'ai_cache',
    null,  -- ai_cache PK = input_hash (text); audit_log.record_id is uuid → null.
           -- input_hash is preserved in before/after (to_jsonb of the row).
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;
