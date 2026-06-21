import React, { useCallback, useMemo, useState } from 'react';
import { useAIOfferLetter } from '@/hooks/useAI';
import { FileText, Copy, Check, Edit3, Send } from 'lucide-react';
import { useOfferLetterSettings, useTenantSettings } from '@/features/settings/hooks/useTenantSettings';
import { escapeHtml, getOfferLetterSettings } from '@/features/offers/renderOfferLetter';

interface OfferLetterDraftPanelProps {
    employeeDetails: OfferDraftDetails;
    onSend?: (content: string) => void;
    autoDraft?: boolean;
}

interface OfferDraftDetails {
    name?: string;
    position?: string;
    rate?: string;
    startDate?: string;
    offerContext?: {
        companyName?: string;
        signatoryName?: string;
        signatoryTitle?: string;
        template?: string;
    };
    [key: string]: unknown;
}

// Helper function to validate required fields
function validateOfferDetails(details: OfferDraftDetails): { isValid: boolean; missingFields: string[] } {
    const missingFields: string[] = [];

    if (!details.name || details.name === '') missingFields.push('Applicant Name');
    if (!details.position || details.position === 'TBD' || details.position === '') missingFields.push('Position Title');
    if (!details.rate || details.rate === 'TBD' || details.rate === '0' || details.rate === '') missingFields.push('Salary Rate');
    if (!details.startDate || details.startDate === 'TBD' || details.startDate === '') missingFields.push('Start Date');

    return {
        isValid: missingFields.length === 0,
        missingFields
    };
}

export function OfferLetterDraftPanel({ employeeDetails, onSend, autoDraft }: OfferLetterDraftPanelProps) {
    const { generate, data, loading, error } = useAIOfferLetter();
    const [copied, setCopied] = useState(false);
    const [editableBody, setEditableBody] = useState('');
    const [validationError, setValidationError] = useState<string | null>(null);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const { data: tenantSettings } = useTenantSettings();
    const {
        data: offerSettingsData,
        isLoading: offerSettingsLoading,
        error: offerSettingsError,
    } = useOfferLetterSettings();
    const offerSettingsSource = useMemo(
        () => offerSettingsData && !offerSettingsData.migrationRequired ? offerSettingsData : null,
        [offerSettingsData],
    );
    const offerSettings = useMemo(
        () => getOfferLetterSettings(offerSettingsSource),
        [offerSettingsSource],
    );
    const companyLogoUrl = tenantSettings?.logo_light ?? null;

    const handleDraft = useCallback(async () => {
        // Validate form fields before drafting
        const validation = validateOfferDetails(employeeDetails);
        if (!validation.isValid) {
            setValidationError(`Please fill in the following required fields: ${validation.missingFields.join(', ')}`);
            return;
        }
        if (offerSettingsError) {
            const message = offerSettingsError instanceof Error ? offerSettingsError.message : 'Unknown error';
            setValidationError(`Offer letter settings failed to load: ${message}`);
            return;
        }

        setValidationError(null);
        const result = await generate({
            ...employeeDetails,
            offerContext: {
                companyName: offerSettings.companyName,
                signatoryName: offerSettings.signatoryName,
                signatoryTitle: offerSettings.signatoryTitle,
                template: offerSettings.template,
            },
        });
        if (result) {
            setEditableBody(result.body);
        }
    }, [employeeDetails, generate, offerSettings, offerSettingsError]);

    // Helper function to convert letter body to HTML for iframe
    const getLetterHTML = () => {
        if (!data) return '';

        const htmlBody = editableBody
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold text
            .replace(/\n\n/g, '</p><p class="mb-4">') // Paragraphs with margin
            .replace(/\n/g, '<br />'); // Line breaks

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 40px 20px;
                        line-height: 1.6;
                        color: #1a1a1a;
                        background: #ffffff;
                    }
                    .container {
                        border: 1px solid #e5e7eb;
                        border-radius: 8px;
                        padding: 40px;
                        background: #ffffff;
                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                    }
                    .logo-section {
                        text-align: center;
                        margin-bottom: 32px;
                        padding-bottom: 24px;
                        border-bottom: 2px solid #f3f4f6;
                    }
                    .logo {
                        max-width: 200px;
                        max-height: 80px;
                        height: auto;
                        margin: 0 auto 16px auto;
                        display: block;
                    }
                    .company-name {
                        font-size: 24px;
                        font-weight: 700;
                        color: #7152F3;
                        margin: 0;
                    }
                    .tagline {
                        font-size: 14px;
                        color: #6b7280;
                        margin-top: 4px;
                    }
                    h1, h2, h3 {
                        color: #111827;
                        margin-top: 24px;
                        margin-bottom: 12px;
                    }
                    h1 { font-size: 28px; font-weight: 700; }
                    h2 { font-size: 20px; font-weight: 600; }
                    h3 { font-size: 18px; font-weight: 600; }
                    p {
                        margin-bottom: 16px;
                        color: #374151;
                    }
                    strong {
                        font-weight: 600;
                        color: #111827;
                    }
                    .recipient-address {
                        margin: 24px 0;
                        padding: 16px;
                        background: #f9fafb;
                        border-left: 4px solid #7152F3;
                        border-radius: 4px;
                    }
                    .section {
                        margin: 24px 0;
                        padding: 20px;
                        background: #f9fafb;
                        border-radius: 8px;
                    }
                    .section-title {
                        font-size: 18px;
                        font-weight: 600;
                        color: #7152F3;
                        margin-bottom: 12px;
                    }
                    .signature {
                        margin-top: 40px;
                        padding-top: 24px;
                        border-top: 1px solid #e5e7eb;
                    }
                    .footer {
                        margin-top: 40px;
                        padding-top: 24px;
                        border-top: 2px solid #f3f4f6;
                        text-align: center;
                        font-size: 12px;
                        color: #6b7280;
                    }
                    ul, ol {
                        margin-left: 24px;
                        margin-bottom: 16px;
                    }
                    li {
                        margin-bottom: 8px;
                        color: #374151;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="logo-section">
                        ${companyLogoUrl ? `<img src="${escapeHtml(companyLogoUrl)}" alt="${escapeHtml(offerSettings.companyName)}" class="logo" />` : ''}
                        <h1 class="company-name">${escapeHtml(offerSettings.companyName)}</h1>
                        <p class="tagline">Employment Offer Letter</p>
                    </div>

                    <div class="content">
                        ${htmlBody}
                    </div>

                    <div class="footer">
                        <p>${escapeHtml(offerSettings.companyName)} | Employment Offer Letter</p>
                        <p style="margin-top: 8px;">This is a confidential offer letter. Please do not share without authorization.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    };

    React.useEffect(() => {
        if (autoDraft && !data && !loading && !error && !offerSettingsLoading) {
            void handleDraft();
        }
    }, [autoDraft, data, error, handleDraft, loading, offerSettingsLoading]);

    const handleCopy = () => {
        if (data) {
            navigator.clipboard.writeText(editableBody);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (!data && !loading && !error) {
        return (
            <div className="p-6 border rounded-lg bg-white dark:bg-gray-800 text-center">
                <FileText className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold mb-2">AI Offer Letter Drafter</h3>
                <p className="text-gray-500 mb-4 max-w-md mx-auto">
                    Generate a personalized offer letter for <strong>{employeeDetails.name || 'the selected applicant'}</strong> based on their position and terms.
                </p>
                {validationError && (
                    <div className="mb-4 p-3 border border-yellow-200 rounded-md bg-yellow-50 dark:bg-yellow-900/10">
                        <p className="text-sm text-yellow-700 dark:text-yellow-300">{validationError}</p>
                    </div>
                )}
                {offerSettingsData?.migrationRequired && (
                    <div className="mb-4 p-3 border border-yellow-200 rounded-md bg-yellow-50 dark:bg-yellow-900/10">
                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                            Phase 2 offer-letter settings migration is required. Using neutral template fallback.
                        </p>
                    </div>
                )}
                {offerSettingsError && (
                    <div className="mb-4 p-3 border border-red-200 rounded-md bg-red-50 dark:bg-red-900/10">
                        <p className="text-sm text-red-700 dark:text-red-300">
                            Offer letter settings failed to load: {offerSettingsError instanceof Error ? offerSettingsError.message : 'Unknown error'}
                        </p>
                    </div>
                )}
                <button
                    onClick={handleDraft}
                    disabled={offerSettingsLoading || Boolean(offerSettingsError)}
                    className="px-6 py-2 text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors"
                >
                    {offerSettingsLoading ? 'Loading Settings...' : 'Draft Offer Letter'}
                </button>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="p-12 border rounded-lg bg-gray-50 dark:bg-gray-800/50 flex flex-col items-center justify-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
                <p className="text-gray-500 animate-pulse">Drafting professional offer letter...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 border border-red-200 rounded-lg bg-red-50 dark:bg-red-900/10">
                <p className="text-sm text-red-600 dark:text-red-300">{error.message}</p>
                <button onClick={handleDraft} className="mt-2 text-sm font-medium text-red-700 underline">Try Again</button>
            </div>
        );
    }

    return (
        <>
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <FileText className="w-5 h-5 text-green-500" />
                        Draft Offer Letter
                    </h3>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowPreviewModal(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border rounded-md hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                        >
                            <FileText className="w-4 h-4" />
                            Full Preview
                        </button>
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border rounded-md hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                        >
                            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                        {onSend && (
                            <button
                                onClick={() => onSend(editableBody)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                            >
                                <Send className="w-4 h-4" />
                                Send Offer
                            </button>
                        )}
                    </div>
                </div>

                <div className="p-6 border rounded-lg bg-white dark:bg-gray-800 shadow-sm">
                    <div className="mb-4 pb-4 border-b dark:border-gray-700">
                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Subject</label>
                        <div className="text-gray-900 dark:text-white font-medium">{data?.subject}</div>
                    </div>

                    <div className="relative">
                        <iframe
                            srcDoc={getLetterHTML()}
                            className="w-full h-[400px] border border-gray-200 dark:border-gray-700 rounded-md bg-white"
                            title="Offer Letter Preview"
                        />
                        <div className="absolute top-2 right-2 text-gray-400 pointer-events-none">
                            <FileText className="w-4 h-4" />
                        </div>
                    </div>

                {/* Edit Mode Toggle - Optional */}
                <details className="mt-4">
                    <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex items-center gap-2">
                        <Edit3 className="w-4 h-4" />
                        Edit Letter Content
                    </summary>
                    <textarea
                        value={editableBody}
                        onChange={(e) => setEditableBody(e.target.value)}
                        className="mt-2 w-full h-64 p-4 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 rounded-md border border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm leading-relaxed"
                        placeholder="Edit the letter content here..."
                    />
                </details>

                <div className="mt-4 flex flex-wrap gap-2">
                    {data?.key_terms?.map((term, i) => (
                        <span key={i} className="px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-md dark:bg-blue-900/30 dark:text-blue-300">
                            {term}
                        </span>
                    ))}
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-400">
                        Tone: {data?.tone}
                    </span>
                </div>
            </div>
        </div>

        {/* Full Screen Preview Modal */}
        {showPreviewModal && (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                onClick={() => setShowPreviewModal(false)}
            >
                <div
                    className="relative w-[95vw] h-[95vh] bg-white dark:bg-gray-900 rounded-lg shadow-2xl overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Modal Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Offer Letter Preview</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{data?.subject}</p>
                        </div>
                        <button
                            onClick={() => setShowPreviewModal(false)}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Modal Body - Iframe */}
                    <div className="w-full h-[calc(95vh-80px)] p-6">
                        <iframe
                            srcDoc={getLetterHTML()}
                            className="w-full h-full border-0 bg-white rounded-md shadow-inner"
                            title="Offer Letter Full Preview"
                        />
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
