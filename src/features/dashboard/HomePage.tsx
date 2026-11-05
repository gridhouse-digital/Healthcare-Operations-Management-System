import { PageSkeleton } from '@/components/shared/PageSkeleton';
import { PlatformOverviewPage } from '@/features/platform/PlatformOverviewPage';
import { useUserRole } from '@/hooks/useUserRole';
import { DashboardPage } from './DashboardPage';

/* Platform admins oversee every agency; everyone else works in their own */
export function HomePage() {
    const { loading, isPlatformAdmin } = useUserRole();

    if (loading) return <PageSkeleton label="Loading dashboard" />;
    return isPlatformAdmin ? <PlatformOverviewPage /> : <DashboardPage />;
}
