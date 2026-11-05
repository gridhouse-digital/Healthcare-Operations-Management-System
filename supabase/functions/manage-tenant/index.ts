import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { tenantGuard } from "../_shared/tenant-guard.ts";
import { handleManageTenant, type StatusResult } from "./handler.ts";

// Platform-admin agency actions. Reads and writes across agencies by design:
// see DECISIONS.md.

Deno.serve((req: Request) => {
  /* Created on first use, so nothing runs before tenantGuard inside the handler */
  let client: SupabaseClient | null = null;
  const admin = () =>
    client ??= createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

  return handleManageTenant(req, {
    guard: tenantGuard,
    verifyUserId: async (ctx, token) => {
      const { data, error } = await ctx.supabase.auth.getUser(token);
      return error ? null : data.user?.id ?? null;
    },
    countActiveAdminRows: async (userId) => {
      const { count, error } = await admin()
        .from("tenant_users")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("role", "platform_admin")
        .eq("status", "active");
      if (error) throw new Error("Admin lookup failed");
      return count ?? 0;
    },
    setStatus: async ({ tenantId, status, reason, actorId }) => {
      const { data, error } = await admin().rpc("set_tenant_status", {
        p_tenant_id: tenantId,
        p_status: status,
        p_reason: reason,
        p_actor: actorId,
      });
      if (error) throw new Error("Status change failed");
      return data as StatusResult;
    },
  });
});
