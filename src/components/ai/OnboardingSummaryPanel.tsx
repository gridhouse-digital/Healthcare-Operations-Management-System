import { useAIOnboarding } from '@/hooks/useAI';
import { ClipboardList, CheckSquare, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OnboardingSummaryPanelProps {
    employee: any;
    status: string;
}

export function OnboardingSummaryPanel({ employee, status }: OnboardingSummaryPanelProps) {
    const { generate, data, loading, error } = useAIOnboarding();

    const handleAnalyze = () => {
        generate({ employee, status });
    };

    if (!data && !loading && !error) {
        return (
            <div className="ai-surface p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ClipboardList className="h-5 w-5" style={{ color: 'var(--ai-text)' }} />
                        <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-foreground">Onboarding Assistant</h3>
                    </div>
                    <Button
                        onClick={handleAnalyze}
                        size="sm"
                    >
                        Analyze Status
                    </Button>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                    Identify missing documents and next steps for {employee.name}.
                </p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="ai-surface flex flex-col items-center justify-center space-y-3 p-8">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-border" style={{ borderTopColor: 'var(--primary)' }} />
                <p className="animate-pulse text-sm text-muted-foreground">Checking requirements...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-lg border border-destructive/15 bg-destructive/8 p-4">
                <p className="text-sm text-destructive">{error.message}</p>
                <Button onClick={handleAnalyze} variant="destructive" size="sm" className="mt-2">Try Again</Button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="saas-card p-6">
                <div className="flex items-center gap-2 mb-4">
                    <ClipboardList className="h-5 w-5" style={{ color: 'var(--ai-text)' }} />
                    <h3 className="text-lg font-semibold">Onboarding Status</h3>
                </div>

                <p className="mb-6 font-medium text-foreground/80">
                    {data?.status_summary}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Missing Documents */}
                    <div>
                        <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-destructive">
                            <AlertCircle className="w-4 h-4" />
                            Missing Documents
                        </h4>
                        <ul className="space-y-2">
                            {data?.missing_documents.length === 0 ? (
                                <li className="text-sm italic text-muted-foreground">All documents submitted.</li>
                            ) : (
                                data?.missing_documents.map((doc, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                                        {doc}
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>

                    {/* Next Steps */}
                    <div>
                        <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
                            <CheckSquare className="w-4 h-4" />
                            Recommended Actions
                        </h4>
                        <ul className="space-y-2">
                            {data?.next_steps.map((step, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                                    {step}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {data?.estimated_completion && (
                    <div className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        Estimated Completion: <span className="font-medium text-foreground">{data.estimated_completion}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
