import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { offerService } from '@/services/offerService';
import { employeeService } from '@/services/employeeService';
import type { Offer } from '@/types';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { format } from 'date-fns';
import { Eye, Edit, FileText, Send, UserCheck, Trash2, Plus } from 'lucide-react';
import { SlideOver } from '@/components/ui/SlideOver';
import { toast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type OfferTab = 'Draft' | 'Pending Approval' | 'Sent' | 'Accepted' | 'Declined';

export function OfferList() {
    const [offers, setOffers] = useState<Offer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const navigate = useNavigate();
    const { confirm, confirmState, handleClose, handleConfirm } = useConfirm();

    const [activeTab, setActiveTab] = useState<OfferTab>('Pending Approval');
    const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);

    const tabs: OfferTab[] = ['Draft', 'Pending Approval', 'Sent', 'Accepted', 'Declined'];

    useEffect(() => { loadOffers(); }, []);

    const loadOffers = async () => {
        try {
            const data = await offerService.getOffers();
            setOffers(data);
        } catch (err) {
            setError('Failed to load offers');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSend = async (offer: Offer) => {
        const confirmed = await confirm({
            title: 'Send Offer',
            description: `Are you sure you want to send this offer to ${offer.applicant?.first_name}?`,
            confirmText: 'Send Offer',
        });
        if (!confirmed) return;

        setProcessingId(offer.id);
        try {
            await offerService.updateStatus(offer.id, 'Sent');
            await loadOffers();
            toast.success('Offer sent successfully!');
            setSelectedOffer(null);
        } catch (err) {
            toast.error('Failed to send offer.');
            console.error(err);
        } finally {
            setProcessingId(null);
        }
    };

    const handleOnboard = async (offer: Offer) => {
        const confirmed = await confirm({
            title: 'Onboard Employee',
            description: `Are you sure you want to onboard ${offer.applicant?.first_name}? This will create an employee record.`,
            confirmText: 'Onboard',
        });
        if (!confirmed) return;

        setProcessingId(offer.id);
        try {
            await employeeService.createEmployeeFromApplicant(offer.applicant_id, {
                position: offer.position_title,
                start_date: offer.start_date,
                salary: offer.salary
            });
            toast.success('Employee onboarded successfully!');
            navigate('/employees');
        } catch (err) {
            toast.error('Failed to onboard employee.');
            console.error(err);
        } finally {
            setProcessingId(null);
        }
    };

    const handleDelete = async (offer: Offer) => {
        const confirmed = await confirm({
            title: 'Delete Offer',
            description: `Are you sure you want to delete this offer for ${offer.applicant?.first_name} ${offer.applicant?.last_name}? This action cannot be undone.`,
            confirmText: 'Delete',
            variant: 'danger',
        });
        if (!confirmed) return;

        setProcessingId(offer.id);
        try {
            await offerService.deleteOffer(offer.id);
            await loadOffers();
            toast.success('Offer deleted successfully!');
            setSelectedOffer(null);
        } catch (err) {
            toast.error('Failed to delete offer.');
            console.error(err);
        } finally {
            setProcessingId(null);
        }
    };

    const handleEdit = (offerId: string) => navigate(`/offers/${offerId}/edit`);

    const filteredOffers = offers.filter(offer => {
        if (activeTab === 'Pending Approval' && offer.status === 'Pending_Approval') return true;
        return offer.status === activeTab;
    });

    const tabCount = (tab: OfferTab) => offers.filter(o => {
        if (tab === 'Pending Approval' && o.status === 'Pending_Approval') return true;
        return o.status === tab;
    }).length;

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <span className="text-[13px] text-muted-foreground font-mono uppercase tracking-[0.06em]">Loading offers…</span>
        </div>
    );
    if (error) return (
        <div className="flex items-center justify-center py-20">
            <span className="text-[13px] text-[hsl(4,82%,52%)]">{error}</span>
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pl-1">
                <div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15 }}
                        className="text-foreground">
                        Offers
                    </h1>
                    <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', letterSpacing: '-0.01em' }}
                        className="text-muted-foreground mt-1">
                        {offers.length} offer letters
                    </p>
                </div>
                <button
                    onClick={() => navigate('/offers/new')}
                    className="inline-flex items-center gap-2 h-8 px-4 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors whitespace-nowrap"
                >
                    <Plus size={14} strokeWidth={2.5} />
                    Create Offer
                </button>
            </div>

            {/* Tab nav + content card */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
                {/* Tabs */}
                <div className="flex overflow-x-auto border-b border-border">
                    {tabs.map((tab) => {
                        const count = tabCount(tab);
                        const isActive = activeTab === tab;
                        return (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={[
                                    'relative flex items-center gap-2 px-5 py-3.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                                    isActive
                                        ? 'text-primary'
                                        : 'text-muted-foreground hover:text-foreground'
                                ].join(' ')}
                            >
                                {tab}
                                {count > 0 && (
                                    <span className={[
                                        'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                                        isActive
                                            ? 'bg-primary/10 text-primary'
                                            : 'bg-muted text-muted-foreground'
                                    ].join(' ')}>
                                        {count}
                                    </span>
                                )}
                                {isActive && (
                                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-t-full" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Offers List */}
                <div className="divide-y divide-border/60">
                    {filteredOffers.length > 0 ? (
                        filteredOffers.map((offer) => (
                            <div
                                key={offer.id}
                                className="px-5 py-4 transition-colors"
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--secondary)'}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2.5 mb-2">
                                            <span className="text-[14px] font-semibold text-foreground">
                                                {offer.applicant?.first_name} {offer.applicant?.last_name}
                                            </span>
                                            <StatusBadge status={offer.status} size="sm" />
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-[12px]">
                                            <div>
                                                <span className="text-muted-foreground">Position</span>
                                                <span className="text-foreground ml-2">{offer.position_title}</span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Pay Rate</span>
                                                <span className="text-foreground font-mono ml-2">${offer.salary.toLocaleString()}</span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Start</span>
                                                <span className="text-foreground font-mono ml-2">
                                                    {format(new Date(offer.start_date), 'MMM d, yyyy')}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground">Created</span>
                                                <span className="text-foreground font-mono ml-2">
                                                    {format(new Date(offer.created_at), 'MMM d, yyyy')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <button
                                            onClick={() => setSelectedOffer(offer)}
                                            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[12px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                                        >
                                            <Eye size={12} />
                                            Preview
                                        </button>
                                        {(offer.status === 'Draft' || offer.status === 'Pending_Approval') && (
                                            <>
                                                <button
                                                    onClick={() => handleEdit(offer.id)}
                                                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[12px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                                                >
                                                    <Edit size={12} />
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(offer)}
                                                    disabled={processingId === offer.id}
                                                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[12px] font-medium border border-destructive/25 text-destructive hover:bg-destructive/6 transition-colors disabled:opacity-50"
                                                >
                                                    <Trash2 size={12} />
                                                    Delete
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="py-16 text-center">
                            <FileText className="mx-auto text-muted-foreground/30 mb-4" size={36} strokeWidth={1} />
                            <p className="text-[13px] text-muted-foreground">No offers in this category</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Offer Preview Drawer */}
            <SlideOver
                isOpen={!!selectedOffer}
                onClose={() => setSelectedOffer(null)}
                title="Offer Preview"
                width="xl"
            >
                {selectedOffer && (
                    <div className="space-y-5">
                        {/* Offer meta */}
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { label: 'Applicant', value: `${selectedOffer.applicant?.first_name} ${selectedOffer.applicant?.last_name}` },
                                { label: 'Position', value: selectedOffer.position_title },
                                { label: 'Pay Rate', value: `$${selectedOffer.salary.toLocaleString()}`, mono: true },
                                { label: 'Start Date', value: format(new Date(selectedOffer.start_date), 'MMM d, yyyy'), mono: true },
                            ].map(({ label, value, mono }) => (
                                <div key={label} className="p-3 bg-muted/20 rounded-md border border-border">
                                    <p className="zone-label mb-1">{label}</p>
                                    <p className={['text-[13px] text-foreground', mono ? 'font-mono' : ''].join(' ')}>{value}</p>
                                </div>
                            ))}
                        </div>

                        {/* Letter preview */}
                        <div className="border border-border rounded-lg p-6 bg-background min-h-[500px]">
                            <div className="max-w-xl mx-auto space-y-5">
                                <div className="text-center mb-6">
                                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.03em' }}
                                        className="text-foreground mb-1">
                                        Prolific Homecare LLC
                                    </h2>
                                    <p className="zone-label">Employment Offer Letter</p>
                                </div>

                                <div className="space-y-4 text-[13px] text-foreground leading-relaxed">
                                    <p>Dear {selectedOffer.applicant?.first_name},</p>

                                    <p>
                                        We are pleased to offer you the position of <strong className="font-semibold">{selectedOffer.position_title}</strong> at
                                        Prolific Homecare LLC. We believe your skills and experience will be a valuable
                                        addition to our team.
                                    </p>

                                    <div className="bg-primary/[0.04] border border-primary/15 rounded-md p-4 my-4">
                                        <p className="zone-label mb-3">Offer Details</p>
                                        <div className="space-y-2">
                                            {[
                                                { k: 'Position', v: selectedOffer.position_title },
                                                { k: 'Pay Rate', v: `$${selectedOffer.salary.toLocaleString()}` },
                                                { k: 'Start Date', v: format(new Date(selectedOffer.start_date), 'MMMM d, yyyy') },
                                                { k: 'Employment Type', v: 'Full-time' },
                                            ].map(({ k, v }) => (
                                                <div key={k} className="flex justify-between text-[12px]">
                                                    <span className="text-muted-foreground">{k}</span>
                                                    <span className="text-foreground font-medium font-mono">{v}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <p>
                                        This position reports to the Director of Nursing and will be based at our
                                        main facility. Your primary responsibilities will include providing direct
                                        patient care and maintaining accurate documentation.
                                    </p>

                                    <p>
                                        Benefits include health insurance, paid time off, and continuing education
                                        opportunities. Please review the attached benefits guide for complete details.
                                    </p>

                                    <div className="mt-8 pt-6 border-t border-border">
                                        <p className="text-[13px] text-muted-foreground">Sincerely,</p>
                                        <p className="mt-3 text-[18px]" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.03em' }}>Jane Wilson</p>
                                        <p className="text-[12px] text-muted-foreground">HR Director — Prolific Homecare LLC</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="space-y-2 pt-4 border-t border-border">
                            <div className="flex gap-2">
                                {(selectedOffer.status === 'Pending_Approval' || selectedOffer.status === 'Draft') && (
                                    <>
                                        <button
                                            onClick={() => handleSend(selectedOffer)}
                                            disabled={processingId === selectedOffer.id}
                                            className="flex-1 inline-flex items-center justify-center gap-2 h-8 px-4 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                                        >
                                            <Send size={13} />
                                            {processingId === selectedOffer.id ? 'Sending…' : 'Approve & Send'}
                                        </button>
                                        <button
                                            onClick={() => handleEdit(selectedOffer.id)}
                                            className="inline-flex items-center gap-2 h-8 px-4 rounded-md border border-border text-[13px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                                        >
                                            <Edit size={13} />
                                            Edit
                                        </button>
                                    </>
                                )}
                                {selectedOffer.status === 'Accepted' && (
                                    <button
                                        onClick={() => handleOnboard(selectedOffer)}
                                        disabled={processingId === selectedOffer.id || selectedOffer.applicant?.status === 'Hired'}
                                        className={[
                                            'flex-1 inline-flex items-center justify-center gap-2 h-8 px-4 rounded-md text-[13px] font-semibold transition-colors',
                                            selectedOffer.applicant?.status === 'Hired'
                                                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                                                : 'bg-[var(--severity-low)] hover:opacity-90 text-white'
                                        ].join(' ')}
                                    >
                                        <UserCheck size={13} />
                                        {selectedOffer.applicant?.status === 'Hired' ? 'Already Onboarded' : 'Onboard Employee'}
                                    </button>
                                )}
                                {(selectedOffer.status === 'Sent' || selectedOffer.status === 'Accepted') && (
                                    <button className="flex-1 inline-flex items-center justify-center h-8 px-4 rounded-md border border-border text-[13px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                                        Download PDF
                                    </button>
                                )}
                            </div>
                            {(selectedOffer.status === 'Draft' || selectedOffer.status === 'Pending_Approval' || selectedOffer.status === 'Declined') && (
                                <button
                                    onClick={() => handleDelete(selectedOffer)}
                                    disabled={processingId === selectedOffer.id}
                                    className="w-full inline-flex items-center justify-center gap-2 h-8 px-4 rounded-md border border-destructive/25 text-destructive text-[13px] font-semibold hover:bg-destructive/6 transition-colors disabled:opacity-50"
                                >
                                    <Trash2 size={13} />
                                    {processingId === selectedOffer.id ? 'Deleting…' : 'Delete Offer'}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </SlideOver>

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
