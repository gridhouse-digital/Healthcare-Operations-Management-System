import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { handleError } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";
import { cronOrTenantGuard } from "../_shared/cron-or-tenant-guard.ts";

// Story 2.1 — BambooHR Hire Detector (production-safe)
// - Callable by pg_cron and manually via authenticated POST
// - Detects hires from BambooHR directory by selecting Active employees with workEmail
// - Uses first successful detection time for people.hired_at
//
// Assumptions / required DB constraints:
//   people:          UNIQUE (tenant_id, email)
//   applicants:      UNIQUE (tenant_id, email)   OR adjust onConflict if using (tenant_id, source, email)
//   integration_log: UNIQUE (tenant_id, source, idempotency_key)

interface BambooEmployee {
  id: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  workEmail?: string | null;
  jobTitle?: string | null;
  status?: string | null;
}

interface BambooDirectoryResponse {
  employees?: BambooEmployee[];
}

interface TenantConfig {
  tenantId: string;
  subdomain: string;
  apiKeyEncrypted: string;
}

interface TenantResult {
  tenant_id: string;
  detected: number;
  skipped: number;
  errors: number;
  rows_processed: number;
  status: "completed" | "completed_with_errors" | "failed";
  error_messages?: string[];
}

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

function safeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function buildFullName(
  firstName?: string | null,
  lastName?: string | null,
): string | null {
  const fullName = [safeString(firstName), safeString(lastName)]
    .filter(Boolean)
    .join(" ")
    .trim();
  return fullName.length > 0 ? fullName : null;
}

async function decryptKey(
  admin: SupabaseClient,
  encrypted: string,
): Promise<string> {
  const { data, error } = await admin.rpc("pgp_sym_decrypt_text", {
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

async function fetchBambooEmployees(
  subdomain: string,
  apiKey: string,
): Promise<BambooEmployee[]> {
  const credentials = btoa(`${apiKey}:x`);
  const url =
    `https://api.bamboohr.com/api/gateway.php/${encodeURIComponent(subdomain)}/v1/employees/directory`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`BambooHR API error: ${res.status}`);
  }

  const body = await res.json() as BambooDirectoryResponse;

  if (!body || typeof body !== "object") {
    throw new Error("BambooHR API returned unexpected response shape");
  }

  return Array.isArray(body.employees) ? body.employees : [];
}

async function markRunStarted(
  admin: SupabaseClient,
  tenantId: string,
  runId: string,
  startedAt: string,
): Promise<void> {
  const { error } = await admin.from("integration_log").insert({
    tenant_id: tenantId,
    source: "bamboohr",
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
  result: TenantResult,
  runId: string,
): Promise<void> {
  const { error } = await admin
    .from("integration_log")
    .update({
      status: result.status,
      completed_at: new Date().toISOString(),
      rows_processed: result.rows_processed,
      error_count: result.errors,
      payload: {
        run_id: runId,
        detected: result.detected,
        skipped: result.skipped,
        errors: result.errors,
        error_messages: result.error_messages ?? [],
      },
    })
    .eq("tenant_id", result.tenant_id)
    .eq("source", "bamboohr")
    .eq("idempotency_key", `run:${runId}`);

  if (error) {
    throw new Error(`Failed to complete run log: ${error.message}`);
  }
}

async function markRunFailed(
  admin: SupabaseClient,
  tenantId: string,
  runId: string,
  message: string,
): Promise<void> {
  const { error } = await admin
    .from("integration_log")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_count: 1,
      payload: {
        run_id: runId,
        error: message,
      },
    })
    .eq("tenant_id", tenantId)
    .eq("source", "bamboohr")
    .eq("idempotency_key", `run:${runId}`);

  if (error) {
    throw new Error(`Failed to mark run failed: ${error.message}`);
  }
}

async function insertDetectionLog(
  admin: SupabaseClient,
  tenantId: string,
  emp: BambooEmployee,
  email: string,
): Promise<{ error: { code?: string; message: string } | null; idempotencyKey: string }> {
  const idempotencyKey = `hire:${emp.id}:${email}`;

  const { error } = await admin.from("integration_log").insert({
    tenant_id: tenantId,
    source: "bamboohr",
    idempotency_key: idempotencyKey,
    status: "hire_detected",
    payload: {
      bamboohr_id: emp.id,
      display_name: safeString(emp.displayName),
      job_title: safeString(emp.jobTitle),
      email,
    },
  });

  return { error, idempotencyKey };
}

async function writePersonAndApplicant(
  admin: SupabaseClient,
  tenantId: string,
  emp: BambooEmployee,
  email: string,
): Promise<void> {
  const firstName = safeString(emp.firstName);
  const lastName = safeString(emp.lastName);
  const jobTitle = safeString(emp.jobTitle);
  const fullName = buildFullName(firstName, lastName);

  const { error: peopleUpsertErr } = await admin.from("people").upsert(
    {
      tenant_id: tenantId,
      email,
      first_name: firstName,
      last_name: lastName,
      job_title: jobTitle,
      type: "employee",
      profile_source: "bamboohr",
    },
    {
      onConflict: "tenant_id,email",
      ignoreDuplicates: true,
    },
  );

  if (peopleUpsertErr) {
    throw new Error(`people upsert failed: ${peopleUpsertErr.message}`);
  }

  const { error: applicantsUpsertErr } = await admin.from("applicants").upsert(
    {
      tenant_id: tenantId,
      email,
      full_name: fullName,
      source: "bamboohr",
      status: "Hired",
      position_applied: jobTitle,
    },
    {
      onConflict: "tenant_id,email",
      ignoreDuplicates: false,
    },
  );

  if (applicantsUpsertErr) {
    throw new Error(`applicants upsert failed: ${applicantsUpsertErr.message}`);
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
  let rowsProcessed = 0;
  const errorMessages: string[] = [];

  await markRunStarted(admin, config.tenantId, runId, startedAt);

  try {
    const apiKey = await decryptKey(admin, config.apiKeyEncrypted);
    const employees = await fetchBambooEmployees(config.subdomain, apiKey);

    const activeEmployees = employees.filter((emp) => {
      const status = safeString(emp.status);
      const workEmail = safeString(emp.workEmail);
      return status === "Active" && !!workEmail;
    });

    rowsProcessed = activeEmployees.length;

    for (const emp of activeEmployees) {
      try {
        const rawEmail = safeString(emp.workEmail);
        if (!rawEmail) {
          skipped++;
          continue;
        }

        const email = normalizeEmail(rawEmail);

        const { error: detectionErr } = await insertDetectionLog(
          admin,
          config.tenantId,
          emp,
          email,
        );

        if (detectionErr) {
          if (detectionErr.code === "23505") {
            skipped++;
            continue;
          }

          errors++;
          errorMessages.push(
            `detection log failed for ${email}: ${detectionErr.message}`,
          );
          continue;
        }

        await writePersonAndApplicant(admin, config.tenantId, emp, email);
        detected++;
      } catch (err) {
        errors++;
        errorMessages.push(err instanceof Error ? err.message : String(err));
      }
    }

    const result: TenantResult = {
      tenant_id: config.tenantId,
      detected,
      skipped,
      errors,
      rows_processed: rowsProcessed,
      status: errors > 0 ? "completed_with_errors" : "completed",
      ...(errorMessages.length > 0 ? { error_messages: errorMessages } : {}),
    };

    await markRunCompleted(admin, result, runId);

    void logAudit({
      tenantId: config.tenantId,
      actorId: "",
      action: "hire_detection.completed",
      tableName: "integration_log",
      recordId: "",
      after: {
        source: "bamboohr",
        run_id: runId,
        detected,
        skipped,
        errors,
        rows_processed: rowsProcessed,
      },
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    try {
      await markRunFailed(admin, config.tenantId, runId, message);
    } catch {
      // Do not hide original failure with a logging failure.
    }

    return {
      tenant_id: config.tenantId,
      detected,
      skipped,
      errors: errors + 1,
      rows_processed: rowsProcessed,
      status: "failed",
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
      .select(
        "tenant_id, bamboohr_subdomain, bamboohr_api_key_encrypted, active_connectors",
      )
      .contains("active_connectors", ["bamboohr"])
      .not("bamboohr_api_key_encrypted", "is", null)
      .not("bamboohr_subdomain", "is", null);

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
            message: "No BambooHR tenants configured",
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

    const results = await Promise.allSettled(
      settings.map((s) =>
        processTenant({
          tenantId: s.tenant_id as string,
          subdomain: s.bamboohr_subdomain as string,
          apiKeyEncrypted: s.bamboohr_api_key_encrypted as string,
        })
      ),
    );

    const summary: TenantResult[] = results.map((result, i) => {
      const tenantId = settings[i].tenant_id as string;

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
        rows_processed: 0,
        status: "failed",
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