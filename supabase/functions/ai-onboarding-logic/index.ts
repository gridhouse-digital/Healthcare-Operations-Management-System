import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts"
import { aiRequest } from "../_shared/aiClient.ts"
import { tenantGuard, TenantGuardError } from "../_shared/tenant-guard.ts"

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const schema = z.object({
    employee: z.record(z.any()),
    status: z.string()
});

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

        const { employee, status } = validation.data

        // Check for injected client-side instructions (System Prompt)
        let aiInput = { employee, status };
        let messages = undefined;

        if (employee._ai_instructions) {
            const systemPrompt = employee._ai_instructions;

            // Remove instructions from the data payload to keep it clean
            const cleanEmployee = { ...employee };
            delete cleanEmployee._ai_instructions;

            messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: JSON.stringify({ employee: cleanEmployee, status }) }
            ];

            // When messages are present, we pass them as the input
            aiInput = { messages } as any;
        }

        const result = await aiRequest({
            task: "onboarding_logic",
            input: aiInput,
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            feature: "ai-onboarding-logic"
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
