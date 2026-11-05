import { errorResponse, handleError } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { decidePlatformAccess } from "../_shared/platform-overview.ts";

export interface TenantCaller {
  role: string;
  userId: string;
  tenantId: string;
}

export type TenantAction = "suspend" | "reactivate";
export type StatusResult = "changed" | "unchanged" | "not_found";

export interface ManageTenantDeps<Caller extends TenantCaller> {
  guard: (req: Request) => Caller;
  verifyUserId: (caller: Caller, token: string) => Promise<string | null>;
  countActiveAdminRows: (userId: string) => Promise<number>;
  /** Changes the status and writes its audit row in one transaction. */
  setStatus: (input: {
    tenantId: string;
    status: "active" | "suspended";
    reason: string | null;
    actorId: string;
  }) => Promise<StatusResult>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_REASON_LENGTH = 5;

export async function handleManageTenant<Caller extends TenantCaller>(
  req: Request,
  deps: ManageTenantDeps<Caller>,
): Promise<Response> {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const fail = (code: string, message: string, status: number) =>
    withCors(errorResponse(code, message, status), req);

  try {
    const caller = deps.guard(req);

    if (caller.role !== "platform_admin") return fail("FORBIDDEN", "Platform admin access required", 403);

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

    if (access === "unauthenticated") return fail("INVALID_JWT", "Session could not be verified", 401);
    if (access === "forbidden") return fail("FORBIDDEN", "Platform admin access required", 403);

    // The target agency comes from the body by design: this is the one action
    // that works across agencies, and the caller is proven a platform admin above.
    const body = await req.json().catch(() => null) as
      | { tenantId?: unknown; action?: unknown; reason?: unknown }
      | null;
    const { tenantId, action } = body ?? {};
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    if (typeof tenantId !== "string" || !UUID.test(tenantId)) {
      return fail("INVALID_TENANT", "A valid tenantId is required", 400);
    }
    if (action !== "suspend" && action !== "reactivate") {
      return fail("INVALID_ACTION", "action must be suspend or reactivate", 400);
    }
    if (action === "suspend" && reason.length < MIN_REASON_LENGTH) {
      return fail("REASON_REQUIRED", "A reason is required to suspend an agency", 400);
    }
    if (tenantId === caller.tenantId) {
      return fail("OWN_AGENCY", "You cannot change your own agency", 403);
    }

    const result = await deps.setStatus({
      tenantId,
      status: action === "suspend" ? "suspended" : "active",
      reason: reason || null,
      actorId: caller.userId,
    });

    if (result === "not_found") return fail("NOT_FOUND", "Agency not found", 404);
    if (result === "unchanged") return fail("NO_CHANGE", `Agency is already ${action === "suspend" ? "suspended" : "active"}`, 409);

    return withCors(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      req,
    );
  } catch (err) {
    return withCors(handleError(err), req);
  }
}
