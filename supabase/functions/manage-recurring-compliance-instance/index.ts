import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleCors, withCors } from "../_shared/cors.ts";
import { errorResponse, handleError } from "../_shared/error-response.ts";
import { tenantGuard } from "../_shared/tenant-guard.ts";
import { logAudit } from "../_shared/audit-logger.ts";

type SupportedAction =
  | "manual_complete"
  | "reopen_cycle"
  | "suppress_reminders"
  | "override_anchor";

interface ManageRecurringComplianceBody {
  instance_id?: string;
  action?: SupportedAction;
  completed_at?: string;
  completion_note?: string;
  reminder_suppressed?: boolean;
  anchor_date?: string;
  reason?: string;
}

interface ComplianceInstanceRow {
  id: string;
  tenant_id: string;
  person_id: string;
  rule_id: string;
  cycle_number: number;
  group_enrollment_id: string | null;
  completed_at: string | null;
  reminder_suppressed: boolean;
  policy_snapshot: Record<string, unknown> | null;
}

interface EnrollmentRow {
  id: string;
  tenant_id: string;
  anchor_date: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function defaultReason(action: SupportedAction, suppressed?: boolean): string {
  switch (action) {
    case "manual_complete":
      return "Manually marked completed from recurring compliance dashboard";
    case "reopen_cycle":
      return "Cycle reopened from recurring compliance dashboard";
    case "suppress_reminders":
      return suppressed
        ? "Reminders suppressed from recurring compliance dashboard"
        : "Reminders re-enabled from recurring compliance dashboard";
    case "override_anchor":
      return "Anchor date updated from recurring compliance dashboard";
  }
}

function normalizeIso(value: string, fieldName: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }
  return date.toISOString();
}

function addMonths(isoDate: string, months: number): string {
  const date = new Date(isoDate);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

function readNumber(snapshot: Record<string, unknown> | null, key: string, fallback: number): number {
  const raw = snapshot?.[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const ctx = tenantGuard(req);

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return withCors(
        errorResponse("SERVER_CONFIG_ERROR", "Supabase service role is not configured", 500),
        req,
      );
    }

    const body = await req.json() as ManageRecurringComplianceBody;
    if (!body.instance_id || !body.action) {
      return withCors(
        errorResponse("INVALID_PAYLOAD", "instance_id and action are required", 400),
        req,
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: instance, error: instanceErr } = await admin
      .from("employee_compliance_instances")
      .select("id, tenant_id, person_id, rule_id, cycle_number, group_enrollment_id, completed_at, reminder_suppressed, policy_snapshot")
      .eq("id", body.instance_id)
      .eq("tenant_id", ctx.tenantId)
      .single<ComplianceInstanceRow>();

    if (instanceErr || !instance) {
      return withCors(
        errorResponse("NOT_FOUND", "Recurring compliance instance not found", 404),
        req,
      );
    }

    const nowIso = new Date().toISOString();
    const reason = body.reason?.trim() || defaultReason(body.action, body.reminder_suppressed);

    if (body.action === "manual_complete") {
      const completedAt = body.completed_at
        ? normalizeIso(body.completed_at, "completed_at")
        : nowIso;

      const { error } = await admin
        .from("employee_compliance_instances")
        .update({
          completed_at: completedAt,
          completion_source: "hr_attestation",
          completion_course_id: String(instance.policy_snapshot?.course_id ?? ""),
          completion_note: body.completion_note?.trim() || null,
          status_override: "completed",
          updated_at: nowIso,
        })
        .eq("id", instance.id)
        .eq("tenant_id", ctx.tenantId);

      if (error) throw error;
    }

    if (body.action === "reopen_cycle") {
      const { error } = await admin
        .from("employee_compliance_instances")
        .update({
          completed_at: null,
          completion_source: null,
          completion_course_id: null,
          completion_note: null,
          status_override: "reopened",
          updated_at: nowIso,
        })
        .eq("id", instance.id)
        .eq("tenant_id", ctx.tenantId);

      if (error) throw error;
    }

    if (body.action === "suppress_reminders") {
      const suppressed = body.reminder_suppressed ?? !instance.reminder_suppressed;
      const { error } = await admin
        .from("employee_compliance_instances")
        .update({
          reminder_suppressed: suppressed,
          updated_at: nowIso,
        })
        .eq("id", instance.id)
        .eq("tenant_id", ctx.tenantId);

      if (error) throw error;
    }

    if (body.action === "override_anchor") {
      if (!instance.group_enrollment_id) {
        return withCors(
          errorResponse("INVALID_STATE", "This instance is not linked to a group enrollment anchor", 400),
          req,
        );
      }
      if (!body.anchor_date) {
        return withCors(
          errorResponse("INVALID_PAYLOAD", "anchor_date is required for override_anchor", 400),
          req,
        );
      }

      const anchorDate = normalizeIso(body.anchor_date, "anchor_date");
      const { data: enrollment, error: enrollmentErr } = await admin
        .from("employee_group_enrollments")
        .select("id, tenant_id, anchor_date")
        .eq("id", instance.group_enrollment_id)
        .eq("tenant_id", ctx.tenantId)
        .single<EnrollmentRow>();

      if (enrollmentErr || !enrollment) {
        return withCors(
          errorResponse("NOT_FOUND", "Group enrollment anchor not found", 404),
          req,
        );
      }

      const { error: enrollmentUpdateErr } = await admin
        .from("employee_group_enrollments")
        .update({
          anchor_date: anchorDate,
          enrolled_at: anchorDate,
          updated_at: nowIso,
        })
        .eq("id", enrollment.id)
        .eq("tenant_id", ctx.tenantId);

      if (enrollmentUpdateErr) throw enrollmentUpdateErr;

      const { data: relatedInstances, error: relatedErr } = await admin
        .from("employee_compliance_instances")
        .select("id, cycle_number, policy_snapshot")
        .eq("tenant_id", ctx.tenantId)
        .eq("group_enrollment_id", enrollment.id);

      if (relatedErr) throw relatedErr;

      for (const related of (relatedInstances ?? []) as Array<{
        id: string;
        cycle_number: number;
        policy_snapshot: Record<string, unknown> | null;
      }>) {
        const initialOffset = readNumber(related.policy_snapshot, "initial_due_offset_months", 12);
        const recurrenceInterval = readNumber(related.policy_snapshot, "recurrence_interval_months", 12);
        const cycleStartAt = addMonths(anchorDate, (related.cycle_number - 1) * recurrenceInterval);
        const dueAt = addMonths(
          anchorDate,
          initialOffset + ((related.cycle_number - 1) * recurrenceInterval),
        );

        const { error } = await admin
          .from("employee_compliance_instances")
          .update({
            cycle_start_at: cycleStartAt,
            due_at: dueAt,
            updated_at: nowIso,
          })
          .eq("id", related.id)
          .eq("tenant_id", ctx.tenantId);

        if (error) throw error;
      }
    }

    const actionPayload = {
      completed_at: body.completed_at ?? null,
      completion_note: body.completion_note?.trim() || null,
      reminder_suppressed: body.reminder_suppressed ?? null,
      anchor_date: body.anchor_date ?? null,
    };

    const { error: actionErr } = await admin
      .from("employee_compliance_instance_actions")
      .insert({
        tenant_id: ctx.tenantId,
        instance_id: instance.id,
        action_type: body.action,
        actor_id: ctx.userId,
        payload: actionPayload,
        reason,
      });

    if (actionErr) throw actionErr;

    const { data: refreshed, error: refreshedErr } = await admin
      .from("v_recurring_compliance_status")
      .select("*")
      .eq("tenant_id", ctx.tenantId)
      .eq("instance_id", instance.id)
      .single();

    if (refreshedErr) throw refreshedErr;

    void logAudit({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      action: `recurring_compliance.${body.action}`,
      tableName: "employee_compliance_instances",
      recordId: instance.id,
      after: { action: body.action, reason },
    });

    return withCors(
      new Response(JSON.stringify({ ok: true, action: body.action, row: refreshed }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      req,
    );
  } catch (err) {
    return withCors(handleError(err), req);
  }
});
