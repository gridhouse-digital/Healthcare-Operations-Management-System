import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { tenantGuard } from "../_shared/tenant-guard.ts";
import { errorResponse, handleError } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";
import {
  decidePlatformAccess,
  summarizeAgency,
  summarizeTotals,
  SYNC_SOURCES,
  SYNC_WINDOW_DAYS,
  type RawAgencyCounts,
  type SourceCounts,
  type SyncSource,
} from "../_shared/platform-overview.ts";

// Platform-wide totals for platform admins. Deliberate exception to the
// one-agency rule: see DECISIONS.md. Selects counts only, never personal fields
// or integration_log.payload.

interface CountResult {
  count: number | null;
  error: unknown;
}

async function countOf(query: PromiseLike<CountResult>): Promise<number> {
  const { count, error } = await query;
  if (error) throw error instanceof Error ? error : new Error("Count query failed");
  return count ?? 0;
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
    countOf(head(admin, "integration_log").eq("tenant_id", tenantId).eq("source", source).eq("status", "failed").gte("created_at", since)),
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
  tenant: { id: string; name: string },
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
  };
}

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const ctx = tenantGuard(req);

    const forbidden = () =>
      withCors(errorResponse("FORBIDDEN", "Platform admin access required", 403), req);

    if (ctx.role !== "platform_admin") return forbidden();

    const token = req.headers.get("Authorization")!.slice(7);
    const { data: verified, error: verifyError } = await ctx.supabase.auth.getUser(token);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const verifiedUserId = verifyError ? null : verified.user?.id ?? null;
    const activePlatformAdminRows = verifiedUserId
      ? await countOf(
        head(admin, "tenant_users")
          .eq("user_id", verifiedUserId)
          .eq("role", "platform_admin")
          .eq("status", "active"),
      )
      : 0;

    const access = decidePlatformAccess({
      claimedRole: ctx.role,
      verifiedUserId,
      claimedUserId: ctx.userId,
      activePlatformAdminRows,
    });

    if (access === "unauthenticated") {
      return withCors(errorResponse("INVALID_JWT", "Session could not be verified", 401), req);
    }
    if (access === "forbidden") return forbidden();

    const since = new Date(Date.now() - SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const [tenants, settings, openAccessRequests] = await Promise.all([
      admin.from("tenants").select("id, name").order("name"),
      admin.from("tenant_settings").select("tenant_id, active_connectors"),
      countOf(head(admin, "tenant_access_requests").in("status", ["submitted", "under_review"])),
    ]);

    if (tenants.error || settings.error) throw new Error("Agency lookup failed");

    const connectorsByTenant = new Map<string, string[]>(
      (settings.data ?? []).map((row) => [row.tenant_id, row.active_connectors ?? []]),
    );

    const raw = await Promise.all(
      (tenants.data ?? []).map((tenant) =>
        loadAgency(admin, tenant, connectorsByTenant.get(tenant.id) ?? [], since)
      ),
    );
    const agencies = raw.map(summarizeAgency);

    await logAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      action: "platform_overview_read",
      tableName: "tenants",
      after: { agencies: agencies.length },
    });

    return withCors(
      new Response(
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          syncWindowDays: SYNC_WINDOW_DAYS,
          totals: summarizeTotals(agencies, openAccessRequests),
          agencies,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
      req,
    );
  } catch (err) {
    return withCors(handleError(err), req);
  }
});
