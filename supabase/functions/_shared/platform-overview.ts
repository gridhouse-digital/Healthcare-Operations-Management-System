// Pure logic for the platform-overview Edge Function: totals only, never a
// person's name, email or an integration payload.

export const SYNC_SOURCES = ["jazzhr", "bamboohr", "wordpress", "learndash", "jotform"] as const;
export type SyncSource = typeof SYNC_SOURCES[number];

export const SYNC_WINDOW_DAYS = 7;

/**
 * Runs that recorded a problem. Connectors can finish a run while individual
 * records fail, so a "failed" status alone would report those agencies healthy.
 */
export const SYNC_ERROR_FILTER =
  "status.in.(failed,partial_failure,completed_with_errors),error_count.gt.0";

export type AgencyStatus = "ok" | "attention" | "not_connected" | "no_data";

export interface SourceCounts {
  source: SyncSource;
  active: boolean;
  lastSuccessAt: string | null;
  failedLastWindow: number;
  everRan: boolean;
}

export interface RawAgencyCounts {
  id: string;
  name: string;
  employees: number;
  employeesActive: number;
  employeesOnboarding: number;
  applicants: number;
  teamUsers: number;
  trainingRecords: number;
  trainingCompleted: number;
  trainingInProgress: number;
  trainingNotStarted: number;
  recurringTotal: number;
  recurringOverdue: number;
  sources: SourceCounts[];
}

export interface AgencySummary {
  id: string;
  name: string;
  status: AgencyStatus;
  employees: number;
  employeesActive: number;
  employeesOnboarding: number;
  applicants: number;
  teamUsers: number;
  /** null means nothing is tracked, which must not read as zero overdue */
  training: {
    records: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    completedPct: number | null;
    recurringOverdue: number;
  } | null;
  connections: Array<{ source: SyncSource; lastSuccessAt: string | null; failedLastWindow: number }>;
  lastSyncAt: string | null;
  failedSyncs: number;
}

export interface OverviewTotals {
  agencies: number;
  needingAttention: number;
  employees: number;
  employeesOnboarding: number;
  recurringOverdue: number;
  failedSyncs: number;
  openAccessRequests: number;
}

export function summarizeAgency(raw: RawAgencyCounts): AgencySummary {
  const connections = raw.sources
    .filter((source) => source.active || source.everRan)
    .map(({ source, lastSuccessAt, failedLastWindow }) => ({ source, lastSuccessAt, failedLastWindow }));

  const failedSyncs = connections.reduce((sum, connection) => sum + connection.failedLastWindow, 0);
  const lastSyncAt = connections
    .map((connection) => connection.lastSuccessAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1) ?? null;

  const tracked = raw.trainingRecords > 0 || raw.recurringTotal > 0;
  const training = tracked
    ? {
      records: raw.trainingRecords,
      completed: raw.trainingCompleted,
      inProgress: raw.trainingInProgress,
      notStarted: raw.trainingNotStarted,
      completedPct: raw.trainingRecords > 0
        ? Math.round((raw.trainingCompleted / raw.trainingRecords) * 100)
        : null,
      recurringOverdue: raw.recurringOverdue,
    }
    : null;

  return {
    id: raw.id,
    name: raw.name,
    status: agencyStatus(raw, connections.length, failedSyncs),
    employees: raw.employees,
    employeesActive: raw.employeesActive,
    employeesOnboarding: raw.employeesOnboarding,
    applicants: raw.applicants,
    teamUsers: raw.teamUsers,
    training,
    connections,
    lastSyncAt,
    failedSyncs,
  };
}

function agencyStatus(raw: RawAgencyCounts, connections: number, failedSyncs: number): AgencyStatus {
  /* Checked first: a known problem must outrank a missing connection */
  if (failedSyncs > 0 || raw.recurringOverdue > 0) return "attention";
  if (raw.employees === 0 && raw.applicants === 0 && connections === 0) return "no_data";
  if (connections === 0) return "not_connected";
  return "ok";
}

export function summarizeTotals(agencies: AgencySummary[], openAccessRequests: number): OverviewTotals {
  return {
    agencies: agencies.length,
    needingAttention: agencies.filter((agency) => agency.status === "attention").length,
    employees: agencies.reduce((sum, agency) => sum + agency.employees, 0),
    employeesOnboarding: agencies.reduce((sum, agency) => sum + agency.employeesOnboarding, 0),
    recurringOverdue: agencies.reduce((sum, agency) => sum + (agency.training?.recurringOverdue ?? 0), 0),
    failedSyncs: agencies.reduce((sum, agency) => sum + agency.failedSyncs, 0),
    openAccessRequests,
  };
}

export type PlatformAccessDecision = "allowed" | "forbidden" | "unauthenticated";

/**
 * tenantGuard only decodes the JWT, and this function reads across every
 * agency with the service role. So the claim alone never grants access: the
 * token must verify with Supabase Auth and the verified user must hold an
 * active platform_admin row. Any missing piece fails closed.
 */
export function decidePlatformAccess(input: {
  claimedRole: string;
  verifiedUserId: string | null;
  claimedUserId: string;
  activePlatformAdminRows: number;
}): PlatformAccessDecision {
  if (input.claimedRole !== "platform_admin") return "forbidden";
  if (!input.verifiedUserId || input.verifiedUserId !== input.claimedUserId) return "unauthenticated";
  return input.activePlatformAdminRows > 0 ? "allowed" : "forbidden";
}
