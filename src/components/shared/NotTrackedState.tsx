import type { ReactNode } from 'react';
import { StatusBadge } from './StatusBadge';

/* A section waiting on a missing feature. It must never read as "all clear", so it never shows a zero or a tick. */
export function NotTrackedState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
    return (
        <div className="flex flex-col items-start gap-2 px-6 py-6">
            <StatusBadge status="Not tracked yet" tone="untracked" />
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="max-w-prose text-sm text-muted-foreground">{children}</p>
            {action}
        </div>
    );
}
