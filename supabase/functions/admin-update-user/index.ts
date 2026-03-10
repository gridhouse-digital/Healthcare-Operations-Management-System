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
            throw new Error('Unauthorized: Admin access required');
        }

        const { userId, tenantUserId, updates } = await req.json();

        if (!userId || !tenantUserId || !updates) {
            throw new Error('Missing userId, tenantUserId, or updates');
        }

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        const { data: tenantUser, error: tenantUserError } = await supabaseAdmin
            .from('tenant_users')
            .select('id, user_id, tenant_id, role, status')
            .eq('id', tenantUserId)
            .eq('tenant_id', ctx.tenantId)
            .single();

        if (tenantUserError || !tenantUser) {
            throw new Error('User not found in this tenant');
        }

        if (tenantUser.user_id !== userId) {
            throw new Error('userId does not match tenant user');
        }

        const tenantUserUpdates: Record<string, unknown> = {};
        if (updates.role) tenantUserUpdates.role = updates.role;
        if (updates.status) tenantUserUpdates.status = updates.status;
        if (Object.keys(tenantUserUpdates).length > 0) {
            tenantUserUpdates.updated_at = new Date().toISOString();
            const { error: tuUpdateError } = await supabaseAdmin
                .from('tenant_users')
                .update(tenantUserUpdates)
                .eq('id', tenantUserId)
                .eq('tenant_id', ctx.tenantId);

            if (tuUpdateError) throw tuUpdateError;
        }

        const authUpdates: Record<string, unknown> = {};
        if (updates.email) authUpdates.email = updates.email;
        if (updates.password) authUpdates.password = updates.password;

        const nextRole = updates.role ?? tenantUser.role;
        if (nextRole) {
            authUpdates.app_metadata = { tenant_id: ctx.tenantId, role: nextRole };
        }

        if (Object.keys(authUpdates).length > 0) {
            const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
                userId,
                authUpdates,
            );
            if (authError) throw authError;
        }

        return new Response(
            JSON.stringify({ message: 'User updated successfully' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(
            JSON.stringify({ error: message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
        );
    }
});
