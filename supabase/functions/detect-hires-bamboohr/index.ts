import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleError, errorResponse } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";
import { cronOrTenantGuard } from "../_shared/cron-or-tenant-guard.ts";

// Story 2.1 — BambooHR Hire Detector
//
// Called by pg_cron every 15 minutes (Story 2.3).
// Also callable manually via POST for testing.
//
// Invariants enforced:
//   NFR-2: Idempotent — integration_log UNIQUE(tenant_id, source, idempotency_key)
//          guards against duplicate hire events. ON CONFLICT DO NOTHING.
//   NFR-3: Never overwrites people.hired_at if already set.
//   NFR-4: Audit log entries via trigger (no direct audit writes needed here).
//   FR-1:  tenant_id read ONLY from BAMBOOHR_TENANT_MAP env var (set by pg_cron scheduler).
//          This EF is called by the scheduler with no user JWT — it uses service role.

interface BambooEmployee {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  jobTitle: string;
  status: string;
}

interface BambooDirectoryResponse {
  employees: BambooEmployee[];
}

interface TenantConfig {
  tenantId: string;
  subdomain: string;
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

async function fetchBambooEmployees(
  subdomain: string,
  apiKey: string,
): Promise<BambooEmployee[]> {
  // Basic Auth: base64("apiKey:x")
  const credentials = btoa(`${apiKey}:x`);
  const url =
    `https://api.bamboohr.com/api/gateway.php/${subdomain}/v1/employees/directory`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(
      `BambooHR API error: ${res.status} ${await res.text()}`,
    );
  }

  const body = await res.json() as BambooDirectoryResponse;
  return body.employees ?? [];
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

  // Log sync run start
  await admin.from("integration_log").insert({
    tenant_id: config.tenantId,
    source: "bamboohr",
    idempotency_key: `run:${runId}`,
    status: "running",
    started_at: startedAt,
    payload: { run_id: runId },
  });

  try {
    const apiKey = await decryptKey(admin, config.apiKey);
    const employees = await fetchBambooEmployees(config.subdomain, apiKey);

    // Only process Active employees with a work email
    const active = employees.filter(
      (e) => e.status === "Active" && e.workEmail,
    );

    for (const emp of active) {
      const email = emp.workEmail.toLowerCase().trim();

      // NFR-2: Insert idempotency row — ON CONFLICT DO NOTHING
      const { error: logErr, count } = await admin
        .from("integration_log")
        .insert({
          tenant_id: config.tenantId,
          source: "bamboohr",
          idempotency_key: email,
          status: "hire_detected",
          payload: {
            bamboohr_id: emp.id,
            display_name: emp.displayName,
            job_title: emp.jobTitle,
          },
        }, { count: "exact" });

      if (logErr) {
        // Unique constraint violation = already processed — not an error
        if (logErr.code === "23505") {
          skipped++;
          continue;
        }
        errors++;
        continue;
      }

      if ((count ?? 0) === 0) {
        // ON CONFLICT hit — already seen this hire
        skipped++;
        continue;
      }

      // Insert people record if new — profile_source set only on first insert
      await admin.from("people").insert(
        {
          tenant_id: config.tenantId,
          email,
          first_name: emp.firstName || null,
          last_name: emp.lastName || null,
          job_title: emp.jobTitle || null,
          type: "employee",
          profile_source: "bamboohr",
        },
        { onConflict: "tenant_id,email", ignoreDuplicates: true },
      );

      // Update non-protected fields (profile_source excluded — first connector wins)
      const { error: peopleErr } = await admin.from("people").update(
        {
          first_name: emp.firstName || null,
          last_name: emp.lastName || null,
          job_title: emp.jobTitle || null,
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

    // Update run log to completed
    await admin
      .from("integration_log")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        rows_processed: active.length,
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
      after: { source: "bamboohr", run_id: runId, detected, skipped, errors },
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

    // Fetch tenants with BambooHR configured
    let settingsQuery = admin
      .from("tenant_settings")
      .select(
        "tenant_id, bamboohr_subdomain, bamboohr_api_key_encrypted, active_connectors",
      )
      .contains("active_connectors", ["bamboohr"])
      .not("bamboohr_api_key_encrypted", "is", null)
      .not("bamboohr_subdomain", "is", null);

    // Authenticated user: restrict to own tenant only
    if (ctx.mode === "user") {
      settingsQuery = settingsQuery.eq("tenant_id", ctx.tenantId);
    }

    const { data: settings, error: settingsErr } = await settingsQuery;

    if (settingsErr) throw settingsErr;
    if (!settings || settings.length === 0) {
      return withCors(
        new Response(
          JSON.stringify({ ok: true, message: "No BambooHR tenants configured", tenants: 0 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
        req,
      );
    }

    const results = await Promise.allSettled(
      settings.map((s) =>
        processTenant({
          tenantId: s.tenant_id as string,
          subdomain: s.bamboohr_subdomain as string,
          apiKey: s.bamboohr_api_key_encrypted as string,
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
