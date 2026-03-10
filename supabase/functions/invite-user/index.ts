import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { tenantGuard } from "../_shared/tenant-guard.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const ctx = tenantGuard(req);

        if (ctx.role === "hr_admin") {
            return new Response(
                JSON.stringify({ error: 'Unauthorized: Admin access required' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 },
            );
        }

        const { email, redirectTo, role = 'hr_admin' } = await req.json();

        if (!email) {
            return new Response(
                JSON.stringify({ error: 'Email is required' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
            );
        }

        const serviceRoleKey = Deno.env.get('PROLIFIC_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!serviceRoleKey) {
            console.error('Service role key not found');
            return new Response(
                JSON.stringify({ error: 'Server configuration error' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
            );
        }

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            serviceRoleKey,
        );

        const normalizedRole = role === 'tenant_admin' ? 'tenant_admin' : 'hr_admin';

        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            redirectTo: redirectTo || 'http://localhost:5173',
            data: {
                tenant_id: ctx.tenantId,
                role: normalizedRole,
                invited_by: ctx.userId,
            },
        });

        if (error) {
            return new Response(
                JSON.stringify({ error: error.message }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
            );
        }

        const invitedUserId = data.user?.id;
        if (invitedUserId) {
            const { error: tenantUserError } = await supabaseAdmin
                .from('tenant_users')
                .upsert({
                    tenant_id: ctx.tenantId,
                    user_id: invitedUserId,
                    role: normalizedRole,
                    status: 'pending',
                    invited_by: ctx.userId,
                }, { onConflict: 'tenant_id,user_id' });

            if (tenantUserError) throw tenantUserError;
        }

        return new Response(
            JSON.stringify(data),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
        );

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(
            JSON.stringify({ error: message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
        );
    }
});
