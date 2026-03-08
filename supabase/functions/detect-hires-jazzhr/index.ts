import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleError } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";
import { cronOrTenantGuard } from "../_shared/cron-or-tenant-guard.ts";

// Story 2.2 — JazzHR Hire Detector
//
// Same pattern as detect-hires-bamboohr. Key differences:
//   - Auth: API key as query param (?apikey=)
//   - Endpoint: GET /applicants
//   - Hire signal: applicant stage name contains "hired" (case-insensitive)
//   - No stable hired_at from JazzHR — use first detection timestamp.
//
// Invariants: NFR-2 (idempotency), NFR-3 (hired_at), NFR-4 (audit).

interface JazzApplicant {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  desired_job: string | null;
  // stage is a nested object
  stage?: { title?: string };
  [key: string]: unknown;
}

interface TenantConfig {
  tenantId: string;
  apiKey: string;
}

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

async function fetchJazzHiredApplicants(
  apiKey: string,
): Promise<JazzApplicant[]> {
  const url = `https://api.jazz.co/v1/applicants?apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`JazzHR API error: ${res.status} ${await res.text()}`);
  }

  const body = await res.json() as JazzApplicant[];
  // Filter to hired stage only
  return body.filter(
    (a) =>
      a.email &&
      typeof a.stage?.title === "string" &&
      a.stage.title.toLowerCase().includes("hired"),
  );
}

async function processTenant(config: TenantConfig): Promise<{
  detected: number;
  skipped: number;
  errors: number;
}> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  let detected = 0;
  let skipped = 0;
  let errors = 0;

  await admin.from("integration_log").insert({
    tenant_id: config.tenantId,
    source: "jazzhr",
    idempotency_key: `run:${runId}`,
    status: "running",
    started_at: startedAt,
    payload: { run_id: runId },
  });

  try {
    const apiKey = await decryptKey(admin, config.apiKey);
    const hired = await fetchJazzHiredApplicants(apiKey);

    for (const applicant of hired) {
      const email = applicant.email.toLowerCase().trim();

      const { error: logErr, count } = await admin
        .from("integration_log")
        .insert({
          tenant_id: config.tenantId,
          source: "jazzhr",
          idempotency_key: email,
          status: "hire_detected",
          payload: {
            jazzhr_id: applicant.id,
            stage: applicant.stage?.title,
            job: applicant.desired_job,
          },
        }, { count: "exact" });

      if (logErr) {
        if (logErr.code === "23505") {
          skipped++;
          continue;
        }
        errors++;
        continue;
      }

      if ((count ?? 0) === 0) {
        skipped++;
        continue;
      }

      // Insert people record if new — profile_source set only on first insert
      await admin.from("people").insert(
        {
          tenant_id: config.tenantId,
          email,
          first_name: applicant.first_name || null,
          last_name: applicant.last_name || null,
          job_title: applicant.desired_job || null,
          type: "employee",
          profile_source: "jazzhr",
        },
        { onConflict: "tenant_id,email", ignoreDuplicates: true },
      );

      // Update non-protected fields (profile_source excluded — first connector wins)
      const { error: peopleErr } = await admin.from("people").update(
        {
          first_name: applicant.first_name || null,
          last_name: applicant.last_name || null,
          job_title: applicant.desired_job || null,
          type: "employee",
        },
      )
        .eq("tenant_id", config.tenantId)
        .eq("email", email);

      if (peopleErr) {
        errors++;
        continue;
      }

      // NFR-3: Set hired_at only if not already set
      await admin
        .from("people")
        .update({ hired_at: new Date().toISOString() })
        .eq("tenant_id", config.tenantId)
        .eq("email", email)
        .is("hired_at", null);

      detected++;
    }

    await admin
      .from("integration_log")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        rows_processed: hired.length,
        error_count: errors,
      })
      .eq("tenant_id", config.tenantId)
      .eq("idempotency_key", `run:${runId}`);

    void logAudit({
      tenantId: config.tenantId,
      actorId: undefined,
      action: "hire_detection.completed",
      tableName: "integration_log",
      recordId: undefined,
      after: { source: "jazzhr", run_id: runId, detected, skipped, errors },
    });
  } catch (err) {
    errors++;
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("integration_log")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_count: 1,
        payload: { run_id: runId, error: message },
      })
      .eq("tenant_id", config.tenantId)
      .eq("idempotency_key", `run:${runId}`);
  }

  return { detected, skipped, errors };
}

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const ctx = cronOrTenantGuard(req);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    let settingsQuery = admin
      .from("tenant_settings")
      .select("tenant_id, jazzhr_api_key_encrypted, active_connectors")
      .contains("active_connectors", ["jazzhr"])
      .not("jazzhr_api_key_encrypted", "is", null);

    // Authenticated user: restrict to own tenant only
    if (ctx.mode === "user") {
      settingsQuery = settingsQuery.eq("tenant_id", ctx.tenantId);
    }

    const { data: settings, error: settingsErr } = await settingsQuery;

    if (settingsErr) throw settingsErr;
    if (!settings || settings.length === 0) {
      return withCors(
        new Response(
          JSON.stringify({ ok: true, message: "No JazzHR tenants configured", tenants: 0 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
        req,
      );
    }

    const results = await Promise.allSettled(
      settings.map((s) =>
        processTenant({
          tenantId: s.tenant_id as string,
          apiKey: s.jazzhr_api_key_encrypted as string,
        })
      ),
    );

    const summary = results.map((r, i) => ({
      tenant_id: settings[i].tenant_id,
      ...(r.status === "fulfilled"
        ? r.value
        : { detected: 0, skipped: 0, errors: 1, error: (r.reason as Error).message }),
    }));

    return withCors(
      new Response(
        JSON.stringify({ ok: true, tenants: summary.length, summary }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
      req,
    );
  } catch (err) {
    return withCors(handleError(err), req);
  }
});
