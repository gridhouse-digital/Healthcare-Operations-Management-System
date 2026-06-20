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
    }
    // NOTE: no updateStatus here by design. Applicant status is either an
    // HR-set pipeline stage (handled in ApplicantDetailsPage.handleStatusUpdate,
    // which only permits New/Screening/Interview/Rejected) or a system-driven
    // outcome — 'Offer' via sendOffer, 'Hired' via convert-applicant / hire
    // detection / WP-link. Never write 'Hired'/'Offer' from the client.
};
