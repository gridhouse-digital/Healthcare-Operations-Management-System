import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { NotTrackedState } from '@/components/shared/NotTrackedState';
import { PageSkeleton } from '@/components/shared/PageSkeleton';
import { StatsCard } from './components/StatsCard';
import { RecentActivity } from './components/RecentActivity';
import { OnboardingSnapshot } from './components/OnboardingSnapshot';
import { ComplianceAlerts } from './components/ComplianceAlerts';
import { QuickActions } from './components/QuickActions';
import { dashboardService, type DashboardStats, type ActivityItem, type OnboardingEmployee } from '@/services/dashboardService';

// ── AI Insights Panel ──
function AIInsightsPanel() {
    return (
        <div className="panel">
            <div className="panel-header justify-between">
                <div className="flex items-center gap-2.5">
                    <Sparkles size={16} strokeWidth={1.75} className="text-primary" aria-hidden="true" />
                    <h3 className="text-title text-foreground">Today's Intelligence</h3>
                </div>
                <span className="ai-tag">AI</span>
            </div>
            <NotTrackedState title="AI daily insights aren't connected yet">
                Insights will appear here once they're generated from your live hiring and compliance records.
            </NotTrackedState>
        </div>
    );
}

export function DashboardPage() {
    const [stats, setStats] = useState<DashboardStats>({
        totalApplicants: 0,
        offersSent: 0,
        offersAccepted: 0,
        onboardingInProgress: 0,
        totalEmployees: 0,
        activeEmployees: 0
    });
    const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
    const [onboardingSnapshot, setOnboardingSnapshot] = useState<OnboardingEmployee[]>([]);
    const [loading, setLoading] = useState(true);
    const [onboardingLoading, setOnboardingLoading] = useState(true);

    useEffect(() => {
        const loadDashboardData = async () => {
            try {
                const [statsData, activityData] = await Promise.all([
                    dashboardService.getStats(),
                    dashboardService.getRecentActivity()
                ]);
                setStats(statsData);
                setRecentActivity(activityData);
                setLoading(false);

                try {
                    const onboardingData = await dashboardService.getOnboardingSnapshot();
                    setOnboardingSnapshot(onboardingData);
                } catch (err) {
                    console.error('Failed to load onboarding snapshot:', err);
                } finally {
                    setOnboardingLoading(false);
                }
            } catch (error) {
                console.error('Failed to load dashboard data:', error);
                setLoading(false);
            }
        };
        loadDashboardData();
    }, []);

    if (loading) {
        return (
            <PageSkeleton label="Loading dashboard" />
        );
    }

    const inactiveCount = Math.max(0, stats.totalEmployees - stats.activeEmployees - stats.onboardingInProgress);

    return (
        <div className="space-y-6 animate-fade-in">

            {/* ── Page header ── */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="page-header-title">Operations Overview</h1>
                    <p className="page-header-meta">
                        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                </div>
            </div>

            {/* ── The ruled tally ── */}
            <div className="grid grid-cols-1 gap-x-10 gap-y-6 xl:grid-cols-2">
                <div>
                    <p className="zone-label mb-2">Hiring Funnel</p>
                    <div className="tally">
                        <StatsCard title="Applicants"  value={stats.totalApplicants}      subtitle="Total pipeline"    intent="default" />
                        <StatsCard title="Offers Sent" value={stats.offersSent}           subtitle="Awaiting response" intent="info" />
                        <StatsCard title="Accepted"    value={stats.offersAccepted}       subtitle="Conversion"        intent="success" />
                        <StatsCard title="Onboarding"  value={stats.onboardingInProgress} subtitle="In progress"       intent="info" />
                    </div>
                </div>
                <div>
                    <p className="zone-label mb-2">Workforce</p>
                    <div className="tally">
                        <StatsCard title="Total Employees" value={stats.totalEmployees}  subtitle="All records"          intent="default" />
                        <StatsCard title="Active"          value={stats.activeEmployees} subtitle="Currently employed"   intent="success" />
                        <StatsCard title="Compliance Risk" value="—"                   subtitle="Not tracked yet" intent="default" />
                        <StatsCard title="Inactive"        value={inactiveCount}         subtitle="Terminated/Suspended" intent="default" />
                    </div>
                </div>
            </div>

            {/* ── Working columns ── */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="min-w-0 space-y-6 lg:col-span-7">
                    <div>
                        <p className="zone-label mb-2">Decision Surfaces</p>
                        <ComplianceAlerts />
                    </div>
                    <RecentActivity activities={recentActivity} />
                </div>
                <div className="min-w-0 space-y-6 lg:col-span-5">
                    <div>
                        <p className="zone-label mb-2">AI Intelligence</p>
                        <AIInsightsPanel />
                    </div>
                    <OnboardingSnapshot employees={onboardingSnapshot} loading={onboardingLoading} />
                    <QuickActions />
                </div>
            </div>
        </div>
    );
}
