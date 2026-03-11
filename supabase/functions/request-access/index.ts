import { createClient } from "jsr:@supabase/supabase-js@2";
import { render } from "npm:@react-email/render@0.0.7";
import * as React from "npm:react@18.3.1";
import { z } from "npm:zod@4.1.13";
import { AccessRequestNotificationEmail } from "../_shared/emails/AccessRequestNotificationEmail.tsx";
import { AccessRequestConfirmationEmail } from "../_shared/emails/AccessRequestConfirmationEmail.tsx";
import { handleCors, withCors } from "../_shared/cors.ts";
import { errorResponse, handleError } from "../_shared/error-response.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PLATFORM_BREVO_API_KEY = Deno.env.get("PLATFORM_BREVO_API_KEY") ?? "";
const REQUEST_ACCESS_NOTIFICATION_TO =
  Deno.env.get("REQUEST_ACCESS_NOTIFICATION_TO") ?? "";
const REQUEST_ACCESS_FROM_EMAIL =
  Deno.env.get("REQUEST_ACCESS_FROM_EMAIL") ?? "";
const REQUEST_ACCESS_FROM_NAME =
  Deno.env.get("REQUEST_ACCESS_FROM_NAME") ?? "HOMS Access Requests";
const REQUEST_ACCESS_RATE_LIMIT_WINDOW_MINUTES = Number(
  Deno.env.get("REQUEST_ACCESS_RATE_LIMIT_WINDOW_MINUTES") ?? "60",
);
const REQUEST_ACCESS_RATE_LIMIT_MAX_PER_EMAIL = Number(
  Deno.env.get("REQUEST_ACCESS_RATE_LIMIT_MAX_PER_EMAIL") ?? "3",
);
const REQUEST_ACCESS_RATE_LIMIT_MAX_PER_IP = Number(
  Deno.env.get("REQUEST_ACCESS_RATE_LIMIT_MAX_PER_IP") ?? "10",
);

const requestAccessSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  primaryContactName: z.string().trim().min(2).max(120),
  workEmail: z.string().trim().email().max(160),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  teamSize: z.enum(["1-10", "11-25", "26-50", "51-100", "100+"]),
  integrationNeeds: z.string().trim().max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  website: z.string().trim().max(200).optional().or(z.literal("")),
});

type RequestAccessPayload = z.infer<typeof requestAccessSchema>;

type ExistingRequestRow = {
  id: string;
  status: "submitted" | "under_review";
};

type AdminClient = ReturnType<typeof getAdminClient>;
type RequestMetadata = {
  requestIp: string | null;
  requestOrigin: string | null;
  userAgent: string | null;
};

function cleanOptional(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function getNotificationRecipients(): string[] {
  return REQUEST_ACCESS_NOTIFICATION_TO
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

function normalizeRequestIp(req: Request): string | null {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  const fallbackHeaders = ["cf-connecting-ip", "x-real-ip"] as const;
  for (const header of fallbackHeaders) {
    const value = req.headers.get(header)?.trim();
    if (value) return value;
  }

  return null;
}

function getRequestMetadata(req: Request): RequestMetadata {
  return {
    requestIp: normalizeRequestIp(req),
    requestOrigin: req.headers.get("Origin"),
    userAgent: req.headers.get("User-Agent"),
  };
}

function getAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function parseRequestBody(req: Request): Promise<RequestAccessPayload | Response> {
  let jsonBody: unknown;

  try {
    jsonBody = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const parsed = requestAccessSchema.safeParse(jsonBody);

  if (!parsed.success) {
    return errorResponse(
      "INVALID_REQUEST",
      "Please correct the highlighted request-access fields and try again.",
      400,
      parsed.error.flatten(),
    );
  }

  return parsed.data;
}

async function findOpenRequest(
  admin: AdminClient,
  organizationName: string,
  workEmail: string,
): Promise<ExistingRequestRow | null> {
  const { data, error } = await admin
    .from("tenant_access_requests")
    .select("id, status")
    .eq("organization_name_normalized", organizationName.toLowerCase())
    .eq("work_email_normalized", workEmail.toLowerCase())
    .in("status", ["submitted", "under_review"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load existing request: ${error.message}`);
  }

  return (data as ExistingRequestRow | null) ?? null;
}

async function persistRequest(
  admin: AdminClient,
  payload: RequestAccessPayload,
  metadata: RequestMetadata,
): Promise<{ id: string; created_at: string }> {
  const requestRow = {
    organization_name: payload.organizationName,
    primary_contact_name: payload.primaryContactName,
    work_email: payload.workEmail.toLowerCase(),
    phone: cleanOptional(payload.phone),
    team_size: payload.teamSize,
    integration_needs: cleanOptional(payload.integrationNeeds),
    notes: cleanOptional(payload.notes),
    notification_status: "pending" as const,
    notification_error: null,
    notification_sent_at: null,
    requester_confirmation_status: "pending" as const,
    requester_confirmation_error: null,
    requester_confirmation_sent_at: null,
    request_ip: metadata.requestIp,
    request_origin: metadata.requestOrigin,
    user_agent: metadata.userAgent,
  };

  const existingRequest = await findOpenRequest(
    admin,
    payload.organizationName,
    payload.workEmail,
  );

  if (existingRequest) {
    const { data, error } = await admin
      .from("tenant_access_requests")
      .update({
        ...requestRow,
        status: existingRequest.status,
      })
      .eq("id", existingRequest.id)
      .select("id, created_at")
      .single();

    if (error) {
      throw new Error(`Failed to update access request: ${error.message}`);
    }

    return data as { id: string; created_at: string };
  }

  const { data, error } = await admin
    .from("tenant_access_requests")
    .insert({
      ...requestRow,
      status: "submitted",
    })
    .select("id, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      const retryRequest = await findOpenRequest(
        admin,
        payload.organizationName,
        payload.workEmail,
      );

      if (retryRequest) {
        const { data: retryData, error: retryError } = await admin
          .from("tenant_access_requests")
          .update({
            ...requestRow,
            status: retryRequest.status,
          })
          .eq("id", retryRequest.id)
          .select("id, created_at")
          .single();

        if (retryError) {
          throw new Error(`Failed to recover duplicate access request: ${retryError.message}`);
        }

        return retryData as { id: string; created_at: string };
      }
    }

    throw new Error(`Failed to save access request: ${error.message}`);
  }

  return data as { id: string; created_at: string };
}

async function countRecentRequestsByEmail(
  admin: AdminClient,
  workEmail: string,
  cutoffIso: string,
): Promise<number> {
  const { count, error } = await admin
    .from("tenant_access_requests")
    .select("id", { count: "exact", head: true })
    .eq("work_email_normalized", workEmail.toLowerCase())
    .gte("created_at", cutoffIso);

  if (error) {
    throw new Error(`Failed to check email rate limit: ${error.message}`);
  }

  return count ?? 0;
}

async function countRecentRequestsByIp(
  admin: AdminClient,
  requestIp: string,
  cutoffIso: string,
): Promise<number> {
  const { count, error } = await admin
    .from("tenant_access_requests")
    .select("id", { count: "exact", head: true })
    .eq("request_ip", requestIp)
    .gte("created_at", cutoffIso);

  if (error) {
    throw new Error(`Failed to check IP rate limit: ${error.message}`);
  }

  return count ?? 0;
}

async function enforceRateLimit(
  admin: AdminClient,
  payload: RequestAccessPayload,
  metadata: RequestMetadata,
): Promise<Response | null> {
  const windowMinutes = Number.isFinite(REQUEST_ACCESS_RATE_LIMIT_WINDOW_MINUTES) &&
      REQUEST_ACCESS_RATE_LIMIT_WINDOW_MINUTES > 0
    ? REQUEST_ACCESS_RATE_LIMIT_WINDOW_MINUTES
    : 60;
  const emailLimit = Number.isFinite(REQUEST_ACCESS_RATE_LIMIT_MAX_PER_EMAIL) &&
      REQUEST_ACCESS_RATE_LIMIT_MAX_PER_EMAIL > 0
    ? REQUEST_ACCESS_RATE_LIMIT_MAX_PER_EMAIL
    : 3;
  const ipLimit = Number.isFinite(REQUEST_ACCESS_RATE_LIMIT_MAX_PER_IP) &&
      REQUEST_ACCESS_RATE_LIMIT_MAX_PER_IP > 0
    ? REQUEST_ACCESS_RATE_LIMIT_MAX_PER_IP
    : 10;
  const cutoffIso = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const recentByEmail = await countRecentRequestsByEmail(
    admin,
    payload.workEmail,
    cutoffIso,
  );

  if (recentByEmail >= emailLimit) {
    return errorResponse(
      "RATE_LIMITED",
      "Too many recent access requests were submitted for this email. Please wait and try again later.",
      429,
    );
  }

  if (metadata.requestIp) {
    const recentByIp = await countRecentRequestsByIp(
      admin,
      metadata.requestIp,
      cutoffIso,
    );

    if (recentByIp >= ipLimit) {
      return errorResponse(
        "RATE_LIMITED",
        "Too many recent access requests were submitted from this source. Please wait and try again later.",
        429,
      );
    }
  }

  return null;
}

async function markNotificationResult(
  admin: AdminClient,
  requestId: string,
  status: "sent" | "failed",
  notificationError?: string | null,
) {
  const updatePayload =
    status === "sent"
      ? {
          notification_status: "sent",
          notification_error: null,
          notification_sent_at: new Date().toISOString(),
        }
      : {
          notification_status: "failed",
          notification_error: truncate(notificationError ?? "Unknown notification failure", 2000),
          notification_sent_at: null,
        };

  const { error } = await admin
    .from("tenant_access_requests")
    .update(updatePayload)
    .eq("id", requestId);

  if (error) {
    console.error("Failed to update notification status", {
      requestId,
      status,
      error: error.message,
    });
  }
}

async function markRequesterConfirmationResult(
  admin: AdminClient,
  requestId: string,
  status: "sent" | "failed" | "skipped",
  confirmationError?: string | null,
) {
  const updatePayload =
    status === "sent"
      ? {
          requester_confirmation_status: "sent",
          requester_confirmation_error: null,
          requester_confirmation_sent_at: new Date().toISOString(),
        }
      : status === "skipped"
        ? {
            requester_confirmation_status: "skipped",
            requester_confirmation_error: null,
            requester_confirmation_sent_at: null,
          }
        : {
            requester_confirmation_status: "failed",
            requester_confirmation_error: truncate(
              confirmationError ?? "Unknown confirmation email failure",
              2000,
            ),
            requester_confirmation_sent_at: null,
          };

  const { error } = await admin
    .from("tenant_access_requests")
    .update(updatePayload)
    .eq("id", requestId);

  if (error) {
    console.error("Failed to update requester confirmation status", {
      requestId,
      status,
      error: error.message,
    });
  }
}

async function sendNotificationEmail(payload: RequestAccessPayload, createdAt: string) {
  const recipients = getNotificationRecipients();

  if (
    !SUPABASE_URL ||
    !SERVICE_ROLE_KEY ||
    !PLATFORM_BREVO_API_KEY ||
    !REQUEST_ACCESS_FROM_EMAIL ||
    recipients.length === 0
  ) {
    throw new Error(
      "Missing platform email configuration. Expected PLATFORM_BREVO_API_KEY, REQUEST_ACCESS_NOTIFICATION_TO, and REQUEST_ACCESS_FROM_EMAIL.",
    );
  }

  const htmlContent = await render(
    React.createElement(AccessRequestNotificationEmail, {
      organizationName: payload.organizationName,
      primaryContactName: payload.primaryContactName,
      workEmail: payload.workEmail,
      phone: cleanOptional(payload.phone),
      teamSize: payload.teamSize,
      integrationNeeds: cleanOptional(payload.integrationNeeds),
      notes: cleanOptional(payload.notes),
      submittedAt: new Date(createdAt).toUTCString(),
    }),
  );

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": PLATFORM_BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        email: REQUEST_ACCESS_FROM_EMAIL,
        name: REQUEST_ACCESS_FROM_NAME,
      },
      to: recipients.map((email) => ({ email })),
      replyTo: {
        email: payload.workEmail,
        name: payload.primaryContactName,
      },
      subject: `New HOMS access request: ${payload.organizationName}`,
      htmlContent,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

async function sendRequesterConfirmationEmail(payload: RequestAccessPayload) {
  if (!PLATFORM_BREVO_API_KEY || !REQUEST_ACCESS_FROM_EMAIL) {
    throw new Error(
      "Missing confirmation email configuration. Expected PLATFORM_BREVO_API_KEY and REQUEST_ACCESS_FROM_EMAIL.",
    );
  }

  const htmlContent = await render(
    React.createElement(AccessRequestConfirmationEmail, {
      organizationName: payload.organizationName,
      primaryContactName: payload.primaryContactName,
    }),
  );

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": PLATFORM_BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        email: REQUEST_ACCESS_FROM_EMAIL,
        name: REQUEST_ACCESS_FROM_NAME,
      },
      to: [{
        email: payload.workEmail,
        name: payload.primaryContactName,
      }],
      replyTo: {
        email: getNotificationRecipients()[0] ?? REQUEST_ACCESS_FROM_EMAIL,
        name: REQUEST_ACCESS_FROM_NAME,
      },
      subject: "We received your HOMS access request",
      htmlContent,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return withCors(
      errorResponse("METHOD_NOT_ALLOWED", "Only POST is supported.", 405),
      req,
    );
  }

  try {
    const parsedBody = await parseRequestBody(req);
    if (parsedBody instanceof Response) {
      return withCors(parsedBody, req);
    }

    const admin = getAdminClient();
    const requestMetadata = getRequestMetadata(req);

    if (parsedBody.website) {
      return withCors(
        new Response(JSON.stringify({ ok: true, ignored: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
        req,
      );
    }

    const rateLimitResponse = await enforceRateLimit(
      admin,
      parsedBody,
      requestMetadata,
    );
    if (rateLimitResponse) {
      return withCors(rateLimitResponse, req);
    }

    const savedRequest = await persistRequest(admin, parsedBody, requestMetadata);

    try {
      await sendNotificationEmail(parsedBody, savedRequest.created_at);
      await markNotificationResult(admin, savedRequest.id, "sent");
    } catch (notificationError) {
      const message =
        notificationError instanceof Error
          ? notificationError.message
          : "Unknown notification failure";

      await markNotificationResult(admin, savedRequest.id, "failed", message);

      return withCors(
        errorResponse(
          "NOTIFICATION_FAILED",
          "Your request was saved, but we could not notify the operations team yet. Please try again later or contact support directly.",
          502,
          {
            requestId: savedRequest.id,
            requestRetained: true,
          },
        ),
        req,
      );
    }

    try {
      await sendRequesterConfirmationEmail(parsedBody);
      await markRequesterConfirmationResult(admin, savedRequest.id, "sent");
    } catch (confirmationError) {
      const message =
        confirmationError instanceof Error
          ? confirmationError.message
          : "Unknown requester confirmation failure";
      await markRequesterConfirmationResult(admin, savedRequest.id, "failed", message);
    }

    return withCors(
      new Response(
        JSON.stringify({
          ok: true,
          requestId: savedRequest.id,
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
