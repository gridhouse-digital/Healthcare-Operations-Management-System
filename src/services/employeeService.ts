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

    async createEmployeeFromApplicant(applicantId: string, offerDetails: { start_date: string; position: string; salary: number }) {
        // 1. Get applicant details
        const { data: applicant, error: appError } = await supabase
            .from('applicants')
            .select('*')
            .eq('id', applicantId)
            .single();

        if (appError) throw appError;
        if (!applicant) throw new Error('Applicant not found');

        // 2. Check if employee record already exists in people
        const { data: existing } = await supabase
            .from('people')
            .select('id')
            .eq('applicant_id', applicantId)
            .eq('type', 'employee')
            .maybeSingle();

        if (existing) {
            throw new Error('Employee record already exists for this applicant');
        }

        // 3. Upsert into people as employee (may already exist as candidate from hire-detection)
        const { data: employee, error: empError } = await supabase
            .from('people')
            .upsert({
                tenant_id: applicant.tenant_id,
                first_name: applicant.first_name,
                last_name: applicant.last_name,
                email: applicant.email,
                phone: applicant.phone || null,
                job_title: offerDetails.position,
                type: 'employee',
                employee_status: 'Onboarding',
                employee_id: `EMP-${Date.now().toString().slice(-6)}`,
                applicant_id: applicant.id,
                hired_at: offerDetails.start_date,
            }, { onConflict: 'tenant_id,email' })
            .select()
            .single();

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

        // 2. Check if employee already exists
        const { data: existing } = await supabase
            .from('people')
            .select('id')
            .eq('applicant_id', applicantId)
            .eq('type', 'employee')
            .maybeSingle();

        if (existing) {
            throw new Error('Employee record already exists for this applicant');
        }

        // 3. Create employee record in people table
        const { data: employee, error: empError } = await supabase
            .from('people')
            .upsert({
                tenant_id: applicant.tenant_id,
                first_name: applicant.first_name,
                last_name: applicant.last_name,
                email: applicant.email,
                phone: applicant.phone || null,
                job_title: applicant.position_applied || 'To Be Assigned',
                type: 'employee',
                employee_status: 'Onboarding',
                employee_id: `EMP-${Date.now().toString().slice(-6)}`,
                applicant_id: applicant.id,
                hired_at: new Date().toISOString().split('T')[0],
            }, { onConflict: 'tenant_id,email' })
            .select()
            .single();

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
