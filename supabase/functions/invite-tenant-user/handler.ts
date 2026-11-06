import { errorResponse, handleError } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";

// FR-19: Invite users by email + role assignment.
//
// This only creates a pending membership. The row becomes active when Supabase
// Auth confirms the invite (trigger on_invited_user_confirmed), so there is no
// activation request for a browser to send.

export interface InviteCaller {
  role: string;
  userId: string;
  tenantId: string;
}

export type InviteRole = "tenant_admin" | "hr_admin";

export interface Membership {
  tenant_id: string;
  status: string;
}

export interface InviteTenantUserDeps<Caller extends InviteCaller> {
  guard: (req: Request) => Caller;
  findMemberships: (email: string) => Promise<Membership[]>;
  /** Returns the invited user's id, or null if the email already has an account. */
  sendInvite: (email: string, redirectTo: string | undefined) => Promise<string | null>;
  createPendingMembership: (input: {
    tenantId: string;
    userId: string;
    role: InviteRole;
    invitedBy: string;
  }) => Promise<string>;
  audit: (input: {
    tenantId: string;
    actorId: string;
    action: string;
    recordId: string;
    after: Record<string, unknown>;
  }) => Promise<void>;
  /** The deployed frontend. Without one, Auth falls back to its Site URL. */
  appOrigin: () => string | undefined;
}

export type InviteDecision = "invite" | "resend" | "already_member" | "deactivated" | "unavailable";

/**
 * The token hook reads a single active row per user, so an email can belong to
 * only one agency. A pending invite here may be resent; anything else is refused.
 */
export function decideInvite(memberships: Membership[], tenantId: string): InviteDecision {
  if (memberships.length === 0) return "invite";
  const own = memberships.find((m) => m.tenant_id === tenantId);
  if (!own || memberships.length > 1) return "unavailable";
  if (own.status === "pending") return "resend";
  return own.status === "active" ? "already_member" : "deactivated";
}

const VALID_ROLES: readonly string[] = ["tenant_admin", "hr_admin"];

export async function handleInviteTenantUser<Caller extends InviteCaller>(
  req: Request,
  deps: InviteTenantUserDeps<Caller>,
): Promise<Response> {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const fail = (code: string, message: string, status: number) =>
    withCors(errorResponse(code, message, status), req);
  const ok = (body: Record<string, unknown>) =>
    withCors(
      new Response(JSON.stringify({ ok: true, ...body }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      req,
    );

  try {
    const ctx = deps.guard(req);

    if (ctx.role === "hr_admin") return fail("FORBIDDEN", "Only tenant_admin can invite users", 403);

    const body = await req.json().catch(() => null) as { email?: unknown; role?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = body?.role;

    if (!email || !role) return fail("MISSING_FIELDS", "email and role required", 400);
    if (typeof role !== "string" || !VALID_ROLES.includes(role)) {
      return fail("INVALID_ROLE", "role must be tenant_admin or hr_admin", 400);
    }

    const decision = decideInvite(await deps.findMemberships(email), ctx.tenantId);

    if (decision === "already_member") return fail("ALREADY_MEMBER", "This person is already on your team", 409);
    if (decision === "deactivated") {
      return fail("USER_DEACTIVATED", "This person was deactivated and cannot be invited again", 409);
    }
    if (decision === "unavailable") return fail("EMAIL_UNAVAILABLE", "This email cannot be invited", 409);

    const origin = deps.appOrigin();
    const userId = await deps.sendInvite(email, origin ? `${origin}/update-password` : undefined);
    if (!userId) return fail("EMAIL_UNAVAILABLE", "This email cannot be invited", 409);

    if (decision === "resend") return ok({ resent: true });

    const recordId = await deps.createPendingMembership({
      tenantId: ctx.tenantId,
      userId,
      role: role as InviteRole,
      invitedBy: ctx.userId,
    });

    await deps.audit({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      action: "user.invited",
      recordId,
      after: { email, role, status: "pending" },
    });

    return ok({ resent: false });
  } catch (err) {
    return withCors(handleError(err), req);
  }
}
