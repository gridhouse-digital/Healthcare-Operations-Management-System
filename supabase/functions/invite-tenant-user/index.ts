import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { tenantGuard } from "../_shared/tenant-guard.ts";
import { logAudit } from "../_shared/audit-logger.ts";
import { handleInviteTenantUser, type Membership } from "./handler.ts";

Deno.serve((req: Request) => {
  /* Created on first use, so nothing runs before tenantGuard inside the handler */
  let client: SupabaseClient | null = null;
  const admin = () =>
    client ??= createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

  return handleInviteTenantUser(req, {
    guard: tenantGuard,
    findMemberships: async (email) => {
      const { data, error } = await admin().rpc("tenant_memberships_for_email", { p_email: email });
      if (error) throw new Error("Membership lookup failed");
      return (data ?? []) as Membership[];
    },
    sendInvite: async (email, redirectTo) => {
      // No `data` option: it writes user_metadata, which the user can edit and
      // nothing reads. Tenant and role live on the tenant_users row alone.
      const { data, error } = await admin().auth.admin.inviteUserByEmail(email, { redirectTo });
      if (error?.code === "email_exists") return null;
      if (error) throw error;
      if (!data.user?.id) throw new Error("Invite did not return a user ID");
      return data.user.id;
    },
    createPendingMembership: async ({ tenantId, userId, role, invitedBy }) => {
      const { data, error } = await admin()
        .from("tenant_users")
        .insert({ tenant_id: tenantId, user_id: userId, role, status: "pending", invited_by: invitedBy })
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    audit: ({ tenantId, actorId, action, recordId, after }) =>
      logAudit({ tenantId, actorId, action, tableName: "tenant_users", recordId, after }),
    appOrigin: () => Deno.env.get("ALLOWED_ORIGIN_1"),
  });
});
