interface ProgressBarProps {
    progress: number;
    showLabel?: boolean;
    size?: 'sm' | 'md' | 'lg';
    color?: 'blue' | 'green' | 'purple' | 'teal';
}

export function ProgressBar({
    progress,
    showLabel = true,
    size = 'md',
    color = 'blue'
}: ProgressBarProps) {
    const heightClasses = {
        sm: 'h-1.5',
        md: 'h-2',
        lg: 'h-3',
    };

    const colorClasses = {
        blue: 'bg-[var(--chart-4)]',
        green: 'bg-[var(--severity-low)]',
        purple: 'bg-[var(--chart-5)]',
        teal: 'bg-[var(--primary)]',
    };

    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-1">
                {showLabel && (
                    <span className="text-sm tabular-nums text-muted-foreground">{progress}%</span>
                )}
            </div>
            <div className={`w-full rounded-full bg-secondary ${heightClasses[size]} overflow-hidden`}>
                <div
                    className={`${heightClasses[size]} rounded-full ${colorClasses[color]}`}
                    style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
            </div>
        </div>
    );
}
