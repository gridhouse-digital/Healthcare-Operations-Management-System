import { assertEquals, assertInstanceOf } from "jsr:@std/assert";
import { tenantGuard, TenantGuardError } from "../tenant-guard.ts";

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

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: "user-uuid-123",
    app_metadata: {
      tenant_id: "tenant-uuid-456",
      role: "hr_admin",
    },
    ...overrides,
  };
}

// Stub env vars required by tenantGuard
Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_ANON_KEY", "anon-key-stub");

// ---------------------------------------------------------------------------
// Tests — missing / malformed auth
// ---------------------------------------------------------------------------

Deno.test("throws MISSING_AUTH when no Authorization header", () => {
  try {
    tenantGuard(makeReq());
    throw new Error("should have thrown");
  } catch (e) {
    assertInstanceOf(e, TenantGuardError);
    assertEquals((e as TenantGuardError).code, "MISSING_AUTH");
    assertEquals((e as TenantGuardError).status, 401);
  }
});

Deno.test("throws MISSING_AUTH when Authorization is not Bearer", () => {
  const req = new Request("http://localhost/", {
    headers: { Authorization: "Basic dXNlcjpwYXNz" },
  });
  try {
    tenantGuard(req);
    throw new Error("should have thrown");
  } catch (e) {
    assertInstanceOf(e, TenantGuardError);
    assertEquals((e as TenantGuardError).code, "MISSING_AUTH");
  }
});

Deno.test("throws INVALID_JWT when token is malformed", () => {
  try {
    tenantGuard(makeReq("not.a.real.jwt.here.with.too.many.parts"));
    throw new Error("should have thrown");
  } catch (e) {
    assertInstanceOf(e, TenantGuardError);
    assertEquals((e as TenantGuardError).code, "INVALID_JWT");
  }
});

Deno.test("throws INVALID_JWT when body is not valid base64 JSON", () => {
  try {
    tenantGuard(makeReq("header.!!!notbase64!!!.sig"));
    throw new Error("should have thrown");
  } catch (e) {
    assertInstanceOf(e, TenantGuardError);
    assertEquals((e as TenantGuardError).code, "INVALID_JWT");
  }
});

// ---------------------------------------------------------------------------
// Tests — missing claims
// ---------------------------------------------------------------------------

Deno.test("throws MISSING_SUB when sub is absent", () => {
  const token = makeJwt({ app_metadata: { tenant_id: "t1", role: "hr_admin" } });
  try {
    tenantGuard(makeReq(token));
    throw new Error("should have thrown");
  } catch (e) {
    assertInstanceOf(e, TenantGuardError);
    assertEquals((e as TenantGuardError).code, "MISSING_SUB");
  }
});

Deno.test("throws MISSING_APP_METADATA when app_metadata is absent", () => {
  const token = makeJwt({ sub: "user-123" });
  try {
    tenantGuard(makeReq(token));
    throw new Error("should have thrown");
  } catch (e) {
    assertInstanceOf(e, TenantGuardError);
    assertEquals((e as TenantGuardError).code, "MISSING_APP_METADATA");
  }
});

Deno.test("throws MISSING_TENANT_ID when tenant_id is absent", () => {
  const token = makeJwt({ sub: "user-123", app_metadata: { role: "hr_admin" } });
  try {
    tenantGuard(makeReq(token));
    throw new Error("should have thrown");
  } catch (e) {
    assertInstanceOf(e, TenantGuardError);
    assertEquals((e as TenantGuardError).code, "MISSING_TENANT_ID");
  }
});

Deno.test("throws MISSING_TENANT_ID when tenant_id is empty string", () => {
  const token = makeJwt({
    sub: "user-123",
    app_metadata: { tenant_id: "", role: "hr_admin" },
  });
  try {
    tenantGuard(makeReq(token));
    throw new Error("should have thrown");
  } catch (e) {
    assertInstanceOf(e, TenantGuardError);
    assertEquals((e as TenantGuardError).code, "MISSING_TENANT_ID");
  }
});

Deno.test("throws INVALID_ROLE when role is not recognised", () => {
  const token = makeJwt({
    sub: "user-123",
    app_metadata: { tenant_id: "t1", role: "superuser" },
  });
  try {
    tenantGuard(makeReq(token));
    throw new Error("should have thrown");
  } catch (e) {
    assertInstanceOf(e, TenantGuardError);
    assertEquals((e as TenantGuardError).code, "INVALID_ROLE");
  }
});

// ---------------------------------------------------------------------------
// Tests — happy path (all three roles)
// ---------------------------------------------------------------------------

Deno.test({
  name: "returns TenantContext for hr_admin",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    const token = makeJwt(validPayload());
    const ctx = tenantGuard(makeReq(token));
    assertEquals(ctx.tenantId, "tenant-uuid-456");
    assertEquals(ctx.userId, "user-uuid-123");
    assertEquals(ctx.role, "hr_admin");
  },
});

Deno.test({
  name: "returns TenantContext for tenant_admin",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    const token = makeJwt(validPayload({
      app_metadata: { tenant_id: "t2", role: "tenant_admin" },
    }));
    const ctx = tenantGuard(makeReq(token));
    assertEquals(ctx.role, "tenant_admin");
  },
});

Deno.test({
  name: "returns TenantContext for platform_admin",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    const token = makeJwt(validPayload({
      app_metadata: { tenant_id: "t3", role: "platform_admin" },
    }));
    const ctx = tenantGuard(makeReq(token));
    assertEquals(ctx.role, "platform_admin");
  },
});

Deno.test("throws SERVER_CONFIG_ERROR when SUPABASE_URL is missing", () => {
  Deno.env.delete("SUPABASE_URL");
  const token = makeJwt(validPayload());
  try {
    tenantGuard(makeReq(token));
    throw new Error("should have thrown");
  } catch (e) {
    assertInstanceOf(e, TenantGuardError);
    assertEquals((e as TenantGuardError).code, "SERVER_CONFIG_ERROR");
    assertEquals((e as TenantGuardError).status, 500);
  } finally {
    Deno.env.set("SUPABASE_URL", "http://localhost:54321");
  }
});

Deno.test("throws SERVER_CONFIG_ERROR when SUPABASE_ANON_KEY is missing", () => {
  Deno.env.delete("SUPABASE_ANON_KEY");
  const token = makeJwt(validPayload());
  try {
    tenantGuard(makeReq(token));
    throw new Error("should have thrown");
  } catch (e) {
    assertInstanceOf(e, TenantGuardError);
    assertEquals((e as TenantGuardError).code, "SERVER_CONFIG_ERROR");
    assertEquals((e as TenantGuardError).status, 500);
  } finally {
    Deno.env.set("SUPABASE_ANON_KEY", "anon-key-stub");
  }
});

Deno.test("tenant_id is NEVER read from request body or headers", () => {
  // Payload has no tenant_id — must throw even if a header is present
  const token = makeJwt({ sub: "user-123", app_metadata: { role: "hr_admin" } });
  const req = new Request("http://localhost/", {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-tenant-id": "injected-tenant", // must be ignored
    },
  });
  try {
    tenantGuard(req);
    throw new Error("should have thrown");
  } catch (e) {
    assertInstanceOf(e, TenantGuardError);
    assertEquals((e as TenantGuardError).code, "MISSING_TENANT_ID");
  }
});
