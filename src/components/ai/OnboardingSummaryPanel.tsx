import { useAIOnboarding } from '@/hooks/useAI';
import { ClipboardList, CheckSquare, Clock, AlertCircle } from 'lucide-react';

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
            <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 text-indigo-500" />
                        <h3 className="font-medium">Onboarding Assistant</h3>
                    </div>
                    <button
                        onClick={handleAnalyze}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors"
                    >
                        Analyze Status
                    </button>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                    Identify missing documents and next steps for {employee.name}.
                </p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="p-8 border rounded-lg bg-gray-50 dark:bg-gray-800/50 flex flex-col items-center justify-center space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <p className="text-sm text-gray-500 animate-pulse">Checking requirements...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 border border-red-200 rounded-lg bg-red-50 dark:bg-red-900/10">
                <p className="text-sm text-red-600 dark:text-red-300">{error.message}</p>
                <button onClick={handleAnalyze} className="mt-2 text-sm font-medium text-red-700 underline">Try Again</button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="p-6 border rounded-lg bg-white dark:bg-gray-800 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <ClipboardList className="w-5 h-5 text-indigo-500" />
                    <h3 className="text-lg font-semibold">Onboarding Status</h3>
                </div>

                <p className="text-gray-700 dark:text-gray-300 mb-6 font-medium">
                    {data?.status_summary}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Missing Documents */}
                    <div>
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400 mb-3">
                            <AlertCircle className="w-4 h-4" />
                            Missing Documents
                        </h4>
                        <ul className="space-y-2">
                            {data?.missing_documents.length === 0 ? (
                                <li className="text-sm text-gray-500 italic">All documents submitted.</li>
                            ) : (
                                data?.missing_documents.map((doc, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                        {doc}
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>

                    {/* Next Steps */}
                    <div>
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-400 mb-3">
                            <CheckSquare className="w-4 h-4" />
                            Recommended Actions
                        </h4>
                        <ul className="space-y-2">
                            {data?.next_steps.map((step, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                                    {step}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {data?.estimated_completion && (
                    <div className="mt-6 pt-4 border-t dark:border-gray-700 flex items-center gap-2 text-sm text-gray-500">
                        <Clock className="w-4 h-4" />
                        Estimated Completion: <span className="font-medium text-gray-900 dark:text-white">{data.estimated_completion}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
