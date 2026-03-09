/**
 * sendRequirementRequest — Multi-tenant email sender
 *
 * Sends requirement request emails via Brevo API.
 * Reads Brevo API key + logo from tenant_settings.
 * Uses tenantGuard for auth.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { tenantGuard } from "../_shared/tenant-guard.ts";
import { handleError, errorResponse } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { render } from "npm:@react-email/render@0.0.7";
import * as React from "npm:react@18.3.1";
import { RequirementRequestEmail } from "../_shared/emails/RequirementRequestEmail.tsx";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PGCRYPTO_KEY = Deno.env.get("PGCRYPTO_ENCRYPTION_KEY") ?? "";

async function decryptKey(
  admin: ReturnType<typeof createClient>,
  encrypted: string,
): Promise<string> {
  const { data, error } = await admin.rpc("pgp_sym_decrypt_text", {
    ciphertext: encrypted,
    passphrase: PGCRYPTO_KEY,
  });
  if (error) throw new Error(`Decrypt failed: ${error.message}`);
  return data as string;
}

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const ctx = tenantGuard(req);

    const { email, name, formName, formUrl } = await req.json();

    if (!email || !formUrl) {
      return withCors(
        errorResponse("MISSING_FIELDS", "Email and Form URL are required", 400),
        req,
      );
    }

    // Admin client to decrypt keys
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Fetch Brevo key + logo from tenant_settings
    const { data: settings, error: settingsError } = await admin
      .from("tenant_settings")
      .select("brevo_api_key_encrypted, logo_light")
      .eq("tenant_id", ctx.tenantId)
      .single();

    if (settingsError || !settings) {
      return withCors(
        errorResponse("CONFIG_ERROR", "Tenant settings not found", 404),
        req,
      );
    }

    if (!settings.brevo_api_key_encrypted) {
      return withCors(
        errorResponse("CONFIG_ERROR", "Brevo API Key not configured", 400),
        req,
      );
    }

    const BREVO_API_KEY = await decryptKey(admin, settings.brevo_api_key_encrypted);
    const logoUrl = settings.logo_light;

    console.log(`Sending ${formName} request to ${email}...`);

    const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: "Prolific Homecare HR",
          email: "admin@prolifichcs.com",
        },
        to: [{ email: email, name: name || email }],
        subject: `Action Required: Please submit your ${formName}`,
        htmlContent: await render(
          React.createElement(RequirementRequestEmail, {
            applicantName: name || "Applicant",
            missingItems: [formName],
            uploadUrl: formUrl,
            logoUrl: logoUrl || undefined,
          }),
        ),
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Brevo API Error:", errorText);
      throw new Error(`Failed to send email: ${errorText}`);
    }

    return withCors(
      new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      }),
      req,
    );
  } catch (err) {
    console.error("Error:", err);
    return withCors(handleError(err), req);
  }
});
