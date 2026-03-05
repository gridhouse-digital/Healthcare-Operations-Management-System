import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditEntry {
  tenantId: string;
  actorId: string;
  action: string;
  tableName: string;
  recordId: string;
  before?: unknown;
  after?: unknown;
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

/**
 * Fire-and-forget audit log write.
 *
 * - Uses the SERVICE ROLE key so it bypasses RLS and always succeeds,
 *   even when called from contexts where the user's own RLS might block.
 * - Never throws to the caller — failures are swallowed (audit failure
 *   must not interrupt the business operation).
 * - Returns a Promise so callers can optionally await for testing.
 */
export function logAudit(entry: AuditEntry): Promise<void> {
  return _writeAudit(entry).catch(() => {
    // Intentionally swallowed — audit failure must not propagate.
  });
}

async function _writeAudit(entry: AuditEntry): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return;

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  await supabase.from("audit_log").insert({
    tenant_id: entry.tenantId,
    actor_id: entry.actorId,
    action: entry.action,
    table_name: entry.tableName,
    record_id: entry.recordId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    // created_at is set by DB default
  });
}
