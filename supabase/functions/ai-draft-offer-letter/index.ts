import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts"
import { aiRequest } from "../_shared/aiClient.ts"
import { tenantGuard, TenantGuardError } from "../_shared/tenant-guard.ts"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const schema = z.union([
    z.object({
        candidate_name: z.string(),
        position: z.string(),
        start_date: z.string(),
        salary_rate: z.string(),
        manager_name: z.string()
    }),
    z.object({
        messages: z.array(z.any())
    })
]);

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }

    try {
        // tenant_id + user id come ONLY from the JWT app_metadata (never headers/body)
        const ctx = tenantGuard(req)

        const body = await req.json()
        const validation = schema.safeParse(body)

        if (!validation.success) {
            throw new Error(`Validation Error: ${JSON.stringify(validation.error.issues)}`)
        }

        // Determine input
        const input = 'messages' in validation.data
            ? { messages: validation.data.messages }
            : validation.data;

        const result = await aiRequest({
            task: "offer_letter",
            input: input,
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            feature: "ai-draft-offer-letter"
        })

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        })

    } catch (e: any) {
        const status = e instanceof TenantGuardError ? e.status : 400
        return new Response(JSON.stringify({ error: e.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status
        })
    }
})
