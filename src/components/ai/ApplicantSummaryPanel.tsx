import { useAISummary } from '@/hooks/useAI';
import { Sparkles, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ApplicantSummaryPanelProps {
    applicant: any;
}

export function ApplicantSummaryPanel({ applicant }: ApplicantSummaryPanelProps) {
    const { generate, data, loading, error } = useAISummary();

    const handleGenerate = () => {
        generate(applicant);
    };

    if (!data && !loading && !error) {
        return (
            <div className="ai-surface p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5" style={{ color: 'var(--ai-text)' }} />
                        <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-foreground">AI Applicant Summary</h3>
                    </div>
                    <Button
                        onClick={handleGenerate}
                        size="sm"
                    >
                        Generate Summary
                    </Button>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                    Get a quick overview of this applicant's strengths, risks, and fit.
                </p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="ai-surface flex flex-col items-center justify-center space-y-3 p-8">
                <div
                    className="h-8 w-8 animate-spin rounded-full border-2 border-border"
                    style={{ borderTopColor: 'var(--primary)' }}
                />
                <p className="animate-pulse text-sm text-muted-foreground">Analyzing resume and profile...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-lg border border-destructive/15 bg-destructive/8 p-4">
                <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-5 h-5" />
                    <h3 className="font-medium">Analysis Failed</h3>
                </div>
                <p className="mt-1 text-sm text-destructive">{error.message}</p>
                <Button
                    onClick={handleGenerate}
                    variant="destructive"
                    size="sm"
                    className="mt-3"
                >
                    Try Again
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Summary Card */}
            <div className="saas-card p-6">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5" style={{ color: 'var(--ai-text)' }} />
                        <h3 className="text-lg font-semibold">AI Analysis</h3>
                    </div>
                    <span className="ai-tag">AI Summary</span>
                </div>

                <p className="mb-6 leading-relaxed text-foreground/80">
                    {data?.summary}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Strengths */}
                    <div>
                        <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--severity-low)' }}>
                            <CheckCircle className="w-4 h-4" />
                            Key Strengths
                        </h4>
                        <ul className="space-y-2">
                            {(data?.strengths || []).map((strength, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--severity-low)' }} />
                                    {strength}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Risks */}
                    <div>
                        <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--severity-high)' }}>
                            <AlertTriangle className="w-4 h-4" />
                            Potential Risks
                        </h4>
                        <ul className="space-y-2">
                            {(!data?.risks || data.risks.length === 0) ? (
                                <li className="text-sm italic text-muted-foreground">No significant risks identified.</li>
                            ) : (
                                (data.risks || []).map((risk, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--severity-high)' }} />
                                        {risk}
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>
                </div>

                {/* Salary Insights */}
                {data?.salary_insights && (
                    <div className="mt-6 border-t border-border pt-6">
                        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
                            <TrendingUp className="w-4 h-4" />
                            Salary Insights
                        </h4>
                        <p className="text-sm text-muted-foreground">
                            {data.salary_insights}
                        </p>
                    </div>
                )}

                {/* Tags */}
                <div className="mt-6 flex flex-wrap gap-2">
                    {(data?.tags || []).map((tag, i) => (
                        <span
                            key={i}
                            className="status-chip status-chip-muted"
                        >
                            #{tag}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
