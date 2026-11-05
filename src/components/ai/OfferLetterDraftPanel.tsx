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
            <div className="p-6 border rounded-lg bg-card text-center">
                <FileText className="w-12 h-12 text-signal mx-auto mb-3" aria-hidden="true" />
                <h3 className="text-lg font-medium mb-2">AI Offer Letter Drafter</h3>
                <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                    Generate a personalized offer letter for <strong>{employeeDetails.name || 'the selected applicant'}</strong> based on their position and terms.
                </p>
                {validationError && (
                    <div className="mb-4 p-3 border border-accent-2/30 rounded-md bg-accent-2/12">
                        <p className="text-sm text-accent-2">{validationError}</p>
                    </div>
                )}
                {offerSettingsData?.migrationRequired && (
                    <div className="mb-4 p-3 border border-accent-2/30 rounded-md bg-accent-2/12">
                        <p className="text-sm text-accent-2">
                            Phase 2 offer-letter settings migration is required. Using neutral template fallback.
                        </p>
                    </div>
                )}
                {offerSettingsError && (
                    <div className="mb-4 p-3 border border-error/30 rounded-md bg-error/12">
                        <p className="text-sm text-error">
                            Offer letter settings failed to load: {offerSettingsError instanceof Error ? offerSettingsError.message : 'Unknown error'}
                        </p>
                    </div>
                )}
                <button
                    onClick={handleDraft}
                    disabled={offerSettingsLoading || Boolean(offerSettingsError)}
                    className="px-6 py-2 text-primary-foreground bg-primary rounded-full hover:bg-accent-hi transition-colors"
                >
                    {offerSettingsLoading ? 'Loading Settings...' : 'Draft Offer Letter'}
                </button>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="p-12 border rounded-lg bg-muted flex flex-col items-center justify-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-signal/30"></div>
                <p className="text-muted-foreground animate-pulse">Drafting professional offer letter...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 border border-error/30 rounded-lg bg-error/12">
                <p className="text-sm text-error">{error.message}</p>
                <button onClick={handleDraft} className="mt-2 text-sm font-medium text-error underline">Try Again</button>
            </div>
        );
    }

    return (
        <>
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium flex items-center gap-2">
                        <FileText className="w-5 h-5 text-signal" aria-hidden="true" />
                        Draft Offer Letter
                    </h3>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowPreviewModal(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-foreground bg-card border rounded-md hover:bg-accent"
                        >
                            <FileText className="w-4 h-4" aria-hidden="true" />
                            Full Preview
                        </button>
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-foreground bg-card border rounded-md hover:bg-accent"
                        >
                            {copied ? <Check className="w-4 h-4 text-signal" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                        {onSend && (
                            <button
                                onClick={() => onSend(editableBody)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-full hover:bg-accent-hi"
                            >
                                <Send className="w-4 h-4" aria-hidden="true" />
                                Send Offer
                            </button>
                        )}
                    </div>
                </div>

                <div className="p-6 border rounded-lg bg-card shadow-sm">
                    <div className="mb-4 pb-4 border-b">
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Subject</label>
                        <div className="text-foreground dark:text-primary-foreground font-medium">{data?.subject}</div>
                    </div>

                    <div className="relative">
                        <iframe
                            srcDoc={getLetterHTML()}
                            className="w-full h-[400px] border border-border rounded-md bg-well-card"
                            title="Offer Letter Preview"
                        />
                        <div className="absolute top-2 right-2 text-muted-foreground pointer-events-none">
                            <FileText className="w-4 h-4" aria-hidden="true" />
                        </div>
                    </div>

                {/* Edit Mode Toggle - Optional */}
                <details className="mt-4">
                    <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
                        <Edit3 className="w-4 h-4" aria-hidden="true" />
                        Edit Letter Content
                    </summary>
                    <textarea
                        value={editableBody}
                        onChange={(e) => setEditableBody(e.target.value)}
                        className="mt-2 w-full h-64 p-4 text-foreground bg-muted rounded-md border border-border resize-none font-mono text-sm leading-relaxed"
                        placeholder="Edit the letter content here..."
                    />
                </details>

                <div className="mt-4 flex flex-wrap gap-2">
                    {data?.key_terms?.map((term, i) => (
                        <span key={i} className="px-2 py-1 text-xs font-medium bg-signal/12 text-signal rounded-md">
                            {term}
                        </span>
                    ))}
                    <span className="px-2 py-1 text-xs font-medium bg-muted text-muted-foreground rounded-md">
                        Tone: {data?.tone}
                    </span>
                </div>
            </div>
        </div>

        {/* Full Screen Preview Modal */}
        {showPreviewModal && (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-shade/50"
                onClick={() => setShowPreviewModal(false)}
            >
                <div
                    className="relative w-[95vw] h-[95vh] bg-card rounded-lg shadow-2xl overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Modal Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted">
                        <div>
                            <h2 className="text-lg font-medium text-foreground dark:text-primary-foreground">Offer Letter Preview</h2>
                            <p className="text-sm text-muted-foreground">{data?.subject}</p>
                        </div>
                        <button
                            onClick={() => setShowPreviewModal(false)}
                            className="p-2 text-muted-foreground hover:text-muted-foreground rounded-md hover:bg-accent transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Modal Body - Iframe */}
                    <div className="w-full h-[calc(95vh-80px)] p-6">
                        <iframe
                            srcDoc={getLetterHTML()}
                            className="w-full h-full border-0 bg-well-card rounded-md shadow-inner"
                            title="Offer Letter Full Preview"
                        />
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
