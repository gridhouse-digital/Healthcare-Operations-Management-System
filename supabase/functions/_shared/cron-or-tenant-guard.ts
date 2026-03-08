import { TenantGuardError, type TenantRole } from "./tenant-guard.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InvocationContext =
  | { mode: "cron" }
  | { mode: "user"; tenantId: string; userId: string; role: TenantRole };

// ---------------------------------------------------------------------------
// Dual-path auth guard for scheduled Edge Functions
// ---------------------------------------------------------------------------

/**
 * Auth guard for EFs invoked by BOTH pg_cron and authenticated users.
 *
 * - pg_cron sends a service-role JWT → returns { mode: "cron" }
 * - Authenticated users send a user JWT → returns { mode: "user", tenantId, userId, role }
 * - Anything else → throws TenantGuardError
 *
 * The caller decides how to scope work based on the mode:
 * - "cron": process all tenants (fan-out)
 * - "user": restrict to ctx.tenantId only
 */
export function cronOrTenantGuard(req: Request): InvocationContext {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new TenantGuardError("MISSING_AUTH", "Authorization header required");
  }

  const token = authHeader.slice(7);

  let payload: Record<string, unknown>;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("malformed");
    payload = JSON.parse(atob(parts[1])) as Record<string, unknown>;
  } catch {
    throw new TenantGuardError("INVALID_JWT", "JWT could not be decoded");
  }

  // ── Path A: service-role token (pg_cron) ──────────────────────────
  const topLevelRole = payload["role"];
  if (topLevelRole === "service_role") {
    return { mode: "cron" };
  }

  // ── Path B: user token ────────────────────────────────────────────
  const sub = payload["sub"];
  if (typeof sub !== "string" || sub.length === 0) {
    throw new TenantGuardError("MISSING_SUB", "JWT sub claim missing");
  }

  const meta = payload["app_metadata"];
  if (!meta || typeof meta !== "object") {
    throw new TenantGuardError(
      "MISSING_APP_METADATA",
      "JWT app_metadata claim missing",
    );
  }
  const appMeta = meta as Record<string, unknown>;

  const tenantId = appMeta["tenant_id"];
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    throw new TenantGuardError(
      "MISSING_TENANT_ID",
      "app_metadata.tenant_id missing or empty",
    );
  }

  const role = appMeta["role"];
  const validRoles: TenantRole[] = ["platform_admin", "tenant_admin", "hr_admin"];
  if (typeof role !== "string" || !validRoles.includes(role as TenantRole)) {
    throw new TenantGuardError(
      "INVALID_ROLE",
      `app_metadata.role must be one of: ${validRoles.join(", ")}`,
    );
  }

  return {
    mode: "user",
    tenantId,
    userId: sub,
    role: role as TenantRole,
  };
}
