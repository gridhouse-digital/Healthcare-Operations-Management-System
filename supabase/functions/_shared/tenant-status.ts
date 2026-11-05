import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const PAGE_SIZE = 1000;

/**
 * Agencies whose scheduled work must stop. A failed lookup throws rather than
 * running them, and it reads every page because the API caps a response at
 * max_rows with no error.
 */
export async function suspendedTenantIds(admin: SupabaseClient): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0;; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("tenants")
      .select("id")
      .eq("status", "suspended")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("Tenant status lookup failed");
    for (const row of data ?? []) ids.add(row.id as string);
    if ((data?.length ?? 0) < PAGE_SIZE) return ids;
  }
}

export function withoutSuspended<Row>(rows: Row[] | null, suspended: Set<string>): Row[] | null {
  return rows && rows.filter((row) => !suspended.has((row as { tenant_id: string }).tenant_id));
}
