import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useApplicantDetails } from '@/hooks/useApplicantDetails';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { format } from 'date-fns';
import { ArrowLeft, Mail, Phone, FileText, Calendar, Shield, AlertCircle, CheckCircle, X, ExternalLink, UserPlus, UserCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { EnhancedApplicantSummaryPanel } from '@/components/ai/EnhancedApplicantSummaryPanel';
import { ApplicantTimeline } from '@/components/applicants/ApplicantTimeline';
import { employeeService } from '@/services/employeeService';
import { toast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export function ApplicantDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { data: applicant, isLoading, error } = useApplicantDetails(id);
    const { confirm, confirmState, handleClose, handleConfirm } = useConfirm();

    // Document Viewer State
    const [viewingDoc, setViewingDoc] = useState<{ url: string; title: string } | null>(null);

    // Request Loading State
    const [requestLoading, setRequestLoading] = useState<Record<string, boolean>>({});

    // Move to Employee Loading State
    const [moveToEmployeeLoading, setMoveToEmployeeLoading] = useState(false);
    const [hasEmployeeRecord, setHasEmployeeRecord] = useState(false);

    // Check if employee record already exists
    useEffect(() => {
        const checkEmployeeExists = async () => {
            if (!applicant?.id) return;

            const { data } = await supabase
                .from('people')
                .select('id')
                .eq('applicant_id', applicant.id)
                .eq('type', 'employee')
                .maybeSingle();

            setHasEmployeeRecord(!!data);
        };

        checkEmployeeExists();
    }, [applicant?.id]);

    const handleRequestRequirement = async (reqKey: string, reqLabel: string, formUrl: string) => {
        if (!applicant) return;

        if (!formUrl) {
            toast.error('Form URL not found for this requirement.');
            return;
        }

        const email = getAnswer('email');
        if (!email || email === 'N/A' || !email.includes('@')) {
            toast.error('Valid applicant email is required to send a request.');
            return;
        }

        setRequestLoading(prev => ({ ...prev, [reqKey]: true }));
        try {
            const fullNameAnswer = applicant.answers?.fullName;
            const firstName = fullNameAnswer?.first || applicant.answers?.['q3_fullName']?.first || 'Unknown';
            const lastName = fullNameAnswer?.last || applicant.answers?.['q3_fullName']?.last || 'Applicant';
            const name = `${firstName} ${lastName}`;

            const { error } = await supabase.functions.invoke('sendRequirementRequest', {
                body: {
                    email: email,
                    name: name,
                    formName: reqLabel,
                    formUrl: formUrl
                }
            });

            if (error) {
                console.error('Request Error Response:', error);
                let errorMessage = error.message || 'Unknown error occurred';
                try {
                    const parsed = JSON.parse(error.message);
                    if (parsed.error) errorMessage = parsed.error;
                } catch (e) { /* ignore */ }
                throw new Error(errorMessage);
            }

            toast.success(`Request for ${reqLabel} sent successfully!`);
        } catch (err: any) {
            console.error('Request Error:', err);
            toast.error('Failed to send request: ' + err.message);
        } finally {
            setRequestLoading(prev => ({ ...prev, [reqKey]: false }));
        }
    };

    // Handle "new" applicant route
    if (id === 'new') {
        return (
            <div className="space-y-5 animate-fade-in">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/applicants')}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                    >
                        <ArrowLeft size={16} strokeWidth={2} />
                    </button>
                    <div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
                            Add Applicant
                        </h1>
                    </div>
                </div>
                <div className="bg-card border border-border rounded-lg p-12 text-center">
                    <UserPlus size={36} className="mx-auto mb-4 text-muted-foreground/30" strokeWidth={1.25} />
                    <h2 className="text-[15px] font-semibold text-foreground mb-2">
                        Applicants are added through JotForm
                    </h2>
                    <p className="text-[13px] text-muted-foreground mb-6 max-w-md mx-auto">
                        New applicants submit their information via the JotForm application system. Use the Sync button on the list page to import them.
                    </p>
                    <button
                        onClick={() => navigate('/applicants')}
                        className="h-8 px-4 bg-primary text-primary-foreground rounded-md text-[13px] font-semibold hover:bg-primary/90 transition-colors"
                    >
                        View Applicants
                    </button>
                </div>
            </div>
        );
    }

    if (isLoading) return (
        <div className="flex items-center justify-center h-64">
            <div className="w-5 h-5 rounded-full border-2 border-border border-t-primary animate-spin" />
        </div>
    );
    if (error) return (
            <div className="severity-critical rounded-md border border-destructive/20 bg-destructive/6 p-4">
                <p className="text-[13px] font-semibold text-destructive">
                Failed to load applicant: {error.message}
            </p>
        </div>
    );
    if (!applicant) return (
        <div className="p-8 text-center">
            <p className="text-[13px] text-muted-foreground/50">Applicant not found</p>
        </div>
    );

    // Helper to extract answer safely
    const getAnswer = (key: string) => applicant.answers?.[key] || 'N/A';
    const fullName = applicant.answers?.fullName || applicant.answers?.['q3_fullName'] || {};
    const applicantFirstName = fullName.first || 'Applicant';
    const applicantLastName = fullName.last || '';

    const handleSendOffer = () => {
        if (!applicant) return;

        const fullNameAnswer = applicant.answers?.fullName;
        const firstName = fullNameAnswer?.first || applicant.answers?.['q3_fullName']?.first || 'Unknown';
        const lastName = fullNameAnswer?.last || applicant.answers?.['q3_fullName']?.last || 'Applicant';

        navigate('/offers/new', {
            state: {
                applicant: {
                    id: applicant.id,
                    first_name: firstName,
                    last_name: lastName,
                    email: getAnswer('email'),
                },
                autoDraft: true
            }
        });
    };

    // Status Update Logic
    const handleStatusUpdate = async (newStatus: string) => {
        if (!applicant) return;

        try {
            const { error } = await supabase
                .from('applicants')
                .update({ status: newStatus })
                .eq('id', applicant.id);

            if (error) throw error;

            await queryClient.invalidateQueries({ queryKey: ['applicant', id] });
            toast.success(`Status updated to ${newStatus}`);
        } catch (err: any) {
            console.error('Status Update Error:', err);
            toast.error('Failed to update status: ' + err.message);
        }
    };

    // Move to Employee Logic
    const handleMoveToEmployee = async () => {
        if (!applicant) return;

        const confirmed = await confirm({
            title: 'Move to Employees',
            description: `Are you sure you want to move ${getAnswer('fullName')?.first} ${getAnswer('fullName')?.last} to the Employees table?\n\nThis will:\n- Create an employee record\n- Set applicant status to 'Hired'\n- Mark employee as 'Onboarding' (will change to 'Active' when all courses are completed)`,
            confirmText: 'Move to Employees',
        });

        if (!confirmed) return;

        setMoveToEmployeeLoading(true);
        try {
            const employee = await employeeService.moveApplicantToEmployee(applicant.id);

            await queryClient.invalidateQueries({ queryKey: ['applicant', id] });
            await queryClient.invalidateQueries({ queryKey: ['applicants'] });
            await queryClient.invalidateQueries({ queryKey: ['employees'] });

            // Mark that employee record now exists
            setHasEmployeeRecord(true);

            toast.success(`Successfully moved to Employees! Employee ID: ${employee.employee_id}`);

            // Optionally navigate to employee page after creation
            navigate('/employees');
        } catch (err: any) {
            console.error('Move to Employee Error:', err);
            toast.error('Failed to move to employees: ' + err.message);
        } finally {
            setMoveToEmployeeLoading(false);
        }
    };

    return (
        <div className="space-y-5 animate-fade-in relative">
            {/* ── Page header ── */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/applicants')}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                    >
                        <ArrowLeft size={16} strokeWidth={2} />
                    </button>
                    <div>
                        <h1
                            className="text-foreground"
                            style={{ fontFamily: 'var(--font-display)', fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05 }}
                        >
                            {applicantFirstName} {applicantLastName}
                        </h1>
                        <p className="mt-0.5 text-muted-foreground/80" style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', letterSpacing: '-0.01em' }}>
                            Applicant Profile
                        </p>
                    </div>
                </div>
                <StatusBadge status={applicant.status} />
            </div>

            {/* ── Action bar ── */}
            <div className="flex gap-2 flex-wrap">
                <button
                    onClick={handleSendOffer}
                    className="flex items-center gap-2 h-8 px-4 rounded-md bg-[var(--severity-low)] text-white text-[13px] font-semibold transition-colors hover:opacity-90"
                >
                    Send Offer
                </button>
                <button
                    onClick={handleMoveToEmployee}
                    disabled={moveToEmployeeLoading || hasEmployeeRecord}
                    className="flex items-center gap-2 h-8 px-4 bg-primary text-primary-foreground rounded-md text-[13px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <UserCheck size={13} strokeWidth={2} />
                    {moveToEmployeeLoading ? 'Moving…' : hasEmployeeRecord ? 'Already Employee' : 'Move to Employees'}
                </button>
                <button
                    onClick={() => handleStatusUpdate('Interview')}
                    className="flex items-center gap-2 h-8 px-4 rounded-md bg-[var(--severity-medium)] text-white text-[13px] font-semibold transition-colors hover:opacity-90"
                >
                    Interview
                </button>
                <button
                    onClick={() => handleStatusUpdate('Rejected')}
                    className="flex items-center gap-2 h-8 px-4 rounded-md bg-destructive text-white text-[13px] font-semibold transition-colors hover:opacity-90"
                >
                    Reject
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Main Info Column */}
                <div className="lg:col-span-2 space-y-5">
                    {/* Personal Information */}
                    <div className="bg-card border border-border rounded-lg overflow-hidden">
                        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border">
                            <FileText size={13} strokeWidth={2} className="text-primary" />
                            <h3 className="text-[13px] font-semibold text-foreground">Personal Information</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y divide-border/50 md:divide-y-0">
                            {[
                                { label: 'Email', icon: Mail, value: getAnswer('email') },
                                { label: 'Phone', icon: Phone, value: getAnswer('phoneNumber')?.full || getAnswer('phoneNumber') },
                                { label: 'Position Applied', icon: FileText, value: getAnswer('positionApplied') },
                                { label: 'Date Applied', icon: Calendar, value: format(new Date(applicant.created_at), 'MMM d, yyyy') },
                            ].map(({ label, icon: Icon, value }) => (
                                <div key={label} className="px-5 py-3.5">
                                    <p className="zone-label mb-1">{label}</p>
                                    <div className="flex items-center gap-2">
                                        <Icon size={12} strokeWidth={1.75} className="text-muted-foreground/40 flex-shrink-0" />
                                        <span className="text-[13px] font-medium text-foreground">{value}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Requirements */}
                    <div className="bg-card border border-border rounded-lg overflow-hidden">
                        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border">
                            <Shield size={13} strokeWidth={2} className="text-primary" />
                            <h3 className="text-[13px] font-semibold text-foreground">Requirements</h3>
                        </div>
                        <div className="divide-y divide-border/50">
                            {[
                                { key: 'emergency_contact', label: 'Emergency Contact Form' },
                                { key: 'i9_eligibility', label: 'I-9 Eligibility Form' },
                                { key: 'vaccination', label: 'Vaccination Form' },
                                { key: 'licenses', label: 'Licenses & Certifications' },
                                { key: 'background_check', label: 'Background Check' },
                            ].map((req) => {
                                const submission = applicant[req.key as keyof typeof applicant];
                                const isSubmitted = !!submission?.id;

                                return (
                                    <div key={req.key} className="flex items-center justify-between px-5 py-3 hover:bg-secondary/30 transition-colors">
                                        <div className="flex items-center gap-3">
                                            {isSubmitted ? (
                                                <CheckCircle size={14} strokeWidth={2} className="flex-shrink-0 text-[var(--severity-low)]" />
                                            ) : (
                                                <AlertCircle size={14} strokeWidth={2} className="flex-shrink-0 text-[var(--severity-medium)]" />
                                            )}
                                            <div>
                                                <p className="text-[13px] font-medium text-foreground">{req.label}</p>
                                                <p className="text-[11px] text-muted-foreground/55 mt-0.5">
                                                    {isSubmitted
                                                        ? `Submitted ${new Date(submission.created_at).toLocaleDateString()}`
                                                        : 'Not submitted yet'}
                                                </p>
                                            </div>
                                        </div>
                                        {isSubmitted ? (
                                            <button
                                                onClick={() => setViewingDoc({ url: submission.url, title: req.label })}
                                                className="flex items-center gap-1 text-[12px] font-semibold text-primary hover:text-primary/70 transition-colors"
                                            >
                                                View <ExternalLink size={11} strokeWidth={2} />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleRequestRequirement(req.key, req.label, submission?.formUrl)}
                                                disabled={requestLoading[req.key]}
                                                className="text-[12px] font-semibold text-primary hover:text-primary/70 transition-colors disabled:opacity-40"
                                            >
                                                Request
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Application Timeline */}
                    <ApplicantTimeline applicant={applicant} />
                </div>

                {/* Right sidebar */}
                <div className="space-y-5">
                    <EnhancedApplicantSummaryPanel applicant={applicant} />
                </div>
            </div>

            {/* Document Viewer Modal */}
            {viewingDoc && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
                    <div className="bg-card border border-border w-full h-full max-w-6xl rounded-lg overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                            <h3 className="text-[13px] font-semibold text-foreground">{viewingDoc.title}</h3>
                            <button
                                onClick={() => setViewingDoc(null)}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                            >
                                <X size={15} strokeWidth={2} />
                            </button>
                        </div>
                        <div className="flex-1 bg-muted relative">
                            <iframe src={viewingDoc.url} className="w-full h-full border-0" title={viewingDoc.title} />
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Dialog */}
            <ConfirmDialog
                isOpen={confirmState.isOpen}
                onClose={handleClose}
                onConfirm={handleConfirm}
                title={confirmState.title}
                description={confirmState.description}
                confirmText={confirmState.confirmText}
                cancelText={confirmState.cancelText}
                variant={confirmState.variant}
            />
        </div>
    );
}
