import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Initialize Supabase Client
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Fetch Settings
        const { data: settingsData, error: settingsError } = await supabase
            .from('settings')
            .select('key, value')

        if (settingsError) throw new Error(`Failed to fetch settings: ${settingsError.message}`)

        const config = settingsData?.reduce((acc: any, curr: any) => {
            acc[curr.key] = curr.value
            return acc
        }, {}) || {}

        const JOTFORM_API_KEY = config['jotform_api_key']
        if (!JOTFORM_API_KEY) {
            throw new Error('Missing JOTFORM_API_KEY in settings')
        }

        let { applicantId } = await req.json()

        if (!applicantId) {
            throw new Error('Missing applicantId')
        }

        // Check if applicantId is a UUID (Supabase ID) and resolve to JotForm ID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        let supabaseUuid: string | null = null;
        let jotformId: string = applicantId;

        if (uuidRegex.test(applicantId)) {
            supabaseUuid = applicantId; // Preserve the UUID
            const { data: applicant, error: dbError } = await supabase
                .from('applicants')
                .select('jotform_id')
                .eq('id', applicantId)
                .single()

            if (dbError || !applicant?.jotform_id) {
                throw new Error(`Could not find applicant with ID ${applicantId}`)
            }
            jotformId = applicant.jotform_id
        }

        // Use jotformId for JotForm API calls
        applicantId = jotformId;

        // Form IDs from Settings
        const FORMS = {
            APPLICATION: config['jotform_form_id_application'],
            EMERGENCY: config['jotform_form_id_emergency'],
            I9: config['jotform_form_id_i9'],
            VACCINATION: config['jotform_form_id_vaccination'],
            LICENSES: config['jotform_form_id_licenses'],
            BACKGROUND: config['jotform_form_id_background']
        }

        // Validate critical form IDs
        if (!FORMS.APPLICATION) throw new Error('Missing Application Form ID in settings')

        // 1. Fetch Main Application Details
        const mainResponse = await fetch(`https://api.jotform.com/submission/${applicantId}?apiKey=${JOTFORM_API_KEY}`)
        if (!mainResponse.ok) throw new Error('Failed to fetch application details')
        const mainData = await mainResponse.json()

        // Helper to extract answers
        const extractAnswers = (submission: any) => {
            const answers: any = {}
            let generatedResume = "APPLICANT FORM DATA (Treat as Resume):\n\n";

            // Handle both single submission response (has .content) and list item (has .answers directly)
            const answersObj = submission.answers || (submission.content && submission.content.answers)

            if (!answersObj) return { answers, generatedResume: "" }

            Object.values(answersObj).forEach((ans: any) => {
                // Use the field name if available
                if (ans.name) {
                    answers[ans.name] = ans.answer
                }

                // Build Generated Resume from all fields
                if (ans.text && ans.answer) {
                    let answerStr = "";
                    if (typeof ans.answer === 'object') {
                        // Handle complex fields like grids or lists
                        answerStr = JSON.stringify(ans.answer, null, 2);
                    } else {
                        answerStr = String(ans.answer);
                    }
                    // Skip empty answers or system fields
                    if (answerStr && ans.text !== 'Header' && ans.text !== 'Submit') {
                        generatedResume += `### ${ans.text}\n${answerStr}\n\n`;
                    }
                }

                // Also map by type to ensure we get critical fields even if named differently
                if (ans.type === 'control_email') {
                    answers['email'] = ans.answer;
                }
                if (ans.type === 'control_fullname') {
                    answers['fullName'] = ans.answer;
                }
                if (ans.type === 'control_phone') {
                    answers['phoneNumber'] = ans.answer;
                }
                // Try to find position if not named explicitly
                if (!answers['positionApplied'] && (ans.name === 'positionApplied' || (ans.text && ans.text.toLowerCase().includes('position')))) {
                    answers['positionApplied'] = ans.answer;
                }

                // Map File Uploads (Resume)
                if (ans.type === 'control_fileupload') {
                    // JotForm returns file uploads as array of strings (URLs)
                    const files = Array.isArray(ans.answer) ? ans.answer : [ans.answer];
                    if (files.length > 0 && files[0]) {
                        // Check if it looks like a resume
                        const isResume = ans.name?.toLowerCase().includes('resume') ||
                            ans.text?.toLowerCase().includes('resume') ||
                            ans.name?.toLowerCase().includes('cv') ||
                            ans.text?.toLowerCase().includes('cv');

                        if (isResume || !answers['resume_url']) {
                            answers['resume_url'] = files[0];
                        }
                    }
                }
            })
            return { answers, generatedResume }
        }

        const { answers: mainAnswers, generatedResume } = extractAnswers(mainData)
        const applicantEmail = mainAnswers.email
        const applicantName = mainAnswers.fullName // Object { first, last } or string

        // Debug info collector
        const debugInfo: any = {
            targetEmail: applicantEmail,
            targetName: applicantName,
            forms: {}
        }

        // Helper to fetch submissions for a form and find match by email or name
        const fetchMatchingSubmission = async (formId: string, targetEmail: string, targetName?: any) => {
            if (!formId) return null; // Skip if form ID not configured

            try {
                // Build filter to search by email (much more efficient than fetching all)
                let url = `https://api.jotform.com/form/${formId}/submissions?apiKey=${JOTFORM_API_KEY}&orderby=created_at,desc`;

                // If we have an email, try filtering by it first for efficiency
                if (targetEmail) {
                    // Note: JotForm filter syntax varies, trying direct email match
                    // If this doesn't work, fallback to fetching limited results
                    const filter = JSON.stringify({ email: targetEmail });
                    url += `&filter=${encodeURIComponent(filter)}&limit=5`;
                } else {
                    // No email to filter, fetch limited recent submissions
                    url += `&limit=20`;
                }

                const res = await fetch(url)
                if (!res.ok) {
                    debugInfo.forms[formId] = { error: `Fetch failed: ${res.status}` }
                    return null
                }
                const data = await res.json()

                if (!data.content || !Array.isArray(data.content)) {
                    debugInfo.forms[formId] = { error: 'No content' }
                    return null
                }

                // Debug: Capture first submission keys and values to see structure
                if (data.content.length > 0) {
                    const { answers: firstAns } = extractAnswers(data.content[0])
                    debugInfo.forms[formId] = {
                        foundCount: data.content.length,
                        firstSubmissionKeys: Object.keys(firstAns),
                        // Log first 3 values to help debug matching issues
                        sampleValues: Object.values(firstAns).slice(0, 5)
                    }
                }

                // Find match
                const match = data.content.find((sub: any) => {
                    const { answers: ans } = extractAnswers(sub)

                    // Flatten all values to strings for searching
                    const values = Object.values(ans).map(v =>
                        typeof v === 'object' ? JSON.stringify(v).toLowerCase() : String(v).toLowerCase()
                    )

                    // 1. Email Match
                    if (targetEmail) {
                        const emailLower = targetEmail.toLowerCase()
                        const emailMatch = values.some(v => v.includes(emailLower))
                        if (emailMatch) return true
                    }

                    // 2. Name Match (Fallback)
                    if (targetName) {
                        let first = '', last = '';
                        if (typeof targetName === 'object') {
                            first = (targetName.first || '').toLowerCase();
                            last = (targetName.last || '').toLowerCase();
                        } else if (typeof targetName === 'string') {
                            const parts = targetName.split(' ');
                            first = (parts[0] || '').toLowerCase();
                            last = (parts[parts.length - 1] || '').toLowerCase();
                        }

                        if (first && last) {
                            const fullNameStr = `${first} ${last}`

                            // A. Check if full name string exists in any stringified value
                            const simpleMatch = values.some(v => v.includes(fullNameStr))
                            if (simpleMatch) return true

                            // B. Check ALL structured values for a name match
                            const structuredMatch = Object.values(ans).some((val: any) => {
                                if (val && typeof val === 'object' && val.first && val.last) {
                                    return val.first.toLowerCase() === first && val.last.toLowerCase() === last
                                }
                                return false
                            })
                            if (structuredMatch) return true
                        }
                    }

                    return false
                })

                if (match) {
                    return {
                        id: match.id,
                        created_at: match.created_at,
                        status: match.status,
                        url: `https://www.jotform.com/submission/${match.id}`
                    }
                }

                return null
            } catch (e: any) {
                debugInfo.forms[formId] = { error: e.message }
                console.error(`Error fetching form ${formId}:`, e)
                return null
            }
        }

        // Fetch other forms in parallel
        let relatedForms: any = {
            emergency_contact: null,
            i9_eligibility: null,
            vaccination: null,
            licenses: null,
            background_check: null
        }

        // We try to match if we have either email or name
        if (applicantEmail || applicantName) {
            const [emergency, i9, vaccination, licenses, background] = await Promise.all([
                fetchMatchingSubmission(FORMS.EMERGENCY, applicantEmail, applicantName),
                fetchMatchingSubmission(FORMS.I9, applicantEmail, applicantName),
                fetchMatchingSubmission(FORMS.VACCINATION, applicantEmail, applicantName),
                fetchMatchingSubmission(FORMS.LICENSES, applicantEmail, applicantName),
                fetchMatchingSubmission(FORMS.BACKGROUND, applicantEmail, applicantName)
            ])

            relatedForms = {
                emergency_contact: emergency ? { ...emergency, formUrl: `https://form.jotform.com/${FORMS.EMERGENCY}` } : null,
                i9_eligibility: i9 ? { ...i9, formUrl: `https://form.jotform.com/${FORMS.I9}` } : null,
                vaccination: vaccination ? { ...vaccination, formUrl: `https://form.jotform.com/${FORMS.VACCINATION}` } : null,
                licenses: licenses ? { ...licenses, formUrl: `https://form.jotform.com/${FORMS.LICENSES}` } : null,
                background_check: background ? { ...background, formUrl: `https://form.jotform.com/${FORMS.BACKGROUND}` } : null
            }
        }

        const responseData = {
            id: supabaseUuid || mainData.content.id, // Return UUID if available, otherwise JotForm ID
            created_at: mainData.content.created_at,
            status: mainData.content.status,
            answers: mainAnswers,
            resume_url: mainAnswers.resume_url || null,
            resume_text: generatedResume || null,
            ...relatedForms,
            _debug: debugInfo
        }

        return new Response(JSON.stringify(responseData), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
