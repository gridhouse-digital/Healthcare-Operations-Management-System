
/*
 * StatusBadge — Clinical Authority Design System
 * Uses left dot + label pattern for immediate visual scanning.
 * Colors map to real clinical workflow states, not just aesthetic choices.
 * Dark-first: no dark: prefixes — uses single values appropriate for dark zinc canvas.
 */

export type StatusType =
    | 'New'
    | 'Screening'
    | 'Interview'
    | 'Offer'
    | 'Hired'
    | 'Rejected'
    | 'Accepted'
    | 'Draft'
    | 'Pending_Approval'
    | 'Sent'
    | 'Declined'
    | 'Onboarding'
    | 'Onboarding Started'
    | 'Onboarding Completed'
    | 'Active'
    | 'Suspended'
    | 'Terminated';

interface StatusBadgeProps {
    status: StatusType | string;
    size?: 'sm' | 'md';
}

// dot color | text color | bg | border — all dark-first, no dark: prefixes
const statusMap: Record<string, { dot: string; text: string; bg: string; border: string }> = {
    'New':                  { dot: 'hsl(0 0% 42%)',         text: 'hsl(0 0% 56%)',        bg: 'hsl(0 0% 100% / 0.04)',        border: 'hsl(0 0% 100% / 0.08)' },
    'Screening':            { dot: 'var(--primary)',         text: 'color-mix(in srgb, var(--primary) 88%, white 12%)', bg: 'color-mix(in srgb, var(--primary) 12%, transparent)', border: 'color-mix(in srgb, var(--primary) 24%, transparent)' },
    'Interview':            { dot: 'var(--primary)',         text: 'color-mix(in srgb, var(--primary) 88%, white 12%)', bg: 'color-mix(in srgb, var(--primary) 12%, transparent)', border: 'color-mix(in srgb, var(--primary) 24%, transparent)' },
    'Offer':                { dot: 'var(--chart-5)',         text: 'color-mix(in srgb, var(--chart-5) 82%, white 18%)', bg: 'color-mix(in srgb, var(--chart-5) 12%, transparent)', border: 'color-mix(in srgb, var(--chart-5) 20%, transparent)' },
    'Accepted':             { dot: 'var(--chart-5)',         text: 'color-mix(in srgb, var(--chart-5) 82%, white 18%)', bg: 'color-mix(in srgb, var(--chart-5) 12%, transparent)', border: 'color-mix(in srgb, var(--chart-5) 20%, transparent)' },
    'Sent':                 { dot: 'var(--chart-5)',         text: 'color-mix(in srgb, var(--chart-5) 82%, white 18%)', bg: 'color-mix(in srgb, var(--chart-5) 12%, transparent)', border: 'color-mix(in srgb, var(--chart-5) 20%, transparent)' },
    'Hired':                { dot: 'hsl(152 58% 42%)',       text: 'hsl(152 54% 56%)',      bg: 'hsl(152 58% 38% / 0.10)',      border: 'hsl(152 58% 38% / 0.20)' },
    'Pending_Approval':     { dot: 'hsl(38 96% 52%)',        text: 'hsl(38 90% 60%)',       bg: 'hsl(38 96% 48% / 0.08)',       border: 'hsl(38 96% 48% / 0.20)' },
    'Onboarding':           { dot: 'var(--primary)',         text: 'color-mix(in srgb, var(--primary) 88%, white 12%)', bg: 'color-mix(in srgb, var(--primary) 12%, transparent)', border: 'color-mix(in srgb, var(--primary) 24%, transparent)' },
    'Onboarding Started':   { dot: 'var(--primary)',         text: 'color-mix(in srgb, var(--primary) 88%, white 12%)', bg: 'color-mix(in srgb, var(--primary) 12%, transparent)', border: 'color-mix(in srgb, var(--primary) 24%, transparent)' },
    'Onboarding Completed': { dot: 'hsl(152 58% 42%)',       text: 'hsl(152 54% 56%)',      bg: 'hsl(152 58% 38% / 0.10)',      border: 'hsl(152 58% 38% / 0.20)' },
    'Active':               { dot: 'hsl(152 58% 42%)',       text: 'hsl(152 54% 56%)',      bg: 'hsl(152 58% 38% / 0.10)',      border: 'hsl(152 58% 38% / 0.20)' },
    'Rejected':             { dot: 'hsl(4 82% 56%)',         text: 'hsl(4 76% 66%)',        bg: 'hsl(4 82% 52% / 0.08)',        border: 'hsl(4 82% 52% / 0.20)' },
    'Declined':             { dot: 'hsl(4 82% 56%)',         text: 'hsl(4 76% 66%)',        bg: 'hsl(4 82% 52% / 0.08)',        border: 'hsl(4 82% 52% / 0.20)' },
    'Terminated':           { dot: 'hsl(4 82% 56%)',         text: 'hsl(4 76% 66%)',        bg: 'hsl(4 82% 52% / 0.08)',        border: 'hsl(4 82% 52% / 0.20)' },
    'Suspended':            { dot: 'hsl(22 90% 54%)',        text: 'hsl(22 88% 62%)',       bg: 'hsl(22 90% 50% / 0.08)',       border: 'hsl(22 90% 50% / 0.20)' },
    'Draft':                { dot: 'hsl(0 0% 38%)',          text: 'hsl(0 0% 52%)',         bg: 'hsl(0 0% 100% / 0.04)',        border: 'hsl(0 0% 100% / 0.08)' },
};

const defaultStyle = statusMap['New'];

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
    const s = statusMap[status] ?? defaultStyle;

    const padding = size === 'sm' ? '2px 6px' : '2px 8px';
    const fontSize = size === 'sm' ? '10px' : '11px';
    const gap = size === 'sm' ? '4px' : '5px';
    const dotSize = size === 'sm' ? '5px' : '6px';

    return (
        <span
            className="inline-flex items-center rounded-full font-semibold tracking-[0.03em]"
            style={{
                padding,
                fontSize,
                gap,
                color: s.text,
                background: s.bg,
                border: `1px solid ${s.border}`,
            }}
        >
            <span
                className="flex-shrink-0 rounded-full"
                style={{
                    width: dotSize,
                    height: dotSize,
                    background: s.dot,
                }}
            />
            {status}
        </span>
    );
}
