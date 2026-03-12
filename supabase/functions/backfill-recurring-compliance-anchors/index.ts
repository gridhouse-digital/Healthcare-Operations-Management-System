import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleError } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";
import { logAudit } from "../_shared/audit-logger.ts";
import { cronOrTenantGuard } from "../_shared/cron-or-tenant-guard.ts";

interface TenantSettingsRow {
  tenant_id: string;
  ld_group_mappings: Array<{ job_title: string; group_id: string }> | null;
}

interface PersonRow {
  id: string;
  tenant_id: string;
  email: string;
  job_title: string | null;
  hired_at: string | null;
  created_at: string;
}

interface IntegrationLogRow {
  id: string;
  idempotency_key: string;
  completed_at: string | null;
  payload: Record<string, unknown> | null;
}

interface ComplianceRuleRow {
  course_id: string;
  group_id: string;
}

interface TrainingRecordRow {
  person_id: string;
  course_id: string;
  enrolled_at: string | null;
  completed_at: string | null;
}

type AnchorSource =
  | "training_record"
  | "backfill"
  | "hired_at_fallback"
  | "job_title_legacy";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function normalizeJobTitle(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\r\n?|\n/g, "");
}

async function insertAnchorIfMissing(
  admin: any,
  existingKeys: Set<string>,
  seen: Set<string>,
  params: {
    tenantId: string;
    personId: string;
    groupId: string;
    enrolledAt: string;
    anchorSource: AnchorSource;
  },
): Promise<boolean> {
  const key = `${params.personId}:${params.groupId}`;
  if (existingKeys.has(key) || seen.has(key)) return false;

  const { error } = await admin
    .from("employee_group_enrollments")
    .insert({
      tenant_id: params.tenantId,
      person_id: params.personId,
      group_id: params.groupId,
      enrolled_at: params.enrolledAt,
      anchor_date: params.enrolledAt,
      anchor_source: params.anchorSource,
      active: true,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    if (error.code === "23505") {
      existingKeys.add(key);
      return false;
    }
    throw new Error(
      `Failed to insert anchor for person ${params.personId}, group ${params.groupId}: ${error.message}`,
    );
  }

  seen.add(key);
  existingKeys.add(key);
  return true;
}

async function backfillTenant(
  admin: any,
  settings: TenantSettingsRow,
): Promise<{ inserted: number; skipped: number; errors: number; bySource: Record<AnchorSource, number> }> {
  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  const bySource: Record<AnchorSource, number> = {
    training_record: 0,
    backfill: 0,
    hired_at_fallback: 0,
    job_title_legacy: 0,
  };

  const [
    { data: people, error: peopleErr },
    { data: existing, error: existingErr },
    { data: logs, error: logsErr },
    { data: rules, error: rulesErr },
    { data: trainingRecords, error: trErr },
  ] = await Promise.all([
    admin
      .from("people")
      .select("id, tenant_id, email, job_title, hired_at, created_at")
      .eq("tenant_id", settings.tenant_id)
      .eq("type", "employee"),
    admin
      .from("employee_group_enrollments")
      .select("person_id, group_id")
      .eq("tenant_id", settings.tenant_id),
    admin
      .from("integration_log")
      .select("id, idempotency_key, completed_at, payload")
      .eq("tenant_id", settings.tenant_id)
      .in("status", ["processed", "partial_failure"]),
    admin
      .from("training_compliance_rules")
      .select("course_id, group_id")
      .eq("tenant_id", settings.tenant_id)
      .eq("active", true)
      .eq("compliance_track", "recurring"),
    admin
      .from("training_records")
      .select("person_id, course_id, enrolled_at, completed_at")
      .eq("tenant_id", settings.tenant_id),
  ]);

  if (peopleErr) throw peopleErr;
  if (existingErr) throw existingErr;
  if (logsErr) throw logsErr;
  if (rulesErr) throw rulesErr;
  if (trErr) throw trErr;

  const employees = (people ?? []) as PersonRow[];
  const existingRows = (existing ?? []) as Array<{ person_id: string; group_id: string }>;
  const integrationRows = (logs ?? []) as IntegrationLogRow[];
  const activeRules = (rules ?? []) as ComplianceRuleRow[];
  const trRows = (trainingRecords ?? []) as TrainingRecordRow[];

  const existingKeys = new Set(
    existingRows.map((r) => `${r.person_id}:${r.group_id}`),
  );
  const seen = new Set<string>();

  const employeesByEmail = new Map<string, PersonRow>();
  for (const p of employees) {
    employeesByEmail.set(p.email.toLowerCase(), p);
  }

  const mappingByJobTitle = new Map<string, string[]>();
  for (const mapping of settings.ld_group_mappings ?? []) {
    const key = normalizeJobTitle(mapping.job_title);
    const groupIds = mappingByJobTitle.get(key) ?? [];
    if (!groupIds.includes(mapping.group_id)) groupIds.push(mapping.group_id);
    mappingByJobTitle.set(key, groupIds);
    const alt = key.endsWith("s") ? key.slice(0, -1) : key + "s";
    const altIds = mappingByJobTitle.get(alt) ?? [];
    if (!altIds.includes(mapping.group_id)) altIds.push(mapping.group_id);
    mappingByJobTitle.set(alt, altIds);
  }

  const nowIso = new Date().toISOString();

  // ── 1. Preferred: LearnDash assignment evidence (training_records × rules) ──
  const courseToGroups = new Map<string, string[]>();
  for (const r of activeRules) {
    const groups = courseToGroups.get(r.course_id) ?? [];
    if (!groups.includes(r.group_id)) groups.push(r.group_id);
    courseToGroups.set(r.course_id, groups);
  }

  for (const tr of trRows) {
    const groupIds = courseToGroups.get(tr.course_id) ?? [];
    const anchorAt = tr.enrolled_at ?? tr.completed_at ?? nowIso;
    for (const groupId of groupIds) {
      try {
        const changed = await insertAnchorIfMissing(admin, existingKeys, seen, {
          tenantId: settings.tenant_id,
          personId: tr.person_id,
          groupId,
          enrolledAt: anchorAt,
          anchorSource: "training_record",
        });
        if (changed) {
          inserted++;
          bySource.training_record++;
        } else skipped++;
      } catch {
        errors++;
      }
    }
  }

  // ── 2. process-hire integration_log payload.groups_enrolled ──
  for (const log of integrationRows) {
    const employee = employeesByEmail.get(log.idempotency_key.toLowerCase());
    if (!employee) {
      skipped++;
      continue;
    }
    const groups = Array.isArray(log.payload?.groups_enrolled)
      ? (log.payload!.groups_enrolled as string[]).filter(
          (g): g is string => typeof g === "string" && g.length > 0,
        )
      : [];
    if (groups.length === 0) {
      skipped++;
      continue;
    }
    const enrolledAt = log.completed_at ?? nowIso;
    for (const groupId of groups) {
      try {
        const changed = await insertAnchorIfMissing(admin, existingKeys, seen, {
          tenantId: settings.tenant_id,
          personId: employee.id,
          groupId,
          enrolledAt,
          anchorSource: "backfill",
        });
        if (changed) {
          inserted++;
          bySource.backfill++;
        } else skipped++;
      } catch {
        errors++;
      }
    }
  }

  // ── 3. hired_at + job_title match (only when no stronger evidence) ──
  for (const employee of employees) {
    if (!employee.hired_at) continue;
    const normalized = normalizeJobTitle(employee.job_title);
    const mappedGroups = mappingByJobTitle.get(normalized) ?? [];
    for (const groupId of mappedGroups) {
      try {
        const changed = await insertAnchorIfMissing(admin, existingKeys, seen, {
          tenantId: settings.tenant_id,
          personId: employee.id,
          groupId,
          enrolledAt: employee.hired_at,
          anchorSource: "hired_at_fallback",
        });
        if (changed) {
          inserted++;
          bySource.hired_at_fallback++;
        } else skipped++;
      } catch {
        errors++;
      }
    }
  }

  // ── 4. Last-resort: job_title match only (legacy; use created_at or now) ──
  for (const employee of employees) {
    const normalized = normalizeJobTitle(employee.job_title);
    const mappedGroups = mappingByJobTitle.get(normalized) ?? [];
    const anchorAt = employee.created_at ?? nowIso;
    for (const groupId of mappedGroups) {
      try {
        const changed = await insertAnchorIfMissing(admin, existingKeys, seen, {
          tenantId: settings.tenant_id,
          personId: employee.id,
          groupId,
          enrolledAt: anchorAt,
          anchorSource: "job_title_legacy",
        });
        if (changed) {
          inserted++;
          bySource.job_title_legacy++;
        } else skipped++;
      } catch {
        errors++;
      }
    }
  }

  return { inserted, skipped, errors, bySource };
}

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const ctx = cronOrTenantGuard(req);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    let filterTenantId: string | undefined;
    if (ctx.mode === "user") {
      filterTenantId = ctx.tenantId;
    }

    let settingsQuery = admin
      .from("tenant_settings")
      .select("tenant_id, ld_group_mappings");

    if (filterTenantId) {
      settingsQuery = settingsQuery.eq("tenant_id", filterTenantId);
    }

    const { data: tenantSettings, error: settingsErr } = await settingsQuery;

    if (settingsErr) throw settingsErr;
    if (!tenantSettings || tenantSettings.length === 0) {
      return withCors(
        new Response(
          JSON.stringify({ ok: true, tenants: 0, summary: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
        req,
      );
    }

    const summary = [];
    for (const settings of tenantSettings as TenantSettingsRow[]) {
      const result = await backfillTenant(admin, settings);
      summary.push({ tenant_id: settings.tenant_id, ...result });
    }

    void logAudit({
      tenantId: filterTenantId,
      actorId: undefined,
      action: "recurring_compliance.anchor_backfill",
      tableName: "employee_group_enrollments",
      recordId: undefined,
      after: { tenants_processed: summary.length, summary },
    });

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
