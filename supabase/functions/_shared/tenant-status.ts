import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/** Agencies whose scheduled work must stop. A failed lookup throws rather than running them. */
export async function suspendedTenantIds(admin: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await admin.from("tenants").select("id").eq("status", "suspended");
  if (error) throw new Error("Tenant status lookup failed");
  return new Set((data ?? []).map((row) => row.id as string));
}

export function withoutSuspended<Row>(rows: Row[] | null, suspended: Set<string>): Row[] | null {
  return rows && rows.filter((row) => !suspended.has((row as { tenant_id: string }).tenant_id));
}
