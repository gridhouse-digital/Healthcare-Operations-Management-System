import { ShieldAlert, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Alert {
    id: string;
    type: 'CPR' | 'TB Test' | 'CNA License';
    person: string;
    expiry: string;
    daysLeft: number;
    severity: 'critical' | 'high' | 'medium' | 'low';
}

const alerts: Alert[] = [
    { id: '1', type: 'CPR',         person: 'Jennifer Martinez', expiry: '2025-12-05', daysLeft: 2,  severity: 'critical' },
    { id: '2', type: 'CPR',         person: 'Robert Wilson',     expiry: '2025-12-08', daysLeft: 5,  severity: 'high' },
    { id: '3', type: 'TB Test',     person: 'Michael Brown',     expiry: '2025-12-15', daysLeft: 12, severity: 'medium' },
    { id: '4', type: 'CNA License', person: 'Lisa Anderson',     expiry: '2026-01-10', daysLeft: 45, severity: 'low' },
];

const severityConfig = {
    critical: {
        barClass:  'severity-critical',
        dotColor:  'hsl(4 82% 52%)',
        labelStyle: { color: 'hsl(4 76% 62%)', background: 'hsl(4 82% 52% / 0.10)' },
        dayColor:  'hsl(4 76% 62%)',
        dayWeight: '700',
    },
    high: {
        barClass:  'severity-high',
        dotColor:  'hsl(22 88% 52%)',
        labelStyle: { color: 'hsl(22 88% 62%)', background: 'hsl(22 88% 52% / 0.10)' },
        dayColor:  'hsl(22 88% 62%)',
        dayWeight: '600',
    },
    medium: {
        barClass:  'severity-medium',
        dotColor:  'hsl(38 96% 50%)',
        labelStyle: { color: 'hsl(38 92% 60%)', background: 'hsl(38 96% 50% / 0.10)' },
        dayColor:  'hsl(38 92% 60%)',
        dayWeight: '500',
    },
    low: {
        barClass:  'severity-low',
        dotColor:  'hsl(48 96% 50%)',
        labelStyle: { color: 'hsl(48 90% 62%)', background: 'hsl(48 96% 50% / 0.08)' },
        dayColor:  'hsl(0 0% 44%)',
        dayWeight: '500',
    },
};

export function ComplianceAlerts() {
    const urgentCount = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').length;

    return (
        <section className="animate-reveal-up delay-300 bg-card rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                <div className="flex items-center gap-2.5">
                    <ShieldAlert
                        size={14}
                        strokeWidth={2}
                        style={{ color: 'hsl(38 90% 54%)' }}
                    />
                    <h3 className="text-[13px] font-semibold text-foreground">Compliance Alerts</h3>
                    {urgentCount > 0 && (
                        <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-bold text-white"
                            style={{ background: 'hsl(4 82% 54%)' }}>
                            {urgentCount}
                        </span>
                    )}
                </div>
                <button className="text-[11px] font-medium text-primary hover:text-primary/70 transition-colors flex items-center gap-0.5">
                    Manage <ChevronRight size={11} strokeWidth={2.5} />
                </button>
            </div>

            <div className="divide-y divide-border/50">
                {alerts.map((alert, i) => {
                    const cfg = severityConfig[alert.severity];
                    return (
                        <div
                            key={alert.id}
                            className={cn(
                                'animate-reveal-right flex items-center gap-4 px-5 py-3 transition-colors cursor-pointer',
                                cfg.barClass,
                            )}
                            style={{ animationDelay: `${(i + 4) * 50}ms` }}
                            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'hsl(0 0% 100% / 0.03)'}
                            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                        >
                            <div
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{ background: cfg.dotColor }}
                            />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                    <span className="text-[13px] font-semibold text-foreground">{alert.person}</span>
                                    <span
                                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                        style={cfg.labelStyle}
                                    >
                                        {alert.type}
                                    </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground/60 font-medium mt-0.5">
                                    Expires {alert.expiry}
                                </p>
                            </div>
                            <div className="flex-shrink-0 text-right">
                                <p
                                    className="text-[13px] leading-none tabular-nums"
                                    style={{ color: cfg.dayColor, fontWeight: cfg.dayWeight }}
                                >
                                    {alert.daysLeft}d
                                </p>
                                <p className="text-[10px] text-muted-foreground/40 font-medium mt-0.5">left</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
