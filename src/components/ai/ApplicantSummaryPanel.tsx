import { useAISummary } from '@/hooks/useAI';
import { Sparkles, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';

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
            <div className="p-4 border rounded-lg bg-gray-50 dark:bg-card border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-500" />
                        <h3 className="font-medium">AI Applicant Summary</h3>
                    </div>
                    <button
                        onClick={handleGenerate}
                        className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 transition-colors"
                    >
                        Generate Summary
                    </button>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                    Get a quick overview of this applicant's strengths, risks, and fit.
                </p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="p-8 border rounded-lg bg-gray-50 dark:bg-card border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                <p className="text-sm text-gray-500 animate-pulse">Analyzing resume and profile...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 border border-red-200 rounded-lg bg-red-50 dark:bg-red-900/10">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                    <AlertTriangle className="w-5 h-5" />
                    <h3 className="font-medium">Analysis Failed</h3>
                </div>
                <p className="mt-1 text-sm text-red-600 dark:text-red-300">{error.message}</p>
                <button
                    onClick={handleGenerate}
                    className="mt-3 text-sm font-medium text-red-700 underline hover:text-red-800"
                >
                    Try Again
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Summary Card */}
            <div className="p-6 border rounded-lg bg-white dark:bg-card border-gray-200 dark:border-gray-800 shadow-sm">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-500" />
                        <h3 className="text-lg font-semibold">AI Analysis</h3>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30">
                        <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                            AI Summary
                        </span>
                    </div>
                </div>

                <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-6">
                    {data?.summary}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Strengths */}
                    <div>
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-green-700 dark:text-green-400 mb-3">
                            <CheckCircle className="w-4 h-4" />
                            Key Strengths
                        </h4>
                        <ul className="space-y-2">
                            {(data?.strengths || []).map((strength, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                    {strength}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Risks */}
                    <div>
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400 mb-3">
                            <AlertTriangle className="w-4 h-4" />
                            Potential Risks
                        </h4>
                        <ul className="space-y-2">
                            {(!data?.risks || data.risks.length === 0) ? (
                                <li className="text-sm text-gray-500 italic">No significant risks identified.</li>
                            ) : (
                                (data.risks || []).map((risk, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                        {risk}
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>
                </div>

                {/* Salary Insights */}
                {data?.salary_insights && (
                    <div className="mt-6 pt-6 border-t dark:border-gray-700">
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2">
                            <TrendingUp className="w-4 h-4" />
                            Salary Insights
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            {data.salary_insights}
                        </p>
                    </div>
                )}

                {/* Tags */}
                <div className="mt-6 flex flex-wrap gap-2">
                    {(data?.tags || []).map((tag, i) => (
                        <span
                            key={i}
                            className="px-2.5 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                        >
                            #{tag}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
