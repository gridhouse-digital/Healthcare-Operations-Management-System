import { createClient } from "jsr:@supabase/supabase-js@2";
import { tenantGuard } from "../_shared/tenant-guard.ts";
import { handleError, errorResponse } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";

// FR-19: Deactivate user — disable auth + invalidate sessions + audit.

interface DeactivateBody {
  tenantUserId: string;
}

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const ctx = tenantGuard(req);

    if (ctx.role === "hr_admin") {
      return withCors(
        errorResponse("FORBIDDEN", "Only tenant_admin can deactivate users", 403),
        req,
      );
    }

    const body = await req.json() as DeactivateBody;
    const { tenantUserId } = body;

    if (!tenantUserId) {
      return withCors(errorResponse("MISSING_FIELDS", "tenantUserId required", 400), req);
    }

    const adminUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(adminUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Get the auth user_id — must belong to this tenant
    const { data: tu, error: fetchErr } = await adminClient
      .from("tenant_users")
      .select("user_id, role")
      .eq("id", tenantUserId)
      .eq("tenant_id", ctx.tenantId)
      .single();

    if (fetchErr || !tu) {
      return withCors(errorResponse("NOT_FOUND", "User not found in this tenant", 404), req);
    }

    // Prevent deactivating yourself
    if ((tu as { user_id: string }).user_id === ctx.userId) {
      return withCors(errorResponse("FORBIDDEN", "Cannot deactivate your own account", 403), req);
    }

    // Update tenant_users status
    const { error: updateError } = await adminClient
      .from("tenant_users")
      .update({ status: "deactivated", updated_at: new Date().toISOString() })
      .eq("id", tenantUserId)
      .eq("tenant_id", ctx.tenantId);

    if (updateError) throw updateError;

    // Disable Supabase auth account
    const { error: authBanError } = await adminClient.auth.admin.updateUserById(
      (tu as { user_id: string }).user_id,
      { ban_duration: "876600h" }, // ~100 years = effectively permanent
    );
    if (authBanError) throw authBanError;

    // Invalidate all active sessions immediately
    await adminClient.auth.admin.signOut((tu as { user_id: string }).user_id, "global");

    void logAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      action: "user.deactivated",
      tableName: "tenant_users",
      recordId: tenantUserId,
      before: { status: "active" },
      after: { status: "deactivated" },
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
