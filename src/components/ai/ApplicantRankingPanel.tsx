import { useState } from 'react';
import { useAIRanking } from '@/hooks/useAI';
import { Trophy, AlertTriangle, ArrowRight, Target } from 'lucide-react';

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
            <div className="p-6 border rounded-lg bg-white dark:bg-gray-800 text-center">
                <Trophy className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold mb-2">AI Candidate Ranking</h3>
                <p className="text-gray-500 mb-4 max-w-md mx-auto">
                    Rank {candidates.length} candidates against the job description to identify the top performers.
                </p>
                <button
                    onClick={handleRank}
                    className="px-6 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                >
                    Rank Candidates
                </button>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="p-12 border rounded-lg bg-gray-50 dark:bg-gray-800/50 flex flex-col items-center justify-center space-y-4">
                <div className="relative">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    <Trophy className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-5 h-5 text-blue-600" />
                </div>
                <p className="text-gray-500 animate-pulse">Comparing candidates against requirements...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 border border-red-200 rounded-lg bg-red-50 dark:bg-red-900/10">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                    <AlertTriangle className="w-5 h-5" />
                    <h3 className="font-medium">Ranking Failed</h3>
                </div>
                <p className="mt-1 text-sm text-red-600 dark:text-red-300">{error.message}</p>
                <button
                    onClick={handleRank}
                    className="mt-3 text-sm font-medium text-red-700 underline hover:text-red-800"
                >
                    Try Again
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Target className="w-5 h-5 text-blue-500" />
                    Ranking Results
                </h3>
                <span className="text-sm text-gray-500">
                    Best Match: <span className="font-medium text-gray-900 dark:text-white">{data?.rankings.find(r => r.applicant_id === data.best_candidate_id)?.name}</span>
                </span>
            </div>

            <div className="space-y-3">
                {data?.rankings.sort((a, b) => b.score - a.score).map((ranking, index) => (
                    <div
                        key={ranking.applicant_id}
                        className={`border rounded-lg transition-all ${showDetails === ranking.applicant_id
                                ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                                : 'bg-white border-gray-200 hover:border-blue-300 dark:bg-gray-800 dark:border-gray-700'
                            }`}
                    >
                        <div
                            className="p-4 flex items-center justify-between cursor-pointer"
                            onClick={() => setShowDetails(showDetails === ranking.applicant_id ? null : ranking.applicant_id)}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`
                  flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm
                  ${index === 0 ? 'bg-yellow-100 text-yellow-700' :
                                        index === 1 ? 'bg-gray-100 text-gray-700' :
                                            index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}
                `}>
                                    #{index + 1}
                                </div>
                                <div>
                                    <h4 className="font-medium text-gray-900 dark:text-white">{ranking.name}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ranking.match_level === 'High' ? 'bg-green-100 text-green-700' :
                                                ranking.match_level === 'Medium' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-gray-100 text-gray-600'
                                            }`}>
                                            {ranking.match_level} Match
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{ranking.score}</div>
                                    <div className="text-xs text-gray-500">Score</div>
                                </div>
                                <ArrowRight className={`w-5 h-5 text-gray-400 transition-transform ${showDetails === ranking.applicant_id ? 'rotate-90' : ''}`} />
                            </div>
                        </div>

                        {showDetails === ranking.applicant_id && (
                            <div className="px-4 pb-4 pt-0 text-sm text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700 mt-2 pt-3">
                                <p className="leading-relaxed">{ranking.reason}</p>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
