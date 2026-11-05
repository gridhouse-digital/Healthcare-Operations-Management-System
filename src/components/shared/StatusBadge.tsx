import { CheckCircle2, Circle, CircleDashed, CircleDot, Clock, XCircle, type LucideIcon } from 'lucide-react';

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

export type StatusTone = 'neutral' | 'active' | 'done' | 'waiting' | 'critical' | 'untracked';

interface StatusBadgeProps {
    status: StatusType | string;
    /** Sets the tone for a status outside the workflow list below */
    tone?: StatusTone;
    size?: 'sm' | 'md';
}

/* Every status carries an icon and a word, so colour is never the only signal */
const tones: Record<StatusTone, { chip: string; icon: LucideIcon }> = {
    neutral:   { chip: 'status-chip-muted', icon: Circle },
    active:    { chip: 'status-chip-cyan',  icon: CircleDot },
    done:      { chip: 'status-chip-green', icon: CheckCircle2 },
    waiting:   { chip: 'status-chip-amber', icon: Clock },
    critical:  { chip: 'status-chip-red',   icon: XCircle },
    untracked: { chip: 'status-chip-muted', icon: CircleDashed },
};

const toneByStatus: Record<string, StatusTone> = {
    'New': 'neutral',
    'Draft': 'neutral',
    'Screening': 'active',
    'Interview': 'active',
    'Offer': 'active',
    'Accepted': 'active',
    'Sent': 'active',
    'Hired': 'done',
    'Onboarding': 'active',
    'Onboarding Started': 'active',
    'Onboarding Completed': 'done',
    'Active': 'done',
    'Pending_Approval': 'waiting',
    'Suspended': 'waiting',
    'Rejected': 'critical',
    'Declined': 'critical',
    'Terminated': 'critical',
};

/* Stored values like Pending_Approval or ACTIVE read as plain words on screen */
function displayLabel(status: string) {
    const words = status.replace(/_/g, ' ');
    return words === words.toUpperCase() && words.length > 2
        ? words.charAt(0) + words.slice(1).toLowerCase()
        : words;
}

export function StatusBadge({ status, tone }: StatusBadgeProps) {
    const { chip, icon: Icon } = tones[tone ?? toneByStatus[status] ?? 'neutral'];

    return (
        <span className={`status-chip gap-1.5 ${chip}`}>
            <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
            {displayLabel(status)}
        </span>
    );
}
