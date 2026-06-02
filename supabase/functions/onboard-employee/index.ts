import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { render } from "npm:@react-email/render@0.0.7";
import * as React from "npm:react@18.3.1";
import { WelcomeEmail } from "../_shared/emails/WelcomeEmail.tsx";
import { cronOrTenantGuard } from "../_shared/cron-or-tenant-guard.ts";
import { TenantGuardError } from "../_shared/tenant-guard.ts";

// =============================================================================
// onboard-employee — EXTERNAL provisioning ONLY (Phase 1, Q4).
//
// Responsibility (narrowed): idempotent WordPress user creation + LearnDash
// group enrollment + onboarding notification. It does NOT create or own the
// internal `people` employee row — that is the convert-applicant authority's
// job. This function is invoked BY convert-applicant (and the accepted-offer
// trigger via convert-applicant) and supports authorized RETRY without
// creating a duplicate `people` row (it only updates wp_user_id on the existing
// row; lookup-before-create on the WP side avoids duplicate WP users).
//
// Integration failures are logged to integration_log (no silent failure).
// =============================================================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Auth FIRST: this EF is invoked by the on_offer_accepted DB webhook
        // (service-role JWT → mode "cron"). A user JWT is also accepted. The
        // request is rejected if neither is present. tenant_id is NEVER taken
        // from the body — it is derived from the applicant record below.
        const auth = cronOrTenantGuard(req)

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Get the payload (Offer Accepted Event)
        const { record } = await req.json()
        if (!record || record.status !== 'Accepted') {
            return new Response(JSON.stringify({ message: 'Ignored: Status not Accepted' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        const applicantId = record.applicant_id

        // 2. Fetch Applicant Details (Email, Name)
        const { data: applicant, error: applicantError } = await supabaseClient
            .from('applicants')
            .select('*')
            .eq('id', applicantId)
            .single()

        if (applicantError || !applicant) {
            throw new Error(`Applicant not found: ${applicantError?.message}`)
        }

        // Q3 fix: the offer row persists the job title as `position_title`
        // (NOT `position`). Read the authoritative title from the persisted
        // offer-row shape. The previous `record.position` read was always
        // undefined because the offers table has no `position` column.
        const { data: acceptedOffer } = await supabaseClient
            .from('offers')
            .select('position_title')
            .eq('applicant_id', applicantId)
            .eq('status', 'Accepted')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        const position = acceptedOffer?.position_title ?? '' // e.g., "Registered Nurse (RN)"

        // 3. Determine tenant from the server-trusted applicant record ONLY.
        // Never trust record.tenant_id from the request body. No hardcoded fallback.
        const tenantId = applicant.tenant_id;
        if (!tenantId) {
            throw new Error(`Applicant ${applicantId} has no tenant_id; cannot onboard`);
        }
        // If the webhook payload carried a tenant_id, it must match the applicant's.
        if (record.tenant_id && record.tenant_id !== tenantId) {
            throw new Error('tenant_id mismatch between offer payload and applicant record');
        }
        // Defense-in-depth: if invoked by an authenticated user (not cron), the
        // caller's tenant must match the applicant's tenant.
        if (auth.mode === 'user' && auth.tenantId !== tenantId) {
            throw new Error('Caller tenant does not match applicant tenant');
        }

        // Fetch tenant settings (WP credentials & group map)
        const PGCRYPTO_KEY = Deno.env.get("PGCRYPTO_ENCRYPTION_KEY") ?? "";

        const { data: tenantSettings, error: settingsError } = await supabaseClient
            .from('tenant_settings')
            .select('wp_site_url, wp_username_encrypted, wp_app_password_encrypted, ld_group_mappings, brevo_api_key_encrypted, logo_light')
            .eq('tenant_id', tenantId)
            .single()

        if (settingsError || !tenantSettings) throw new Error(`Settings fetch error: ${settingsError?.message || 'not found'}`)

        if (!tenantSettings.wp_site_url || !tenantSettings.wp_username_encrypted || !tenantSettings.wp_app_password_encrypted) {
            throw new Error('Missing WordPress configuration in tenant_settings')
        }

        // Decrypt WP credentials
        const { data: wpUsername } = await supabaseClient.rpc("pgp_sym_decrypt_text", {
            ciphertext: tenantSettings.wp_username_encrypted, passphrase: PGCRYPTO_KEY
        });
        const { data: wpAppPassword } = await supabaseClient.rpc("pgp_sym_decrypt_text", {
            ciphertext: tenantSettings.wp_app_password_encrypted, passphrase: PGCRYPTO_KEY
        });

        const config: any = {
            wp_api_url: tenantSettings.wp_site_url.endsWith('/wp-json') ? tenantSettings.wp_site_url : `${tenantSettings.wp_site_url}/wp-json`,
            wp_username: wpUsername,
            wp_app_password: wpAppPassword,
            learndash_group_map: JSON.stringify(tenantSettings.ld_group_mappings || {}),
            brevo_api_key: tenantSettings.brevo_api_key_encrypted ? await (async () => {
                const { data } = await supabaseClient.rpc("pgp_sym_decrypt_text", {
                    ciphertext: tenantSettings.brevo_api_key_encrypted, passphrase: PGCRYPTO_KEY
                });
                return data;
            })() : null,
            logo_light: tenantSettings.logo_light,
        }

        if (!config.wp_username || !config.wp_app_password) {
            throw new Error('Failed to decrypt WordPress credentials')
        }

        // 4. Create WordPress User
        const wpAuth = btoa(`${config.wp_username}:${config.wp_app_password}`)
        const wpPassword = Math.random().toString(36).slice(-10) + "1!"; // Generate random initial password
        const wpUserResponse = await fetch(`${config.wp_api_url}/wp/v2/users`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${wpAuth}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: applicant.email,
                email: applicant.email,
                first_name: applicant.first_name,
                last_name: applicant.last_name,
                password: wpPassword,
                roles: ['subscriber'], // Default role
            }),
        })

        let wpUser = await wpUserResponse.json()

        // Handle existing user case
        if (!wpUserResponse.ok) {
            if (wpUser.code === 'existing_user_login' || wpUser.code === 'existing_user_email') {
                // If user exists, try to find them to get ID
                const searchResponse = await fetch(`${config.wp_api_url}/wp/v2/users?search=${applicant.email}`, {
                    headers: { 'Authorization': `Basic ${wpAuth}` }
                })
                const searchResults = await searchResponse.json()
                if (searchResults.length > 0) {
                    wpUser = searchResults[0]
                } else {
                    throw new Error(`Failed to create WP user: ${JSON.stringify(wpUser)}`)
                }
            } else {
                throw new Error(`Failed to create WP user: ${JSON.stringify(wpUser)}`)
            }
        }

        // 5. Assign to LearnDash Group
        let groupIds: number[] = []
        try {
            const groupMap = JSON.parse(config.learndash_group_map || '{}')
            // Match position to group IDs. 
            // Logic: Check if the exact position exists, or if a key is a substring of the position
            // e.g. "Nurse" key matches "Registered Nurse (RN)"

            // Direct match
            if (groupMap[position]) {
                groupIds = Array.isArray(groupMap[position]) ? groupMap[position] : [groupMap[position]]
            } else {
                // Fuzzy match
                for (const key in groupMap) {
                    if (position.includes(key)) {
                        const val = groupMap[key]
                        const ids = Array.isArray(val) ? val : [val]
                        groupIds = [...groupIds, ...ids]
                    }
                }
            }
        } catch (e) {
            console.error("Error parsing group map", e)
        }

        const enrollmentResults = []
        for (const groupId of groupIds) {
            // LearnDash API: Update User Groups
            // Endpoint: /ldlms/v2/groups/<id>/users
            // Method: POST, Body: { user_ids: [id] }
            // Note: This endpoint might vary by LearnDash version. 
            // Alternative: /ldlms/v2/users/<user_id>/groups (PUT) with { group_ids: [...] }

            // Using the User endpoint is usually safer to ADD groups without removing others if we handle it right,
            // but LearnDash REST API often replaces the list. 
            // Let's try the Group endpoint to add this user to the group.

            const enrollResponse = await fetch(`${config.wp_api_url}/ldlms/v2/groups/${groupId}/users`, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${wpAuth}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_ids: [wpUser.id]
                })
            })
            enrollmentResults.push({ groupId, status: enrollResponse.status })
        }

        // 6. Provisioning is UPDATE-ONLY here (Q4): the `people` employee row is
        // owned by convert-applicant. We only stamp wp_user_id onto the existing
        // row. We NEVER create a `people` row here, so an authorized retry cannot
        // produce a duplicate. If the row is missing, that is a conversion
        // ordering issue — log it, do not create.
        const { data: person } = await supabaseClient
            .from('people')
            .select('id')
            .eq('applicant_id', applicantId)
            .eq('type', 'employee')
            .maybeSingle()

        if (person) {
            await supabaseClient
                .from('people')
                .update({ wp_user_id: wpUser.id })
                .eq('id', person.id)
        } else {
            console.log(`No people record found for applicant ${applicantId} to update wp_user_id`)
        }

        // Record provisioning success in integration_log (no silent failure).
        const failedEnrollments = enrollmentResults.filter((e) => e.status >= 400)
        await supabaseClient.from('integration_log').upsert(
            [{
                tenant_id: tenantId,
                source: 'learndash',
                idempotency_key: `onboard:${applicantId}`,
                status: failedEnrollments.length > 0 ? 'partial' : 'processed',
                payload: {
                    wp_user_id: wpUser.id,
                    groups_enrolled: groupIds,
                    enrollment_results: enrollmentResults,
                },
                completed_at: new Date().toISOString(),
            }],
            { onConflict: 'tenant_id,source,idempotency_key' },
        )

        // 7. Send Welcome Email via Brevo
        if (config.brevo_api_key) {
            console.log(`Sending Welcome Email to ${applicant.email}...`)
            const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': config.brevo_api_key,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: {
                        name: 'Prolific Homecare HR',
                        email: 'admin@prolifichcs.com'
                    },
                    to: [{ email: applicant.email, name: `${applicant.first_name} ${applicant.last_name}` }],
                    subject: `Welcome to Prolific Homecare!`,
                    htmlContent: await render(
                        React.createElement(WelcomeEmail, {
                            applicantName: `${applicant.first_name} ${applicant.last_name}`,
                            loginUrl: `${config.wp_api_url}/wp-login.php`,
                            username: applicant.email,
                            logoUrl: config.logo_light || undefined
                        })
                    )
                })
            })

            if (!emailResponse.ok) {
                const errorText = await emailResponse.text()
                console.error('Brevo API Error (Welcome Email):', errorText)
            } else {
                console.log('Welcome Email sent successfully')
            }
        }

        return new Response(
            JSON.stringify({
                message: 'Onboarding successful',
                wp_user_id: wpUser.id,
                groups_enrolled: groupIds
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )

    } catch (error) {
        const status = error instanceof TenantGuardError ? error.status : 400
        const message = error instanceof Error ? error.message : String(error)

        // No silent failure: log the provisioning failure to integration_log when
        // we have enough trusted context to do so. Best-effort — never throws.
        try {
            const failClient = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            )
            // Re-derive applicant/tenant from the body for the log key (trusted lookup).
            const reqClone = req.clone()
            const parsed = await reqClone.json().catch(() => ({}))
            const appId = parsed?.record?.applicant_id
            if (appId) {
                const { data: app } = await failClient
                    .from('applicants').select('tenant_id').eq('id', appId).maybeSingle()
                if (app?.tenant_id) {
                    await failClient.from('integration_log').upsert(
                        [{
                            tenant_id: app.tenant_id,
                            source: 'learndash',
                            idempotency_key: `onboard:${appId}`,
                            status: 'failed',
                            payload: { error: message },
                            completed_at: new Date().toISOString(),
                        }],
                        { onConflict: 'tenant_id,source,idempotency_key' },
                    )
                }
            }
        } catch {
            // swallow — logging must not mask the original error
        }

        return new Response(
            JSON.stringify({ error: message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status }
        )
    }
})
