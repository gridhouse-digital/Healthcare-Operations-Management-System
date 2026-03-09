import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleError } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";
import { cronOrTenantGuard } from "../_shared/cron-or-tenant-guard.ts";

// Story 4.5.1 — sync-wp-users
//
// Fetches all WordPress users (role=subscriber) and upserts into people table.
// This handles the case where WP/LearnDash already has employees before an
// ATS connector is set up. Runs daily at 6:30 AM UTC (before sync-training
// at 7:00 AM) so that new WP users have wp_user_id set before course
// progress is fetched.
//
// Invariants:
//   NFR-2: Idempotent — insert-ignore + selective update.
//   NFR-3: Never overwrites profile_source, hired_at, or job_title if set.
//   Run dedup: skip if running <1hr, mark stale if >1hr.

// ── Interfaces ──────────────────────────────────────────────────────

interface WpUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  name: string;
  roles: string[];
}

interface TenantWpConfig {
  tenant_id: string;
  wp_site_url: string;
  wp_username_encrypted: string;
  wp_app_password_encrypted: string;
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

// ── fetchAllWpUsers (paginated) ─────────────────────────────────────

async function fetchAllWpUsers(
  siteUrl: string,
  auth: string,
): Promise<WpUser[]> {
  const all: WpUser[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    // Fetch all users (no role filter) — LearnDash sites use varying roles
    // (subscriber, group_leader, student, etc.). We filter out admins below.
    const res = await fetch(
      `${siteUrl}/wp-json/wp/v2/users?per_page=100&context=edit&page=${page}`,
      { headers: { Authorization: auth, Accept: "application/json" } },
    );

    if (!res.ok) {
      if (page === 1) {
        throw new Error(
          `WP users fetch failed: ${res.status} ${await res.text()}`,
        );
      }
      break;
    }

    const pageTotal = res.headers.get("x-wp-totalpages");
    if (pageTotal) {
      totalPages = parseInt(pageTotal, 10) || 1;
    }

    const items = (await res.json()) as WpUser[];
    all.push(...items);
    page++;
  } while (page <= totalPages);

  // Filter out WP admins/editors — only sync learners/employees
  const ADMIN_ROLES = new Set(["administrator", "editor"]);
  return all.filter((u) => !u.roles.some((r) => ADMIN_ROLES.has(r)));
}

// ── checkRunDedup ───────────────────────────────────────────────────

async function checkRunDedup(
  admin: ReturnType<typeof createClient>,
  tenantId: string,
  force: boolean,
): Promise<"proceed" | "skip" | { staleRunId: string }> {
  if (force) return "proceed";

  const { data: runs } = await admin
    .from("integration_log")
    .select("id, started_at")
    .eq("tenant_id", tenantId)
    .eq("source", "wordpress")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1);

  if (!runs || runs.length === 0) return "proceed";

  const run = runs[0];
  const startedAt = new Date(run.started_at as string).getTime();
  const age = Date.now() - startedAt;
  const ONE_HOUR = 60 * 60 * 1000;

  if (age < ONE_HOUR) return "skip";

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
    source: "wordpress",
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
    const wpUsername = await decryptKey(admin, config.wp_username_encrypted);
    const wpPassword = await decryptKey(admin, config.wp_app_password_encrypted);
    const auth = wpAuth(wpUsername, wpPassword);
    const siteUrl = config.wp_site_url.replace(/\/$/, "");

    const wpUsers = await fetchAllWpUsers(siteUrl, auth);

    if (wpUsers.length === 0) {
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

    for (const wpUser of wpUsers) {
      const email = wpUser.email?.toLowerCase().trim();
      if (!email) {
        skipped++;
        continue;
      }

      try {
        // Insert-ignore: profile_source='wordpress' only on first insert
        await admin.from("people").insert(
          {
            tenant_id: config.tenant_id,
            email,
            first_name: wpUser.first_name || null,
            last_name: wpUser.last_name || null,
            wp_user_id: wpUser.id,
            type: "employee",
            profile_source: "wordpress",
          },
          { onConflict: "tenant_id,email", ignoreDuplicates: true },
        );

        // Update non-protected fields — never touch profile_source, hired_at, job_title
        const { error: updateErr } = await admin
          .from("people")
          .update({
            first_name: wpUser.first_name || null,
            last_name: wpUser.last_name || null,
            wp_user_id: wpUser.id,
            type: "employee",
          })
          .eq("tenant_id", config.tenant_id)
          .eq("email", email);

        if (updateErr) {
          console.error(`Update failed for ${email}: ${updateErr.message}`);
          errors++;
        } else {
          synced++;
        }
      } catch (userErr) {
        const msg = userErr instanceof Error ? userErr.message : String(userErr);
        console.error(`Error syncing WP user ${email}: ${msg}`);
        errors++;
      }
    }

    await admin
      .from("integration_log")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        rows_processed: wpUsers.length,
        error_count: errors,
      })
      .eq("tenant_id", config.tenant_id)
      .eq("idempotency_key", `run:${runId}`);

    void logAudit({
      tenantId: config.tenant_id,
      actorId: undefined,
      action: "wp_user_sync.completed",
      tableName: "integration_log",
      recordId: undefined,
      after: { source: "wordpress", run_id: runId, synced, skipped, errors },
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
    const ctx = cronOrTenantGuard(req);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    let filterTenantId: string | undefined;
    let force = false;

    if (ctx.mode === "user") {
      filterTenantId = ctx.tenantId;
    }

    try {
      if (req.method === "POST") {
        const body = await req.json();
        force = body?.force === true;
      }
    } catch {
      // Empty body from pg_cron — proceed with defaults
    }

    // Fetch all tenants with WP configured
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
            message: "No WordPress tenants configured",
            tenants: 0,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
        req,
      );
    }

    // Process tenants sequentially to avoid overwhelming WP
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
