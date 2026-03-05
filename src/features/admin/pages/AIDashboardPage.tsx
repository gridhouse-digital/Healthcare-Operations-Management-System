import React, { useEffect, useState } from 'react';
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
            } catch (err: any) {
                console.error('Failed to fetch AI dashboard data:', err);
                setError(err.message || 'Unknown error occurred');
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

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <span className="text-[13px] text-muted-foreground font-mono uppercase tracking-[0.06em]">Loading AI telemetry…</span>
            </div>
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Page Header */}
            <div className="flex items-end justify-between pl-1">
                <div>
                    <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.875rem', fontStyle: 'italic', letterSpacing: '-0.025em', lineHeight: 1.15 }}
                        className="text-foreground">
                        AI Dashboard
                    </h1>
                    <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6875rem', letterSpacing: '0.07em' }}
                        className="uppercase text-muted-foreground mt-1">
                        System telemetry &amp; inference logs
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="ai-tag">AI</span>
                    <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(152,58%,38%)] animate-pulse" />
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.625rem', letterSpacing: '0.05em' }}
                            className="uppercase text-[hsl(152,54%,44%)]">
                            Operational
                        </span>
                    </div>
                </div>
            </div>

            {/* Error Alert */}
            {error && (
                <div className="p-4 rounded-lg bg-[hsl(4,82%,52%)]/8 border border-[hsl(4,82%,52%)]/20">
                    <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle size={13} className="text-[hsl(4,82%,52%)]" />
                        <p className="text-[13px] font-semibold text-[hsl(4,70%,44%)] dark:text-[hsl(4,76%,60%)]">Error Loading Data</p>
                    </div>
                    <p className="text-[12px] text-[hsl(4,70%,44%)] dark:text-[hsl(4,76%,60%)] font-mono">{error}</p>
                    <p className="text-[11px] text-muted-foreground mt-1.5">The ai_logs or ai_cache tables may not exist or there may be permission issues.</p>
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                    { label: 'Total Requests', value: totalRequests.toLocaleString(), icon: BarChart, color: 'text-primary' },
                    { label: 'Success Rate', value: `${successRate}%`, icon: CheckCircle, color: 'text-[hsl(152,58%,38%)]' },
                    { label: 'Token Usage', value: totalTokens.toLocaleString(), icon: Zap, color: 'text-[hsl(38,96%,48%)]' },
                ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="bg-card border border-border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                            <span className="zone-label">{label}</span>
                            <Icon size={14} className={color} strokeWidth={2} />
                        </div>
                        <p style={{ fontFamily: "'DM Serif Display', serif", fontSize: '2rem', fontStyle: 'italic', letterSpacing: '-0.02em', lineHeight: 1 }}
                            className="text-foreground">
                            {value}
                        </p>
                    </div>
                ))}
            </div>

            {/* Logs + Cache */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Activity Log */}
                <div className="lg:col-span-2 bg-card border border-border rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
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
                                            <Sparkles size={28} className="mx-auto text-muted-foreground/25 mb-3" strokeWidth={1} />
                                            <p className="text-[13px] text-muted-foreground">No AI activity logs yet</p>
                                            <p className="text-[12px] text-muted-foreground/60 font-mono mt-1">Logs appear after AI features are used</p>
                                        </td>
                                    </tr>
                                ) : (
                                    logs.map((log) => (
                                        <tr key={log.id} className="hover:bg-primary/[0.02] transition-colors">
                                            <td className="px-4 py-3">
                                                <span className="text-[12px] text-muted-foreground font-mono">
                                                    {new Date(log.created_at).toLocaleTimeString()}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-[13px] text-foreground font-medium">{log.feature}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-[11px] text-muted-foreground font-mono">{log.model?.split('/').pop() || 'N/A'}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-[12px] text-muted-foreground font-mono">
                                                    {(log.tokens_in + log.tokens_out).toLocaleString()}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className={[
                                                        'inline-flex items-center h-5 px-2 rounded text-[10px] font-mono font-semibold uppercase tracking-[0.04em] border w-fit',
                                                        log.success
                                                            ? 'bg-[hsl(152,58%,38%)]/8 text-[hsl(152,50%,30%)] dark:text-[hsl(152,54%,52%)] border-[hsl(152,58%,38%)]/20'
                                                            : 'bg-[hsl(4,82%,52%)]/8 text-[hsl(4,70%,44%)] dark:text-[hsl(4,76%,60%)] border-[hsl(4,82%,52%)]/20'
                                                    ].join(' ')}>
                                                        {log.success ? 'ok' : 'error'}
                                                    </span>
                                                    {log.error && (
                                                        <span className="text-[11px] text-[hsl(4,76%,60%)] font-mono max-w-[180px] truncate" title={log.error}>
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

                {/* Cache Status */}
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
                        <Database size={13} className="text-primary" strokeWidth={2} />
                        <span className="zone-label">Cache Status</span>
                    </div>
                    <div className="p-4">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[12px] text-muted-foreground font-mono uppercase tracking-[0.04em]">Active entries</span>
                            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.5rem', fontStyle: 'italic' }}
                                className="text-foreground">
                                {cacheEntries.length}
                            </span>
                        </div>
                        {cacheEntries.length === 0 ? (
                            <div className="py-8 text-center">
                                <Database size={24} className="mx-auto text-muted-foreground/25 mb-2" strokeWidth={1} />
                                <p className="text-[12px] text-muted-foreground">No cached entries</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {cacheEntries.slice(0, 5).map((entry) => (
                                    <div key={entry.input_hash} className="flex items-center justify-between p-2.5 bg-muted/20 rounded-md border border-border">
                                        <span className="text-[12px] text-foreground font-mono truncate max-w-[140px]">{entry.model || 'cached'}</span>
                                        <span className="text-[11px] text-muted-foreground font-mono flex-shrink-0 ml-2">
                                            {Math.floor((new Date().getTime() - new Date(entry.created_at).getTime()) / 1000 / 60)}m ago
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {cacheEntries.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-border">
                                <button className="w-full h-8 rounded-md text-[12px] font-semibold text-[hsl(4,70%,44%)] dark:text-[hsl(4,76%,60%)] border border-[hsl(4,82%,52%)]/25 hover:bg-[hsl(4,82%,52%)]/6 transition-colors">
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
