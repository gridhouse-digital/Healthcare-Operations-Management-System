import { createClient } from "jsr:@supabase/supabase-js@2";
import { tenantGuard } from "../_shared/tenant-guard.ts";
import { handleError, errorResponse } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";

// FR-17: Save LearnDash group mappings.

interface LdGroupMapping {
  job_title: string;
  group_id: string;
}

interface SaveLdMappingsBody {
  mappings: LdGroupMapping[];
}

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const ctx = tenantGuard(req);

    if (ctx.role === "hr_admin") {
      return withCors(
        errorResponse("FORBIDDEN", "Only tenant_admin can configure mappings", 403),
        req,
      );
    }

    const body = await req.json() as SaveLdMappingsBody;
    const { mappings } = body;

    if (!Array.isArray(mappings)) {
      return withCors(errorResponse("INVALID_PAYLOAD", "mappings must be an array", 400), req);
    }

    // Validate each mapping has required fields
    for (const m of mappings) {
      if (!m.job_title || !m.group_id) {
        return withCors(
          errorResponse("INVALID_MAPPING", "Each mapping requires job_title and group_id", 400),
          req,
        );
      }
    }

    const adminUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(adminUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { error } = await adminClient
      .from("tenant_settings")
      .upsert({
        tenant_id: ctx.tenantId,
        ld_group_mappings: mappings,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;

    void logAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      action: "ld_mappings.updated",
      tableName: "tenant_settings",
      recordId: ctx.tenantId,
      after: { mapping_count: mappings.length },
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
