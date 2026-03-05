import { createClient } from "jsr:@supabase/supabase-js@2";
import { tenantGuard } from "../_shared/tenant-guard.ts";
import { handleError, errorResponse } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";

// FR-19: Role change + forced session invalidation.

interface UpdateRoleBody {
  userId: string;        // auth.users.id
  tenantUserId: string;  // tenant_users.id
  role: "tenant_admin" | "hr_admin";
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
    const { userId, tenantUserId, role } = body;

    if (!userId || !tenantUserId || !role) {
      return withCors(errorResponse("MISSING_FIELDS", "userId, tenantUserId, role required", 400), req);
    }

    const adminUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(adminUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Fetch current role for audit before value
    const { data: current } = await adminClient
      .from("tenant_users")
      .select("role")
      .eq("id", tenantUserId)
      .eq("tenant_id", ctx.tenantId)
      .single();

    // Update tenant_users role
    const { error: updateError } = await adminClient
      .from("tenant_users")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", tenantUserId)
      .eq("tenant_id", ctx.tenantId);

    if (updateError) throw updateError;

    // Update auth user app_metadata.role so new JWTs reflect the change
    const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
      app_metadata: { tenant_id: ctx.tenantId, role },
    });
    if (authError) throw authError;

    // Force session invalidation — sign out all sessions for this user
    await adminClient.auth.admin.signOut(userId, "global");

    void logAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      action: "user.role_changed",
      tableName: "tenant_users",
      recordId: tenantUserId,
      before: { role: (current as { role: string } | null)?.role },
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
