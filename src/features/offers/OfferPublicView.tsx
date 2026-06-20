import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { offerService } from '@/services/offerService';
import type { Offer } from '@/types';
import { format } from 'date-fns';
import { CheckCircle, XCircle, FileText } from 'lucide-react';
import { toast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
    buildOfferLetterValues,
    getOfferLetterSettings,
    renderOfferLetterHtml,
    type OfferLetterSettingsLike,
} from './renderOfferLetter';

type PublicOffer = Offer & {
    offer_settings?: OfferLetterSettingsLike | null;
};

export function OfferPublicView() {
    const { token } = useParams<{ token: string }>();
    const [offer, setOffer] = useState<PublicOffer | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const { confirm, confirmState, handleClose, handleConfirm } = useConfirm();

    useEffect(() => {
        if (token) {
            loadOffer(token);
        }
    }, [token]);

    const loadOffer = async (t: string) => {
        try {
            const data = await offerService.getOfferByToken(t);
            setOffer(data as PublicOffer);
        } catch (err) {
            setError('Invalid or expired offer link.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleResponse = async (status: 'Accepted' | 'Declined') => {
        if (!offer || !token) return;

        const confirmed = await confirm({
            title: `${status === 'Accepted' ? 'Accept' : 'Decline'} Offer`,
            description: `Are you sure you want to ${status.toLowerCase()} this offer?`,
            confirmText: status === 'Accepted' ? 'Accept' : 'Decline',
            variant: status === 'Declined' ? 'danger' : 'default',
        });

        if (!confirmed) return;

        setActionLoading(true);
        try {
            await offerService.respondToOffer(token, status);
            setOffer({ ...offer, status });
            setSuccessMessage(
                status === 'Accepted'
                    ? 'Congratulations! You have accepted the offer.'
                    : 'You have declined the offer.'
            );
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            toast.error(`Failed to update offer status: ${message}`);
            console.error(err);
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) return <div className="flex h-screen items-center justify-center">Loading offer...</div>;
    if (error) return <div className="flex h-screen items-center justify-center text-red-600">{error}</div>;
    if (!offer) return null;

    const offerSettings = getOfferLetterSettings(offer.offer_settings);
    const candidateName = `${offer.applicant?.first_name ?? ''} ${offer.applicant?.last_name ?? ''}`.trim() || 'Candidate';
    const rate = `$${Number(offer.salary).toLocaleString()}`;
    const startDate = format(new Date(offer.start_date), 'MMMM d, yyyy');
    const acceptUrl = token ? `${window.location.origin}/offer/${token}` : '';
    const renderedLetter = renderOfferLetterHtml(
        offerSettings.template,
        buildOfferLetterValues({
            offer,
            settings: offer.offer_settings,
            candidateName,
            rate,
            startDate,
            acceptUrl,
        }),
    );

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
                <div className="text-center mb-10">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                        Job Offer
                    </h1>
                    <p className="mt-2 text-lg text-slate-600">
                        {offerSettings.companyName}
                    </p>
                </div>

                <div className="overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-slate-900/5">
                    {/* Header */}
                    <div className="bg-primary px-6 py-8 text-white sm:px-10">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-bold">
                                    {offer.applicant?.first_name} {offer.applicant?.last_name}
                                </h2>
                                <p className="mt-1 text-primary-foreground/80">
                                    {offer.position_title}
                                </p>
                            </div>
                            <div className="rounded-full bg-white/20 p-3">
                                <FileText className="h-8 w-8 text-white" />
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="px-6 py-8 sm:px-10 space-y-8">

                        {successMessage ? (
                            <div className={`rounded-md p-4 ${offer.status === 'Accepted' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        {offer.status === 'Accepted' ? (
                                            <CheckCircle className="h-5 w-5 text-green-400" aria-hidden="true" />
                                        ) : (
                                            <XCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
                                        )}
                                    </div>
                                    <div className="ml-3">
                                        <h3 className="text-sm font-medium">{successMessage}</h3>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                                    <div className="rounded-lg border border-slate-200 p-4">
                                        <dt className="text-sm font-medium text-slate-500">Start Date</dt>
                                        <dd className="mt-1 text-lg font-semibold text-slate-900">
                                            {format(new Date(offer.start_date), 'MMMM d, yyyy')}
                                        </dd>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 p-4">
                                        <dt className="text-sm font-medium text-slate-500">Pay Rate</dt>
                                        <dd className="mt-1 text-lg font-semibold text-slate-900">
                                            {rate}
                                        </dd>
                                    </div>
                                </div>

                                <div className="prose prose-slate max-w-none text-slate-600">
                                    <div dangerouslySetInnerHTML={{ __html: renderedLetter }} />
                                </div>

                                <div className="flex items-center justify-center gap-4 pt-4">
                                    <button
                                        onClick={() => handleResponse('Accepted')}
                                        disabled={actionLoading || offer.status !== 'Sent'}
                                        className="inline-flex w-full items-center justify-center rounded-md bg-green-600 px-8 py-3 text-base font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50 sm:w-auto"
                                    >
                                        <CheckCircle className="mr-2 h-5 w-5" />
                                        Accept Offer
                                    </button>
                                    <button
                                        onClick={() => handleResponse('Declined')}
                                        disabled={actionLoading || offer.status !== 'Sent'}
                                        className="inline-flex w-full items-center justify-center rounded-md bg-white px-8 py-3 text-base font-semibold text-red-600 shadow-sm ring-1 ring-inset ring-red-200 hover:bg-red-50 disabled:opacity-50 sm:w-auto"
                                    >
                                        <XCircle className="mr-2 h-5 w-5" />
                                        Decline
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Read-only view for already responded offers */}
                        {offer.status !== 'Sent' && !successMessage && (
                            <div className="text-center text-slate-500">
                                This offer has already been <strong>{offer.status.toLowerCase()}</strong>.
                            </div>
                        )}

                    </div>
                </div>
            </div>

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
