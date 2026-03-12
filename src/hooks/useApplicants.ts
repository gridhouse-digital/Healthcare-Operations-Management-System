import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Applicant } from '@/types';

interface ApplicantTenantOption {
    id: string;
    name: string;
}

/**
 * Fetches applicants directly from the Supabase database.
 * This is a fast read-only operation that does not trigger a sync with JotForm.
 */
export const useApplicants = (tenantId?: string) => {
    return useQuery({
        queryKey: ['applicants', tenantId ?? 'all'],
        queryFn: async () => {
            let query = supabase
                .from('applicants')
                .select('*')
                .order('created_at', { ascending: false });

            if (tenantId && tenantId !== 'all') {
                query = query.eq('tenant_id', tenantId);
            }

            const { data, error } = await query;

            if (error) {
                console.error('Failed to fetch applicants from DB:', error);
                throw new Error(`Failed to load applicants: ${error.message}`);
            }

            return data as Applicant[];
        },
    });
};

export const useApplicantTenants = (enabled: boolean) => {
    return useQuery({
        queryKey: ['applicant-tenants'],
        enabled,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('tenants')
                .select('id, name')
                .order('name', { ascending: true });

            if (error) {
                console.error('Failed to fetch tenants for applicant filter:', error);
                throw new Error(`Failed to load tenants: ${error.message}`);
            }

            return (data ?? []) as ApplicantTenantOption[];
        },
    });
};

/**
 * A mutation hook that triggers a "Force Sync" from JotForm to the database.
 * Call this when the user clicks "Refresh List" or a similar manual sync button.
 * On success, it invalidates the 'applicants' query to refetch fresh data from the DB.
 */
export const useSyncApplicants = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            const { data, error } = await supabase.functions.invoke('listApplicants');

            if (error) {
                console.error('Sync error:', error);
                throw new Error(`Sync failed: ${error.message || JSON.stringify(error)}`);
            }

            // Check if Edge Function returned an error in the body
            if (data && typeof data === 'object' && 'error' in data) {
                console.error('Edge Function returned error:', data);
                throw new Error(data.error as string);
            }

            return data;
        },
        onSuccess: () => {
            // Invalidate and refetch the applicants list from the DB
            queryClient.invalidateQueries({ queryKey: ['applicants'] });
        },
    });
};
