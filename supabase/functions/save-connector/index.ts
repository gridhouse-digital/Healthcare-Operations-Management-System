import { createClient } from "jsr:@supabase/supabase-js@2";
import { tenantGuard } from "../_shared/tenant-guard.ts";
import { handleError, errorResponse } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";

// FR-16: Save encrypted connector credentials.
// NFR-7: Keys encrypted via pgcrypto — plaintext never stored, never logged.
// FR-22: profile_source set at connector save (first connector configured wins).

interface SaveConnectorBody {
  source: "bamboohr" | "jazzhr" | "wordpress" | "jotform";
  subdomain?: string; // BambooHR only
  apiKey?: string; // BambooHR / JazzHR / JotForm
  // WordPress-specific fields
  wpSiteUrl?: string;
  wpUsername?: string;
  wpAppPassword?: string;
}

const PGCRYPTO_KEY = Deno.env.get("PGCRYPTO_ENCRYPTION_KEY") ?? "";

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const ctx = tenantGuard(req);

    if (ctx.role === "hr_admin") {
      return withCors(
        errorResponse("FORBIDDEN", "Only tenant_admin can configure connectors", 403),
        req,
      );
    }

    const body = await req.json() as SaveConnectorBody;
    const { source, apiKey, subdomain, wpSiteUrl, wpUsername, wpAppPassword } = body;

    if (!source) {
      return withCors(errorResponse("MISSING_FIELDS", "source required", 400), req);
    }

    if (source === "bamboohr" || source === "jazzhr" || source === "jotform") {
      if (!apiKey) {
        return withCors(errorResponse("MISSING_FIELDS", "apiKey required", 400), req);
      }
      if (source === "bamboohr" && !subdomain) {
        return withCors(errorResponse("MISSING_FIELDS", "subdomain required for BambooHR", 400), req);
      }
    }

    if (source === "wordpress") {
      if (!wpSiteUrl || !wpUsername || !wpAppPassword) {
        return withCors(
          errorResponse("MISSING_FIELDS", "wpSiteUrl, wpUsername, wpAppPassword required", 400),
          req,
        );
      }
    }

    // Use service role to encrypt + write — RLS bypassed for encryption operation
    const adminUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(adminUrl, serviceKey, {
      auth: { persistSession: false },
    });

    type SettingsUpdate = {
      active_connectors?: string[];
      profile_source?: string;
      bamboohr_subdomain?: string;
      bamboohr_api_key_encrypted?: string;
      jazzhr_api_key_encrypted?: string;
      jotform_api_key_encrypted?: string;
      wp_site_url?: string;
      wp_username_encrypted?: string;
      wp_app_password_encrypted?: string;
      updated_at: string;
    };

    const updatePayload: SettingsUpdate = {
      updated_at: new Date().toISOString(),
    };

    if (source === "bamboohr") {
      const { data: encryptedKey, error: encErr } = await adminClient.rpc(
        "pgp_sym_encrypt_text",
        { plaintext: apiKey, passphrase: PGCRYPTO_KEY },
      );
      if (encErr) throw encErr;
      updatePayload.bamboohr_subdomain = subdomain;
      updatePayload.bamboohr_api_key_encrypted = encryptedKey as string;
      updatePayload.active_connectors = [source];
      updatePayload.profile_source = source;
    } else if (source === "jazzhr") {
      const { data: encryptedKey, error: encErr } = await adminClient.rpc(
        "pgp_sym_encrypt_text",
        { plaintext: apiKey, passphrase: PGCRYPTO_KEY },
      );
      if (encErr) throw encErr;
      updatePayload.jazzhr_api_key_encrypted = encryptedKey as string;
      updatePayload.active_connectors = [source];
      updatePayload.profile_source = source;
    } else if (source === "jotform") {
      const { data: encryptedKey, error: encErr } = await adminClient.rpc(
        "pgp_sym_encrypt_text",
        { plaintext: apiKey, passphrase: PGCRYPTO_KEY },
      );
      if (encErr) throw encErr;
      updatePayload.jotform_api_key_encrypted = encryptedKey as string;
      // JotForm is not a profile_source or ATS connector — don't set those
    } else {
      // wordpress — encrypt username and app password
      const { data: encUser, error: encUserErr } = await adminClient.rpc(
        "pgp_sym_encrypt_text",
        { plaintext: wpUsername, passphrase: PGCRYPTO_KEY },
      );
      if (encUserErr) throw encUserErr;
      const { data: encPass, error: encPassErr } = await adminClient.rpc(
        "pgp_sym_encrypt_text",
        { plaintext: wpAppPassword, passphrase: PGCRYPTO_KEY },
      );
      if (encPassErr) throw encPassErr;
      updatePayload.wp_site_url = wpSiteUrl.endsWith("/") ? wpSiteUrl.slice(0, -1) : wpSiteUrl;
      updatePayload.wp_username_encrypted = encUser as string;
      updatePayload.wp_app_password_encrypted = encPass as string;
    }

    const { error: updateErr } = await adminClient
      .from("tenant_settings")
      .upsert({ tenant_id: ctx.tenantId, ...updatePayload });

    if (updateErr) throw updateErr;

    // Audit log — never log raw credentials
    void logAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      action: "connector.saved",
      tableName: "tenant_settings",
      recordId: ctx.tenantId,
      after: {
        source,
        subdomain: subdomain ?? null,
        wp_site_url: wpSiteUrl ?? null,
        key_configured: true,
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
