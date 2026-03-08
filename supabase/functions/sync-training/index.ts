import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleError } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";

// Story 4.2 — sync-training (LearnDash course progress sync)
//
// Called by pg_cron daily + manual POST.
// Fetches LearnDash course progress for all employees with a wp_user_id,
// upserts training_records (Layer A only), and logs sync runs to integration_log.
//
// Invariants enforced:
//   NFR-2: Idempotent — ON CONFLICT (tenant_id, person_id, course_id) DO UPDATE.
//   NFR-3: UPSERT intentionally OMITS training_hours and expires_at.
//          These are Layer B/C fields set by HR overrides (training_adjustments),
//          and sync MUST NEVER overwrite them.
//   NFR-4: Audit log entries via logAudit (fire-and-forget).
//   Run dedup: integration_log checked for stale/running runs before proceeding.

// ── LearnDash status → DB enum mapping ──────────────────────────────

const LD_STATUS_MAP: Record<string, string> = {
  "not-started": "not_started",
  "in-progress": "in_progress",
  "completed": "completed",
};

// ── Interfaces ──────────────────────────────────────────────────────

interface LdCourseProgress {
  course: number;
  progress_status: string;
  date_completed: string | null;
  steps_completed: number;
  steps_total: number;
}

interface TenantWpConfig {
  tenant_id: string;
  wp_site_url: string;
  wp_username_encrypted: string;
  wp_app_password_encrypted: string;
}

interface PersonWithWp {
  id: string;
  tenant_id: string;
  email: string;
  wp_user_id: number;
}

// ── Environment ─────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PGCRYPTO_KEY = Deno.env.get("PGCRYPTO_ENCRYPTION_KEY") ?? "";

// ── Helpers ─────────────────────────────────────────────────────────

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

function wpAuth(username: string, appPassword: string): string {
  return `Basic ${btoa(`${username}:${appPassword}`)}`;
}

// ── HTML entity decoder ──────────────────────────────────────────────

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&nbsp;/g, " ");
}

// ── fetchCourseName (with cache) ────────────────────────────────────

async function fetchCourseName(
  siteUrl: string,
  auth: string,
  courseId: number,
  cache: Map<number, string>,
): Promise<string> {
  const cached = cache.get(courseId);
  if (cached) return cached;

  const res = await fetch(
    `${siteUrl}/wp-json/ldlms/v2/sfwd-courses/${courseId}`,
    { headers: { Authorization: auth, Accept: "application/json" } },
  );

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[fetchCourseName] ${res.status} for course ${courseId}: ${errBody.slice(0, 200)}`);
    const fallback = `Course #${courseId}`;
    cache.set(courseId, fallback);
    return fallback;
  }

  const body = await res.json();
  const raw = body?.title?.rendered ?? `Course #${courseId}`;
  const name = decodeHtmlEntities(raw);
  cache.set(courseId, name);
  return name;
}

// ── fetchAllCourseProgress (paginated) ──────────────────────────────

async function fetchAllCourseProgress(
  siteUrl: string,
  auth: string,
  wpUserId: number,
): Promise<LdCourseProgress[]> {
  const all: LdCourseProgress[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const res = await fetch(
      `${siteUrl}/wp-json/ldlms/v2/users/${wpUserId}/course-progress?per_page=100&page=${page}`,
      { headers: { Authorization: auth, Accept: "application/json" } },
    );

    if (!res.ok) {
      // If first page fails, throw. Otherwise return what we have.
      if (page === 1) {
        throw new Error(
          `LD progress fetch failed for WP user ${wpUserId}: ${res.status} ${await res.text()}`,
        );
      }
      break;
    }

    const pageTotal = res.headers.get("x-wp-totalpages");
    if (pageTotal) {
      totalPages = parseInt(pageTotal, 10) || 1;
    }

    const items = (await res.json()) as LdCourseProgress[];
    all.push(...items);
    page++;
  } while (page <= totalPages);

  return all;
}

// ── checkRunDedup ───────────────────────────────────────────────────

async function checkRunDedup(
  admin: ReturnType<typeof createClient>,
  tenantId: string,
  force: boolean,
): Promise<"proceed" | "skip" | { staleRunId: string }> {
  if (force) return "proceed";

  // Find most recent running sync for this tenant
  const { data: runs } = await admin
    .from("integration_log")
    .select("id, started_at")
    .eq("tenant_id", tenantId)
    .eq("source", "learndash")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1);

  if (!runs || runs.length === 0) return "proceed";

  const run = runs[0];
  const startedAt = new Date(run.started_at as string).getTime();
  const age = Date.now() - startedAt;
  const ONE_HOUR = 60 * 60 * 1000;

  if (age < ONE_HOUR) {
    // Recent running sync — skip
    return "skip";
  }

  // Stale run (>1hr) — mark it and proceed
  return { staleRunId: run.id as string };
}

// ── processTenant ───────────────────────────────────────────────────

async function processTenant(
  config: TenantWpConfig,
  force: boolean,
): Promise<{
  synced: number;
  skipped: number;
  errors: number;
}> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const runId = crypto.randomUUID();
  let synced = 0;
  let skipped = 0;
  let errors = 0;

  // ── Run dedup check ──
  const dedupResult = await checkRunDedup(admin, config.tenant_id, force);

  if (dedupResult === "skip") {
    return { synced: 0, skipped: 0, errors: 0 };
  }

  // If stale, mark old run as stale before proceeding
  if (typeof dedupResult === "object" && "staleRunId" in dedupResult) {
    await admin
      .from("integration_log")
      .update({
        status: "stale",
        completed_at: new Date().toISOString(),
      })
      .eq("id", dedupResult.staleRunId);
  }

  // ── Log sync run start ──
  await admin.from("integration_log").insert({
    tenant_id: config.tenant_id,
    source: "learndash",
    idempotency_key: `run:${runId}`,
    status: "running",
    started_at: new Date().toISOString(),
    payload: {
      run_id: runId,
      ...(typeof dedupResult === "object" && "staleRunId" in dedupResult
        ? { replaced_stale_run: dedupResult.staleRunId }
        : {}),
    },
  });

  try {
    // Decrypt WP credentials
    const wpUsername = await decryptKey(admin, config.wp_username_encrypted);
    const wpPassword = await decryptKey(admin, config.wp_app_password_encrypted);
    const auth = wpAuth(wpUsername, wpPassword);
    const siteUrl = config.wp_site_url.replace(/\/$/, "");

    // Fetch employees with wp_user_id
    const { data: employees, error: empErr } = await admin
      .from("people")
      .select("id, tenant_id, email, wp_user_id")
      .eq("tenant_id", config.tenant_id)
      .not("wp_user_id", "is", null);

    if (empErr) throw new Error(`Failed to fetch employees: ${empErr.message}`);
    if (!employees || employees.length === 0) {
      await admin
        .from("integration_log")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          rows_processed: 0,
          error_count: 0,
        })
        .eq("tenant_id", config.tenant_id)
        .eq("idempotency_key", `run:${runId}`);
      return { synced: 0, skipped: 0, errors: 0 };
    }

    // Course name cache — scoped per tenant
    const courseNameCache = new Map<number, string>();

    // Rate limiting: 200ms delay between employees if >50
    const needsDelay = employees.length > 50;

    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i] as PersonWithWp;

      if (needsDelay && i > 0) {
        await new Promise((r) => setTimeout(r, 200));
      }

      try {
        const progress = await fetchAllCourseProgress(
          siteUrl,
          auth,
          emp.wp_user_id,
        );

        if (progress.length === 0) {
          skipped++;
          continue;
        }

        for (const cp of progress) {
          const courseId = cp.course;
          const rawStatus = cp.progress_status;
          const mappedStatus = LD_STATUS_MAP[rawStatus] ?? null;

          // Skip records with unknown status — avoids overwriting valid data with null
          if (!mappedStatus) {
            console.warn(
              `Unknown LD status "${rawStatus}" for person ${emp.id}, course ${courseId} — skipping`,
            );
            continue;
          }

          const stepsCompleted = cp.steps_completed ?? 0;
          const stepsTotal = cp.steps_total ?? 0;
          const completionPct = stepsTotal > 0
            ? Math.round((stepsCompleted / stepsTotal) * 100)
            : 0;

          const courseName = await fetchCourseName(
            siteUrl,
            auth,
            courseId,
            courseNameCache,
          );

          // NFR-3: training_hours and expires_at are intentionally OMITTED from
          // this upsert. These fields belong to Layer B (HR adjustments via
          // training_adjustments table) and Layer C (effective compliance).
          // Sync writes ONLY Layer A (raw progress from LearnDash).
          // Overwriting them here would violate the 3-layer immutable model.
          const { error: upsertErr } = await admin
            .from("training_records")
            .upsert(
              {
                tenant_id: config.tenant_id,
                person_id: emp.id,
                course_id: String(courseId),
                course_name: courseName,
                status: mappedStatus,
                completion_pct: completionPct,
                completed_at: cp.date_completed || null,
                last_synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              {
                onConflict: "tenant_id,person_id,course_id",
                ignoreDuplicates: false,
              },
            );

          if (upsertErr) {
            console.error(
              `Upsert failed for person ${emp.id}, course ${courseId}: ${upsertErr.message}`,
            );
            errors++;
          } else {
            synced++;
          }
        }
      } catch (empError) {
        const msg = empError instanceof Error ? empError.message : String(empError);
        console.error(`Error syncing employee ${emp.email}: ${msg}`);
        errors++;
      }
    }

    // Update run log to completed
    await admin
      .from("integration_log")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        rows_processed: synced + errors,
        error_count: errors,
      })
      .eq("tenant_id", config.tenant_id)
      .eq("idempotency_key", `run:${runId}`);

    void logAudit({
      tenantId: config.tenant_id,
      actorId: undefined,
      action: "training_sync.completed",
      tableName: "integration_log",
      recordId: undefined,
      after: { source: "learndash", run_id: runId, synced, skipped, errors },
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
        payload: {
          run_id: runId,
          error: message,
          ...(typeof dedupResult === "object" && "staleRunId" in dedupResult
            ? { replaced_stale_run: dedupResult.staleRunId }
            : {}),
        },
      })
      .eq("tenant_id", config.tenant_id)
      .eq("idempotency_key", `run:${runId}`);
  }

  return { synced, skipped, errors };
}

// ── Deno.serve handler ──────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Parse optional POST body (tenant_id, force)
    let filterTenantId: string | undefined;
    let force = false;
    try {
      if (req.method === "POST") {
        const body = await req.json();
        filterTenantId = body?.tenant_id;
        force = body?.force === true;
      }
    } catch {
      // Empty body from pg_cron — proceed with defaults
    }

    // Fetch all tenants with LearnDash/WP configured
    let query = admin
      .from("tenant_settings")
      .select(
        "tenant_id, wp_site_url, wp_username_encrypted, wp_app_password_encrypted",
      )
      .not("wp_site_url", "is", null)
      .not("wp_username_encrypted", "is", null)
      .not("wp_app_password_encrypted", "is", null);

    if (filterTenantId) {
      query = query.eq("tenant_id", filterTenantId);
    }

    const { data: settings, error: settingsErr } = await query;

    if (settingsErr) throw settingsErr;
    if (!settings || settings.length === 0) {
      return withCors(
        new Response(
          JSON.stringify({
            ok: true,
            message: "No LearnDash tenants configured",
            tenants: 0,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
        req,
      );
    }

    // Process tenants sequentially — each tenant fans out to N employees x M
    // courses against the same WP instance, so parallel would overwhelm WP.
    const summary = [];
    for (const s of settings) {
      try {
        const result = await processTenant(
          {
            tenant_id: s.tenant_id as string,
            wp_site_url: s.wp_site_url as string,
            wp_username_encrypted: s.wp_username_encrypted as string,
            wp_app_password_encrypted: s.wp_app_password_encrypted as string,
          },
          force,
        );
        summary.push({ tenant_id: s.tenant_id, ...result });
      } catch (err) {
        summary.push({
          tenant_id: s.tenant_id,
          synced: 0,
          skipped: 0,
          errors: 1,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

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
