// ---------------------------------------------------------------------------
// ai-summarize-applicant — request handler (extracted for unit testing).
//
// Security invariants (P0 tenant-isolation fix):
//   1. tenant_id is derived ONLY from the JWT app_metadata via tenantGuard().
//      The x-tenant-id header is IGNORED entirely.
//   2. The applicant is fetched by (id AND JWT tenant_id) BEFORE any work; a
//      row outside the caller's tenant yields 404 and no further processing.
//   3. The resume_text write is scoped by .eq('tenant_id').eq('id').
//   4. resume_url is sourced from the verified DB row, never the request body
//      (kills the SSRF + forged-input vector). The host is allowlisted and
//      private/loopback/link-local targets are rejected before fetching.
// ---------------------------------------------------------------------------

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { aiRequest, type AIRequestOptions } from "../_shared/aiClient.ts";
import { getSupabaseClient } from "../_shared/supabaseClient.ts";
import { tenantGuard, TenantGuardError } from "../_shared/tenant-guard.ts";

// CORS — note x-tenant-id is intentionally NOT advertised: it is ignored.
export const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const schema = z.union([
    z.object({
        applicant: z.object({
            id: z.string().optional(),
            first_name: z.string().optional(),
            last_name: z.string().optional(),
            email: z.string().optional(),
            resume_text: z.string().optional().nullable(),
            resume_url: z.string().optional().nullable(),
            skills: z.array(z.string()).optional(),
        }).passthrough(),
    }),
    z.object({
        messages: z.array(z.any()),
    }),
]);

// ---------------------------------------------------------------------------
// Injectable dependencies (defaults wire up the real implementations).
// ---------------------------------------------------------------------------

export interface SummarizeDeps {
    tenantGuard: (req: Request) => { tenantId: string; userId: string };
    getServiceClient: () => any;
    aiRequest: (options: AIRequestOptions) => Promise<unknown>;
    fetchFn: typeof fetch;
    parsePdf: (bytes: Uint8Array) => Promise<{ text: string }>;
}

export const defaultDeps: SummarizeDeps = {
    tenantGuard: (req) => {
        const ctx = tenantGuard(req);
        return { tenantId: ctx.tenantId, userId: ctx.userId };
    },
    getServiceClient: getSupabaseClient,
    aiRequest,
    fetchFn: (input, init) => fetch(input as any, init),
    parsePdf: async (bytes) => {
        // Imported lazily so the npm dependency only loads at runtime (when a
        // resume is actually parsed), not when the module graph is loaded for
        // unit tests with injected fakes.
        const { default: pdf } = await import("npm:pdf-parse@1.1.1");
        const { Buffer } = await import("node:buffer");
        const data = await pdf(Buffer.from(bytes));
        return { text: data.text ?? "" };
    },
};

// ---------------------------------------------------------------------------
// SSRF guard — only fetch DB-sourced resume URLs that are https, target an
// allowlisted host, and are not pointed at internal/private/loopback ranges.
// ---------------------------------------------------------------------------

function isPrivateOrLoopbackHost(hostname: string): boolean {
    const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (h === "localhost" || h === "::1" || h === "0.0.0.0") return true;
    if (h === "metadata.google.internal") return true;
    // IPv4 literal ranges
    const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
        const [a, b] = [Number(m[1]), Number(m[2])];
        if (a === 10) return true;                       // 10.0.0.0/8
        if (a === 127) return true;                      // loopback
        if (a === 0) return true;                        // 0.0.0.0/8
        if (a === 169 && b === 254) return true;         // link-local / cloud metadata
        if (a === 192 && b === 168) return true;         // 192.168.0.0/16
        if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    }
    // IPv6 unique-local / loopback
    if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
    return false;
}

export function isAllowedResumeUrl(rawUrl: string): boolean {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return false;
    }
    if (url.protocol !== "https:") return false;
    if (isPrivateOrLoopbackHost(url.hostname)) return false;

    // Build the host allowlist: Supabase storage host, known resume sources,
    // plus any operator-configured extras. If RESUME_URL_ALLOWED_HOSTS is set
    // it is treated as additive, not exclusive of the built-ins.
    const allowed = new Set<string>([
        "www.jotform.com",
        "jotform.com",
        "files.jotform.com",
        "www.jotform.us",
        "jotform.us",
        "eu.jotform.com",
    ]);
    const supaUrl = Deno.env.get("SUPABASE_URL");
    if (supaUrl) {
        try {
            allowed.add(new URL(supaUrl).host);
        } catch { /* ignore */ }
    }
    const extra = Deno.env.get("RESUME_URL_ALLOWED_HOSTS");
    if (extra) {
        extra.split(",").map((s) => s.trim()).filter(Boolean).forEach((h) => allowed.add(h));
    }
    return allowed.has(url.host);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function jsonResponse(status: number, payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status,
    });
}

export async function handleSummarize(
    req: Request,
    deps: SummarizeDeps = defaultDeps,
): Promise<Response> {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // 1️⃣ Tenant is derived from the JWT ONLY. x-tenant-id is never read.
        const { tenantId, userId } = deps.tenantGuard(req);

        const body = await req.json();
        const validation = schema.safeParse(body);
        if (!validation.success) {
            return jsonResponse(400, {
                error: `Validation Error: ${JSON.stringify(validation.error.issues)}`,
            });
        }

        // Determine input: either 'applicant' object or 'messages' array
        let input: any = "messages" in validation.data
            ? { messages: validation.data.messages }
            : validation.data.applicant;

        const supabase = deps.getServiceClient();

        // Resolve the applicant payload from whichever input mode was used.
        let applicantData: any = null;
        let userMessageIndex = -1;

        if ("messages" in validation.data) {
            userMessageIndex = validation.data.messages.findIndex((m: any) => m.role === "user");
            if (userMessageIndex !== -1) {
                try {
                    const content = validation.data.messages[userMessageIndex].content;
                    applicantData = typeof content === "string" ? JSON.parse(content) : content;
                } catch (e) {
                    console.error("Failed to parse user message content:", e);
                }
            }
        } else {
            applicantData = validation.data.applicant;
        }

        // 2️⃣ If an applicant id is supplied, it MUST belong to the caller's
        //    tenant. Fetch the authoritative row scoped by (id, JWT tenant_id)
        //    before any work; reject cross-tenant ids with 404.
        if (applicantData && applicantData.id) {
            const { data: row, error: rowError } = await supabase
                .from("applicants")
                .select("id, tenant_id, resume_text, resume_url")
                .eq("id", applicantData.id)
                .eq("tenant_id", tenantId)
                .maybeSingle();

            if (rowError) {
                throw new Error(`Applicant lookup failed: ${rowError.message}`);
            }
            if (!row) {
                return jsonResponse(404, { error: "Applicant not found in tenant" });
            }

            // 4️⃣ Source resume fields from the verified DB row — NOT the request
            //    body. This removes the forged-input + SSRF vector entirely.
            applicantData.resume_url = row.resume_url ?? null;

            if (row.resume_text) {
                applicantData.resume_text = row.resume_text;
            } else if (row.resume_url) {
                applicantData.resume_text = null;
                try {
                    const dbUrl: string = row.resume_url;
                    // Test the URL *pathname* for the .pdf extension so URLs with
                    // query strings / fragments (e.g. signed-storage tokens) still
                    // match. isAllowedResumeUrl() already validated it parses.
                    const isPdf = isAllowedResumeUrl(dbUrl) &&
                        new URL(dbUrl).pathname.toLowerCase().endsWith(".pdf");
                    if (isPdf) {
                        console.log(`Extracting text from DB-sourced resume: ${dbUrl}`);
                        const fileRes = await deps.fetchFn(dbUrl);
                        if (fileRes.ok) {
                            const arrayBuffer = await fileRes.arrayBuffer();
                            const pdfData = await deps.parsePdf(new Uint8Array(arrayBuffer));
                            if (pdfData.text) {
                                const cleanedText = pdfData.text.trim();
                                // 3️⃣ Scope the write by tenant AND id.
                                await supabase
                                    .from("applicants")
                                    .update({ resume_text: cleanedText })
                                    .eq("tenant_id", tenantId)
                                    .eq("id", applicantData.id);
                                applicantData.resume_text = cleanedText;
                            }
                        } else {
                            console.error("Failed to fetch resume file:", fileRes.status);
                        }
                    } else {
                        console.log("Skipping extraction: disallowed host or non-PDF resume URL.");
                    }
                } catch (err) {
                    console.error("Resume extraction failed:", err);
                }
            }
        }

        // Reconstruct input if we modified it
        if ("messages" in validation.data && userMessageIndex !== -1 && applicantData) {
            validation.data.messages[userMessageIndex].content = JSON.stringify(applicantData);
            input = { messages: validation.data.messages };
        } else if (!("messages" in validation.data) && applicantData) {
            input = applicantData;
        }

        const result = await deps.aiRequest({
            task: "summary",
            input,
            tenantId,
            userId,
            feature: "ai-summarize-applicant",
        });

        return jsonResponse(200, result);
    } catch (error: any) {
        const status = error instanceof TenantGuardError ? error.status : 400;
        return jsonResponse(status, { error: error?.message ?? String(error) });
    }
}
