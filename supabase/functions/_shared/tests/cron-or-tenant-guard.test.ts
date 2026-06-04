import { assertEquals, assertInstanceOf } from "jsr:@std/assert";
import { cronOrTenantGuard } from "../cron-or-tenant-guard.ts";
import { TenantGuardError } from "../tenant-guard.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fakesig`;
}

function makeReq(token?: string): Request {
  return new Request("http://localhost/", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

// The service-role key under test is an OPAQUE, non-JWT token — the new
// `sb_secret_…` API key format. This is the exact regression: convert-applicant
// → onboard-employee passed this as a Bearer token and the old guard rejected it
// with INVALID_JWT because it required a 3-part JWT before any role check.
const SERVICE_KEY = "sb_secret_OPAQUE_not_a_jwt_0123456789";
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);

// ---------------------------------------------------------------------------
// Path A — service-role key (the bug this guards against)
// ---------------------------------------------------------------------------

Deno.test("opaque sb_secret service key → cron mode (regression: was INVALID_JWT)", () => {
  const ctx = cronOrTenantGuard(makeReq(SERVICE_KEY));
  assertEquals(ctx.mode, "cron");
});

Deno.test("legacy service-role JWT (role claim) → cron mode (fallback path)", () => {
  const ctx = cronOrTenantGuard(makeReq(makeJwt({ role: "service_role" })));
  assertEquals(ctx.mode, "cron");
});

// ---------------------------------------------------------------------------
// Path B — user token
// ---------------------------------------------------------------------------

Deno.test("valid user JWT → user mode with tenant/user/role", () => {
  const ctx = cronOrTenantGuard(makeReq(makeJwt({
    sub: "user-uuid-123",
    app_metadata: { tenant_id: "tenant-uuid-456", role: "hr_admin" },
  })));
  assertEquals(ctx.mode, "user");
  if (ctx.mode === "user") {
    assertEquals(ctx.tenantId, "tenant-uuid-456");
    assertEquals(ctx.userId, "user-uuid-123");
    assertEquals(ctx.role, "hr_admin");
  }
});

// ---------------------------------------------------------------------------
// Rejections
// ---------------------------------------------------------------------------

Deno.test("missing Authorization header → MISSING_AUTH", () => {
  try {
    cronOrTenantGuard(makeReq());
    throw new Error("should have thrown");
  } catch (e) {
    assertInstanceOf(e, TenantGuardError);
    assertEquals((e as TenantGuardError).code, "MISSING_AUTH");
  }
});

Deno.test("opaque non-JWT that is NOT the service key → INVALID_JWT", () => {
  try {
    cronOrTenantGuard(makeReq("some-other-opaque-token-not-the-key"));
    throw new Error("should have thrown");
  } catch (e) {
    assertInstanceOf(e, TenantGuardError);
    assertEquals((e as TenantGuardError).code, "INVALID_JWT");
  }
});

Deno.test("user JWT missing tenant_id → MISSING_TENANT_ID", () => {
  try {
    cronOrTenantGuard(makeReq(makeJwt({ sub: "u1", app_metadata: { role: "hr_admin" } })));
    throw new Error("should have thrown");
  } catch (e) {
    assertInstanceOf(e, TenantGuardError);
    assertEquals((e as TenantGuardError).code, "MISSING_TENANT_ID");
  }
});
