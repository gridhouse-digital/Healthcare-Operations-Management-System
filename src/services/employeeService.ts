import { supabase } from '@/lib/supabase';
import type { Employee } from '@/types';

/**
 * Employee service — queries the `people` table (type='employee').
 * The legacy `employees` table has been dropped (Epic 5).
 */
export const employeeService = {
    async getEmployees() {
        const { data, error } = await supabase
            .from('people')
            .select('*')
            .eq('type', 'employee')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as Employee[];
    },

    async getEmployeeById(id: string) {
        const { data, error } = await supabase
            .from('people')
            .select('*')
            .eq('id', id)
            .eq('type', 'employee')
            .single();

        if (error) throw error;
        return data as Employee;
    },

    async updateEmployee(id: string, updates: Partial<Employee>) {
        const { data, error } = await supabase
            .from('people')
            .update(updates)
            .eq('id', id)
            .eq('type', 'employee')
            .select()
            .single();

        if (error) throw error;
        return data as Employee;
    },

    /**
     * Reads the STORED lifecycle status (Phase 1, Q2/AC-6). The
     * employee-status resolver (server-side) is the sole writer of
     * people.employee_status; the frontend only reads it — it no longer
     * recomputes status from the compliance view.
     */
    async getEmployeeOnboardingStatus(personId: string): Promise<'Onboarding' | 'Active' | 'Terminated'> {
        const { data, error } = await supabase
            .from('people')
            .select('employee_status')
            .eq('id', personId)
            .single();

        if (error) throw error;
        return (data?.employee_status as 'Onboarding' | 'Active' | 'Terminated') ?? 'Onboarding';
    },

    /**
     * Thin caller (Phase 1, Q4/AC-1). Conversion is owned by the server-side
     * convert-applicant authority — the browser performs NO multi-step
     * conversion writes, no identity matching, and no status computation. This
     * just invokes the EF and surfaces its result (including the fail-safe
     * identity-collision outcome from Q5).
     *
     * Replaces the former divergent `createEmployeeFromApplicant` and
     * `moveApplicantToEmployee` methods (both deleted).
     */
    async convertApplicantToEmployee(applicantId: string, offerId?: string): Promise<{
        outcome: 'converted' | 'collision';
        personId?: string;
        collisionId?: string;
        reasonCode?: string;
        employeeStatus?: string;
    }> {
        const { data, error } = await supabase.functions.invoke('convert-applicant', {
            body: { applicant_id: applicantId, offer_id: offerId },
        });

        // Surface BOTH transport errors and in-body errors (project convention).
        if (error) throw error;
        if (data?.error) {
            const msg = typeof data.error === 'object' ? data.error.message : data.error;
            throw new Error(msg || 'Conversion failed');
        }

        return {
            outcome: data.outcome,
            personId: data.person_id,
            collisionId: data.collision_id,
            reasonCode: data.reason_code,
            employeeStatus: data.employee_status,
        };
    },
};
