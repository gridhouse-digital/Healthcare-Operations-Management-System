import { createClient } from "jsr:@supabase/supabase-js@2";
import { tenantGuard } from "../_shared/tenant-guard.ts";
import { handleError, errorResponse } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";

// FR-19: Invite users by email + role assignment.

interface InviteTenantUserBody {
  email: string;
  role: "tenant_admin" | "hr_admin";
}

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const ctx = tenantGuard(req);

    // Only tenant_admin and platform_admin can invite
    if (ctx.role === "hr_admin") {
      return withCors(
        errorResponse("FORBIDDEN", "Only tenant_admin can invite users", 403),
        req,
      );
    }

    const body = await req.json() as InviteTenantUserBody;
    const { email, role } = body;

    if (!email || !role) {
      return withCors(errorResponse("MISSING_FIELDS", "email and role required", 400), req);
    }

    const validRoles = ["tenant_admin", "hr_admin"] as const;
    if (!validRoles.includes(role)) {
      return withCors(errorResponse("INVALID_ROLE", "role must be tenant_admin or hr_admin", 400), req);
    }

    const adminUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(adminUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Send Supabase auth invite email
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          // Pre-set app_metadata so JWT hook picks it up on first login
          tenant_id: ctx.tenantId,
          role,
        },
      },
    );

    if (inviteError) throw inviteError;

    const newUserId = inviteData.user?.id;
    if (!newUserId) throw new Error("Invite did not return a user ID");

    // Create tenant_users row
    const { data: tuData, error: tuError } = await adminClient
      .from("tenant_users")
      .insert({
        tenant_id: ctx.tenantId,
        user_id: newUserId,
        role,
        status: "pending",
        invited_by: ctx.userId,
      })
      .select("id")
      .single();

    if (tuError) throw tuError;

    void logAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      action: "user.invited",
      tableName: "tenant_users",
      recordId: (tuData as { id: string }).id,
      after: { email, role, status: "pending" },
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
