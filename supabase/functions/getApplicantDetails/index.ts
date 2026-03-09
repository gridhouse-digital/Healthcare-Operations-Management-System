/**
 * getApplicantDetails — Multi-tenant applicant detail fetcher
 *
 * Fetches comprehensive applicant data from JotForm API or falls back to DB.
 * Resolves related compliance forms (emergency, I-9, vaccination, licenses, background).
 * Scoped to the caller's tenant via tenantGuard.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { tenantGuard } from "../_shared/tenant-guard.ts";
import { handleError, errorResponse } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";

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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Fetch tenant settings for JotForm config
    const { data: settings, error: settingsError } = await admin
      .from("tenant_settings")
      .select(`
        jotform_api_key_encrypted,
        jotform_form_id_application,
        jotform_form_id_emergency,
        jotform_form_id_i9,
        jotform_form_id_vaccination,
        jotform_form_id_licenses,
        jotform_form_id_background
      `)
      .eq("tenant_id", ctx.tenantId)
      .single();

    if (settingsError || !settings) {
      return withCors(
        errorResponse("CONFIG_ERROR", "Tenant settings not found", 404),
        req,
      );
    }

    let { applicantId } = await req.json();
    if (!applicantId) {
      return withCors(
        errorResponse("MISSING_FIELDS", "applicantId required", 400),
        req,
      );
    }

    // Check if applicantId is a UUID and resolve to JotForm ID
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let supabaseUuid: string | null = null;
    let jotformId: string | null = applicantId;

    if (uuidRegex.test(applicantId)) {
      supabaseUuid = applicantId;
      const { data: applicant, error: dbError } = await admin
        .from("applicants")
        .select("*")
        .eq("id", applicantId)
        .eq("tenant_id", ctx.tenantId)
        .single();

      if (dbError || !applicant) {
        return withCors(
          errorResponse("NOT_FOUND", `Applicant ${applicantId} not found`, 404),
          req,
        );
      }

      // If no jotform_id, return DB fallback
      if (!applicant.jotform_id) {
        const fallbackResponse = {
          id: applicant.id,
          created_at: applicant.created_at,
          status: applicant.status,
          source: applicant.source,
          answers: {
            fullName: { first: applicant.first_name, last: applicant.last_name },
            email: applicant.email,
            phoneNumber: applicant.phone,
            positionApplied: applicant.position_applied,
          },
          resume_url: applicant.resume_url,
          resume_text: null,
          emergency_contact: null,
          i9_eligibility: null,
          vaccination: null,
          licenses: null,
          background_check: null,
          _fallback: true,
          _reason: "no_jotform_id",
        };

        return withCors(
          new Response(JSON.stringify(fallbackResponse), {
            headers: { "Content-Type": "application/json" },
          }),
          req,
        );
      }

      jotformId = applicant.jotform_id;
    }

    applicantId = jotformId;

    // Decrypt JotForm API key
    if (!settings.jotform_api_key_encrypted) {
      return withCors(
        errorResponse("CONFIG_ERROR", "JotForm API key not configured", 400),
        req,
      );
    }

    const JOTFORM_API_KEY = await decryptKey(
      admin,
      settings.jotform_api_key_encrypted,
    );

    const FORMS = {
      APPLICATION: settings.jotform_form_id_application,
      EMERGENCY: settings.jotform_form_id_emergency,
      I9: settings.jotform_form_id_i9,
      VACCINATION: settings.jotform_form_id_vaccination,
      LICENSES: settings.jotform_form_id_licenses,
      BACKGROUND: settings.jotform_form_id_background,
    };

    // Fetch main application from JotForm
    let mainData: any = null;
    let jotformError: string | null = null;

    try {
      const mainResponse = await fetch(
        `https://api.jotform.com/submission/${applicantId}?apiKey=${JOTFORM_API_KEY}`,
      );
      if (!mainResponse.ok) {
        jotformError = `JotForm API returned ${mainResponse.status}`;
      } else {
        mainData = await mainResponse.json();
      }
    } catch (e: any) {
      jotformError = e.message;
    }

    // Fallback to DB if JotForm unavailable
    if (!mainData || jotformError) {
      console.warn(
        `[getApplicantDetails] JotForm unavailable (${jotformError}), falling back to DB`,
      );

      const { data: dbApplicant, error: dbError } = await admin
        .from("applicants")
        .select("*")
        .eq("id", supabaseUuid || applicantId)
        .eq("tenant_id", ctx.tenantId)
        .single();

      if (dbError || !dbApplicant) {
        return withCors(
          errorResponse(
            "NOT_FOUND",
            `Applicant not found: ${dbError?.message || "Not found"}`,
            404,
          ),
          req,
        );
      }

      const fallbackResponse = {
        id: dbApplicant.id,
        created_at: dbApplicant.created_at,
        status: dbApplicant.status,
        source: dbApplicant.source,
        answers: {
          fullName: {
            first: dbApplicant.first_name,
            last: dbApplicant.last_name,
          },
          email: dbApplicant.email,
          phoneNumber: dbApplicant.phone,
          positionApplied: dbApplicant.position_applied,
        },
        resume_url: dbApplicant.resume_url,
        resume_text: null,
        emergency_contact: null,
        i9_eligibility: null,
        vaccination: null,
        licenses: null,
        background_check: null,
        _fallback: true,
        _jotform_error: jotformError,
      };

      return withCors(
        new Response(JSON.stringify(fallbackResponse), {
          headers: { "Content-Type": "application/json" },
        }),
        req,
      );
    }

    // Helper to extract answers from JotForm submission
    const extractAnswers = (submission: any) => {
      const answers: any = {};
      let generatedResume = "APPLICANT FORM DATA (Treat as Resume):\n\n";

      const answersObj =
        submission.answers ||
        (submission.content && submission.content.answers);

      if (!answersObj) return { answers, generatedResume: "" };

      Object.values(answersObj).forEach((ans: any) => {
        if (ans.name) answers[ans.name] = ans.answer;

        if (ans.text && ans.answer) {
          let answerStr = "";
          if (typeof ans.answer === "object") {
            answerStr = JSON.stringify(ans.answer, null, 2);
          } else {
            answerStr = String(ans.answer);
          }
          if (answerStr && ans.text !== "Header" && ans.text !== "Submit") {
            generatedResume += `### ${ans.text}\n${answerStr}\n\n`;
          }
        }

        if (ans.type === "control_email") answers["email"] = ans.answer;
        if (ans.type === "control_fullname") answers["fullName"] = ans.answer;
        if (ans.type === "control_phone") answers["phoneNumber"] = ans.answer;
        if (
          !answers["positionApplied"] &&
          (ans.name === "positionApplied" ||
            (ans.text && ans.text.toLowerCase().includes("position")))
        ) {
          answers["positionApplied"] = ans.answer;
        }

        if (ans.type === "control_fileupload") {
          const files = Array.isArray(ans.answer) ? ans.answer : [ans.answer];
          if (files.length > 0 && files[0]) {
            const isResume =
              ans.name?.toLowerCase().includes("resume") ||
              ans.text?.toLowerCase().includes("resume") ||
              ans.name?.toLowerCase().includes("cv") ||
              ans.text?.toLowerCase().includes("cv");
            if (isResume || !answers["resume_url"]) {
              answers["resume_url"] = files[0];
            }
          }
        }
      });
      return { answers, generatedResume };
    };

    const { answers: mainAnswers, generatedResume } = extractAnswers(mainData);
    const applicantEmail = mainAnswers.email;
    const applicantName = mainAnswers.fullName;

    // Fetch matching compliance submissions in parallel
    const fetchMatchingSubmission = async (
      formId: string | null,
      targetEmail: string,
      targetName?: any,
    ) => {
      if (!formId) return null;

      try {
        let url = `https://api.jotform.com/form/${formId}/submissions?apiKey=${JOTFORM_API_KEY}&orderby=created_at,desc`;
        if (targetEmail) {
          const filter = JSON.stringify({ email: targetEmail });
          url += `&filter=${encodeURIComponent(filter)}&limit=5`;
        } else {
          url += `&limit=20`;
        }

        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.content || !Array.isArray(data.content)) return null;

        const match = data.content.find((sub: any) => {
          const { answers: ans } = extractAnswers(sub);
          const values = Object.values(ans).map((v) =>
            typeof v === "object"
              ? JSON.stringify(v).toLowerCase()
              : String(v).toLowerCase()
          );

          if (targetEmail) {
            const emailLower = targetEmail.toLowerCase();
            if (values.some((v) => v.includes(emailLower))) return true;
          }

          if (targetName) {
            let first = "", last = "";
            if (typeof targetName === "object") {
              first = (targetName.first || "").toLowerCase();
              last = (targetName.last || "").toLowerCase();
            } else if (typeof targetName === "string") {
              const parts = targetName.split(" ");
              first = (parts[0] || "").toLowerCase();
              last = (parts[parts.length - 1] || "").toLowerCase();
            }
            if (first && last) {
              const fullNameStr = `${first} ${last}`;
              if (values.some((v) => v.includes(fullNameStr))) return true;
              const structuredMatch = Object.values(ans).some((val: any) => {
                if (val && typeof val === "object" && val.first && val.last) {
                  return (
                    val.first.toLowerCase() === first &&
                    val.last.toLowerCase() === last
                  );
                }
                return false;
              });
              if (structuredMatch) return true;
            }
          }

          return false;
        });

        if (match) {
          return {
            id: match.id,
            created_at: match.created_at,
            status: match.status,
            url: `https://www.jotform.com/submission/${match.id}`,
          };
        }

        return null;
      } catch (e: any) {
        console.error(`Error fetching form ${formId}:`, e);
        return null;
      }
    };

    let relatedForms: any = {
      emergency_contact: null,
      i9_eligibility: null,
      vaccination: null,
      licenses: null,
      background_check: null,
    };

    if (applicantEmail || applicantName) {
      const [emergency, i9, vaccination, licenses, background] =
        await Promise.all([
          fetchMatchingSubmission(FORMS.EMERGENCY, applicantEmail, applicantName),
          fetchMatchingSubmission(FORMS.I9, applicantEmail, applicantName),
          fetchMatchingSubmission(FORMS.VACCINATION, applicantEmail, applicantName),
          fetchMatchingSubmission(FORMS.LICENSES, applicantEmail, applicantName),
          fetchMatchingSubmission(FORMS.BACKGROUND, applicantEmail, applicantName),
        ]);

      relatedForms = {
        emergency_contact: emergency
          ? { ...emergency, formUrl: `https://form.jotform.com/${FORMS.EMERGENCY}` }
          : null,
        i9_eligibility: i9
          ? { ...i9, formUrl: `https://form.jotform.com/${FORMS.I9}` }
          : null,
        vaccination: vaccination
          ? { ...vaccination, formUrl: `https://form.jotform.com/${FORMS.VACCINATION}` }
          : null,
        licenses: licenses
          ? { ...licenses, formUrl: `https://form.jotform.com/${FORMS.LICENSES}` }
          : null,
        background_check: background
          ? { ...background, formUrl: `https://form.jotform.com/${FORMS.BACKGROUND}` }
          : null,
      };
    }

    const responseData = {
      id: supabaseUuid || mainData.content.id,
      created_at: mainData.content.created_at,
      status: mainData.content.status,
      answers: mainAnswers,
      resume_url: mainAnswers.resume_url || null,
      resume_text: generatedResume || null,
      ...relatedForms,
    };

    return withCors(
      new Response(JSON.stringify(responseData), {
        headers: { "Content-Type": "application/json" },
      }),
      req,
    );
  } catch (err) {
    console.error("[getApplicantDetails] Error:", err);
    return withCors(handleError(err), req);
  }
});
