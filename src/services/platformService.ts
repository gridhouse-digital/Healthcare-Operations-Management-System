import { supabase } from '@/lib/supabase';

export type AgencyStatus = 'ok' | 'attention' | 'not_connected' | 'no_data';

export interface AgencyConnection {
    source: string;
    lastSuccessAt: string | null;
    failedLastWindow: number;
    stale: boolean;
}

export interface AgencySummary {
    id: string;
    name: string;
    status: AgencyStatus;
    employees: number;
    employeesActive: number;
    employeesOnboarding: number;
    applicants: number;
    teamUsers: number;
    training: {
        records: number;
        completed: number;
        inProgress: number;
        notStarted: number;
        completedPct: number | null;
        recurringOverdue: number;
    } | null;
    connections: AgencyConnection[];
    lastSyncAt: string | null;
    failedSyncs: number;
    attentionReasons: string[];
}

export interface PlatformOverview {
    generatedAt: string;
    syncWindowDays: number;
    totals: {
        agencies: number;
        needingAttention: number;
        employees: number;
        employeesOnboarding: number;
        recurringOverdue: number | null;
        failedSyncs: number;
        openAccessRequests: number;
    };
    agencies: AgencySummary[];
}

export const platformService = {
    async getOverview(): Promise<PlatformOverview> {
        const { data, error } = await supabase.functions.invoke<PlatformOverview>('platform-overview');
        if (error) throw error;
        if (!data) throw new Error('Agency overview returned no data');
        /* The function deploys separately, so a field it doesn't send yet must not break the page */
        return {
            ...data,
            agencies: data.agencies.map((agency) => ({
                ...agency,
                attentionReasons: agency.attentionReasons ?? [],
            })),
        };
    },
};
