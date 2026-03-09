/**
 * listApplicants — Multi-tenant JotForm sync
 *
 * Syncs JotForm submissions to the applicants table, scoped by tenant.
 * Reads JotForm API key + form ID from tenant_settings (encrypted).
 * Uses tenantGuard for auth — tenant_id comes from JWT, never body.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { tenantGuard } from "../_shared/tenant-guard.ts";
import { handleError, errorResponse } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { JotFormClient, mapSubmissionToApplicant } from "../_shared/jotform-client.ts";
import { migrateFileToStorage, isJotFormFileUrl } from "../_shared/file-manager.ts";

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

    // Admin client to decrypt keys and bypass RLS for upserts
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Fetch tenant settings
    const { data: settings, error: settingsError } = await admin
      .from("tenant_settings")
      .select(
        "jotform_api_key_encrypted, jotform_form_id_application",
      )
      .eq("tenant_id", ctx.tenantId)
      .single();

    if (settingsError || !settings) {
      return withCors(
        errorResponse("CONFIG_ERROR", "Tenant settings not found", 404),
        req,
      );
    }

    if (!settings.jotform_api_key_encrypted) {
      return withCors(
        errorResponse("CONFIG_ERROR", "JotForm API key not configured", 400),
        req,
      );
    }

    if (!settings.jotform_form_id_application) {
      return withCors(
        errorResponse("CONFIG_ERROR", "JotForm Application Form ID not configured", 400),
        req,
      );
    }

    // Decrypt JotForm API key
    const JOTFORM_API_KEY = await decryptKey(admin, settings.jotform_api_key_encrypted);
    const FORM_ID = settings.jotform_form_id_application;

    // Initialize JotForm client with retry logic
    const jotformClient = new JotFormClient(
      JOTFORM_API_KEY,
      SUPABASE_URL,
      SERVICE_KEY,
    );

    // Fetch submissions
    const submissions = await jotformClient.getFormSubmissions(FORM_ID, {
      limit: 100,
      orderby: "created_at",
    });

    // Fetch existing applicants for THIS tenant
    const { data: existingApplicants } = await admin
      .from("applicants")
      .select("id, status, jotform_id, email, resume_url")
      .eq("tenant_id", ctx.tenantId);

    const jotformIdMap = new Map();
    const emailMap = new Map();

    if (existingApplicants) {
      existingApplicants.forEach((app: any) => {
        if (app.jotform_id) {
          jotformIdMap.set(app.jotform_id, {
            id: app.id,
            status: app.status,
            resume_url: app.resume_url,
          });
        }
        if (app.email) {
          emailMap.set(app.email.toLowerCase(), app);
        }
      });
    }

    // Map submissions to applicant data
    const applicants = await Promise.all(
      submissions.map(async (submission: any) => {
        const baseData = mapSubmissionToApplicant(submission);

        const existingRecord =
          jotformIdMap.get(baseData.jotform_id) ||
          (baseData.email
            ? emailMap.get(baseData.email.toLowerCase())
            : null);

        // Migrate resume file if needed
        if (baseData.resume_url && isJotFormFileUrl(baseData.resume_url)) {
          if (
            existingRecord?.resume_url &&
            !isJotFormFileUrl(existingRecord.resume_url)
          ) {
            baseData.resume_url = existingRecord.resume_url;
          } else {
            const migrationResult = await migrateFileToStorage(
              baseData.resume_url,
              baseData.jotform_id,
              admin,
            );
            if (migrationResult.success && migrationResult.storageUrl) {
              baseData.resume_url = migrationResult.storageUrl;
            }
          }
        }

        // Find existing record
        let existingMatch = jotformIdMap.get(baseData.jotform_id);
        let existingId = existingMatch?.id;
        let existingStatus = existingMatch?.status;

        if (!existingId && baseData.email) {
          const match = emailMap.get(baseData.email.toLowerCase());
          if (match) {
            existingStatus = match.status;
            existingId = match.id;
          }
        }

        const ALLOWED_STATUSES = [
          "New",
          "Screening",
          "Interview",
          "Offer",
          "Hired",
          "Rejected",
        ];
        const status = existingStatus || "New";

        const payload: any = {
          ...baseData,
          tenant_id: ctx.tenantId,
          source: "jotform",
          status: ALLOWED_STATUSES.includes(status) ? status : "New",
          created_at: submission.created_at,
        };

        if (existingId) {
          payload.id = existingId;
        }

        return payload;
      }),
    );

    // Deduplicate by email
    const uniqueApplicantsMap = new Map();
    applicants.forEach((app: any) => {
      if (!app.email) return;
      const email = app.email.toLowerCase().trim();
      const existing = uniqueApplicantsMap.get(email);
      if (!existing) {
        uniqueApplicantsMap.set(email, app);
      } else if (app.id && !existing.id) {
        uniqueApplicantsMap.set(email, app);
      }
    });

    const uniqueApplicants = Array.from(uniqueApplicantsMap.values());
    const updates = uniqueApplicants.filter((a: any) => a.id);
    const inserts = uniqueApplicants.filter((a: any) => !a.id);

    // Deduplicate updates by ID
    const uniqueUpdatesMap = new Map();
    updates.forEach((app: any) => {
      if (app.id) uniqueUpdatesMap.set(app.id, app);
    });
    const deduplicatedUpdates = Array.from(uniqueUpdatesMap.values());

    let allUpsertedData: any[] = [];

    // Process Updates (match by ID)
    if (deduplicatedUpdates.length > 0) {
      const { data: updatedData, error: updateError } = await admin
        .from("applicants")
        .upsert(deduplicatedUpdates, { onConflict: "id" })
        .select();

      if (updateError) {
        throw new Error(`Failed to update applicants: ${updateError.message}`);
      }
      if (updatedData) allUpsertedData = [...allUpsertedData, ...updatedData];
    }

    // Process Inserts (match by jotform_id)
    if (inserts.length > 0) {
      const { data: insertedData, error: insertError } = await admin
        .from("applicants")
        .upsert(inserts, { onConflict: "jotform_id" })
        .select();

      if (insertError) {
        if (
          insertError.code === "23505" &&
          insertError.message.includes("email")
        ) {
          // Handle email conflicts individually with tenant-scoped unique key
          for (const applicant of inserts) {
            try {
              await admin
                .from("applicants")
                .upsert(applicant, {
                  onConflict: "tenant_id,email",
                })
                .select();
            } catch (err) {
              console.error(
                `Error processing applicant ${applicant.email}:`,
                err,
              );
            }
          }
        } else {
          throw new Error(
            `Failed to insert applicants: ${insertError.message}`,
          );
        }
      }
      if (insertedData) allUpsertedData = [...allUpsertedData, ...insertedData];
    }

    return withCors(
      new Response(JSON.stringify(allUpsertedData), {
        headers: { "Content-Type": "application/json" },
      }),
      req,
    );
  } catch (err) {
    console.error("[listApplicants] Error:", err);
    return withCors(handleError(err), req);
  }
});
