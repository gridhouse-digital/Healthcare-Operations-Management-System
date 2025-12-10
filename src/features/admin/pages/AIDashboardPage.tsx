import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BarChart, Activity, Database, Clock, AlertTriangle, CheckCircle } from 'lucide-react';

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
                // Fetch recent logs
                const { data: logsData, error: logsError } = await supabase
                    .from('ai_logs')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(100);

                if (logsError) {
                    console.error('Error fetching ai_logs:', logsError);
                    setError(`Failed to load AI logs: ${logsError.message}`);
                }

                // Fetch cache stats
                const { data: cacheData, error: cacheError } = await supabase
                    .from('ai_cache')
                    .select('input_hash, created_at, model, output, ttl_seconds')
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (cacheError) {
                    console.error('Error fetching ai_cache:', cacheError);
                    if (!error) setError(`Failed to load cache data: ${cacheError.message}`);
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

    // Calculate stats
    const totalRequests = logs.length;
    const successRate = totalRequests > 0
        ? ((logs.filter(l => l.success).length / totalRequests) * 100).toFixed(1)
        : '0';
    const totalTokens = logs.reduce((acc, curr) => acc + (curr.tokens_in || 0) + (curr.tokens_out || 0), 0);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Activity className="w-6 h-6 text-blue-500" />
                    AI System Status
                </h1>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    System Operational
                </div>
            </div>

            {/* Error Alert */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-red-800 dark:text-red-300">
                        <AlertTriangle className="w-5 h-5" />
                        <p className="font-medium">Error Loading Data</p>
                    </div>
                    <p className="text-sm text-red-700 dark:text-red-400 mt-1">{error}</p>
                    <p className="text-xs text-red-600 dark:text-red-500 mt-2">
                        The ai_logs and ai_cache tables may not exist in the database or there may be permission issues.
                    </p>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-500">Total Requests</h3>
                        <BarChart className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalRequests}</div>
                </div>

                <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-500">Success Rate</h3>
                        <CheckCircle className="w-5 h-5 text-green-500" />
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{successRate}%</div>
                </div>

                <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-500">Token Usage</h3>
                        <Database className="w-5 h-5 text-purple-500" />
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalTokens.toLocaleString()}</div>
                </div>
            </div>

            {/* Recent Logs & Cache */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Logs */}
                <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg border shadow-sm overflow-hidden">
                    <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Recent Activity Log</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Time</th>
                                    <th className="px-4 py-3 font-medium">Feature</th>
                                    <th className="px-4 py-3 font-medium">Model</th>
                                    <th className="px-4 py-3 font-medium">Tokens</th>
                                    <th className="px-4 py-3 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y dark:divide-gray-700">
                                {logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-12 text-center">
                                            <Database className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                                            <p className="text-gray-500 font-medium">No AI activity logs yet</p>
                                            <p className="text-sm text-gray-400 mt-1">Logs will appear here after AI features are used</p>
                                        </td>
                                    </tr>
                                ) : (
                                    logs.map((log) => (
                                        <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="px-4 py-3 text-gray-500">
                                                {new Date(log.created_at).toLocaleTimeString()}
                                            </td>
                                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                                                {log.feature}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                                                {log.model?.split('/').pop() || 'N/A'}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500">
                                                {(log.tokens_in + log.tokens_out).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${log.success
                                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                                    }`}>
                                                    {log.success ? 'success' : 'error'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Cache Status */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border shadow-sm overflow-hidden">
                    <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Cache Status</h3>
                    </div>
                    <div className="p-4">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm text-gray-500">Active Entries</span>
                            <span className="font-bold text-gray-900 dark:text-white">{cacheEntries.length}</span>
                        </div>
                        {cacheEntries.length === 0 ? (
                            <div className="py-8 text-center">
                                <Database className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                                <p className="text-sm text-gray-500">No cached entries</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {cacheEntries.slice(0, 5).map((entry) => (
                                    <div key={entry.input_hash} className="flex items-center justify-between text-sm p-2 bg-gray-50 dark:bg-gray-900/30 rounded">
                                        <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[150px]">{entry.model || 'cached'}</span>
                                        <span className="text-gray-500 text-xs">
                                            {Math.floor((new Date().getTime() - new Date(entry.created_at).getTime()) / 1000 / 60)}m ago
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {cacheEntries.length > 0 && (
                            <div className="mt-4 pt-4 border-t dark:border-gray-700">
                                <button className="w-full py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
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
