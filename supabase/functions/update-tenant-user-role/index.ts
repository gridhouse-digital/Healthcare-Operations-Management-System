import { createClient } from "jsr:@supabase/supabase-js@2";
import { tenantGuard } from "../_shared/tenant-guard.ts";
import { handleError, errorResponse } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";
import { blockedUserChange, isAssignableRole } from "../_shared/role-change.ts";

// FR-19: Role change. custom_access_token_hook reads tenant_users, so the new
// role applies at the user's next token refresh, within the JWT lifetime.

interface UpdateRoleBody {
  tenantUserId: string;  // tenant_users.id
  role: string;
}

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const ctx = tenantGuard(req);

    if (ctx.role === "hr_admin") {
      return withCors(
        errorResponse("FORBIDDEN", "Only tenant_admin can change roles", 403),
        req,
      );
    }

    const body = await req.json() as UpdateRoleBody;
    const { tenantUserId, role } = body;

    if (!tenantUserId || !role) {
      return withCors(errorResponse("MISSING_FIELDS", "tenantUserId, role required", 400), req);
    }

    if (!isAssignableRole(role)) {
      return withCors(errorResponse("INVALID_ROLE", "role must be tenant_admin or hr_admin", 400), req);
    }

    const adminUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(adminUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // The target comes from this tenant's row, never from the request body
    const { data: target, error: targetError } = await adminClient
      .from("tenant_users")
      .select("user_id, role")
      .eq("id", tenantUserId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();

    if (targetError) throw targetError;
    if (!target) {
      return withCors(errorResponse("NOT_FOUND", "User not found in this tenant", 404), req);
    }

    const blocked = blockedUserChange({
      actorUserId: ctx.userId,
      targetUserId: target.user_id,
      targetRole: target.role,
    });
    if (blocked) return withCors(errorResponse("FORBIDDEN", blocked, 403), req);

    // Update tenant_users role
    const { error: updateError } = await adminClient
      .from("tenant_users")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", tenantUserId)
      .eq("tenant_id", ctx.tenantId);

    if (updateError) throw updateError;

    // Update auth user app_metadata.role so new JWTs reflect the change
    const { error: authError } = await adminClient.auth.admin.updateUserById(target.user_id, {
      app_metadata: { tenant_id: ctx.tenantId, role },
    });
    if (authError) throw authError;

    void logAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      action: "user.role_changed",
      tableName: "tenant_users",
      recordId: tenantUserId,
      before: { role: target.role },
      after: { role },
    });

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
});
