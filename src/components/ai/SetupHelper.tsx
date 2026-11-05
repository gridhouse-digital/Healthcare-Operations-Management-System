import React, { useState } from 'react';
import { useAISetupHelper } from '@/hooks/useAI';
import { HelpCircle, Settings, ArrowRight, Lightbulb } from 'lucide-react';

export function SetupHelper() {
    const { generate, data, loading, error } = useAISetupHelper();
    const [query, setQuery] = useState('');

    const handleAsk = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            generate(query);
        }
    };

    return (
        <div className="p-6 border rounded-lg bg-card shadow-sm">
            <div className="flex items-center gap-2 mb-4">
                <HelpCircle className="w-6 h-6 text-signal" aria-hidden="true" />
                <h3 className="text-lg font-medium">System Setup Assistant</h3>
            </div>

            <form onSubmit={handleAsk} className="relative mb-6">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask how to configure settings (e.g., 'How do I set up Brevo?')"
                    className="w-full pl-4 pr-12 py-3 border rounded-lg bg-muted transition"
                />
                <button
                    type="submit"
                    disabled={loading || !query.trim()}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 text-primary-foreground bg-signal rounded-md hover:bg-accent-hi disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                    ) : (
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    )}
                </button>
            </form>

            {error && (
                <div className="p-4 mb-4 border border-error/30 rounded-lg bg-error/12 text-sm text-error">
                    {error.message}
                </div>
            )}

            {data && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-signal/12 rounded-lg shrink-0">
                            <Lightbulb className="w-5 h-5 text-signal" aria-hidden="true" />
                        </div>
                        <div className="text-foreground leading-relaxed">
                            {data.advice}
                        </div>
                    </div>

                    {data.config_suggestions.length > 0 && (
                        <div>
                            <h4 className="flex items-center gap-2 text-sm font-medium text-foreground dark:text-primary-foreground mb-3">
                                <Settings className="w-4 h-4" aria-hidden="true" />
                                Suggested Configurations
                            </h4>
                            <div className="space-y-3">
                                {data.config_suggestions.map((suggestion, i) => (
                                    <div key={i} className="p-4 border rounded-lg bg-muted hover:border-signal/30 transition-colors">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-medium text-muted-foreground">Setting Key</span>
                                            <span className="text-xs font-medium text-signal bg-signal/12 px-2 py-0.5 rounded">
                                                Suggested Value
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between mb-2">
                                            <code className="text-sm font-medium text-foreground dark:text-primary-foreground">{suggestion.setting_key}</code>
                                            <code className="text-sm text-foreground">{suggestion.suggested_value}</code>
                                        </div>
                                        <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
                                            {suggestion.reason}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
