// ---------------------------------------------------------------------------
// Allowed origins — add tenant domains here as clients are onboarded.
// In production this list should come from an env var or tenant_settings.
// ---------------------------------------------------------------------------

// Read env vars at call time (not module load time) so that tests can set
// env vars before the first call and have them take effect.
function getAllowedOrigins(): Set<string> {
  return new Set([
    Deno.env.get("ALLOWED_ORIGIN_1") ?? "http://localhost:5173",
    Deno.env.get("ALLOWED_ORIGIN_2") ?? "",
  ].filter(Boolean));
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin !== null && getAllowedOrigins().has(origin) ? origin : "";

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, x-client-info, apikey",
    "Access-Control-Max-Age": "86400",
  };
}

// ---------------------------------------------------------------------------
// Preflight handler
// ---------------------------------------------------------------------------

/**
 * Call at the top of every Edge Function handler.
 * Returns a 204 Response for OPTIONS preflight, or null for other methods.
 *
 * Usage:
 *   const preflight = handleCors(req);
 *   if (preflight) return preflight;
 */
export function handleCors(req: Request): Response | null {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  return null;
}

/**
 * Add CORS headers to an existing Response.
 * Use when building the final response of a handler.
 */
export function withCors(res: Response, req: Request): Response {
  const origin = req.headers.get("Origin");
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin))) {
    headers.set(k, v);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
