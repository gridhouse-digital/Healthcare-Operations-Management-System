import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleError } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";
import { cronOrTenantGuard } from "../_shared/cron-or-tenant-guard.ts";

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
  date_started: string | null;
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

interface GroupEnrollmentRow {
  group_id: string;
  active: boolean;
  ended_at: string | null;
}

interface GroupCourseRecord {
  courseId: string;
  courseName: string;
}

// ── Environment ─────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PGCRYPTO_KEY = Deno.env.get("PGCRYPTO_ENCRYPTION_KEY") ?? "";

// ── Helpers ─────────────────────────────────────────────────────────

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

async function upsertTrainingCourse(
  admin: any,
  params: {
    tenantId: string;
    courseId: string;
    courseName: string;
  },
): Promise<void> {
  const { error } = await admin
    .from("training_courses")
    .upsert(
      {
        tenant_id: params.tenantId,
        course_id: params.courseId,
        course_name: params.courseName,
        active: true,
        wp_meta: { source: "learndash_sync" },
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "tenant_id,course_id",
        ignoreDuplicates: false,
      },
    );

  if (error) {
    throw new Error(
      `Course catalog upsert failed for course ${params.courseId}: ${error.message}`,
    );
  }
}

async function upsertGroupCourseMapping(
  admin: any,
  params: {
    tenantId: string;
    groupId: string;
    courseId: string;
    courseName: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("learndash_group_courses")
    .upsert(
      {
        tenant_id: params.tenantId,
        group_id: params.groupId,
        course_id: params.courseId,
        course_name: params.courseName,
        active: true,
        last_seen_at: now,
        updated_at: now,
      },
      {
        onConflict: "tenant_id,group_id,course_id",
        ignoreDuplicates: false,
      },
    );

  if (error) {
    throw new Error(
      `Group-course mapping upsert failed for group ${params.groupId}, course ${params.courseId}: ${error.message}`,
    );
  }
}

async function fetchResourceArray(
  siteUrl: string,
  auth: string,
  paths: string[],
): Promise<unknown[] | null> {
  for (const path of paths) {
    try {
      const res = await fetch(`${siteUrl}${path}`, {
        headers: { Authorization: auth, Accept: "application/json" },
      });

      if (!res.ok) {
        console.warn(
          `[fetchResourceArray] ${res.status} for ${path}: ${(await res.text()).slice(0, 200)}`,
        );
        continue;
      }

      const body = await res.json();
      if (Array.isArray(body)) return body;
      if (body && typeof body === "object") {
        if (Array.isArray((body as { data?: unknown[] }).data)) {
          return (body as { data: unknown[] }).data;
        }
        if (Array.isArray((body as { items?: unknown[] }).items)) {
          return (body as { items: unknown[] }).items;
        }
      }
      return [];
    } catch (error) {
      console.warn(
        `[fetchResourceArray] failed for ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return null;
}

function pickObjectString(
  value: unknown,
  keys: string[],
): string | null {
  if (!value || typeof value !== "object") return null;

  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (candidate === undefined || candidate === null) continue;

    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }

    if (typeof candidate === "number") {
      return String(candidate);
    }
  }

  return null;
}

function pickRenderedTitle(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  const namedValue = pickObjectString(value, ["name", "course_name", "title"]);
  if (namedValue) return decodeHtmlEntities(namedValue);

  const titleObject = (value as Record<string, unknown>).title;
  if (titleObject && typeof titleObject === "object") {
    const rendered = pickObjectString(titleObject, ["rendered"]);
    if (rendered) return decodeHtmlEntities(rendered);
  }

  return null;
}

async function fetchUserGroupIds(
  siteUrl: string,
  auth: string,
  wpUserId: number,
): Promise<string[] | null> {
  const items = await fetchResourceArray(siteUrl, auth, [
    `/wp-json/ldlms/v1/users/${wpUserId}/groups`,
    `/wp-json/ldlms/v2/users/${wpUserId}/groups`,
  ]);

  if (items === null) return null;

  const groupIds = new Set<string>();
  for (const item of items) {
    if (typeof item === "string" || typeof item === "number") {
      groupIds.add(String(item));
      continue;
    }

    const groupId = pickObjectString(item, ["id", "group_id"]);
    if (groupId) {
      groupIds.add(groupId);
    }
  }

  return Array.from(groupIds);
}

async function fetchGroupCourses(
  siteUrl: string,
  auth: string,
  groupId: string,
  courseNameCache: Map<number, string>,
): Promise<GroupCourseRecord[] | null> {
  const items = await fetchResourceArray(siteUrl, auth, [
    `/wp-json/ldlms/v1/groups/${groupId}/courses`,
    `/wp-json/ldlms/v2/groups/${groupId}/courses`,
  ]);

  if (items === null) return null;

  const courses = new Map<string, GroupCourseRecord>();
  for (const item of items) {
    let courseId: string | null = null;
    let courseName: string | null = null;

    if (typeof item === "string" || typeof item === "number") {
      courseId = String(item);
    } else {
      courseId = pickObjectString(item, ["id", "course_id"]);
      courseName = pickRenderedTitle(item);
    }

    if (!courseId) continue;

    if (!courseName) {
      const numericCourseId = Number(courseId);
      courseName = Number.isFinite(numericCourseId)
        ? await fetchCourseName(siteUrl, auth, numericCourseId, courseNameCache)
        : `Course #${courseId}`;
    }

    courses.set(courseId, {
      courseId,
      courseName,
    });
  }

  return Array.from(courses.values());
}

async function reconcileEmployeeGroupEnrollments(
  admin: any,
  params: {
    tenantId: string;
    personId: string;
    currentGroupIds: string[];
  },
): Promise<void> {
  const { data, error } = await admin
    .from("employee_group_enrollments")
    .select("group_id, active, ended_at")
    .eq("tenant_id", params.tenantId)
    .eq("person_id", params.personId);

  if (error) {
    throw new Error(`Failed to fetch current group enrollments: ${error.message}`);
  }

  const rows = (data ?? []) as GroupEnrollmentRow[];
  const now = new Date().toISOString();
  const currentGroupIds = Array.from(new Set(params.currentGroupIds));
  const currentGroupSet = new Set(currentGroupIds);

  const rowsToDeactivate = rows
    .filter((row) => row.active && !currentGroupSet.has(row.group_id))
    .map((row) => row.group_id);

  if (rowsToDeactivate.length > 0) {
    const { error: deactivateError } = await admin
      .from("employee_group_enrollments")
      .update({
        active: false,
        ended_at: now,
        updated_at: now,
      })
      .eq("tenant_id", params.tenantId)
      .eq("person_id", params.personId)
      .in("group_id", rowsToDeactivate);

    if (deactivateError) {
      throw new Error(`Failed to deactivate removed groups: ${deactivateError.message}`);
    }
  }

  const rowsToReactivate = rows
    .filter((row) => currentGroupSet.has(row.group_id) && (!row.active || row.ended_at !== null))
    .map((row) => row.group_id);

  if (rowsToReactivate.length > 0) {
    const { error: reactivateError } = await admin
      .from("employee_group_enrollments")
      .update({
        active: true,
        ended_at: null,
        updated_at: now,
      })
      .eq("tenant_id", params.tenantId)
      .eq("person_id", params.personId)
      .in("group_id", rowsToReactivate);

    if (reactivateError) {
      throw new Error(`Failed to reactivate current groups: ${reactivateError.message}`);
    }
  }

  const existingGroupIds = new Set(rows.map((row) => row.group_id));
  const rowsToInsert = currentGroupIds.filter((groupId) => !existingGroupIds.has(groupId));

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await admin
      .from("employee_group_enrollments")
      .insert(
        rowsToInsert.map((groupId) => ({
          tenant_id: params.tenantId,
          person_id: params.personId,
          group_id: groupId,
          enrolled_at: now,
          anchor_date: now,
          anchor_source: "backfill",
          active: true,
          ended_at: null,
          updated_at: now,
        })),
      );

    if (insertError) {
      throw new Error(`Failed to insert current groups: ${insertError.message}`);
    }
  }
}

async function reconcileGroupCourseMappings(
  admin: any,
  params: {
    tenantId: string;
    groupId: string;
    courses: GroupCourseRecord[];
  },
): Promise<void> {
  const { data, error } = await admin
    .from("learndash_group_courses")
    .select("course_id, active")
    .eq("tenant_id", params.tenantId)
    .eq("group_id", params.groupId);

  if (error) {
    throw new Error(`Failed to fetch existing group-course mappings: ${error.message}`);
  }

  const existing = (data ?? []) as Array<{ course_id: string; active: boolean }>;
  const currentCourseIds = new Set(params.courses.map((course) => course.courseId));
  const now = new Date().toISOString();

  for (const course of params.courses) {
    await upsertGroupCourseMapping(admin, {
      tenantId: params.tenantId,
      groupId: params.groupId,
      courseId: course.courseId,
      courseName: course.courseName,
    });
  }

  const courseIdsToDeactivate = existing
    .filter((row) => row.active && !currentCourseIds.has(row.course_id))
    .map((row) => row.course_id);

  if (courseIdsToDeactivate.length > 0) {
    const { error: deactivateError } = await admin
      .from("learndash_group_courses")
      .update({
        active: false,
        updated_at: now,
      })
      .eq("tenant_id", params.tenantId)
      .eq("group_id", params.groupId)
      .in("course_id", courseIdsToDeactivate);

    if (deactivateError) {
      throw new Error(`Failed to deactivate removed group courses: ${deactivateError.message}`);
    }
  }

  const courseIdsToReactivate = existing
    .filter((row) => !row.active && currentCourseIds.has(row.course_id))
    .map((row) => row.course_id);

  if (courseIdsToReactivate.length > 0) {
    const { error: reactivateError } = await admin
      .from("learndash_group_courses")
      .update({
        active: true,
        last_seen_at: now,
        updated_at: now,
      })
      .eq("tenant_id", params.tenantId)
      .eq("group_id", params.groupId)
      .in("course_id", courseIdsToReactivate);

    if (reactivateError) {
      throw new Error(`Failed to reactivate current group courses: ${reactivateError.message}`);
    }
  }
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
  admin: any,
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

  const run = runs[0] as { id: string; started_at: string };
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
    const syncedGroups = new Set<string>();

    // Rate limiting: 200ms delay between employees if >50
    const needsDelay = employees.length > 50;

    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i] as PersonWithWp;

      if (needsDelay && i > 0) {
        await new Promise((r) => setTimeout(r, 200));
      }

      try {
        const currentGroupIds = await fetchUserGroupIds(siteUrl, auth, emp.wp_user_id);

        if (currentGroupIds !== null) {
          await reconcileEmployeeGroupEnrollments(admin, {
            tenantId: config.tenant_id,
            personId: emp.id,
            currentGroupIds,
          });

          for (const groupId of currentGroupIds) {
            if (syncedGroups.has(groupId)) continue;

            const groupCourses = await fetchGroupCourses(
              siteUrl,
              auth,
              groupId,
              courseNameCache,
            );

            if (groupCourses === null) continue;

            for (const course of groupCourses) {
              try {
                await upsertTrainingCourse(admin, {
                  tenantId: config.tenant_id,
                  courseId: course.courseId,
                  courseName: course.courseName,
                });
              } catch (courseCatalogErr) {
                console.warn(
                  courseCatalogErr instanceof Error
                    ? courseCatalogErr.message
                    : String(courseCatalogErr),
                );
              }
            }

            await reconcileGroupCourseMappings(admin, {
              tenantId: config.tenant_id,
              groupId,
              courses: groupCourses,
            });

            syncedGroups.add(groupId);
          }
        }

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

          let trainingMinutes: number | null = null;
          if (cp.date_started && cp.date_completed) {
            const start = new Date(cp.date_started);
            const end = new Date(cp.date_completed);
            const diffMs = end.getTime() - start.getTime();
            if (Number.isFinite(diffMs) && diffMs > 0) {
              trainingMinutes = Math.round(diffMs / 60000);
            }
          }

          const courseName = await fetchCourseName(
            siteUrl,
            auth,
            courseId,
            courseNameCache,
          );

          try {
            await upsertTrainingCourse(admin, {
              tenantId: config.tenant_id,
              courseId: String(courseId),
              courseName,
            });
          } catch (courseCatalogErr) {
            console.warn(
              courseCatalogErr instanceof Error
                ? courseCatalogErr.message
                : String(courseCatalogErr),
            );
          }

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
                  enrolled_at: cp.date_started || null,
                training_hours: trainingMinutes,
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
    const ctx = cronOrTenantGuard(req);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Parse optional POST body (force flag only; tenant scoping from guard)
    let filterTenantId: string | undefined;
    let force = false;

    if (ctx.mode === "user") {
      // Authenticated user: restrict to own tenant only
      filterTenantId = ctx.tenantId;
    }

    try {
      if (req.method === "POST") {
        const body = await req.json();
        // Ignore body.tenant_id — tenant scoping comes from the JWT guard
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
