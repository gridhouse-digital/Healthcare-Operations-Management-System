import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { tenantGuard } from "../_shared/tenant-guard.ts";
import { handlePlatformOverview } from "./handler.ts";
import {
  sortByAttention,
  summarizeAgency,
  summarizeTotals,
  SYNC_ERROR_FILTER,
  SYNC_SOURCES,
  SYNC_WINDOW_DAYS,
  type RawAgencyCounts,
  type SourceCounts,
  type SyncSource,
} from "../_shared/platform-overview.ts";

// Platform-wide totals for platform admins. Deliberate exception to the
// one-agency rule: see DECISIONS.md. Selects counts only, never personal fields
// or integration_log.payload.

const PAGE_SIZE = 1000;
const AGENCY_BATCH_SIZE = 5;

interface TenantRow {
  id: string;
  name: string;
  status: string;
  status_reason: string | null;
  status_changed_at: string | null;
}

interface CountResult {
  count: number | null;
  error: unknown;
}

async function countOf(query: PromiseLike<CountResult>): Promise<number> {
  const { count, error } = await query;
  if (error) throw error instanceof Error ? error : new Error("Count query failed");
  return count ?? 0;
}

/* The API caps a response at max_rows with no error, so read until a short page */
async function fetchAll<Row>(
  page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0;; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("Agency lookup failed");
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
  }
}

function head(admin: SupabaseClient, table: string) {
  return admin.from(table).select("*", { count: "exact", head: true });
}

async function loadSource(
  admin: SupabaseClient,
  tenantId: string,
  source: SyncSource,
  active: boolean,
  since: string,
): Promise<SourceCounts> {
  const [lastSuccess, failedLastWindow, everRan] = await Promise.all([
    admin
      .from("integration_log")
      .select("completed_at")
      .eq("tenant_id", tenantId)
      .eq("source", source)
      .eq("status", "completed")
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    countOf(head(admin, "integration_log").eq("tenant_id", tenantId).eq("source", source).or(SYNC_ERROR_FILTER).gte("created_at", since)),
    countOf(head(admin, "integration_log").eq("tenant_id", tenantId).eq("source", source)),
  ]);

  if (lastSuccess.error) throw new Error("Sync lookup failed");

  return {
    source,
    active,
    lastSuccessAt: lastSuccess.data?.completed_at ?? null,
    failedLastWindow,
    everRan: everRan > 0,
  };
}

async function loadAgency(
  admin: SupabaseClient,
  tenant: TenantRow,
  activeConnectors: string[],
  since: string,
): Promise<RawAgencyCounts> {
  const id = tenant.id;
  const employees = () => head(admin, "people").eq("tenant_id", id).eq("type", "employee");
  const training = () => head(admin, "v_training_compliance").eq("tenant_id", id);
  const recurring = () => head(admin, "v_recurring_compliance_status").eq("tenant_id", id);

  const [
    employeeCount,
    employeesActive,
    employeesOnboarding,
    applicants,
    teamUsers,
    trainingRecords,
    trainingCompleted,
    trainingInProgress,
    trainingNotStarted,
    recurringTotal,
    recurringOverdue,
    sources,
  ] = await Promise.all([
    countOf(employees()),
    countOf(employees().eq("employee_status", "Active")),
    countOf(employees().eq("employee_status", "Onboarding")),
    countOf(head(admin, "applicants").eq("tenant_id", id)),
    countOf(head(admin, "tenant_users").eq("tenant_id", id).neq("role", "platform_admin")),
    countOf(training()),
    countOf(training().eq("effective_status", "completed")),
    countOf(training().eq("effective_status", "in_progress")),
    countOf(training().eq("effective_status", "not_started")),
    countOf(recurring()),
    countOf(recurring().eq("compliance_status", "overdue")),
    Promise.all(SYNC_SOURCES.map((source) => loadSource(admin, id, source, activeConnectors.includes(source), since))),
  ]);

  return {
    id,
    name: tenant.name,
    employees: employeeCount,
    employeesActive,
    employeesOnboarding,
    applicants,
    teamUsers,
    trainingRecords,
    trainingCompleted,
    trainingInProgress,
    trainingNotStarted,
    recurringTotal,
    recurringOverdue,
    sources,
    tenantStatus: tenant.status,
    statusReason: tenant.status_reason,
    statusChangedAt: tenant.status_changed_at,
  };
}

/* The admin's own agency is the operator's internal account, not a client */
async function loadOverview(admin: SupabaseClient, ownTenantId: string) {
  const since = new Date(Date.now() - SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [allTenants, settings, openAccessRequests] = await Promise.all([
    fetchAll<TenantRow>((from, to) =>
      admin.from("tenants").select("id, name, status, status_reason, status_changed_at").order("name").order("id").range(from, to)
    ),
    fetchAll<{ tenant_id: string; active_connectors: string[] | null }>((from, to) =>
      admin.from("tenant_settings").select("tenant_id, active_connectors").order("tenant_id").range(from, to)
    ),
    countOf(head(admin, "tenant_access_requests").in("status", ["submitted", "under_review"])),
  ]);

  const tenants = allTenants.filter((tenant) => tenant.id !== ownTenantId);
  const connectorsByTenant = new Map<string, string[]>(
    settings.map((row) => [row.tenant_id, row.active_connectors ?? []]),
  );

  /* Each agency runs about 26 queries, so a few at a time */
  const raw: RawAgencyCounts[] = [];
  for (let start = 0; start < tenants.length; start += AGENCY_BATCH_SIZE) {
    raw.push(
      ...await Promise.all(
        tenants.slice(start, start + AGENCY_BATCH_SIZE).map((tenant) =>
          loadAgency(admin, tenant, connectorsByTenant.get(tenant.id) ?? [], since)
        ),
      ),
    );
  }

  const agencies = sortByAttention(raw.map((agency) => summarizeAgency(agency)));
  return { totals: summarizeTotals(agencies, openAccessRequests), agencies };
}

Deno.serve((req: Request) => {
  /* Created on first use, so nothing runs before tenantGuard inside the handler */
  let client: SupabaseClient | null = null;
  const admin = () =>
    client ??= createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

  return handlePlatformOverview(req, {
    guard: tenantGuard,
    verifyUserId: async (ctx, token) => {
      const { data, error } = await ctx.supabase.auth.getUser(token);
      return error ? null : data.user?.id ?? null;
    },
    countActiveAdminRows: (userId) =>
      countOf(
        head(admin(), "tenant_users")
          .eq("user_id", userId)
          .eq("role", "platform_admin")
          .eq("status", "active"),
      ),
    loadOverview: (ctx) => loadOverview(admin(), ctx.tenantId),
    /* Written directly: logAudit swallows failures, and this read must not go unrecorded */
    writeAudit: async (ctx, agencies) => {
      const { error } = await admin().from("audit_log").insert({
        tenant_id: ctx.tenantId,
        actor_id: ctx.userId,
        action: "platform_overview_read",
        table_name: "tenants",
        after: { agencies },
      });
      if (error) throw new Error("Audit insert failed");
    },
  });
});
