import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
    title: string;
    value: string | number;
    icon?: LucideIcon;
    trend?: { value: number; isPositive: boolean; };
    subtitle?: string;
    intent?: 'default' | 'success' | 'warning' | 'danger' | 'info';
    stagger?: number;
}

const intentColor = {
    default: 'var(--foreground)',
    info:    'var(--foreground)',
    success: 'var(--foreground)',
    warning: 'var(--severity-medium)',
    danger:  'var(--severity-critical)',
};

/* One cell of a ruled tally: a figure and its label, no tile, no icon */
export function StatsCard({ title, value, trend, subtitle, intent = 'default' }: StatsCardProps) {
    return (
        <div className="tally-cell">
            <p className="zone-label">{title}</p>
            <p className="data-value mt-2 text-3xl" style={{ color: intentColor[intent] }}>
                {value}
            </p>
            <div className="mt-2 flex items-center gap-2">
                {trend && (
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                        {trend.isPositive ? 'Up' : 'Down'} {trend.value}%
                    </span>
                )}
                {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
            </div>
        </div>
    );
}
