import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleError } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";
import { cronOrTenantGuard } from "../_shared/cron-or-tenant-guard.ts";

// Story 3.1 — process-hire
//
// Scans integration_log for status='hire_detected' rows, then for each:
//   1. Lookup people record (email, job_title)
//   2. Decrypt WP credentials from tenant_settings
//   3. Lookup or create WP user (idempotent — lookup before create)
//   4. Store wp_user_id on people record
//   5. Match job_title -> ld_group_mappings -> enroll in LD groups
//   6. Update integration_log row to status='processed'
//
// Invariants:
//   NFR-2: Idempotent — WP lookup before create; skip if already processed.
//   NFR-4: Audit via DB trigger on people + integration_log updates.
//   Story 3.3: All failures written to integration_log — no silent failures.

interface LdGroupMapping {
  job_title: string;
  group_id: string;
}

interface WpUser {
  id: number;
  email: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PGCRYPTO_KEY = Deno.env.get("PGCRYPTO_ENCRYPTION_KEY") ?? "";

async function decryptKey(
  admin: any,
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

async function lookupWpUser(
  siteUrl: string,
  auth: string,
  email: string,
): Promise<WpUser | null> {
  const res = await fetch(
    `${siteUrl}/wp-json/wp/v2/users?search=${encodeURIComponent(email)}&context=edit`,
    { headers: { Authorization: auth, Accept: "application/json" } },
  );
  if (!res.ok) return null;
  const users = await res.json() as WpUser[];
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

async function createWpUser(
  siteUrl: string,
  auth: string,
  email: string,
  firstName: string,
  lastName: string,
): Promise<WpUser> {
  const base = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z0-9.]/g, "");
  const username = base || email.split("@")[0];
  // Temporary password — user will reset via WP email
  const tempPw = crypto.randomUUID().replace(/-/g, "") + "Aa1!";
  const res = await fetch(`${siteUrl}/wp-json/wp/v2/users`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      username,
      email,
      password: tempPw,
      first_name: firstName,
      last_name: lastName,
      roles: ["subscriber"],
    }),
  });
  if (!res.ok) {
    throw new Error(`WP user creation failed: ${res.status} ${await res.text()}`);
  }
  return await res.json() as WpUser;
}

async function enrollLdGroup(
  siteUrl: string,
  auth: string,
  groupId: string,
  wpUserId: number,
): Promise<void> {
  const res = await fetch(
    `${siteUrl}/wp-json/ldlms/v2/groups/${groupId}/users`,
    {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ user_ids: [wpUserId] }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `LD enrollment failed (group ${groupId}): ${res.status} ${await res.text()}`,
    );
  }
}

async function upsertGroupEnrollmentAnchor(
  admin: any,
  params: {
    tenantId: string;
    personId: string;
    groupId: string;
    enrolledAt: string;
  },
): Promise<void> {
  const { error } = await admin
    .from("employee_group_enrollments")
    .upsert(
      {
        tenant_id: params.tenantId,
        person_id: params.personId,
        group_id: params.groupId,
        enrolled_at: params.enrolledAt,
        anchor_date: params.enrolledAt,
        anchor_source: "process_hire",
        active: true,
        ended_at: null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "tenant_id,person_id,group_id",
        ignoreDuplicates: false,
      },
    );

  if (error) {
    throw new Error(
      `Failed to record enrollment anchor for group ${params.groupId}: ${error.message}`,
    );
  }
}

interface HireRow {
  id: string;
  tenant_id: string;
  idempotency_key: string; // email
}

async function processHire(
  admin: any,
  hire: HireRow,
): Promise<"processed" | "skipped" | "partial_failure"> {
  const email = hire.idempotency_key;

  // Fetch people record
  const { data: personRow, error: pErr } = await admin
    .from("people")
    .select("id, first_name, last_name, job_title, wp_user_id")
    .eq("tenant_id", hire.tenant_id)
    .eq("email", email)
    .single();
  const person = personRow as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    job_title: string | null;
    wp_user_id: number | null;
  } | null;
  if (pErr || !person) throw new Error(`No people record for ${email}`);

  // Fetch tenant WP config
  const { data: cfgRow, error: cErr } = await admin
    .from("tenant_settings")
    .select(
      "wp_site_url, wp_username_encrypted, wp_app_password_encrypted, ld_group_mappings",
    )
    .eq("tenant_id", hire.tenant_id)
    .single();
  const cfg = cfgRow as {
    wp_site_url: string | null;
    wp_username_encrypted: string | null;
    wp_app_password_encrypted: string | null;
    ld_group_mappings: LdGroupMapping[] | null;
  } | null;

  if (cErr || !cfg?.wp_site_url || !cfg?.wp_username_encrypted) {
    // WP not configured — mark skipped, not failed
    await admin
      .from("integration_log")
      .update({ status: "skipped", completed_at: new Date().toISOString() })
      .eq("id", hire.id);
    return "skipped";
  }

  const wpUsername = await decryptKey(admin, cfg.wp_username_encrypted as string);
  const wpPassword = await decryptKey(admin, cfg.wp_app_password_encrypted as string);
  const auth = wpAuth(wpUsername, wpPassword);
  const siteUrl = (cfg.wp_site_url as string).replace(/\/$/, "");

  // Lookup or create WP user (idempotent)
  let wpUserId = person.wp_user_id as number | null;
  if (!wpUserId) {
    const existing = await lookupWpUser(siteUrl, auth, email);
    if (existing) {
      wpUserId = existing.id;
    } else {
      const created = await createWpUser(
        siteUrl,
        auth,
        email,
        person.first_name || email.split("@")[0],
        person.last_name || "",
      );
      wpUserId = created.id;
    }
    await admin
      .from("people")
      .update({ wp_user_id: wpUserId })
      .eq("tenant_id", hire.tenant_id)
      .eq("email", email);
  }

  // LearnDash group enrollment (match job title with singular/plural: Caregiver <-> Caregivers)
  const mappings = (cfg.ld_group_mappings as LdGroupMapping[] | null) ?? [];
  const personTitle = (person.job_title ?? "").trim().toLowerCase().replace(/\r\n?|\n/g, "");
  const matched = mappings.filter((m) => {
    const mTitle = m.job_title.trim().toLowerCase();
    if (personTitle === mTitle) return true;
    if (personTitle.endsWith("s") && personTitle.slice(0, -1) === mTitle) return true;
    if (mTitle.endsWith("s") && mTitle.slice(0, -1) === personTitle) return true;
    return false;
  });

  const enrollErrors: string[] = [];
  for (const m of matched) {
    try {
      await enrollLdGroup(siteUrl, auth, m.group_id, wpUserId);
      await upsertGroupEnrollmentAnchor(admin, {
        tenantId: hire.tenant_id,
        personId: person.id as string,
        groupId: m.group_id,
        enrolledAt: new Date().toISOString(),
      });
    } catch (e) {
      enrollErrors.push(e instanceof Error ? e.message : String(e));
    }
  }

  // Mark processed or partial_failure depending on LD enrollment results
  const finalStatus = enrollErrors.length > 0 ? "partial_failure" : "processed";
  await admin
    .from("integration_log")
    .update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
      payload: {
        wp_user_id: wpUserId,
        groups_enrolled: matched.map((m) => m.group_id),
        enrollment_errors: enrollErrors.length ? enrollErrors : undefined,
      },
    })
    .eq("id", hire.id);

  void logAudit({
    tenantId: hire.tenant_id,
    actorId: undefined,
    action: "process_hire.completed",
    tableName: "integration_log",
    recordId: undefined,
    after: {
      email,
      wp_user_id: wpUserId,
      groups_enrolled: matched.length,
      enrollment_errors: enrollErrors.length,
    },
  });

  return finalStatus as "processed" | "partial_failure";
}

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const ctx = cronOrTenantGuard(req);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Fetch up to 100 unprocessed hire_detected rows
    let hiresQuery = admin
      .from("integration_log")
      .select("id, tenant_id, idempotency_key")
      .eq("status", "hire_detected")
      .order("created_at", { ascending: true })
      .limit(100);

    // Authenticated user: restrict to own tenant only
    if (ctx.mode === "user") {
      hiresQuery = hiresQuery.eq("tenant_id", ctx.tenantId);
    }

    const { data: hires, error: hiresErr } = await hiresQuery;

    if (hiresErr) throw hiresErr;
    if (!hires || hires.length === 0) {
      return withCors(
        new Response(
          JSON.stringify({ ok: true, message: "No pending hires", processed: 0 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
        req,
      );
    }

    const results = await Promise.allSettled(
      hires.map((h) => processHire(admin, h as HireRow)),
    );

    // Write failures to integration_log (Story 3.3 — no silent failures)
    await Promise.all(
      results.map(async (r, i) => {
        if (r.status === "rejected") {
          await admin
            .from("integration_log")
            .update({
              status: "failed",
              completed_at: new Date().toISOString(),
              payload: { error: (r.reason as Error).message },
            })
            .eq("id", hires[i].id);
        }
      }),
    );

    const summary = {
      total: hires.length,
      processed: results.filter(
        (r) => r.status === "fulfilled" && r.value === "processed",
      ).length,
      partial_failure: results.filter(
        (r) => r.status === "fulfilled" && r.value === "partial_failure",
      ).length,
      skipped: results.filter(
        (r) => r.status === "fulfilled" && r.value === "skipped",
      ).length,
      failed: results.filter((r) => r.status === "rejected").length,
    };

    return withCors(
      new Response(
        JSON.stringify({ ok: true, ...summary }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
      req,
    );
  } catch (err) {
    return withCors(handleError(err), req);
  }
});
