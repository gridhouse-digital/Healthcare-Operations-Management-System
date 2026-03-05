import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TenantRole =
  | "platform_admin"
  | "tenant_admin"
  | "hr_admin";

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: TenantRole;
  /** Supabase client scoped to the authenticated user's RLS context */
  supabase: SupabaseClient;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class TenantGuardError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 401) {
    super(message);
    this.name = "TenantGuardError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

/**
 * MUST be the first call in every MVP Edge Function handler.
 *
 * Extracts tenant_id, user id, and role exclusively from the JWT
 * app_metadata claims — never from the request body or headers.
 *
 * Throws TenantGuardError (which error-response.ts will catch) if:
 * - Authorization header is missing or malformed
 * - JWT cannot be decoded
 * - app_metadata.tenant_id is absent
 * - app_metadata.role is absent or not a recognised TenantRole
 */
export function tenantGuard(req: Request): TenantContext {
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

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    throw new TenantGuardError(
      "SERVER_CONFIG_ERROR",
      "Supabase URL or anon key not configured",
      500,
    );
  }

  // Use the caller's JWT so RLS policies apply correctly.
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  return {
    tenantId,
    userId: sub,
    role: role as TenantRole,
    supabase,
  };
}
