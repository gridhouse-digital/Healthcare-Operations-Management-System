import { supabase } from '@/lib/supabase';
import type { Applicant } from '@/types';

export const applicantService = {
    async getApplicants() {
        const { data, error } = await supabase
            .from('applicants')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as Applicant[];
    },

    async getApplicantById(id: string) {
        const { data, error } = await supabase
            .from('applicants')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data as Applicant;
    },

    async updateStatus(id: string, status: string) {
        const { error } = await supabase
            .from('applicants')
            .update({ status })
            .eq('id', id);

        if (error) throw error;
    }
};
