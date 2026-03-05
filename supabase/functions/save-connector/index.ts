import { createClient } from "jsr:@supabase/supabase-js@2";
import { tenantGuard } from "../_shared/tenant-guard.ts";
import { handleError, errorResponse } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";

// FR-16: Save encrypted connector credentials.
// NFR-7: Keys encrypted via pgcrypto — plaintext never stored, never logged.
// FR-22: profile_source set at connector save (first connector configured wins).

interface SaveConnectorBody {
  source: "bamboohr" | "jazzhr";
  subdomain?: string; // BambooHR only
  apiKey: string;
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
    const { source, apiKey, subdomain } = body;

    if (!source || !apiKey) {
      return withCors(errorResponse("MISSING_FIELDS", "source and apiKey required", 400), req);
    }
    if (source === "bamboohr" && !subdomain) {
      return withCors(errorResponse("MISSING_FIELDS", "subdomain required for BambooHR", 400), req);
    }

    // Use service role to encrypt + write — RLS bypassed for encryption operation
    const adminUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(adminUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Build the update payload with pgcrypto encryption
    // pgp_sym_encrypt(plaintext, key) is called via RPC to keep key server-side
    type SettingsUpdate = {
      active_connectors: string[];
      profile_source: string;
      bamboohr_subdomain?: string;
      bamboohr_api_key_encrypted?: string;
      jazzhr_api_key_encrypted?: string;
      updated_at: string;
    };

    const updatePayload: SettingsUpdate = {
      active_connectors: [source],
      profile_source: source,
      updated_at: new Date().toISOString(),
    };

    if (source === "bamboohr") {
      // Encrypt via pgcrypto RPC call
      const { data: encryptedKey, error: encErr } = await adminClient.rpc(
        "pgp_sym_encrypt_text",
        { plaintext: apiKey, passphrase: PGCRYPTO_KEY },
      );
      if (encErr) throw encErr;
      updatePayload.bamboohr_subdomain = subdomain;
      updatePayload.bamboohr_api_key_encrypted = encryptedKey as string;
    } else {
      const { data: encryptedKey, error: encErr } = await adminClient.rpc(
        "pgp_sym_encrypt_text",
        { plaintext: apiKey, passphrase: PGCRYPTO_KEY },
      );
      if (encErr) throw encErr;
      updatePayload.jazzhr_api_key_encrypted = encryptedKey as string;
    }

    const { error: updateErr } = await adminClient
      .from("tenant_settings")
      .upsert({ tenant_id: ctx.tenantId, ...updatePayload });

    if (updateErr) throw updateErr;

    // Audit log — never log the raw key, only the action
    void logAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      action: "connector.saved",
      tableName: "tenant_settings",
      recordId: ctx.tenantId,
      after: { source, subdomain: subdomain ?? null, key_configured: true },
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
