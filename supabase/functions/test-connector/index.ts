import { tenantGuard } from "../_shared/tenant-guard.ts";
import { handleError, errorResponse } from "../_shared/error-response.ts";
import { handleCors, withCors } from "../_shared/cors.ts";

// FR-16: Test connector credentials before saving.
// NFR-7: API key is received from the browser only during the test call —
//         it is NEVER logged, stored in plaintext, or returned.

interface TestConnectorBody {
  source: "bamboohr" | "jazzhr";
  subdomain?: string;
  apiKey: string;
}

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const ctx = tenantGuard(req);

    // tenant_admin or platform_admin only
    if (ctx.role === "hr_admin") {
      return withCors(
        errorResponse("FORBIDDEN", "Only tenant_admin can configure connectors", 403),
        req,
      );
    }

    const body = await req.json() as TestConnectorBody;
    const { source, apiKey, subdomain } = body;

    if (!source || !apiKey) {
      return withCors(errorResponse("MISSING_FIELDS", "source and apiKey are required", 400), req);
    }

    let testOk = false;
    let testError: string | undefined;

    if (source === "bamboohr") {
      if (!subdomain) {
        return withCors(errorResponse("MISSING_FIELDS", "subdomain is required for BambooHR", 400), req);
      }
      // Test: fetch the BambooHR /meta endpoint — lightweight, no data returned
      const url = `https://api.bamboohr.com/api/gateway.php/${subdomain}/v1/meta/fields`;
      const resp = await fetch(url, {
        headers: {
          Authorization: `Basic ${btoa(`${apiKey}:x`)}`,
          Accept: "application/json",
        },
      });
      if (resp.ok) {
        testOk = true;
      } else if (resp.status === 401 || resp.status === 403) {
        testError = "Invalid API key or subdomain";
      } else {
        testError = `BambooHR returned HTTP ${resp.status}`;
      }

    } else if (source === "jazzhr") {
      // Test: fetch the JazzHR /applicants endpoint with limit=1
      const resp = await fetch(`https://api.resumatorapi.com/v1/applicants?apikey=${apiKey}&per_page=1`);
      if (resp.ok) {
        testOk = true;
      } else if (resp.status === 401 || resp.status === 403) {
        testError = "Invalid JazzHR API key";
      } else {
        testError = `JazzHR returned HTTP ${resp.status}`;
      }

    } else {
      return withCors(errorResponse("INVALID_SOURCE", "source must be bamboohr or jazzhr", 400), req);
    }

    if (!testOk) {
      return withCors(
        new Response(JSON.stringify({ ok: false, error: testError }), {
          status: 200, // Return 200 — the test result is in the body
          headers: { "Content-Type": "application/json" },
        }),
        req,
      );
    }

    return withCors(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      req,
    );

  } catch (err) {
    return withCors(handleError(err), req);
  }
});
