import { createClient } from "jsr:@supabase/supabase-js@2";
import { tenantGuard } from "../_shared/tenant-guard.ts";
import { handleError, errorResponse } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";

// FR-17: Save LearnDash group mappings.
// Onboarding-completion-gate (2026-06-12 handoff §5b): also persists the
// tenant's designated onboarding group (tenant_settings.onboarding_group_id)
// when the field is present in the body. tenant_id comes from the JWT ONLY.

interface LdGroupMapping {
  job_title: string;
  group_id: string;
}

interface SaveLdMappingsBody {
  mappings: LdGroupMapping[];
  /**
   * Optional. When present: a non-empty string designates the onboarding
   * group; null (or empty string) clears it — the resolver then fails closed.
   * When ABSENT, the stored value is left untouched (legacy callers).
   */
  onboarding_group_id?: string | null;
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

    // Optional onboarding group designation. Distinguish "absent" (leave the
    // stored value untouched) from "present" (set or clear).
    const hasOnboardingGroup = Object.prototype.hasOwnProperty.call(
      body,
      "onboarding_group_id",
    );
    let onboardingGroupId: string | null = null;
    if (hasOnboardingGroup) {
      const raw = body.onboarding_group_id;
      if (raw !== null && typeof raw !== "string") {
        return withCors(
          errorResponse(
            "INVALID_PAYLOAD",
            "onboarding_group_id must be a string or null",
            400,
          ),
          req,
        );
      }
      onboardingGroupId = typeof raw === "string" && raw.trim() !== ""
        ? raw.trim()
        : null;
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
        ...(hasOnboardingGroup
          ? { onboarding_group_id: onboardingGroupId }
          : {}),
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
        mapping_count: mappings.length,
        ...(hasOnboardingGroup
          ? { onboarding_group_id: onboardingGroupId }
          : {}),
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
