import { errorResponse, handleError } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import {
  decidePlatformAccess,
  SYNC_WINDOW_DAYS,
  type AgencySummary,
  type OverviewTotals,
} from "../_shared/platform-overview.ts";

export interface OverviewCaller {
  role: string;
  userId: string;
  tenantId: string;
}

export interface OverviewData {
  totals: OverviewTotals;
  agencies: AgencySummary[];
}

/** Injected so the access flow can be tested without a server or a database. */
export interface PlatformOverviewDeps<Caller extends OverviewCaller> {
  guard: (req: Request) => Caller;
  verifyUserId: (caller: Caller, token: string) => Promise<string | null>;
  countActiveAdminRows: (userId: string) => Promise<number>;
  loadOverview: (caller: Caller) => Promise<OverviewData>;
  /** Must reject when the audit row cannot be written. */
  writeAudit: (caller: Caller, agencies: number) => Promise<void>;
}

export async function handlePlatformOverview<Caller extends OverviewCaller>(
  req: Request,
  deps: PlatformOverviewDeps<Caller>,
): Promise<Response> {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const caller = deps.guard(req);

    const forbidden = () =>
      withCors(errorResponse("FORBIDDEN", "Platform admin access required", 403), req);

    if (caller.role !== "platform_admin") return forbidden();

    const token = req.headers.get("Authorization")!.slice(7);
    const verifiedUserId = await deps.verifyUserId(caller, token);
    const activePlatformAdminRows = verifiedUserId
      ? await deps.countActiveAdminRows(verifiedUserId)
      : 0;

    const access = decidePlatformAccess({
      claimedRole: caller.role,
      verifiedUserId,
      claimedUserId: caller.userId,
      activePlatformAdminRows,
    });

    if (access === "unauthenticated") {
      return withCors(errorResponse("INVALID_JWT", "Session could not be verified", 401), req);
    }
    if (access === "forbidden") return forbidden();

    const { totals, agencies } = await deps.loadOverview(caller);

    /* A cross-agency read is only released once it has been recorded */
    try {
      await deps.writeAudit(caller, agencies.length);
    } catch {
      return withCors(errorResponse("AUDIT_FAILED", "Audit record could not be written", 500), req);
    }

    return withCors(
      new Response(
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          syncWindowDays: SYNC_WINDOW_DAYS,
          totals,
          agencies,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
      req,
    );
  } catch (err) {
    return withCors(handleError(err), req);
  }
}
