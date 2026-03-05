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
    default: { accent: 'hsl(196 84% 52%)',  iconBg: 'hsl(196 84% 52% / 0.09)', iconColor: 'hsl(196 84% 58%)' },
    info:    { accent: 'hsl(210 80% 58%)',   iconBg: 'hsl(210 80% 58% / 0.09)', iconColor: 'hsl(210 80% 62%)' },
    success: { accent: 'hsl(142 60% 48%)',   iconBg: 'hsl(142 60% 48% / 0.09)', iconColor: 'hsl(142 60% 52%)' },
    warning: { accent: 'hsl(43 94% 56%)',    iconBg: 'hsl(43 94% 56% / 0.09)',  iconColor: 'hsl(43 94% 56%)' },
    danger:  { accent: 'hsl(0 72% 62%)',     iconBg: 'hsl(0 72% 62% / 0.09)',   iconColor: 'hsl(0 72% 62%)' },
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
            <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '2.125rem', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1, color: 'var(--foreground)' }}>
                {value}
            </p>

            {/* Footer */}
            <div className="flex items-center gap-2 mt-2.5">
                {trend && (
                    <span
                        className="inline-flex items-center gap-0.5 text-[11px] font-semibold"
                        style={{ color: trend.isPositive ? 'hsl(142 60% 48%)' : 'hsl(0 72% 62%)' }}
                    >
                        {trend.isPositive ? <TrendingUp size={10} strokeWidth={2.5} /> : <TrendingDown size={10} strokeWidth={2.5} />}
                        {trend.value}%
                    </span>
                )}
                {subtitle && (
                    <span
                        className="text-[11px]"
                        style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.02em', color: 'var(--muted-foreground)', opacity: 0.5 }}
                    >
                        {subtitle}
                    </span>
                )}
            </div>
        </div>
    );
}
