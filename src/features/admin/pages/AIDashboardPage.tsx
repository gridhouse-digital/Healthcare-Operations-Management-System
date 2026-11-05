import { useEffect, useState } from 'react';
import { PageSkeleton } from '@/components/shared/PageSkeleton';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { supabase } from '@/lib/supabase';
import { Activity, Database, AlertTriangle, Sparkles } from 'lucide-react';

interface AILog {
    id: string;
    created_at: string;
    tenant_id?: string;
    user_id?: string;
    feature: string;
    model: string;
    tokens_in: number;
    tokens_out: number;
    success: boolean;
    error: string | null;
}

interface AICache {
    input_hash: string;
    created_at: string;
    model: string;
    output: any;
    ttl_seconds: number;
}

export function AIDashboardPage() {
    const [logs, setLogs] = useState<AILog[]>([]);
    const [cacheEntries, setCacheEntries] = useState<AICache[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const { data: logsData, error: logsError } = await supabase
                    .from('ai_logs')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(100);

                if (logsError) {
                    console.error('Error fetching ai_logs:', logsError);
                    setError(`Failed to load AI logs: ${logsError.message}`);
                }

                const { data: cacheData, error: cacheError } = await supabase
                    .from('ai_cache')
                    .select('input_hash, created_at, model, output, ttl_seconds')
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (cacheError) {
                    console.error('Error fetching ai_cache:', cacheError);
                }

                if (logsData) setLogs(logsData);
                if (cacheData) setCacheEntries(cacheData);
            } catch (fetchError: any) {
                console.error('Failed to fetch AI dashboard data:', fetchError);
                setError(fetchError.message || 'Unknown error occurred');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const totalRequests = logs.length;
    const successRate = totalRequests > 0
        ? ((logs.filter(l => l.success).length / totalRequests) * 100).toFixed(1)
        : '0';
    const totalTokens = logs.reduce((acc, curr) => acc + (curr.tokens_in || 0) + (curr.tokens_out || 0), 0);

    if (loading) {
        return (
            <PageSkeleton label="Loading AI telemetry" />
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="page-header-title">AI Dashboard</h1>
                    <p className="page-header-meta">System telemetry, inference performance, and cache activity</p>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/8 p-4">
                    <div className="mb-1 flex items-center gap-2">
                        <AlertTriangle size={14} className="text-destructive" aria-hidden="true" />
                        <p className="text-sm font-medium text-destructive">Error Loading Data</p>
                    </div>
                    <p className="text-xs text-destructive/90">{error}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">The `ai_logs` or `ai_cache` tables may not exist, or there may be permission issues.</p>
                </div>
            )}

            <div className="tally tally-3">
                {[
                    { label: 'Total Requests', value: totalRequests.toLocaleString() },
                    { label: 'Success Rate', value: `${successRate}%` },
                    { label: 'Token Usage', value: totalTokens.toLocaleString() },
                ].map(({ label, value }) => (
                    <div key={label} className="tally-cell">
                        <p className="zone-label">{label}</p>
                        <p className="data-value mt-2 text-3xl text-foreground">{value}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="panel lg:col-span-2">
                    <div className="panel-header">
                        <Activity size={14} className="text-primary" strokeWidth={1.75} aria-hidden="true" />
                        <h2 className="text-title text-foreground">Recent Activity Log</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b border-border">
                                <tr>
                                    {['Time', 'Feature', 'Model', 'Tokens', 'Status'].map((h) => (
                                        <th key={h} className={`whitespace-nowrap px-4 py-3 ${h === 'Tokens' ? 'text-right' : 'text-left'}`}>
                                            <span className="zone-label">{h}</span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-5 py-16 text-center">
                                            <Sparkles size={28} className="mx-auto mb-3 text-muted-foreground" strokeWidth={1} aria-hidden="true" />
                                            <p className="text-sm text-muted-foreground">No AI activity logs yet</p>
                                            <p className="mt-1 text-xs text-muted-foreground">Logs appear after AI features are used</p>
                                        </td>
                                    </tr>
                                ) : (
                                    logs.map((log) => (
                                        <tr key={log.id} className="table-row-interactive">
                                            <td className="whitespace-nowrap px-4 py-2">
                                                <span className="text-xs tabular-nums text-muted-foreground">
                                                    {new Date(log.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                                </span>
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-2">
                                                <span className="text-sm text-foreground">{log.feature}</span>
                                            </td>
                                            <td className="max-w-[200px] px-4 py-2">
                                                <span className="block truncate text-xs text-muted-foreground" title={log.model ?? undefined}>{log.model?.split('/').pop() || 'N/A'}</span>
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <span className="text-xs tabular-nums text-muted-foreground">
                                                    {(log.tokens_in + log.tokens_out).toLocaleString()}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2">
                                                <div className="flex flex-col items-start gap-1">
                                                    <StatusBadge status={log.success ? 'OK' : 'Error'} tone={log.success ? 'done' : 'critical'} />
                                                    {log.error && (
                                                        <span className="max-w-[180px] truncate text-xs text-destructive" title={log.error}>
                                                            {log.error}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="panel">
                    <div className="panel-header">
                        <Database size={14} className="text-primary" strokeWidth={1.75} aria-hidden="true" />
                        <h2 className="text-title text-foreground">Cache Status</h2>
                    </div>
                    <div className="p-4">
                        <div className="mb-4 flex items-center justify-between">
                            <span className="meta-label">Active entries</span>
                            <span className="data-value text-section text-foreground">{cacheEntries.length}</span>
                        </div>
                        {cacheEntries.length === 0 ? (
                            <div className="py-8 text-center">
                                <Database size={24} className="mx-auto mb-2 text-muted-foreground" strokeWidth={1} aria-hidden="true" />
                                <p className="text-xs text-muted-foreground">No cached entries</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {cacheEntries.slice(0, 5).map((entry) => (
                                    <div key={entry.input_hash} className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-2.5">
                                        <span className="max-w-[140px] truncate text-xs text-foreground">{entry.model || 'cached'}</span>
                                        <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                                            {Math.floor((new Date().getTime() - new Date(entry.created_at).getTime()) / 1000 / 60)}m ago
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {cacheEntries.length > 0 && (
                            <div className="mt-4 border-t border-border pt-4">
                                <button className="h-8 w-full rounded-md border border-destructive/25 text-xs font-medium text-destructive transition-colors hover:bg-destructive/6">
                                    Clear Cache
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
