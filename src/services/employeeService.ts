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

    async getEmployeeOnboardingStatus(personId: string): Promise<'Onboarding' | 'Active'> {
        let activeQuery = await supabase
            .from('v_onboarding_training_compliance')
            .select('effective_status')
            .eq('person_id', personId);

        const viewMissing =
            activeQuery.error &&
            (
                activeQuery.error.code === '42P01' ||
                activeQuery.error.code === 'PGRST205' ||
                /relation .* does not exist/i.test(activeQuery.error.message || '') ||
                /schema cache/i.test(activeQuery.error.message || '')
            );

        if (viewMissing) {
            const fallbackQuery = await supabase
                .from('training_records')
                .select('status')
                .eq('person_id', personId);

            if (fallbackQuery.error) throw fallbackQuery.error;

            const rows = fallbackQuery.data || [];
            const allDone = rows.length > 0 && rows.every((row) => row.status === 'completed');
            return allDone ? 'Active' : 'Onboarding';
        }

        if (activeQuery.error) throw activeQuery.error;

        const rows = activeQuery.data || [];
        const allDone = rows.length > 0 && rows.every((row) => row.effective_status === 'completed');
        return allDone ? 'Active' : 'Onboarding';
    },

    async findEmployeeMatch(applicantId: string, tenantId: string, email: string) {
        const normalizedEmail = email.trim().toLowerCase();

        const [{ data: byApplicant, error: byApplicantError }, { data: byEmail, error: byEmailError }] = await Promise.all([
            supabase
                .from('people')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('type', 'employee')
                .eq('applicant_id', applicantId)
                .maybeSingle(),
            supabase
                .from('people')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('type', 'employee')
                .ilike('email', normalizedEmail)
                .order('wp_user_id', { ascending: false })
                .limit(5),
        ]);

        if (byApplicantError) throw byApplicantError;
        if (byEmailError) throw byEmailError;

        if (byApplicant) return byApplicant as Employee;

        const matches = (byEmail || []) as Employee[];
        if (matches.length === 0) return null;

        const exactNormalizedMatch = matches.find((row) => row.email.trim().toLowerCase() === normalizedEmail);
        if (exactNormalizedMatch) return exactNormalizedMatch;

        return matches[0];
    },

    async createEmployeeFromApplicant(applicantId: string, offerDetails: { start_date: string; position: string; salary: number }) {
        // 1. Get applicant details
        const { data: applicant, error: appError } = await supabase
            .from('applicants')
            .select('*')
            .eq('id', applicantId)
            .single();

        if (appError) throw appError;
        if (!applicant) throw new Error('Applicant not found');

        const normalizedEmail = applicant.email.trim().toLowerCase();
        const existing = await this.findEmployeeMatch(applicantId, applicant.tenant_id, normalizedEmail);

        const payload = {
            tenant_id: applicant.tenant_id,
            first_name: applicant.first_name,
            last_name: applicant.last_name,
            email: normalizedEmail,
            phone: applicant.phone || null,
            job_title: offerDetails.position,
            type: 'employee',
            applicant_id: applicant.id,
            hired_at: offerDetails.start_date,
        };

        let employee: Employee | null = null;
        let empError: Error | null = null;

        if (existing) {
            const employeeStatus = await this.getEmployeeOnboardingStatus(existing.id);
            const { data, error } = await supabase
                .from('people')
                .update({
                    ...payload,
                    employee_status: employeeStatus,
                    employee_id: existing.employee_id || `EMP-${Date.now().toString().slice(-6)}`,
                })
                .eq('id', existing.id)
                .eq('type', 'employee')
                .select()
                .single();

            employee = data as Employee;
            empError = error;
        } else {
            const { data, error } = await supabase
                .from('people')
                .insert({
                    ...payload,
                    employee_status: 'Onboarding',
                    employee_id: `EMP-${Date.now().toString().slice(-6)}`,
                })
                .select()
                .single();

            employee = data as Employee;
            empError = error;
        }

        if (empError) throw empError;

        // 4. Update applicant status to Hired
        const { error: updateError } = await supabase
            .from('applicants')
            .update({ status: 'Hired' })
            .eq('id', applicantId);

        if (updateError) console.error('Failed to update applicant status', updateError);

        return employee as Employee;
    },

    async moveApplicantToEmployee(applicantId: string) {
        // 1. Get applicant details
        const { data: applicant, error: appError } = await supabase
            .from('applicants')
            .select('*')
            .eq('id', applicantId)
            .single();

        if (appError) throw appError;
        if (!applicant) throw new Error('Applicant not found');

        const normalizedEmail = applicant.email.trim().toLowerCase();
        const existing = await this.findEmployeeMatch(applicantId, applicant.tenant_id, normalizedEmail);

        const payload = {
            tenant_id: applicant.tenant_id,
            first_name: applicant.first_name,
            last_name: applicant.last_name,
            email: normalizedEmail,
            phone: applicant.phone || null,
            job_title: applicant.position_applied || 'To Be Assigned',
            type: 'employee',
            applicant_id: applicant.id,
            hired_at: new Date().toISOString().split('T')[0],
        };

        let employee: Employee | null = null;
        let empError: Error | null = null;

        if (existing) {
            const employeeStatus = await this.getEmployeeOnboardingStatus(existing.id);
            const { data, error } = await supabase
                .from('people')
                .update({
                    ...payload,
                    employee_status: employeeStatus,
                    employee_id: existing.employee_id || `EMP-${Date.now().toString().slice(-6)}`,
                })
                .eq('id', existing.id)
                .eq('type', 'employee')
                .select()
                .single();

            employee = data as Employee;
            empError = error;
        } else {
            const { data, error } = await supabase
                .from('people')
                .insert({
                    ...payload,
                    employee_status: 'Onboarding',
                    employee_id: `EMP-${Date.now().toString().slice(-6)}`,
                })
                .select()
                .single();

            employee = data as Employee;
            empError = error;
        }

        if (empError) throw empError;

        // 4. Update applicant status to Hired
        const { error: updateError } = await supabase
            .from('applicants')
            .update({ status: 'Hired' })
            .eq('id', applicantId);

        if (updateError) console.error('Failed to update applicant status', updateError);

        return employee as Employee;
    },
};
