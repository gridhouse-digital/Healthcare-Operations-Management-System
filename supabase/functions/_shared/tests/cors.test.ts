import { assertEquals } from "jsr:@std/assert";
import { handleCors, withCors } from "../cors.ts";

// Set a known allowed origin before tests run
Deno.env.set("ALLOWED_ORIGIN_1", "https://app.prolifichr.com");
Deno.env.set("ALLOWED_ORIGIN_2", "http://localhost:5173");

function makeOptionsReq(origin: string): Request {
  return new Request("http://localhost/", {
    method: "OPTIONS",
    headers: { Origin: origin },
  });
}

function makeGetReq(origin: string): Request {
  return new Request("http://localhost/", {
    method: "GET",
    headers: { Origin: origin },
  });
}

// ---------------------------------------------------------------------------
// handleCors — OPTIONS preflight
// ---------------------------------------------------------------------------

Deno.test("handleCors returns 204 for OPTIONS from allowed origin", () => {
  const res = handleCors(makeOptionsReq("https://app.prolifichr.com"));
  assertEquals(res?.status, 204);
  assertEquals(
    res?.headers.get("Access-Control-Allow-Origin"),
    "https://app.prolifichr.com",
  );
});

Deno.test("handleCors returns empty ACAO for OPTIONS from unknown origin", () => {
  const res = handleCors(makeOptionsReq("https://evil.com"));
  assertEquals(res?.status, 204);
  // An empty string means browser will block the cross-origin request
  assertEquals(res?.headers.get("Access-Control-Allow-Origin"), "");
});

Deno.test("handleCors returns null for non-OPTIONS requests", () => {
  const res = handleCors(makeGetReq("https://app.prolifichr.com"));
  assertEquals(res, null);
});

// ---------------------------------------------------------------------------
// withCors — adds CORS headers to existing Response
// ---------------------------------------------------------------------------

Deno.test("withCors adds ACAO header to existing response", () => {
  const original = new Response(JSON.stringify({ ok: true }), { status: 200 });
  const req = makeGetReq("https://app.prolifichr.com");
  const res = withCors(original, req);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "https://app.prolifichr.com",
  );
  assertEquals(res.status, 200);
});

Deno.test("withCors preserves original response status and body", async () => {
  const original = new Response(JSON.stringify({ data: 42 }), { status: 201 });
  const req = makeGetReq("http://localhost:5173");
  const res = withCors(original, req);
  assertEquals(res.status, 201);
  const body = await res.json() as { data: number };
  assertEquals(body.data, 42);
});

Deno.test("withCors does not set ACAO for unknown origin", () => {
  const original = new Response(null, { status: 200 });
  const req = makeGetReq("https://attacker.io");
  const res = withCors(original, req);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "");
});

Deno.test("handleCors includes allowed methods in preflight headers", () => {
  const res = handleCors(makeOptionsReq("https://app.prolifichr.com"));
  const methods = res?.headers.get("Access-Control-Allow-Methods") ?? "";
  assertEquals(methods.includes("POST"), true);
  assertEquals(methods.includes("GET"), true);
  assertEquals(methods.includes("DELETE"), true);
});

Deno.test("handleCors returns empty ACAO when Origin header is absent", () => {
  // Covers the origin === null branch in corsHeaders()
  const req = new Request("http://localhost/", { method: "OPTIONS" });
  const res = handleCors(req);
  assertEquals(res?.status, 204);
  assertEquals(res?.headers.get("Access-Control-Allow-Origin"), "");
});

Deno.test("withCors returns empty ACAO when Origin header is absent", () => {
  // Covers the origin === null branch in withCors()
  const original = new Response(null, { status: 200 });
  const req = new Request("http://localhost/", { method: "GET" });
  const res = withCors(original, req);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "");
});

Deno.test("getAllowedOrigins filters out empty string when ALLOWED_ORIGIN_2 is unset", () => {
  // Temporarily unset ALLOWED_ORIGIN_2 so the ?? '' fallback produces ''
  // and filter(Boolean) removes it — covers the falsy-filter branch.
  Deno.env.delete("ALLOWED_ORIGIN_2");
  const req = new Request("http://localhost/", {
    method: "OPTIONS",
    headers: { Origin: "https://app.prolifichr.com" },
  });
  const res = handleCors(req);
  // Origin 1 is still set, so allowed origin should still match
  assertEquals(res?.status, 204);
  assertEquals(res?.headers.get("Access-Control-Allow-Origin"), "https://app.prolifichr.com");
  // Restore
  Deno.env.set("ALLOWED_ORIGIN_2", "http://localhost:5173");
});

Deno.test("getAllowedOrigins filters out empty ALLOWED_ORIGIN_1 fallback", () => {
  // Unset both env vars so both fall back to defaults (ORIGIN_1 -> localhost:5173, ORIGIN_2 -> '')
  // The '' is filtered out; localhost:5173 remains
  Deno.env.delete("ALLOWED_ORIGIN_1");
  Deno.env.delete("ALLOWED_ORIGIN_2");
  const req = new Request("http://localhost/", {
    method: "OPTIONS",
    headers: { Origin: "http://localhost:5173" },
  });
  const res = handleCors(req);
  assertEquals(res?.status, 204);
  assertEquals(res?.headers.get("Access-Control-Allow-Origin"), "http://localhost:5173");
  // Restore
  Deno.env.set("ALLOWED_ORIGIN_1", "https://app.prolifichr.com");
  Deno.env.set("ALLOWED_ORIGIN_2", "http://localhost:5173");
});
