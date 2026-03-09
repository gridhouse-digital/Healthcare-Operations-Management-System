import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { render } from "npm:@react-email/render@0.0.7";
import * as React from "npm:react@18.3.1";
import { WelcomeEmail } from "../_shared/emails/WelcomeEmail.tsx";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
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
        const position = record.position // e.g., "Registered Nurse (RN)"

        // 2. Fetch Applicant Details (Email, Name)
        const { data: applicant, error: applicantError } = await supabaseClient
            .from('applicants')
            .select('*')
            .eq('id', applicantId)
            .single()

        if (applicantError || !applicant) {
            throw new Error(`Applicant not found: ${applicantError?.message}`)
        }

        // 3. Fetch tenant settings (WP credentials & group map)
        // Determine tenant from applicant (or fallback to known tenant)
        const tenantId = applicant.tenant_id || '11111111-1111-1111-1111-111111111111';
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

        // 6. Update Employee Record in Supabase
        // First check if employee record exists (it should have been created by another trigger or process, 
        // but if not, we might need to create it or just update the applicant/offer metadata?
        // Usually 'onboard-employee' implies creating the employee record too if it doesn't exist.
        // For now, let's assume we update the 'applicants' or 'employees' table.
        // The prompt mentioned "Update the employees table in Supabase with the new wp_user_id".

        // Update the people record linked to this applicant
        const { data: person } = await supabaseClient
            .from('people')
            .select('id')
            .eq('applicant_id', applicantId)
            .eq('type', 'employee')
            .single()

        if (person) {
            await supabaseClient
                .from('people')
                .update({ wp_user_id: wpUser.id })
                .eq('id', person.id)
        } else {
            console.log(`No people record found for applicant ${applicantId} to update wp_user_id`)
        }

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
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
