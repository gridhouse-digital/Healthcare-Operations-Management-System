import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const teamSizeOptions = ['1-10', '11-25', '26-50', '51-100', '100+'] as const;

const requestAccessSchema = z.object({
    organizationName: z.string().trim().min(2, 'Organization name is required.').max(120, 'Use 120 characters or fewer.'),
    primaryContactName: z.string().trim().min(2, 'Primary contact name is required.').max(120, 'Use 120 characters or fewer.'),
    workEmail: z.string().trim().email('Enter a valid work email address.').max(160, 'Use 160 characters or fewer.'),
    phone: z.string().trim().max(30, 'Use 30 characters or fewer.').optional(),
    teamSize: z.string().refine(
        (value): value is (typeof teamSizeOptions)[number] => teamSizeOptions.includes(value as (typeof teamSizeOptions)[number]),
        'Select your estimated team size.',
    ),
    integrationNeeds: z.string().trim().max(500, 'Use 500 characters or fewer.').optional(),
    notes: z.string().trim().max(1000, 'Use 1000 characters or fewer.').optional(),
    website: z.string().trim().max(200).optional(),
});

type RequestAccessFormValues = {
    organizationName: string;
    primaryContactName: string;
    workEmail: string;
    phone: string;
    teamSize: '1-10' | '11-25' | '26-50' | '51-100' | '100+' | '';
    integrationNeeds: string;
    notes: string;
    website: string;
};

interface SubmittedRequestState {
    organizationName: string;
    workEmail: string;
}

interface EdgeFunctionEnvelope {
    error?: {
        message?: string;
        details?: {
            requestRetained?: boolean;
        };
    };
}

function cleanOptional(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeValues(values: RequestAccessFormValues) {
    return {
        organizationName: values.organizationName.trim(),
        primaryContactName: values.primaryContactName.trim(),
        workEmail: values.workEmail.trim().toLowerCase(),
        phone: cleanOptional(values.phone),
        teamSize: values.teamSize,
        integrationNeeds: cleanOptional(values.integrationNeeds),
        notes: cleanOptional(values.notes),
        website: values.website.trim(),
    };
}

function readEnvelopeMessage(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const envelope = payload as EdgeFunctionEnvelope;
    const message = envelope.error?.message;
    if (!message) {
        return null;
    }

    return envelope.error?.details?.requestRetained
        ? `${message} Your request has been retained for manual recovery.`
        : message;
}

async function extractInvokeErrorMessage(error: unknown, data: unknown): Promise<string> {
    const dataMessage = readEnvelopeMessage(data);
    if (dataMessage) {
        return dataMessage;
    }

    const response = (error as { context?: Response } | null)?.context;
    if (response instanceof Response) {
        const body = await response.json().catch(() => null);
        const responseMessage = readEnvelopeMessage(body);
        if (responseMessage) {
            return responseMessage;
        }
    }

    if (error instanceof Error && error.message) {
        return error.message;
    }

    return 'Unable to submit your access request right now. Please try again later.';
}

export function RequestAccessPage() {
    const {
        register,
        handleSubmit,
        setError,
        clearErrors,
        formState: { errors, isSubmitting },
    } = useForm<RequestAccessFormValues>({
        defaultValues: {
            organizationName: '',
            primaryContactName: '',
            workEmail: '',
            phone: '',
            teamSize: '',
            integrationNeeds: '',
            notes: '',
            website: '',
        },
    });

    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submittedRequest, setSubmittedRequest] = useState<SubmittedRequestState | null>(null);

    const handleRequestAccess = async (values: RequestAccessFormValues) => {
        clearErrors();
        setSubmitError(null);

        const normalizedValues = normalizeValues(values);
        const parsed = requestAccessSchema.safeParse(normalizedValues);

        if (!parsed.success) {
            for (const issue of parsed.error.issues) {
                const fieldName = issue.path[0];
                if (typeof fieldName === 'string') {
                    setError(fieldName as keyof RequestAccessFormValues, {
                        type: 'manual',
                        message: issue.message,
                    });
                }
            }
            return;
        }

        const { data, error } = await supabase.functions.invoke('request-access', {
            body: parsed.data,
        });

        if (error || (data as EdgeFunctionEnvelope | null)?.error) {
            setSubmitError(await extractInvokeErrorMessage(error, data));
            return;
        }

        setSubmittedRequest({
            organizationName: parsed.data.organizationName,
            workEmail: parsed.data.workEmail,
        });
    };

    return (
        <div className="auth-shell px-5">
            <div className="auth-grid" />
            <div className="relative w-full max-w-[560px]">
                <div className="auth-card">
                    {submittedRequest ? (
                        <div className="px-8 py-10 text-center">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[color:var(--severity-low)]/30 bg-[color:var(--severity-low)]/10">
                                <CheckCircle2 className="h-7 w-7 text-[color:var(--severity-low)]" />
                            </div>
                            <h1 className="auth-title mt-6">Request Received</h1>
                            <p className="auth-meta mt-3">
                                We saved {submittedRequest.organizationName}&apos;s request and
                                notified the operations team. They will review it manually and
                                follow up at {submittedRequest.workEmail}. A confirmation email
                                should also be on its way to the requester.
                            </p>
                            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                                <Link
                                    to="/login"
                                    className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-[13px] font-semibold tracking-[0.01em] text-primary-foreground transition-all hover:bg-primary/90"
                                >
                                    Return to Login
                                </Link>
                                <button
                                    type="button"
                                    className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-5 text-[13px] font-semibold tracking-[0.01em] text-foreground transition-colors hover:bg-secondary"
                                    onClick={() => {
                                        setSubmittedRequest(null);
                                        setSubmitError(null);
                                    }}
                                >
                                    Submit Another Request
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="border-b border-border px-8 pb-6 pt-8 text-center">
                                <img
                                    src="https://bucket-ivvnia.s3.amazonaws.com/wp-content/uploads/2025/06/02222211/Prolific-Homecare-Logo.png"
                                    alt="HOMS"
                                    className="mx-auto mb-5 h-14 w-auto object-contain"
                                />
                                <h1 className="auth-title">Request Access</h1>
                                <p className="auth-meta mt-2">
                                    New organizations can submit onboarding details here.
                                    Tenant creation and approval are still handled manually.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit(handleRequestAccess)} noValidate className="space-y-5 px-8 py-6">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <input
                                        {...register('website')}
                                        type="text"
                                        tabIndex={-1}
                                        autoComplete="off"
                                        className="hidden"
                                        aria-hidden="true"
                                    />

                                    <div className="sm:col-span-2">
                                        <label className="form-label">Organization Name</label>
                                        <input
                                            {...register('organizationName')}
                                            type="text"
                                            placeholder="Prolific Homecare East"
                                            className="saas-input"
                                        />
                                        {errors.organizationName?.message && (
                                            <p className="mt-1.5 text-[12px] text-destructive">{errors.organizationName.message}</p>
                                        )}
                                    </div>

                                    <div>
                                        <label className="form-label">Primary Contact</label>
                                        <input
                                            {...register('primaryContactName')}
                                            type="text"
                                            placeholder="Jordan Smith"
                                            className="saas-input"
                                        />
                                        {errors.primaryContactName?.message && (
                                            <p className="mt-1.5 text-[12px] text-destructive">{errors.primaryContactName.message}</p>
                                        )}
                                    </div>

                                    <div>
                                        <label className="form-label">Work Email</label>
                                        <input
                                            {...register('workEmail')}
                                            type="email"
                                            autoComplete="email"
                                            placeholder="jordan@agency.com"
                                            className="saas-input"
                                        />
                                        {errors.workEmail?.message && (
                                            <p className="mt-1.5 text-[12px] text-destructive">{errors.workEmail.message}</p>
                                        )}
                                    </div>

                                    <div>
                                        <label className="form-label">Phone</label>
                                        <input
                                            {...register('phone')}
                                            type="tel"
                                            autoComplete="tel"
                                            placeholder="(555) 555-5555"
                                            className="saas-input"
                                        />
                                        {errors.phone?.message && (
                                            <p className="mt-1.5 text-[12px] text-destructive">{errors.phone.message}</p>
                                        )}
                                    </div>

                                    <div>
                                        <label className="form-label">Estimated Team Size</label>
                                        <select {...register('teamSize')} className="saas-input appearance-none">
                                            <option value="">Select team size</option>
                                            {teamSizeOptions.map((option) => (
                                                <option key={option} value={option}>
                                                    {option}
                                                </option>
                                            ))}
                                        </select>
                                        {errors.teamSize?.message && (
                                            <p className="mt-1.5 text-[12px] text-destructive">{errors.teamSize.message}</p>
                                        )}
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label className="form-label">Integration Needs</label>
                                        <textarea
                                            {...register('integrationNeeds')}
                                            placeholder="BambooHR, JazzHR, WordPress/LearnDash, or other systems you need connected."
                                            className="saas-input min-h-[104px] resize-y py-3"
                                        />
                                        {errors.integrationNeeds?.message && (
                                            <p className="mt-1.5 text-[12px] text-destructive">{errors.integrationNeeds.message}</p>
                                        )}
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label className="form-label">Notes</label>
                                        <textarea
                                            {...register('notes')}
                                            placeholder="Share launch timing, compliance priorities, or anything the ops team should know."
                                            className="saas-input min-h-[120px] resize-y py-3"
                                        />
                                        {errors.notes?.message && (
                                            <p className="mt-1.5 text-[12px] text-destructive">{errors.notes.message}</p>
                                        )}
                                    </div>
                                </div>

                                {submitError && (
                                    <div className="rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2.5">
                                        <p className="text-[12px] text-destructive">{submitError}</p>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-[13px] font-semibold tracking-[0.01em] text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-55"
                                >
                                    {isSubmitting ? 'Submitting Request...' : 'Submit Access Request'}
                                </button>

                                <div className="pt-1 text-center">
                                    <Link
                                        to="/login"
                                        className="inline-flex items-center gap-1.5 text-[12px] font-medium tracking-[0.01em] text-primary transition-colors hover:text-primary/80"
                                    >
                                        <ArrowLeft size={12} />
                                        Back to Login
                                    </Link>
                                </div>
                            </form>
                        </>
                    )}
                </div>

                <p className="mt-5 text-center text-[11px] tracking-[0.06em] text-muted-foreground/55">
                    Request access does not create a workspace automatically. The operations team
                    reviews each submission before onboarding.
                </p>
            </div>
        </div>
    );
}
