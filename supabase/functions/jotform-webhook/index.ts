/**
 * JotForm Webhook Handler — Multi-tenant
 *
 * Receives real-time submission notifications from JotForm and:
 * 1. Determines form type from tenant_settings
 * 2. Creates/updates applicant records (with tenant_id + source)
 * 3. Handles compliance document submissions
 * 4. Broadcasts updates via Supabase Realtime
 *
 * NOTE: Webhooks are unauthenticated — we look up the tenant by form ID.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { mapSubmissionToApplicant } from "../_shared/jotform-client.ts";
import { migrateFileToStorage, isJotFormFileUrl } from "../_shared/file-manager.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface WebhookPayload {
  submissionID: string;
  formID: string;
  rawRequest: Record<string, any>;
  pretty?: string;
  created_at?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse webhook payload
    const contentType = req.headers.get("content-type") || "";
    let payload: WebhookPayload;

    if (contentType.includes("application/json")) {
      payload = await req.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      const rawRequest: Record<string, any> = {};

      for (const [key, value] of formData.entries()) {
        rawRequest[key] = value;
      }

      payload = {
        submissionID: formData.get("submissionID") as string,
        formID: formData.get("formID") as string,
        rawRequest,
      };
    } else {
      throw new Error("Unsupported content type");
    }

    console.log("Webhook received:", {
      submissionID: payload.submissionID,
      formID: payload.formID,
    });

    // Look up which tenant owns this form ID
    const tenantLookup = await findTenantByFormId(supabase, payload.formID);

    if (!tenantLookup) {
      console.log("No tenant found for form ID:", payload.formID);
      return new Response(
        JSON.stringify({ success: false, error: "Unknown form ID" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    const { tenantId, formType } = tenantLookup;
    console.log("Form type detected:", formType, "for tenant:", tenantId);

    if (formType === "application") {
      await handleApplicationSubmission(payload, supabase, tenantId);
    } else if (formType === "compliance") {
      await handleComplianceSubmission(payload, formType, supabase, tenantId);
    } else {
      console.log("Unknown form type, skipping processing");
    }

    // Broadcast update via Realtime
    await supabase
      .channel("applicants")
      .send({
        type: "broadcast",
        event: "submission_received",
        payload: {
          submissionId: payload.submissionID,
          formId: payload.formID,
          formType,
          tenantId,
        },
      });

    return new Response(
      JSON.stringify({ success: true, message: "Webhook processed", formType }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Webhook error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});

/**
 * Find which tenant owns a given JotForm form ID.
 * Scans tenant_settings for matching jotform_form_id_* columns.
 */
async function findTenantByFormId(
  supabase: ReturnType<typeof createClient>,
  formId: string,
): Promise<{ tenantId: string; formType: string } | null> {
  const formColumns = [
    { col: "jotform_form_id_application", type: "application" },
    { col: "jotform_form_id_emergency", type: "compliance" },
    { col: "jotform_form_id_i9", type: "compliance" },
    { col: "jotform_form_id_vaccination", type: "compliance" },
    { col: "jotform_form_id_licenses", type: "compliance" },
    { col: "jotform_form_id_background", type: "compliance" },
  ];

  const { data: allSettings } = await supabase
    .from("tenant_settings")
    .select(
      "tenant_id, jotform_form_id_application, jotform_form_id_emergency, jotform_form_id_i9, jotform_form_id_vaccination, jotform_form_id_licenses, jotform_form_id_background",
    );

  if (!allSettings) return null;

  for (const row of allSettings) {
    for (const { col, type } of formColumns) {
      if ((row as any)[col] === formId) {
        return { tenantId: row.tenant_id, formType: type };
      }
    }
  }

  return null;
}

/**
 * Handle application form submission
 */
async function handleApplicationSubmission(
  payload: WebhookPayload,
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
): Promise<void> {
  const answers: Record<string, any> = {};

  for (const [key, value] of Object.entries(payload.rawRequest)) {
    if (key.startsWith("q")) {
      const fieldName = key.substring(key.indexOf("_") + 1);
      const questionId = key.split("_")[0];

      answers[questionId] = {
        name: fieldName,
        answer: value,
        text: fieldName,
        type: typeof value === "object" ? "complex" : "text",
      };
    }
  }

  const submission = {
    id: payload.submissionID,
    form_id: payload.formID,
    created_at: payload.created_at || new Date().toISOString(),
    answers,
    ip: "",
    status: "ACTIVE",
    new: "1",
    flag: "0",
    notes: "",
    updated_at: null,
  };

  const applicantData = mapSubmissionToApplicant(submission);

  // Migrate file if present
  if (applicantData.resume_url && isJotFormFileUrl(applicantData.resume_url)) {
    console.log(`[Webhook] Migrating file for applicant: ${applicantData.email}`);
    const migrationResult = await migrateFileToStorage(
      applicantData.resume_url,
      applicantData.jotform_id,
      supabase,
    );
    if (migrationResult.success && migrationResult.storageUrl) {
      applicantData.resume_url = migrationResult.storageUrl;
    }
  }

  // Check if applicant exists — scoped to tenant
  let targetApplicantId: string | null = null;
  let matchReason: string | null = null;

  // Strategy 1: Match by JotForm ID within tenant
  const { data: existingByJotForm } = await supabase
    .from("applicants")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("jotform_id", applicantData.jotform_id)
    .single();

  if (existingByJotForm) {
    targetApplicantId = existingByJotForm.id;
    matchReason = "jotform_id";
  }

  // Strategy 2: Match by Email within tenant
  if (!targetApplicantId && applicantData.email) {
    const { data: existingByEmail } = await supabase
      .from("applicants")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("email", applicantData.email)
      .single();

    if (existingByEmail) {
      targetApplicantId = existingByEmail.id;
      matchReason = "email";
    }
  }

  if (targetApplicantId) {
    console.log(`Updating existing applicant (${matchReason}):`, targetApplicantId);

    const { error: updateError } = await supabase
      .from("applicants")
      .update({
        first_name: applicantData.first_name,
        last_name: applicantData.last_name,
        email: applicantData.email,
        phone: applicantData.phone,
        position_applied: applicantData.position_applied,
        resume_url: applicantData.resume_url,
        jotform_id: applicantData.jotform_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetApplicantId);

    if (updateError) {
      throw new Error(`Failed to update applicant: ${updateError.message}`);
    }
  } else {
    console.log("Creating new applicant (no match found)");
    const { error: insertError } = await supabase
      .from("applicants")
      .insert({
        ...applicantData,
        tenant_id: tenantId,
        source: "jotform",
        status: "New",
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      if (insertError.code === "23505" && insertError.message.includes("email")) {
        console.warn("Hit email constraint race condition, retrying update...");
        const { error: fallbackError } = await supabase
          .from("applicants")
          .update({
            jotform_id: applicantData.jotform_id,
            first_name: applicantData.first_name,
            last_name: applicantData.last_name,
            phone: applicantData.phone,
            position_applied: applicantData.position_applied,
            resume_url: applicantData.resume_url,
            updated_at: new Date().toISOString(),
          })
          .eq("tenant_id", tenantId)
          .eq("email", applicantData.email);

        if (fallbackError)
          throw new Error(`Fallback update failed: ${fallbackError.message}`);
      } else {
        throw new Error(`Failed to create applicant: ${insertError.message}`);
      }
    }
  }
}

/**
 * Handle compliance form submissions
 */
async function handleComplianceSubmission(
  payload: WebhookPayload,
  _formType: string,
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
): Promise<void> {
  let email = "";

  for (const [key, value] of Object.entries(payload.rawRequest)) {
    if (key.toLowerCase().includes("email") && typeof value === "string") {
      email = value;
      break;
    }
  }

  if (!email) {
    console.log("No email found in compliance submission, skipping");
    return;
  }

  // Find person by email within tenant (uses people table, not dropped employees)
  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("email", email)
    .maybeSingle();

  if (!person) {
    console.log("No person found for email:", email, "in tenant:", tenantId);
    return;
  }

  // TODO: Create compliance_documents table and insert record
  console.log("Compliance submission received:", {
    personId: person.id,
    tenantId,
    submissionId: payload.submissionID,
  });
}
