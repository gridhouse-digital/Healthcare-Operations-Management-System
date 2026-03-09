import { useEffect, useState } from 'react';
import { Users, Send, CheckCircle2, Briefcase, UserX, GraduationCap, Sparkles, AlertTriangle, TrendingUp } from 'lucide-react';
import { StatsCard } from './components/StatsCard';
import { RecentActivity } from './components/RecentActivity';
import { OnboardingSnapshot } from './components/OnboardingSnapshot';
import { ComplianceAlerts } from './components/ComplianceAlerts';
import { QuickActions } from './components/QuickActions';
import { dashboardService, type DashboardStats, type ActivityItem, type OnboardingEmployee } from '@/services/dashboardService';

// ── AI Insights Panel ──
function AIInsightsPanel() {
    const [aiLoading, setAiLoading] = useState(true);
    useEffect(() => {
        const t = setTimeout(() => setAiLoading(false), 1400);
        return () => clearTimeout(t);
    }, []);

    const insights = [
        { text: '3 applicants are interview-ready based on screening scores', dot: 'var(--primary)', tag: 'hiring' },
        { text: 'TB Test for J. Martinez expires in 2 days — action required', dot: 'hsl(0 72% 62%)', tag: 'urgent' },
        { text: 'Onboarding completion rate up 12% this week', dot: 'var(--severity-low)', tag: 'trend' },
    ];

    return (
        <div
            className="animate-reveal-up rounded-lg overflow-hidden"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: '1px solid var(--border)' }}
            >
                <div className="flex items-center gap-2.5">
                    <div
                        className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{ background: 'var(--ai-surface)', border: '1px solid var(--ai-border)' }}
                    >
                        <Sparkles size={12} strokeWidth={2} style={{ color: 'var(--ai-text)' }} />
                    </div>
                    <div>
                        <p className="text-[13px] font-semibold leading-none" style={{ color: 'var(--foreground)' }}>Today's Intelligence</p>
                        <p className="text-[11px] mt-0.5" style={{ letterSpacing: '-0.01em', color: 'var(--muted-foreground)', opacity: 0.8 }}>
                            AI · {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!aiLoading && (
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--severity-low)' }} />
                            <span className="text-[10px] font-medium" style={{ letterSpacing: '-0.01em', color: 'var(--severity-low)' }}>Live</span>
                        </div>
                    )}
                    <span className="ai-tag">AI</span>
                </div>
            </div>

            {/* Body */}
            <div className="p-4">
                {aiLoading ? (
                    <div className="space-y-3">
                        {[82, 65, 74].map((w, i) => (
                            <div key={i} className="flex gap-3 items-center">
                                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--border-strong)' }} />
                                <div className="h-3 rounded ai-shimmer flex-1" style={{ maxWidth: `${w}%` }} />
                            </div>
                        ))}
                        <div className="mt-3 pt-3 space-y-2" style={{ borderTop: '1px solid var(--border)' }}>
                            <div className="h-3 rounded ai-shimmer w-2/5" />
                            <div className="h-3 rounded ai-shimmer w-3/4" />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3 animate-fade-in">
                        <div className="space-y-1.5">
                            {insights.map((insight, i) => (
                                <div key={i} className="group flex items-start gap-2.5 py-1 px-2 rounded-md" style={{ transition: 'background 80ms' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--secondary)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                                >
                                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-[5px]" style={{ background: insight.dot }} />
                                    <p className="text-[12.5px] leading-snug font-medium flex-1" style={{ color: 'var(--foreground)', opacity: 0.8 }}>{insight.text}</p>
                                    <span className="text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                                        {insight.tag}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <TrendingUp size={10} strokeWidth={2.5} style={{ color: 'var(--primary)' }} />
                                <span className="text-[10px] font-medium" style={{ letterSpacing: '-0.01em', color: 'var(--primary)' }}>
                                    Recommendation
                                </span>
                            </div>
                            <p className="text-[12px] leading-snug" style={{ color: 'var(--muted-foreground)' }}>
                                Schedule follow-up with 2 applicants in Interview stage inactive for &gt;5 days.
                            </p>
                        </div>
                    </div>
                )}
            </div>
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
            <div className="flex items-center justify-center h-[calc(100vh-100px)]">
                <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
            </div>
        );
    }

    const inactiveCount = Math.max(0, stats.totalEmployees - stats.activeEmployees - stats.onboardingInProgress);

    return (
        <div className="space-y-6 animate-fade-in">

            {/* ── Page header ── */}
            <div className="flex items-end justify-between">
                <div>
                    <h1
                        style={{ fontFamily: 'var(--font-display)', fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05, color: 'var(--foreground)' }}
                    >
                        Operations Overview
                    </h1>
                    <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', letterSpacing: '-0.01em', color: 'var(--muted-foreground)', opacity: 0.8, marginTop: '4px' }}>
                        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                </div>
                <div
                    className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md"
                    style={{ background: 'color-mix(in srgb, var(--severity-critical) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--severity-critical) 18%, transparent)' }}
                >
                    <AlertTriangle size={11} strokeWidth={2} style={{ color: 'var(--severity-critical)' }} />
                    <span
                        className="text-[11px] font-semibold"
                        style={{ fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em', color: 'var(--severity-critical)' }}
                    >
                        4 COMPLIANCE RISKS
                    </span>
                </div>
            </div>

            {/* ── AI Intelligence ── */}
            <div>
                <p className="zone-label mb-2">AI Intelligence</p>
                <AIInsightsPanel />
            </div>

            {/* ── Hiring Funnel ── */}
            <div>
                <p className="zone-label mb-2">Hiring Funnel</p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatsCard title="Applicants"  value={stats.totalApplicants}      icon={Users}         subtitle="Total pipeline"    intent="default" stagger={0} />
                    <StatsCard title="Offers Sent" value={stats.offersSent}           icon={Send}          subtitle="Awaiting response" intent="info"    stagger={1} />
                    <StatsCard title="Accepted"    value={stats.offersAccepted}       icon={CheckCircle2}  subtitle="Conversion"        intent="success" stagger={2} />
                    <StatsCard title="Onboarding"  value={stats.onboardingInProgress} icon={GraduationCap} subtitle="In progress"        intent="info"    stagger={3} />
                </div>
            </div>

            {/* ── Workforce ── */}
            <div>
                <p className="zone-label mb-2">Workforce</p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatsCard title="Total Employees" value={stats.totalEmployees}  icon={Briefcase} subtitle="All records"          intent="default" stagger={4} />
                    <StatsCard title="Active"          value={stats.activeEmployees} icon={Briefcase} subtitle="Currently employed"   intent="success" stagger={5} />
                    <StatsCard title="Compliance Risk" value={4}                     icon={UserX}     subtitle="Expiring credentials" intent="warning" stagger={6} />
                    <StatsCard title="Inactive"        value={inactiveCount}         icon={UserX}     subtitle="Terminated/Suspended" intent="danger"  stagger={7} />
                </div>
            </div>

            {/* ── Decision Surfaces ── */}
            <div>
                <p className="zone-label mb-2">Decision Surfaces</p>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-5">
                        <RecentActivity activities={recentActivity} />
                    </div>
                    <div className="lg:col-span-4">
                        <ComplianceAlerts />
                    </div>
                    <div className="lg:col-span-3 space-y-4">
                        <OnboardingSnapshot employees={onboardingSnapshot} loading={onboardingLoading} />
                        <QuickActions />
                    </div>
                </div>
            </div>
        </div>
    );
}
