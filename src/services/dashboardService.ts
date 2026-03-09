import { supabase } from '@/lib/supabase';

export interface DashboardStats {
    totalApplicants: number;
    offersSent: number;
    offersAccepted: number;
    onboardingInProgress: number;
    totalEmployees: number;
    activeEmployees: number;
}

export interface ActivityItem {
    id: string;
    message: string;
    timestamp: string;
    type: 'applicant' | 'offer' | 'employee';
}

export interface OnboardingEmployee {
    id: string;
    name: string;
    role: string;
    progress: number;
    status: string;
}

export const dashboardService = {
    async getStats(): Promise<DashboardStats> {
        const [
            applicantsResponse,
            { count: offersSent },
            { count: offersAccepted },
            { count: onboardingInProgress },
            { count: totalEmployees },
            { count: activeEmployees }
        ] = await Promise.all([
            supabase.functions.invoke('listApplicants'),
            supabase.from('offers').select('*', { count: 'exact', head: true }).eq('status', 'Sent'),
            supabase.from('offers').select('*', { count: 'exact', head: true }).eq('status', 'Accepted'),
            supabase.from('people').select('*', { count: 'exact', head: true }).eq('type', 'employee').eq('employee_status', 'Onboarding'),
            supabase.from('people').select('*', { count: 'exact', head: true }).eq('type', 'employee'),
            supabase.from('people').select('*', { count: 'exact', head: true }).eq('type', 'employee').eq('employee_status', 'Active')
        ]);

        const totalApplicants = applicantsResponse.data ? applicantsResponse.data.length : 0;

        return {
            totalApplicants: totalApplicants,
            offersSent: offersSent || 0,
            offersAccepted: offersAccepted || 0,
            onboardingInProgress: onboardingInProgress || 0,
            totalEmployees: totalEmployees || 0,
            activeEmployees: activeEmployees || 0
        };
    },

    async getRecentActivity(): Promise<ActivityItem[]> {
        const { data: applicants } = await supabase.functions.invoke('listApplicants');

        const { data: offers } = await supabase
            .from('offers')
            .select('id, position_title, status, created_at, applicants(first_name, last_name)')
            .order('created_at', { ascending: false })
            .limit(5);

        const activities: ActivityItem[] = [];

        if (applicants && Array.isArray(applicants)) {
            applicants.forEach((app: any) => {
                activities.push({
                    id: `app-${app.id}`,
                    message: `New applicant: ${app.first_name} ${app.last_name} (${app.position_applied})`,
                    timestamp: app.created_at,
                    type: 'applicant'
                });
            });
        }

        offers?.forEach(offer => {
            const name = offer.applicants ? `${(offer.applicants as any).first_name} ${(offer.applicants as any).last_name}` : 'Unknown';
            let action = 'Offer created';
            if (offer.status === 'Sent') action = 'Offer sent';
            if (offer.status === 'Accepted') action = 'Offer accepted';

            activities.push({
                id: `offer-${offer.id}`,
                message: `${action} for ${name} (${offer.position_title})`,
                timestamp: offer.created_at,
                type: 'offer'
            });
        });

        return activities
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 5);
    },

    async getOnboardingSnapshot(): Promise<OnboardingEmployee[]> {
        const { data } = await supabase
            .from('people')
            .select('id, first_name, last_name, job_title, employee_status, created_at')
            .eq('type', 'employee')
            .eq('employee_status', 'Onboarding')
            .order('created_at', { ascending: false })
            .limit(5);

        if (!data) return [];

        return data.map((emp) => ({
            id: emp.id,
            name: `${emp.first_name} ${emp.last_name}`,
            role: emp.job_title || 'Unknown',
            progress: 0,
            status: emp.employee_status || 'Onboarding'
        }));
    }
};
