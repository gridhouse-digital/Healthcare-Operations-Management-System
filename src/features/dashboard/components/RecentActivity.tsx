import { formatDistanceToNow } from 'date-fns';
import { Users, FileText, Briefcase, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActivityItem } from '@/services/dashboardService';

interface RecentActivityProps {
    activities: ActivityItem[];
}

const typeConfig = {
    applicant: {
        icon: Users,
        dotClass: 'bg-[hsl(196,84%,42%)]',
        label: 'Applicant',
    },
    offer: {
        icon: FileText,
        dotClass: 'bg-[hsl(152,60%,40%)]',
        label: 'Offer',
    },
    employee: {
        icon: Briefcase,
        dotClass: 'bg-[hsl(270,56%,52%)]',
        label: 'Employee',
    },
};

export function RecentActivity({ activities }: RecentActivityProps) {
    return (
        <section className="animate-reveal-up delay-200 bg-card rounded-lg border border-border overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                <div className="flex items-center gap-2.5">
                    <Activity size={14} strokeWidth={2} className="text-muted-foreground/60" />
                    <h3 className="text-[13px] font-semibold text-foreground">Activity Feed</h3>
                </div>
                {activities.length > 0 && (
                    <span className="text-[11px] font-medium text-muted-foreground/50">
                        Last {activities.length} events
                    </span>
                )}
            </div>

            {/* Feed */}
            <div className="divide-y divide-border/40">
                {activities.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                        <p className="text-[13px] text-muted-foreground/50 font-medium">No recent activity</p>
                    </div>
                ) : (
                    activities.map((activity, i) => {
                        const cfg = typeConfig[activity.type] ?? typeConfig.applicant;
                        const Icon = cfg.icon;
                        return (
                            <div
                                key={activity.id}
                                className="animate-reveal-right flex items-start gap-3.5 px-5 py-3 hover:bg-secondary/30 transition-colors"
                                style={{ animationDelay: `${(i + 2) * 60}ms` }}
                            >
                                {/* Type dot */}
                                <div className="flex flex-col items-center gap-1 pt-0.5 flex-shrink-0">
                                    <div className={cn('w-1.5 h-1.5 rounded-full', cfg.dotClass)} />
                                    {i < activities.length - 1 && (
                                        <div className="w-px flex-1 bg-border/50 min-h-[16px]" />
                                    )}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0 pb-0.5">
                                    <p className="text-[13px] font-medium text-foreground leading-snug">
                                        {activity.message}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                                            {cfg.label}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground/40">·</span>
                                        <span className="text-[11px] text-muted-foreground/50 font-medium tabular-nums">
                                            {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </section>
    );
}
