import { assertEquals } from "jsr:@std/assert";
import { TenantGuardError } from "../tenant-guard.ts";
import { errorResponse, handleError } from "../error-response.ts";

// Stub env so tenant-guard import doesn't fail at module load
Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_ANON_KEY", "anon-key-stub");

// ---------------------------------------------------------------------------
// errorResponse
// ---------------------------------------------------------------------------

Deno.test("errorResponse returns correct status and JSON envelope", async () => {
  const res = errorResponse("TEST_CODE", "test message", 422);
  assertEquals(res.status, 422);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  const body = await res.json() as { error: { code: string; message: string } };
  assertEquals(body.error.code, "TEST_CODE");
  assertEquals(body.error.message, "test message");
});

Deno.test("errorResponse includes details when provided", async () => {
  const res = errorResponse("BAD", "oops", 400, { field: "email" });
  const body = await res.json() as { error: { details: unknown } };
  assertEquals((body.error.details as { field: string }).field, "email");
});

Deno.test("errorResponse omits details key when not provided", async () => {
  const res = errorResponse("BAD", "oops", 400);
  const body = await res.json() as { error: Record<string, unknown> };
  assertEquals("details" in body.error, false);
});

// ---------------------------------------------------------------------------
// handleError — TenantGuardError
// ---------------------------------------------------------------------------

Deno.test("handleError maps TenantGuardError to correct status", async () => {
  const err = new TenantGuardError("MISSING_AUTH", "Authorization required", 401);
  const res = handleError(err);
  assertEquals(res.status, 401);
  const body = await res.json() as { error: { code: string } };
  assertEquals(body.error.code, "MISSING_AUTH");
});

Deno.test("handleError maps TenantGuardError 403 status correctly", async () => {
  const err = new TenantGuardError("INVALID_ROLE", "role not allowed", 403);
  const res = handleError(err);
  assertEquals(res.status, 403);
});

// ---------------------------------------------------------------------------
// handleError — unknown errors never leak internals
// ---------------------------------------------------------------------------

Deno.test("handleError returns opaque 500 for unknown Error", async () => {
  const res = handleError(new Error("DB password is 1234"));
  assertEquals(res.status, 500);
  const body = await res.json() as { error: { code: string; message: string } };
  assertEquals(body.error.code, "INTERNAL_ERROR");
  // Must not contain the original message
  assertEquals(body.error.message.includes("1234"), false);
});

Deno.test("handleError returns opaque 500 for thrown string", async () => {
  const res = handleError("raw string error");
  assertEquals(res.status, 500);
  const body = await res.json() as { error: { code: string } };
  assertEquals(body.error.code, "INTERNAL_ERROR");
});

Deno.test("handleError returns opaque 500 for null", async () => {
  const res = handleError(null);
  assertEquals(res.status, 500);
});
