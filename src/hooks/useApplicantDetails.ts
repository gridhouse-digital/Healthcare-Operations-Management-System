import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ApplicantDetails {
    id: string;
    created_at: string;
    status: string;
    answers: Record<string, any>;
    emergency_contact: any;
    i9_eligibility: any;
    vaccination: any;
    licenses: any;
    background_check: any;
    _debug?: any;
}

export const useApplicantDetails = (applicantId: string | undefined) => {
    return useQuery({
        queryKey: ['applicant', applicantId],
        queryFn: async () => {
            if (!applicantId) throw new Error('Applicant ID is required');

            const { data, error } = await supabase.functions.invoke('getApplicantDetails', {
                body: { applicantId }
            });

            if (error) {
                throw error;
            }

            return data as ApplicantDetails;
        },
        enabled: !!applicantId && applicantId !== 'new',
    });
};
