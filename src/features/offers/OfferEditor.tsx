import { useState, useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { offerService } from '@/services/offerService';
import { applicantService } from '@/services/applicantService';
import type { Applicant } from '@/types';
import { ArrowLeft, Save, User, Briefcase, DollarSign, Calendar } from 'lucide-react';
import { OfferLetterDraftPanel } from '@/components/ai/OfferLetterDraftPanel';
import { toast } from '@/hooks/useToast';
import { AppSelect } from '@/components/ui/AppSelect';

interface OfferFormData {
    applicant_id: string;
    position_title: string;
    start_date: string;
    salary: number;
}

const fieldWithIconCls = "saas-input pl-9";
const labelCls = "form-label";

export function OfferEditor() {
    const navigate = useNavigate();
    const location = useLocation();
    const { id } = useParams();
    const [applicants, setApplicants] = useState<Applicant[]>([]);
    const [loading, setLoading] = useState(false);

    const { control, register, handleSubmit, watch, formState: { errors }, reset, setValue } = useForm<OfferFormData>();

    useEffect(() => { loadApplicants(); }, []);
    useEffect(() => { if (id) loadOffer(id); }, [id]);

    useEffect(() => {
        if (location.state?.applicant && applicants.length > 0) {
            const app = location.state.applicant;
            const exists = applicants.find(a => a.id === app.id);
            if (!exists) {
                setApplicants(prev => [...prev, {
                    id: app.id,
                    first_name: app.first_name,
                    last_name: app.last_name,
                    email: app.email,
                    status: 'New',
                    created_at: new Date().toISOString()
                } as unknown as Applicant]);
            }
            setValue('applicant_id', app.id);
        }
    }, [applicants.length, location.state, setValue]);

    const loadApplicants = async () => {
        const data = await applicantService.getApplicants();
        setApplicants(data.filter(app => app.status !== 'Hired'));
    };

    const loadOffer = async (offerId: string) => {
        const data = await offerService.getOfferById(offerId);
        reset({
            applicant_id: data.applicant_id,
            position_title: data.position_title,
            start_date: data.start_date,
            salary: data.salary,
        });
    };

    const onSubmit = async (data: OfferFormData) => {
        setLoading(true);
        try {
            if (id) {
                await offerService.updateOffer(id, { ...data, status: 'Draft' });
            } else {
                await offerService.createOffer({ ...data, status: 'Draft' });
            }
            navigate('/offers');
        } catch (error) {
            console.error('Failed to save offer', error);
            toast.error('Failed to save offer. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => navigate('/offers')}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                 aria-label="Back">
                    <ArrowLeft size={14} aria-hidden="true" />
                </button>
                <div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.875rem', fontWeight: 500, lineHeight: 1.05 }}
                        className="text-foreground">
                        {id ? 'Edit Offer' : 'Create Offer'}
                    </h1>
                    <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', }}
                        className="text-muted-foreground mt-0.5">
                        {id ? 'Update offer details' : 'New offer letter'}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Form */}
                <div className="lg:col-span-2 bg-card border border-border rounded-lg p-6">
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                        {/* Applicant */}
                        <div>
                            <label className={labelCls}>Applicant</label>
                            <div className="relative">
                                <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
                                <Controller
                                    control={control}
                                    name="applicant_id"
                                    rules={{ required: 'Applicant is required' }}
                                    render={({ field }) => (
                                        <AppSelect
                                            value={field.value ?? ''}
                                            onValueChange={field.onChange}
                                            placeholder="Select an applicant"
                                            options={applicants.map((app) => ({
                                                value: app.id,
                                                label: `${app.first_name} ${app.last_name} (${app.email})`,
                                            }))}
                                            className={fieldWithIconCls + ' justify-between'}
                                        />
                                    )}
                                />
                            </div>
                            {errors.applicant_id && (
                                <p className="mt-1.5 text-xs text-destructive">{errors.applicant_id.message}</p>
                            )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            {/* Position Title */}
                            <div>
                                <label className={labelCls}>Position Title</label>
                                <div className="relative">
                                    <Briefcase size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
                                    <input
                                        type="text"
                                        placeholder="e.g. Registered Nurse"
                                        {...register('position_title', { required: 'Position title is required' })}
                                        className={fieldWithIconCls}
                                    />
                                </div>
                                {errors.position_title && (
                                    <p className="mt-1.5 text-xs text-destructive">{errors.position_title.message}</p>
                                )}
                            </div>

                            {/* Salary */}
                            <div>
                                <label className={labelCls}>Pay Rate</label>
                                <div className="relative">
                                    <DollarSign size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
                                    <input
                                        type="number"
                                        placeholder="0.00"
                                        {...register('salary', { required: 'Salary is required', min: 0 })}
                                        className={fieldWithIconCls}
                                    />
                                </div>
                            </div>

                            {/* Start Date */}
                            <div>
                                <label className={labelCls}>Start Date</label>
                                <div className="relative">
                                    <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
                                    <input
                                        type="date"
                                        {...register('start_date', { required: 'Start date is required' })}
                                        className={fieldWithIconCls}
                                    />
                                </div>
                                {errors.start_date && (
                                    <p className="mt-1.5 text-xs text-destructive">{errors.start_date.message}</p>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-5 border-t border-border">
                            <button
                                type="button"
                                onClick={() => navigate('/offers')}
                                className="inline-flex items-center h-8 px-4 rounded-full border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="inline-flex items-center gap-2 h-8 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-accent-hi transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Save size={14} aria-hidden="true" />
                                {loading ? 'Saving…' : 'Save Offer'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* AI Assistant */}
                <div>
                    <OfferLetterDraftPanel
                        employeeDetails={{
                            name: applicants.find(a => a.id === watch('applicant_id')) ?
                                `${applicants.find(a => a.id === watch('applicant_id'))?.first_name} ${applicants.find(a => a.id === watch('applicant_id'))?.last_name}` : '',
                            position: watch('position_title') || 'TBD',
                            rate: watch('salary')?.toString() || 'TBD',
                            startDate: watch('start_date') || 'TBD',
                            email: applicants.find(a => a.id === watch('applicant_id'))?.email
                        }}
                        autoDraft={!!location.state?.autoDraft}
                    />
                </div>
            </div>
        </div>
    );
}
