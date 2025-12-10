import { getSupabaseClient } from "./supabaseClient.ts";

export interface AIRequestOptions {
    task: string;
    input: any;
    tenantId?: string | null;
    userId?: string | null;
    feature?: string; // e.g. "ai-summarize-applicant"
}

const DEFAULT_TTL_SECONDS = 86400;         // 24h
const RATE_LIMIT_PER_MINUTE = 60;          // per tenant

// Hash input for ai_cache
async function hashInput(task: string, input: any): Promise<string> {
    const enc = new TextEncoder();
    const data = enc.encode(task + ":" + JSON.stringify(input));
    const digest = await crypto.subtle.digest("SHA-256", data);
    const bytes = new Uint8Array(digest);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function aiRequest(options: AIRequestOptions) {
    const { task, input, tenantId, userId, feature } = options;
    const supabase = getSupabaseClient();

    // Normalize tenant for caching/logging to avoid cross-tenant data leakage
    const tenantKey = tenantId ?? "public";

    // 1️⃣ Rate limiting (per tenant, per minute)
    if (tenantId) {
        const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
        const { count, error: rateError } = await supabase
            .from("ai_logs")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .gte("created_at", oneMinuteAgo);

        if (!rateError && (count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
            throw new Error("Rate limit exceeded for this tenant. Please try again later.");
        }
    }

    // 2️⃣ Cache lookup
    const inputHash = await hashInput(task, { tenant: tenantKey, input });

    const { data: cacheRow, error: cacheError } = await supabase
        .from("ai_cache")
        .select("*")
        .eq("input_hash", inputHash)
        .maybeSingle();

    if (!cacheError && cacheRow) {
        const createdAt = new Date(cacheRow.created_at).getTime();
        const ttlSeconds = cacheRow.ttl_seconds ?? DEFAULT_TTL_SECONDS;
        const isFresh = Date.now() - createdAt < ttlSeconds * 1000;

        if (isFresh) {
            return {
                success: true,
                model: cacheRow.model ?? "cached",
                task,
                input,
                output: cacheRow.output,
                from_cache: true
            };
        }
    }

    // 3️⃣ Call Cloudflare Worker AI Gateway
    const gatewayUrl = Deno.env.get("AI_GATEWAY_URL") || "https://hr-ai-worker.gridhouse-digital10.workers.dev/";
    const gatewayApiKey = Deno.env.get("AI_GATEWAY_API_KEY"); // stored in Supabase env

    // Helper: Map domain task to worker task
    const workerTask = (task === "summary" || task === "offer_letter" || task === "general_chat")
        ? "chat"
        : (task === "ranking" || task === "onboarding_logic" || task === "wp_validation")
            ? "reasoning"
            : task;

    // Helper: Build Worker input
    let workerInput = input;
    if (workerTask === "chat" || workerTask === "reasoning") {
        // If input is already in { messages: ... } format, leave it. 
        // Otherwise, wrap it.
        if (!input?.messages) {
            const content = typeof input === "string" ? input : JSON.stringify(input);
            workerInput = {
                messages: [
                    {
                        role: "system",
                        content: "You are Prolific HR Assistant. Reply in clear, HR-friendly language.",
                    },
                    {
                        role: "user",
                        content,
                    },
                ]
            };
        }
    } else if (workerTask === "embedding") {
        if (!input?.text) {
            const text = typeof input === "string" ? input : JSON.stringify(input);
            workerInput = { text };
        }
    }

    const t0 = Date.now();
    const response = await fetch(gatewayUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(gatewayApiKey ? { "x-api-key": gatewayApiKey } : {}),
            ...(tenantId ? { "x-tenant-id": tenantId } : {}),
            ...(userId ? { "x-user-id": userId } : {})
        },
        body: JSON.stringify({ task: workerTask, input: workerInput })
    });

    const rawText = await response.text();
    const latencyMs = Date.now() - t0;

    if (!response.ok) {
        // log failed call
        await supabase.from("ai_logs").insert({
            tenant_id: tenantId,
            user_id: userId,
            feature: feature ?? task,
            model: null,
            tokens_in: 0,
            tokens_out: 0,
            success: false,
            error: `HTTP ${response.status}: ${rawText}`
        });

        throw new Error(`AI Gateway Error (${response.status}): ${rawText}`);
    }

    let parsed;
    try {
        parsed = JSON.parse(rawText);
    } catch (parseError) {
        await supabase.from("ai_logs").insert({
            tenant_id: tenantId,
            user_id: userId,
            feature: feature ?? task,
            model: null,
            tokens_in: 0,
            tokens_out: 0,
            success: false,
            error: `Invalid JSON from AI Gateway: ${rawText.substring(0, 200)}`
        });
        throw new Error("Invalid JSON from AI gateway.");
    }

    const model = parsed.model ?? "unknown";

    // Extract output from various possible fields in the AI Gateway response
    // The gateway might return: output, result.response, result, or response
    const output = parsed.output
        ?? parsed.result?.response
        ?? parsed.result
        ?? parsed.response
        ?? null;

    // Extract token usage from the response
    const tokensIn = parsed.tokens_in ?? parsed.usage?.prompt_tokens ?? 0;
    const tokensOut = parsed.tokens_out ?? parsed.usage?.completion_tokens ?? 0;

    // 4️⃣ Log usage
    await supabase.from("ai_logs").insert({
        tenant_id: tenantId,
        user_id: userId,
        feature: feature ?? task,
        model,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        success: parsed.success !== false,
        error: null
    });

    // 5️⃣ Write cache
    await supabase.from("ai_cache").upsert({
        input_hash: inputHash,
        output,
        model,
        ttl_seconds: DEFAULT_TTL_SECONDS
    });

    // Return consistent structure matching cache response format
    return {
        success: parsed.success !== false,
        model,
        task,
        input,
        output,
        latency_ms: latencyMs,
        from_cache: false
    };
}
