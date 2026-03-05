import { createClient } from "jsr:@supabase/supabase-js@2";
import { tenantGuard } from "../_shared/tenant-guard.ts";
import { handleError } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const ctx = tenantGuard(req);

    const adminUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(adminUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Fetch tenant_users rows for this tenant
    const { data: tenantUsers, error: tuError } = await adminClient
      .from("tenant_users")
      .select("id, user_id, tenant_id, role, status, invited_by, created_at, updated_at")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false });

    if (tuError) throw tuError;

    // Fetch auth user details (email, last_sign_in_at) for each user_id
    const userIds = (tenantUsers ?? []).map((u: { user_id: string }) => u.user_id);
    const authUsers: Record<string, { email: string; last_sign_in_at: string | null }> = {};

    if (userIds.length > 0) {
      const { data: authData } = await adminClient.auth.admin.listUsers();
      for (const u of authData?.users ?? []) {
        if (userIds.includes(u.id)) {
          authUsers[u.id] = {
            email: u.email ?? "",
            last_sign_in_at: u.last_sign_in_at ?? null,
          };
        }
      }
    }

    const users = (tenantUsers ?? []).map((tu: {
      id: string;
      user_id: string;
      tenant_id: string;
      role: string;
      status: string;
      invited_by: string | null;
      created_at: string;
      updated_at: string;
    }) => ({
      ...tu,
      email: authUsers[tu.user_id]?.email,
      last_sign_in_at: authUsers[tu.user_id]?.last_sign_in_at,
    }));

    return withCors(
      new Response(JSON.stringify({ users }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      req,
    );

  } catch (err) {
    return withCors(handleError(err), req);
  }
});
