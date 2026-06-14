import { createClient } from "jsr:@supabase/supabase-js@2";
import { tenantGuard } from "../_shared/tenant-guard.ts";
import { handleError, errorResponse } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";

// FR-17: Save LearnDash group mappings.
// Onboarding gate revision (2026-06-13): persists is_onboarding per mapping
// entry. tenant_id comes from the JWT ONLY.

interface LdGroupMapping {
  job_title: string;
  group_id: string;
  is_onboarding?: boolean;
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

    const normalizedMappings: LdGroupMapping[] = [];
    for (const m of mappings) {
      if (
        typeof m?.job_title !== "string" ||
        typeof m?.group_id !== "string" ||
        m.job_title.trim() === "" ||
        m.group_id.trim() === ""
      ) {
        return withCors(
          errorResponse("INVALID_MAPPING", "Each mapping requires job_title and group_id", 400),
          req,
        );
      }
      if (
        Object.prototype.hasOwnProperty.call(m, "is_onboarding") &&
        typeof m.is_onboarding !== "boolean"
      ) {
        return withCors(
          errorResponse(
            "INVALID_PAYLOAD",
            "is_onboarding must be a boolean when provided",
            400,
          ),
          req,
        );
      }
      normalizedMappings.push({
        job_title: m.job_title.trim(),
        group_id: m.group_id.trim(),
        is_onboarding: m.is_onboarding === true,
      });
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
        ld_group_mappings: normalizedMappings,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;

    void logAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      action: "ld_mappings.updated",
      tableName: "tenant_settings",
      recordId: ctx.tenantId,
      after: {
        mapping_count: normalizedMappings.length,
        onboarding_group_ids: normalizedMappings
          .filter((m) => m.is_onboarding)
          .map((m) => m.group_id),
      },
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
