import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { handleError } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";
import { cronOrTenantGuard } from "../_shared/cron-or-tenant-guard.ts";

// Story 2.2 — JazzHR Hire Detector (hardened)
// - Auth: API key as query param (?apikey=)
// - Endpoint: GET /applicants
// - Hire signal: applicant stage name contains "hired" (case-insensitive)
// - No stable hired_at from JazzHR — use first detection timestamp.
//
// Security / reliability changes:
// - Fail hard if crypto env missing
// - Do not include upstream response body in thrown errors
// - Stronger idempotency keys
// - Check all DB write errors explicitly
// - Avoid insert count-based control flow
// - Better summary/audit handling

interface JazzApplicant {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  desired_job?: string | null;
  stage?: { title?: string | null };
  [key: string]: unknown;
}

interface TenantConfig {
  tenantId: string;
  apiKeyEncrypted: string;
}

interface TenantSettingRow {
  tenant_id: string;
  jazzhr_api_key_encrypted: string;
  active_connectors?: string[] | null;
}

interface TenantResult {
  tenant_id: string;
  detected: number;
  skipped: number;
  errors: number;
  error_messages?: string[];
}

type RpcErrorLike = { message: string } | null;

type DecryptRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcErrorLike }>;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PGCRYPTO_KEY = Deno.env.get("PGCRYPTO_ENCRYPTION_KEY");

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SERVICE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
if (!PGCRYPTO_KEY) throw new Error("Missing PGCRYPTO_ENCRYPTION_KEY");

function getAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false },
  });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function buildFullName(
  firstName?: string | null,
  lastName?: string | null,
): string | null {
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName.length > 0 ? fullName : null;
}

async function decryptKey(
  admin: SupabaseClient,
  encrypted: string,
): Promise<string> {
  const rpcClient = admin as unknown as DecryptRpcClient;

  const { data, error } = await rpcClient.rpc("pgp_sym_decrypt_text", {
    ciphertext: encrypted,
    passphrase: PGCRYPTO_KEY!,
  });

  if (error) {
    throw new Error(`Decrypt failed: ${error.message}`);
  }

  if (!data || typeof data !== "string") {
    throw new Error("Decrypt failed: empty result");
  }

  return data;
}

async function fetchJazzHiredApplicants(
  apiKey: string,
): Promise<JazzApplicant[]> {
  const url =
    `https://api.resumatorapi.com/v1/applicants?apikey=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`JazzHR API error: ${res.status}`);
  }

  const body = await res.json();

  if (!Array.isArray(body)) {
    throw new Error("JazzHR API returned unexpected response shape");
  }

  return (body as JazzApplicant[]).filter((a) => {
    const stageTitle = typeof a.stage?.title === "string" ? a.stage.title : "";
    const email = typeof a.email === "string" ? a.email : "";
    return email.trim().length > 0 &&
      stageTitle.toLowerCase().includes("hired");
  });
}

async function markRunStarted(
  admin: SupabaseClient,
  tenantId: string,
  runId: string,
  startedAt: string,
): Promise<void> {
  const { error } = await admin.from("integration_log").insert({
    tenant_id: tenantId,
    source: "jazzhr",
    idempotency_key: `run:${runId}`,
    status: "running",
    started_at: startedAt,
    payload: { run_id: runId },
  });

  if (error) {
    throw new Error(`Failed to create run log: ${error.message}`);
  }
}

async function markRunCompleted(
  admin: SupabaseClient,
  tenantId: string,
  runId: string,
  rowsProcessed: number,
  detected: number,
  skipped: number,
  errors: number,
  errorMessages: string[],
): Promise<void> {
  const status = errors > 0 ? "completed_with_errors" : "completed";

  const { error } = await admin
    .from("integration_log")
    .update({
      status,
      completed_at: new Date().toISOString(),
      rows_processed: rowsProcessed,
      error_count: errors,
      payload: {
        run_id: runId,
        detected,
        skipped,
        errors,
        error_messages: errorMessages,
      },
    })
    .eq("tenant_id", tenantId)
    .eq("source", "jazzhr")
    .eq("idempotency_key", `run:${runId}`);

  if (error) {
    throw new Error(`Failed to complete run log: ${error.message}`);
  }
}

async function markRunFailed(
  admin: SupabaseClient,
  tenantId: string,
  runId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await admin
    .from("integration_log")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_count: 1,
      payload: {
        run_id: runId,
        error: errorMessage,
      },
    })
    .eq("tenant_id", tenantId)
    .eq("source", "jazzhr")
    .eq("idempotency_key", `run:${runId}`);

  if (error) {
    throw new Error(`Failed to mark run failed: ${error.message}`);
  }
}

async function writeDetectionLog(
  admin: SupabaseClient,
  tenantId: string,
  applicant: JazzApplicant,
  email: string,
): Promise<{ error: { code?: string; message: string } | null; detectionKey: string }> {
  const detectionKey = `hire:${applicant.id}:${email}`;

  const { error } = await admin.from("integration_log").insert({
    tenant_id: tenantId,
    source: "jazzhr",
    idempotency_key: detectionKey,
    status: "hire_detected",
    payload: {
      jazzhr_id: applicant.id,
      email,
      stage: applicant.stage?.title ?? null,
      job: applicant.desired_job ?? null,
    },
  });

  return { error, detectionKey };
}

async function upsertPersonAndApplicant(
  admin: SupabaseClient,
  tenantId: string,
  applicant: JazzApplicant,
  email: string,
): Promise<void> {
  const firstName = applicant.first_name ?? null;
  const lastName = applicant.last_name ?? null;
  const jobTitle = applicant.desired_job ?? null;
  const fullName = buildFullName(firstName, lastName);

  const { error: peopleUpsertErr } = await admin.from("people").upsert(
    {
      tenant_id: tenantId,
      email,
      first_name: firstName,
      last_name: lastName,
      job_title: jobTitle,
      type: "employee",
      profile_source: "jazzhr",
    },
    {
      onConflict: "tenant_id,email",
      ignoreDuplicates: true,
    },
  );

  if (peopleUpsertErr) {
    throw new Error(`people upsert failed: ${peopleUpsertErr.message}`);
  }

  const { error: applicantUpsertErr } = await admin.from("applicants").upsert(
    {
      tenant_id: tenantId,
      email,
      full_name: fullName,
      source: "jazzhr",
      status: "Hired",
      position_applied: jobTitle,
    },
    {
      onConflict: "tenant_id,email",
      ignoreDuplicates: false,
    },
  );

  if (applicantUpsertErr) {
    throw new Error(`applicants upsert failed: ${applicantUpsertErr.message}`);
  }

  const { error: peopleUpdateErr } = await admin
    .from("people")
    .update({
      first_name: firstName,
      last_name: lastName,
      job_title: jobTitle,
      type: "employee",
    })
    .eq("tenant_id", tenantId)
    .eq("email", email);

  if (peopleUpdateErr) {
    throw new Error(`people update failed: ${peopleUpdateErr.message}`);
  }

  const { error: hiredAtErr } = await admin
    .from("people")
    .update({ hired_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("email", email)
    .is("hired_at", null);

  if (hiredAtErr) {
    throw new Error(`people hired_at update failed: ${hiredAtErr.message}`);
  }
}

async function processTenant(config: TenantConfig): Promise<TenantResult> {
  const admin = getAdminClient();

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  let detected = 0;
  let skipped = 0;
  let errors = 0;
  const errorMessages: string[] = [];

  await markRunStarted(admin, config.tenantId, runId, startedAt);

  try {
    const apiKey = await decryptKey(admin, config.apiKeyEncrypted);
    const hiredApplicants = await fetchJazzHiredApplicants(apiKey);

    for (const applicant of hiredApplicants) {
      try {
        const rawEmail = typeof applicant.email === "string"
          ? applicant.email
          : "";

        if (!rawEmail.trim()) {
          skipped++;
          continue;
        }

        const email = normalizeEmail(rawEmail);

        const { error: logErr } = await writeDetectionLog(
          admin,
          config.tenantId,
          applicant,
          email,
        );

        if (logErr) {
          if (logErr.code === "23505") {
            skipped++;
            continue;
          }

          errors++;
          errorMessages.push(
            `detection log failed for ${email}: ${logErr.message}`,
          );
          continue;
        }

        await upsertPersonAndApplicant(
          admin,
          config.tenantId,
          applicant,
          email,
        );

        detected++;
      } catch (err) {
        errors++;
        errorMessages.push(
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    await markRunCompleted(
      admin,
      config.tenantId,
      runId,
      hiredApplicants.length,
      detected,
      skipped,
      errors,
      errorMessages,
    );

    void logAudit({
      tenantId: config.tenantId,
      actorId: "system",
      action: "hire_detection.completed",
      tableName: "integration_log",
      recordId: runId,
      after: {
        source: "jazzhr",
        run_id: runId,
        detected,
        skipped,
        errors,
      },
    });

    return {
      tenant_id: config.tenantId,
      detected,
      skipped,
      errors,
      ...(errorMessages.length > 0 ? { error_messages: errorMessages } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    try {
      await markRunFailed(admin, config.tenantId, runId, message);
    } catch {
      // Do not mask original failure
    }

    return {
      tenant_id: config.tenantId,
      detected,
      skipped,
      errors: errors + 1,
      error_messages: [...errorMessages, message],
    };
  }
}

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const ctx = cronOrTenantGuard(req);
    const admin = getAdminClient();

    let settingsQuery = admin
      .from("tenant_settings")
      .select("tenant_id, jazzhr_api_key_encrypted, active_connectors")
      .contains("active_connectors", ["jazzhr"])
      .not("jazzhr_api_key_encrypted", "is", null);

    if (ctx.mode === "user") {
      settingsQuery = settingsQuery.eq("tenant_id", ctx.tenantId);
    }

    const { data: settings, error: settingsErr } = await settingsQuery;

    if (settingsErr) {
      throw settingsErr;
    }

    if (!settings || settings.length === 0) {
      return withCors(
        new Response(
          JSON.stringify({
            ok: true,
            message: "No JazzHR tenants configured",
            tenants: 0,
            summary: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
        req,
      );
    }

    const tenantSettings = settings as TenantSettingRow[];

    const results = await Promise.allSettled(
      tenantSettings.map((s: TenantSettingRow) =>
        processTenant({
          tenantId: s.tenant_id as string,
          apiKeyEncrypted: s.jazzhr_api_key_encrypted as string,
        })
      ),
    );

    const summary: TenantResult[] = results.map((
      result: PromiseSettledResult<TenantResult>,
      i: number,
    ) => {
      const tenantId = tenantSettings[i].tenant_id as string;

      if (result.status === "fulfilled") {
        return result.value;
      }

      const message = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);

      return {
        tenant_id: tenantId,
        detected: 0,
        skipped: 0,
        errors: 1,
        error_messages: [message],
      };
    });

    return withCors(
      new Response(
        JSON.stringify({
          ok: true,
          tenants: summary.length,
          summary,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
      req,
    );
  } catch (err) {
    return withCors(handleError(err), req);
  }
});
