import { useState } from 'react';
import { useAIRanking } from '@/hooks/useAI';
import { Trophy, AlertTriangle, ArrowRight, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ApplicantRankingPanelProps {
    candidates: any[];
    jobDescription: string;
}

export function ApplicantRankingPanel({ candidates, jobDescription }: ApplicantRankingPanelProps) {
    const { generate, data, loading, error } = useAIRanking();
    const [showDetails, setShowDetails] = useState<string | null>(null);

    const handleRank = () => {
        generate({ candidates, jobDescription });
    };

    if (!data && !loading && !error) {
        return (
            <div className="saas-card p-6 text-center">
                <Trophy className="mx-auto mb-3 h-12 w-12" style={{ color: 'var(--severity-medium)' }} />
                <h3 className="text-lg font-semibold mb-2">AI Candidate Ranking</h3>
                <p className="mx-auto mb-4 max-w-md text-muted-foreground">
                    Rank {candidates.length} candidates against the job description to identify the top performers.
                </p>
                <Button
                    onClick={handleRank}
                >
                    Rank Candidates
                </Button>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="ai-surface flex flex-col items-center justify-center space-y-4 p-12">
                <div className="relative">
                    <div className="h-12 w-12 animate-spin rounded-full border-2 border-border" style={{ borderTopColor: 'var(--primary)' }} />
                    <Trophy className="absolute top-1/2 left-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 transform text-primary" />
                </div>
                <p className="animate-pulse text-muted-foreground">Comparing candidates against requirements...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-lg border border-destructive/15 bg-destructive/8 p-4">
                <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-5 h-5" />
                    <h3 className="font-medium">Ranking Failed</h3>
                </div>
                <p className="mt-1 text-sm text-destructive">{error.message}</p>
                <Button
                    onClick={handleRank}
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
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    Ranking Results
                </h3>
                <span className="text-sm text-muted-foreground">
                    Best Match: <span className="font-medium text-foreground">{data?.rankings.find(r => r.applicant_id === data.best_candidate_id)?.name}</span>
                </span>
            </div>

            <div className="space-y-3">
                {data?.rankings.sort((a, b) => b.score - a.score).map((ranking, index) => (
                    <div
                        key={ranking.applicant_id}
                        className={`border rounded-lg transition-all ${showDetails === ranking.applicant_id
                                ? 'bg-primary/8 border-primary/20'
                                : 'bg-card border-border hover:border-primary/25'
                            }`}
                    >
                        <div
                            className="p-4 flex items-center justify-between cursor-pointer"
                            onClick={() => setShowDetails(showDetails === ranking.applicant_id ? null : ranking.applicant_id)}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`
                  flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm
                  ${index === 0 ? 'bg-[color:var(--severity-medium)]/12 text-[color:var(--severity-medium)]' :
                                        index === 1 ? 'bg-muted text-muted-foreground' :
                                            index === 2 ? 'bg-[color:var(--severity-high)]/12 text-[color:var(--severity-high)]' : 'bg-secondary text-muted-foreground'}
                `}>
                                    #{index + 1}
                                </div>
                                <div>
                                    <h4 className="font-medium text-foreground">{ranking.name}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ranking.match_level === 'High' ? 'bg-[color:var(--severity-low)]/12 text-[color:var(--severity-low)]' :
                                                ranking.match_level === 'Medium' ? 'bg-primary/10 text-primary' :
                                                    'bg-muted text-muted-foreground'
                                            }`}>
                                            {ranking.match_level} Match
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <div className="text-2xl font-bold text-primary">{ranking.score}</div>
                                    <div className="text-xs text-muted-foreground">Score</div>
                                </div>
                                <ArrowRight className={`h-5 w-5 text-muted-foreground transition-transform ${showDetails === ranking.applicant_id ? 'rotate-90' : ''}`} />
                            </div>
                        </div>

                        {showDetails === ranking.applicant_id && (
                            <div className="mt-2 border-t border-border px-4 pb-4 pt-3 text-sm text-muted-foreground">
                                <p className="leading-relaxed">{ranking.reason}</p>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
