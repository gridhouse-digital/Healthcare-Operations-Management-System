import { createClient } from 'jsr:@supabase/supabase-js@2'
import { render } from 'npm:@react-email/render@0.0.7'
import * as React from 'npm:react@18.3.1'
import { OfferEmail } from '../_shared/emails/OfferEmail.tsx'
import { tenantGuard } from '../_shared/tenant-guard.ts'
import { errorResponse, handleError } from '../_shared/error-response.ts'
import { handleCors, withCors } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PGCRYPTO_KEY = Deno.env.get('PGCRYPTO_ENCRYPTION_KEY') ?? ''

type SendOfferBody = {
  jotformSubmissionId?: string
  position?: string
  salary?: string
  startDate?: string
  email?: string
  firstName?: string
  lastName?: string
}

async function decryptBrevoKey(
  admin: ReturnType<typeof createClient>,
  encrypted: string,
): Promise<string> {
  const { data, error } = await admin.rpc('pgp_sym_decrypt_text', {
    ciphertext: encrypted,
    passphrase: PGCRYPTO_KEY,
  })
  if (error) throw new Error(`Brevo key decrypt failed: ${error.message}`)
  return data as string
}

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req)
  if (preflight) return preflight

  try {
    const ctx = tenantGuard(req)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    const body = await req.json() as SendOfferBody
    const {
      jotformSubmissionId,
      position,
      salary,
      startDate,
      email,
      firstName,
      lastName,
    } = body

    if (!email) {
      return withCors(
        errorResponse('BAD_REQUEST', 'Email is required', 400),
        req,
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    let { data: applicant, error: fetchError } = await admin
      .from('applicants')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('airtable_id', jotformSubmissionId ?? '')
      .maybeSingle()

    if (!applicant && !fetchError) {
      ;({ data: applicant, error: fetchError } = await admin
        .from('applicants')
        .select('id')
        .eq('tenant_id', ctx.tenantId)
        .eq('email', normalizedEmail)
        .maybeSingle())
    }

    if (fetchError) throw new Error(`Failed to fetch applicant: ${fetchError.message}`)

    let applicantId = applicant?.id

    if (!applicantId) {
      const { data: newApplicant, error: createError } = await admin
        .from('applicants')
        .insert({
          tenant_id: ctx.tenantId,
          source: 'jotform',
          email: normalizedEmail,
          full_name: `${firstName ?? ''} ${lastName ?? ''}`.trim() || null,
          position_applied: position ?? null,
          status: 'Offer',
          airtable_id: jotformSubmissionId ?? null,
        })
        .select('id')
        .single()

      if (createError) throw new Error(`Failed to create applicant: ${createError.message}`)
      applicantId = newApplicant.id
    } else {
      const { error: updateError } = await admin
        .from('applicants')
        .update({
          status: 'Offer',
          email: normalizedEmail,
          full_name: `${firstName ?? ''} ${lastName ?? ''}`.trim() || null,
          airtable_id: jotformSubmissionId ?? null,
        })
        .eq('tenant_id', ctx.tenantId)
        .eq('id', applicantId)

      if (updateError) throw new Error(`Failed to update applicant: ${updateError.message}`)
    }

    const { data: offer, error: offerError } = await admin
      .from('offers')
      .insert({
        tenant_id: ctx.tenantId,
        applicant_id: applicantId,
        position_title: position,
        salary,
        start_date: startDate,
        status: 'Pending_Approval',
        secure_token: crypto.randomUUID(),
        created_by: ctx.userId,
      })
      .select()
      .eq('tenant_id', ctx.tenantId)
      .single()

    if (offerError) throw new Error(`Failed to create offer: ${offerError.message}`)

    const { data: tenantSettings } = await admin
      .from('tenant_settings')
      .select('brevo_api_key_encrypted, logo_light')
      .eq('tenant_id', ctx.tenantId)
      .single()

    let brevoApiKey: string | null = null
    const logoUrl = tenantSettings?.logo_light

    if (tenantSettings?.brevo_api_key_encrypted) {
      brevoApiKey = await decryptBrevoKey(admin, tenantSettings.brevo_api_key_encrypted)
    }

    if (brevoApiKey) {
      const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': brevoApiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: 'Prolific Homecare HR',
            email: 'admin@prolifichcs.com',
          },
          to: [{ email: normalizedEmail, name: `${firstName ?? ''} ${lastName ?? ''}`.trim() }],
          subject: `Job Offer: ${position ?? 'Position'} at Prolific Homecare`,
          htmlContent: await render(
            React.createElement(OfferEmail, {
              applicantName: `${firstName ?? ''} ${lastName ?? ''}`.trim(),
              position,
              startDate,
              dailyRate: salary,
              offerUrl: `https://prolific-hr.com/offers/${offer.secure_token}`,
              logoUrl: logoUrl || undefined,
            }),
          ),
        }),
      })

      if (!emailResponse.ok) {
        console.error('Brevo API Error:', await emailResponse.text())
      }
    }

    return withCors(
      new Response(JSON.stringify({ success: true, offer }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
      req,
    )
  } catch (err) {
    return withCors(handleError(err), req)
  }
})
