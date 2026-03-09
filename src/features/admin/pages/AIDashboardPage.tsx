import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BarChart, Activity, Database, AlertTriangle, CheckCircle, Sparkles, Zap } from 'lucide-react';

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
            <div className="flex items-center justify-center py-20">
                <div className="flex items-center gap-3">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span className="text-[13px] tracking-[0.02em] text-muted-foreground">Loading AI telemetry...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex items-end justify-between pl-1">
                <div>
                    <h1 className="page-header-title">AI Dashboard</h1>
                    <p className="page-header-meta">System telemetry, inference performance, and cache activity</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="ai-tag">AI</span>
                    <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--severity-low)]" />
                        <span className="text-[11px] font-medium tracking-[0.04em] text-[color:var(--severity-low)]">
                            Operational
                        </span>
                    </div>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/8 p-4">
                    <div className="mb-1 flex items-center gap-2">
                        <AlertTriangle size={13} className="text-destructive" />
                        <p className="text-[13px] font-semibold text-destructive">Error Loading Data</p>
                    </div>
                    <p className="text-[12px] text-destructive/90">{error}</p>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">The `ai_logs` or `ai_cache` tables may not exist, or there may be permission issues.</p>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {[
                    { label: 'Total Requests', value: totalRequests.toLocaleString(), icon: BarChart, color: 'text-primary' },
                    { label: 'Success Rate', value: `${successRate}%`, icon: CheckCircle, color: 'text-[color:var(--severity-low)]' },
                    { label: 'Token Usage', value: totalTokens.toLocaleString(), icon: Zap, color: 'text-[color:var(--severity-medium)]' },
                ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="saas-card p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <span className="zone-label">{label}</span>
                            <Icon size={14} className={color} strokeWidth={2} />
                        </div>
                        <p className="data-value text-[2rem] text-foreground">{value}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="overflow-hidden rounded-xl border border-border bg-card lg:col-span-2">
                    <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
                        <Activity size={13} className="text-primary" strokeWidth={2} />
                        <span className="zone-label">Recent Activity Log</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b border-border">
                                <tr>
                                    {['Time', 'Feature', 'Model', 'Tokens', 'Status'].map((h) => (
                                        <th key={h} className="px-4 py-3 text-left">
                                            <span className="zone-label">{h}</span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-5 py-16 text-center">
                                            <Sparkles size={28} className="mx-auto mb-3 text-muted-foreground/25" strokeWidth={1} />
                                            <p className="text-[13px] text-muted-foreground">No AI activity logs yet</p>
                                            <p className="mt-1 text-[12px] text-muted-foreground/60">Logs appear after AI features are used</p>
                                        </td>
                                    </tr>
                                ) : (
                                    logs.map((log) => (
                                        <tr key={log.id} className="table-row-interactive">
                                            <td className="px-4 py-3">
                                                <span className="text-[12px] text-muted-foreground">
                                                    {new Date(log.created_at).toLocaleTimeString()}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-[13px] font-medium tracking-[-0.01em] text-foreground">{log.feature}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-[12px] text-muted-foreground">{log.model?.split('/').pop() || 'N/A'}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-[12px] text-muted-foreground">
                                                    {(log.tokens_in + log.tokens_out).toLocaleString()}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col gap-1">
                                                    <span className={log.success ? 'status-chip status-chip-green' : 'status-chip status-chip-red'}>
                                                        {log.success ? 'ok' : 'error'}
                                                    </span>
                                                    {log.error && (
                                                        <span className="max-w-[180px] truncate text-[11px] text-destructive" title={log.error}>
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

                <div className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
                        <Database size={13} className="text-primary" strokeWidth={2} />
                        <span className="zone-label">Cache Status</span>
                    </div>
                    <div className="p-4">
                        <div className="mb-4 flex items-center justify-between">
                            <span className="meta-label">Active entries</span>
                            <span className="data-value text-[1.5rem] text-foreground">{cacheEntries.length}</span>
                        </div>
                        {cacheEntries.length === 0 ? (
                            <div className="py-8 text-center">
                                <Database size={24} className="mx-auto mb-2 text-muted-foreground/25" strokeWidth={1} />
                                <p className="text-[12px] text-muted-foreground">No cached entries</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {cacheEntries.slice(0, 5).map((entry) => (
                                    <div key={entry.input_hash} className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-2.5">
                                        <span className="max-w-[140px] truncate text-[12px] text-foreground">{entry.model || 'cached'}</span>
                                        <span className="ml-2 shrink-0 text-[11px] text-muted-foreground">
                                            {Math.floor((new Date().getTime() - new Date(entry.created_at).getTime()) / 1000 / 60)}m ago
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {cacheEntries.length > 0 && (
                            <div className="mt-4 border-t border-border pt-4">
                                <button className="h-8 w-full rounded-md border border-destructive/25 text-[12px] font-semibold text-destructive transition-colors hover:bg-destructive/6">
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
