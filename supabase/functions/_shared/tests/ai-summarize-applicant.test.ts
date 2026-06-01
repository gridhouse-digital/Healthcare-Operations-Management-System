import { assertEquals } from "jsr:@std/assert";
import {
    defaultDeps,
    handleSummarize,
    isAllowedResumeUrl,
    type SummarizeDeps,
} from "../../ai-summarize-applicant/handler.ts";
import type { AIRequestOptions } from "../aiClient.ts";

// ---------------------------------------------------------------------------
// Env required by the REAL tenantGuard (we intentionally do NOT stub it, so
// these tests exercise the actual JWT-derivation / header-ignoring behaviour).
// SUPABASE_URL doubles as an allowlisted resume host below.
// ---------------------------------------------------------------------------
const PROJECT_HOST = "peffyuhhlmidldugqalo.supabase.co";

// Set required env at the START of each test (not just module load) so these
// tests are independent of sibling test files that mutate SUPABASE_URL.
function setupEnv() {
    Deno.env.set("SUPABASE_URL", `https://${PROJECT_HOST}`);
    Deno.env.set("SUPABASE_ANON_KEY", "anon-key-stub");
    Deno.env.delete("RESUME_URL_ALLOWED_HOSTS");
}
setupEnv();

const TENANT_B = "tenant-bbbb-self";
const TENANT_A = "tenant-aaaa-other";
const APP_ID = "applicant-123";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJwt(payload: Record<string, unknown>): string {
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = btoa(JSON.stringify(payload));
    return `${header}.${body}.fakesig`;
}

function jwtForTenant(tenantId: string): string {
    return makeJwt({
        sub: "user-uuid-1",
        app_metadata: { tenant_id: tenantId, role: "hr_admin" },
    });
}

interface FakeOpts {
    row?: Record<string, unknown> | null;
}

function makeFakeSupabase(opts: FakeOpts) {
    const log = {
        selects: [] as Array<{ table: string; filters: Record<string, unknown> }>,
        updates: [] as Array<{ table: string; payload: unknown; filters: Record<string, unknown> }>,
    };

    function from(table: string) {
        const filters: Record<string, unknown> = {};
        let op: "select" | "update" = "select";
        let payload: unknown = undefined;

        const builder = {
            select() {
                op = "select";
                return builder;
            },
            update(p: unknown) {
                op = "update";
                payload = p;
                return builder;
            },
            eq(col: string, val: unknown) {
                filters[col] = val;
                return builder;
            },
            maybeSingle() {
                log.selects.push({ table, filters: { ...filters } });
                const row = opts.row ?? null;
                // Emulate the WHERE clause: a row is returned only if it matches
                // every eq() filter (i.e. id AND tenant_id must both match).
                if (
                    row &&
                    Object.entries(filters).every(([k, v]) => row[k] === v)
                ) {
                    return Promise.resolve({ data: row, error: null });
                }
                return Promise.resolve({ data: null, error: null });
            },
            // Makes an update chain awaitable.
            then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
                if (op === "update") {
                    log.updates.push({ table, payload, filters: { ...filters } });
                }
                return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            },
        };
        return builder;
    }

    return { client: { from }, log };
}

interface Spies {
    aiCalls: AIRequestOptions[];
    fetchUrls: string[];
}

function makeDeps(
    fakeClient: unknown,
    spies: Spies,
    overrides: Partial<SummarizeDeps> = {},
): SummarizeDeps {
    return {
        // Use the REAL tenantGuard — this is the point of the test.
        tenantGuard: defaultDeps.tenantGuard,
        getServiceClient: () => fakeClient,
        aiRequest: (opts: AIRequestOptions) => {
            spies.aiCalls.push(opts);
            return Promise.resolve({ success: true, output: "SUMMARY", from_cache: false });
        },
        fetchFn: ((url: string) => {
            spies.fetchUrls.push(String(url));
            return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
        }) as unknown as typeof fetch,
        parsePdf: () => Promise.resolve({ text: "  PARSED RESUME  " }),
        ...overrides,
    };
}

function req(jwt: string | null, body: unknown, extraHeaders: Record<string, string> = {}): Request {
    const headers: Record<string, string> = { "Content-Type": "application/json", ...extraHeaders };
    if (jwt) headers["Authorization"] = `Bearer ${jwt}`;
    return new Request("http://localhost/ai-summarize-applicant", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
}

const testOpts = { sanitizeOps: false, sanitizeResources: false } as const;

// ---------------------------------------------------------------------------
// (a) A spoofed x-tenant-id header is IGNORED — tenant comes from the JWT.
// ---------------------------------------------------------------------------
Deno.test({
    ...testOpts,
    name: "(a) spoofed x-tenant-id header is ignored; JWT tenant is used",
    fn: async () => {
        setupEnv();
        const fake = makeFakeSupabase({
            row: { id: APP_ID, tenant_id: TENANT_B, resume_text: "existing", resume_url: null },
        });
        const spies: Spies = { aiCalls: [], fetchUrls: [] };
        const deps = makeDeps(fake.client, spies);

        const res = await handleSummarize(
            req(jwtForTenant(TENANT_B), { applicant: { id: APP_ID, first_name: "X" } }, {
                "x-tenant-id": TENANT_A, // attacker-supplied — must be ignored
            }),
            deps,
        );

        assertEquals(res.status, 200);
        // The applicant lookup was scoped to the JWT tenant, NOT the header.
        assertEquals(fake.log.selects[0].filters.tenant_id, TENANT_B);
        assertEquals(fake.log.selects[0].filters.id, APP_ID);
        // The AI call was attributed to the JWT tenant.
        assertEquals(spies.aiCalls.length, 1);
        assertEquals(spies.aiCalls[0].tenantId, TENANT_B);
    },
});

// ---------------------------------------------------------------------------
// (b) A cross-tenant applicant id is rejected (404) with no write.
// ---------------------------------------------------------------------------
Deno.test({
    ...testOpts,
    name: "(b) cross-tenant applicant id -> 404, no AI call, no write",
    fn: async () => {
        // The row exists but belongs to TENANT_A; caller is TENANT_B.
        const fake = makeFakeSupabase({
            row: { id: APP_ID, tenant_id: TENANT_A, resume_text: null, resume_url: null },
        });
        const spies: Spies = { aiCalls: [], fetchUrls: [] };
        const deps = makeDeps(fake.client, spies);

        const res = await handleSummarize(
            req(jwtForTenant(TENANT_B), { applicant: { id: APP_ID } }),
            deps,
        );

        assertEquals(res.status, 404);
        assertEquals(await res.json(), { error: "Applicant not found in tenant" });
        // Lookup was tenant-scoped to the caller…
        assertEquals(fake.log.selects[0].filters.tenant_id, TENANT_B);
        // …and nothing else happened.
        assertEquals(spies.aiCalls.length, 0);
        assertEquals(fake.log.updates.length, 0);
        assertEquals(spies.fetchUrls.length, 0);
    },
});

// ---------------------------------------------------------------------------
// (c) Own-tenant happy path (resume_text already present -> no fetch).
// ---------------------------------------------------------------------------
Deno.test({
    ...testOpts,
    name: "(c) own-tenant happy path returns 200 and calls AI",
    fn: async () => {
        setupEnv();
        const fake = makeFakeSupabase({
            row: { id: APP_ID, tenant_id: TENANT_B, resume_text: "RESUME ON FILE", resume_url: null },
        });
        const spies: Spies = { aiCalls: [], fetchUrls: [] };
        const deps = makeDeps(fake.client, spies);

        const res = await handleSummarize(
            req(jwtForTenant(TENANT_B), { applicant: { id: APP_ID, first_name: "Jane" } }),
            deps,
        );

        assertEquals(res.status, 200);
        assertEquals(spies.aiCalls.length, 1);
        assertEquals(spies.aiCalls[0].tenantId, TENANT_B);
        const input = spies.aiCalls[0].input as Record<string, unknown>;
        assertEquals(input.resume_text, "RESUME ON FILE");
        // No extraction needed.
        assertEquals(spies.fetchUrls.length, 0);
        assertEquals(fake.log.updates.length, 0);
    },
});

// ---------------------------------------------------------------------------
// (d) resume_url is sourced from the DB row, not the request body (SSRF kill).
//     The write-back is scoped by tenant_id AND id.
// ---------------------------------------------------------------------------
Deno.test({
    ...testOpts,
    name: "(d) resume_url sourced from DB row, not body; write is tenant+id scoped",
    fn: async () => {
        const dbResumeUrl = `https://${PROJECT_HOST}/storage/v1/object/public/resumes/real.pdf`;
        const attackerUrl = "https://evil.example/attack.pdf";

        const fake = makeFakeSupabase({
            row: { id: APP_ID, tenant_id: TENANT_B, resume_text: null, resume_url: dbResumeUrl },
        });
        const spies: Spies = { aiCalls: [], fetchUrls: [] };
        const deps = makeDeps(fake.client, spies);

        const res = await handleSummarize(
            req(jwtForTenant(TENANT_B), {
                applicant: {
                    id: APP_ID,
                    // Attacker-controlled body fields — must be ignored for fetch.
                    resume_url: attackerUrl,
                    resume_text: null,
                },
            }),
            deps,
        );

        assertEquals(res.status, 200);
        // The fetch targeted the DB URL only — never the attacker's URL.
        assertEquals(spies.fetchUrls, [dbResumeUrl]);
        // The write-back was scoped by BOTH tenant_id and id.
        assertEquals(fake.log.updates.length, 1);
        assertEquals(fake.log.updates[0].table, "applicants");
        assertEquals(fake.log.updates[0].payload, { resume_text: "PARSED RESUME" });
        assertEquals(fake.log.updates[0].filters.tenant_id, TENANT_B);
        assertEquals(fake.log.updates[0].filters.id, APP_ID);
        // The extracted text (from the DB resume) reached the AI call.
        const input = spies.aiCalls[0].input as Record<string, unknown>;
        assertEquals(input.resume_text, "PARSED RESUME");
    },
});

// ---------------------------------------------------------------------------
// (e) Missing JWT is rejected (401) before any work.
// ---------------------------------------------------------------------------
Deno.test({
    ...testOpts,
    name: "(e) missing Authorization -> 401, no AI call",
    fn: async () => {
        setupEnv();
        const fake = makeFakeSupabase({ row: null });
        const spies: Spies = { aiCalls: [], fetchUrls: [] };
        const deps = makeDeps(fake.client, spies);

        const res = await handleSummarize(
            req(null, { applicant: { id: APP_ID } }),
            deps,
        );

        assertEquals(res.status, 401);
        assertEquals(spies.aiCalls.length, 0);
        assertEquals(fake.log.selects.length, 0);
    },
});

// ---------------------------------------------------------------------------
// SSRF allowlist unit tests.
// ---------------------------------------------------------------------------
Deno.test("isAllowedResumeUrl: allows the Supabase project host over https", () => {
    setupEnv();
    assertEquals(isAllowedResumeUrl(`https://${PROJECT_HOST}/storage/x.pdf`), true);
});

Deno.test("isAllowedResumeUrl: rejects loopback, link-local and private hosts", () => {
    setupEnv();
    assertEquals(isAllowedResumeUrl("https://127.0.0.1/x.pdf"), false);
    assertEquals(isAllowedResumeUrl("https://169.254.169.254/latest/meta-data"), false);
    assertEquals(isAllowedResumeUrl("https://10.0.0.5/x.pdf"), false);
    assertEquals(isAllowedResumeUrl("https://192.168.1.10/x.pdf"), false);
    assertEquals(isAllowedResumeUrl("https://localhost/x.pdf"), false);
});

Deno.test("isAllowedResumeUrl: rejects non-https and unknown hosts", () => {
    setupEnv();
    assertEquals(isAllowedResumeUrl(`http://${PROJECT_HOST}/x.pdf`), false);
    assertEquals(isAllowedResumeUrl("https://evil.example/x.pdf"), false);
    assertEquals(isAllowedResumeUrl("not-a-url"), false);
});
