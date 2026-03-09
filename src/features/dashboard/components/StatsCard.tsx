import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatsCardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    trend?: { value: number; isPositive: boolean; };
    subtitle?: string;
    intent?: 'default' | 'success' | 'warning' | 'danger' | 'info';
    stagger?: number;
}

const intentMap = {
    default: { accent: 'var(--primary)',          iconBg: 'color-mix(in srgb, var(--primary) 12%, transparent)',          iconColor: 'var(--primary)' },
    info:    { accent: 'var(--chart-3)',          iconBg: 'color-mix(in srgb, var(--chart-3) 12%, transparent)',          iconColor: 'var(--chart-3)' },
    success: { accent: 'var(--severity-low)',     iconBg: 'color-mix(in srgb, var(--severity-low) 12%, transparent)',     iconColor: 'var(--severity-low)' },
    warning: { accent: 'var(--severity-medium)',  iconBg: 'color-mix(in srgb, var(--severity-medium) 12%, transparent)',  iconColor: 'var(--severity-medium)' },
    danger:  { accent: 'var(--severity-critical)',iconBg: 'color-mix(in srgb, var(--severity-critical) 12%, transparent)',iconColor: 'var(--severity-critical)' },
};

const staggerDelays = [0, 50, 100, 150, 200, 250, 300, 350];

export function StatsCard({ title, value, icon: Icon, trend, subtitle, intent = 'default', stagger = 0 }: StatsCardProps) {
    const s = intentMap[intent];
    const delay = staggerDelays[Math.min(stagger, staggerDelays.length - 1)];

    return (
        <div
            className={cn('animate-reveal-up relative rounded-lg overflow-hidden transition-all duration-150 cursor-default')}
            style={{ animationDelay: `${delay}ms`, background: 'var(--card)', border: '1px solid var(--border)', padding: '16px 16px 14px 20px' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
        >
            {/* Left accent bar */}
            <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: s.accent }} />

            {/* Header row */}
            <div className="flex items-start justify-between mb-3">
                <span className="zone-label">{title}</span>
                <div className="flex-shrink-0 p-1.5 rounded-md" style={{ background: s.iconBg }}>
                    <Icon size={13} strokeWidth={1.75} style={{ color: s.iconColor }} />
                </div>
            </div>

            {/* Big number */}
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--foreground)' }}>
                {value}
            </p>

            {/* Footer */}
            <div className="flex items-center gap-2 mt-2.5">
                {trend && (
                    <span
                        className="inline-flex items-center gap-0.5 text-[11px] font-semibold"
                        style={{ color: trend.isPositive ? 'var(--severity-low)' : 'var(--severity-critical)' }}
                    >
                        {trend.isPositive ? <TrendingUp size={10} strokeWidth={2.5} /> : <TrendingDown size={10} strokeWidth={2.5} />}
                        {trend.value}%
                    </span>
                )}
                {subtitle && (
                    <span
                        className="text-[11px]"
                        style={{ fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em', color: 'var(--muted-foreground)', opacity: 0.8 }}
                    >
                        {subtitle}
                    </span>
                )}
            </div>
        </div>
    );
}
