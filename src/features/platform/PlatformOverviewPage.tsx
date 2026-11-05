import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Building2, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageSkeleton } from '@/components/shared/PageSkeleton';
import { SortableHeader } from '@/components/shared/SortableHeader';
import { StatusBadge, type StatusTone } from '@/components/shared/StatusBadge';
import { NotTrackedState } from '@/components/shared/NotTrackedState';
import { SlideOver } from '@/components/ui/SlideOver';
import { useTableSort, type SortColumn } from '@/hooks/useTableSort';
import { StatsCard } from '@/features/dashboard/components/StatsCard';
import {
    platformService,
    type AgencyConnection,
    type AgencyStatus,
    type AgencySummary,
} from '@/services/platformService';

const STATUS: Record<AgencyStatus, { label: string; tone: StatusTone }> = {
    ok: { label: 'Healthy', tone: 'done' },
    attention: { label: 'Needs attention', tone: 'waiting' },
    not_connected: { label: 'Not connected', tone: 'untracked' },
    no_data: { label: 'No data yet', tone: 'untracked' },
};

const SOURCE_LABELS: Record<string, string> = {
    jazzhr: 'JazzHR',
    bamboohr: 'BambooHR',
    wordpress: 'WordPress',
    learndash: 'LearnDash',
    jotform: 'JotForm',
};

const SORT_COLUMNS = {
    name: { value: (row) => row.name },
    employees: { value: (row) => row.employees, kind: 'number' },
    onboarding: { value: (row) => row.employeesOnboarding, kind: 'number' },
    applicants: { value: (row) => row.applicants, kind: 'number' },
    training: { value: (row) => row.training?.completedPct, kind: 'number' },
    overdue: { value: (row) => row.training?.recurringOverdue, kind: 'number' },
    lastSync: { value: (row) => row.lastSyncAt, kind: 'date' },
    status: { value: (row) => STATUS[row.status].label },
} satisfies Record<string, SortColumn<AgencySummary>>;

function timeAgo(value: string | null) {
    return value ? formatDistanceToNow(new Date(value), { addSuffix: true }) : 'Never';
}

function sourceLabel(source: string) {
    return SOURCE_LABELS[source] ?? source;
}

function Figure({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="min-w-0 space-y-1">
            <dt className="zone-label">{label}</dt>
            <dd className="text-sm tabular-nums text-foreground">{value}</dd>
        </div>
    );
}

function ConnectionRow({ connection, syncWindowDays }: { connection: AgencyConnection; syncWindowDays: number }) {
    const failing = connection.failedLastWindow > 0;
    return (
        <div className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
                <p className="text-sm font-medium text-foreground">{sourceLabel(connection.source)}</p>
                <p className="text-xs text-muted-foreground">
                    Last success {timeAgo(connection.lastSuccessAt).toLowerCase()}
                </p>
            </div>
            {failing
                ? <StatusBadge status={`${connection.failedLastWindow} failed in ${syncWindowDays} days`} tone="critical" />
                : <StatusBadge status={`No failures in ${syncWindowDays} days`} tone="done" />}
        </div>
    );
}

function AgencyDetails({ agency, syncWindowDays }: { agency: AgencySummary; syncWindowDays: number }) {
    const status = STATUS[agency.status];

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <h3 className="text-section min-w-0 text-foreground">{agency.name}</h3>
                <StatusBadge status={status.label} tone={status.tone} />
            </div>

            <section className="space-y-4 border-t border-border pt-6">
                <h3 className="text-title text-foreground">People</h3>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <Figure label="Employees" value={agency.employees} />
                    <Figure label="Active" value={agency.employeesActive} />
                    <Figure label="Onboarding" value={agency.employeesOnboarding} />
                    <Figure label="Applicants" value={agency.applicants} />
                    <Figure label="Team users" value={agency.teamUsers} />
                </dl>
            </section>

            <section className="space-y-4 border-t border-border pt-6">
                <div>
                    <h3 className="text-title text-foreground">Training</h3>
                    <p className="mt-1 text-xs text-muted-foreground">From HOMS records. The compliance plugin isn't connected yet.</p>
                </div>
                {agency.training ? (
                    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                        <Figure label="Completed" value={agency.training.completed} />
                        <Figure label="In progress" value={agency.training.inProgress} />
                        <Figure label="Not started" value={agency.training.notStarted} />
                        <Figure label="Overdue renewals" value={agency.training.recurringOverdue} />
                        <Figure label="Completion" value={agency.training.completedPct === null ? '—' : `${agency.training.completedPct}%`} />
                    </dl>
                ) : (
                    <NotTrackedState title="No training records yet">
                        Nothing has reached HOMS for this agency.
                    </NotTrackedState>
                )}
            </section>

            <section className="space-y-2 border-t border-border pt-6">
                <h3 className="text-title text-foreground">Connected systems</h3>
                {agency.connections.length > 0 ? (
                    <div className="divide-y divide-border">
                        {agency.connections.map((connection) => (
                            <ConnectionRow key={connection.source} connection={connection} syncWindowDays={syncWindowDays} />
                        ))}
                    </div>
                ) : (
                    <NotTrackedState title="No connected systems">
                        Nothing is syncing for this agency.
                    </NotTrackedState>
                )}
            </section>
        </div>
    );
}

export function PlatformOverviewPage() {
    const { data, isLoading, error } = useQuery({
        queryKey: ['platform-overview'],
        queryFn: platformService.getOverview,
        retry: false,
    });
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const { sortedRows, sortProps } = useTableSort(data?.agencies ?? [], SORT_COLUMNS);

    if (isLoading) return <PageSkeleton label="Loading agencies" />;

    /* A failed load must never read as zero agencies or zero problems */
    if (error || !data) {
        return (
            <div className="space-y-6">
                <h1 className="page-header-title">Agency Overview</h1>
                <div className="severity-critical flex items-start gap-3 rounded-md border border-destructive/15 bg-destructive/8 p-4">
                    <ShieldAlert size={16} strokeWidth={1.75} className="mt-0.5 flex-shrink-0 text-destructive" aria-hidden="true" />
                    <p className="text-sm font-semibold text-destructive">The agency overview could not be loaded. Reload to try again.</p>
                </div>
            </div>
        );
    }

    const { totals, syncWindowDays } = data;
    const selected = data.agencies.find((agency) => agency.id === selectedId) ?? null;

    return (
        <div className="space-y-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                    <h1 className="page-header-title">Agency Overview</h1>
                    <p className="page-header-meta tabular-nums">
                        {totals.agencies === 1 ? '1 agency' : `${totals.agencies} agencies`}, updated {timeAgo(data.generatedAt)}
                    </p>
                </div>
                <Link to="/admin/access-requests" className="text-sm font-medium text-primary hover:text-accent-hi">
                    View access requests
                </Link>
            </div>

            <div className="tally tally-5">
                <StatsCard title="Agencies" value={totals.agencies} subtitle={totals.needingAttention === 1 ? '1 needs attention' : `${totals.needingAttention} need attention`} />
                <StatsCard title="Employees" value={totals.employees} subtitle={`${totals.employeesOnboarding} onboarding`} />
                <StatsCard title="Overdue Renewals" value={totals.recurringOverdue} subtitle="HOMS records" intent={totals.recurringOverdue > 0 ? 'warning' : 'default'} />
                <StatsCard title="Failed Syncs" value={totals.failedSyncs} subtitle={`Last ${syncWindowDays} days`} intent={totals.failedSyncs > 0 ? 'danger' : 'default'} />
                <StatsCard title="Open Requests" value={totals.openAccessRequests} subtitle="Waiting for review" />
            </div>

            <div className="overflow-x-auto border-t border-border">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border">
                            <SortableHeader label="Agency" {...sortProps('name')} className="py-3 pr-4 text-left" />
                            <SortableHeader label="Status" {...sortProps('status')} className="hidden py-3 pr-4 text-left sm:table-cell" />
                            <SortableHeader label="Employees" {...sortProps('employees')} className="hidden py-3 pr-4 text-right md:table-cell" />
                            <SortableHeader label="Onboarding" {...sortProps('onboarding')} className="hidden py-3 pr-4 text-right xl:table-cell" />
                            <SortableHeader label="Applicants" {...sortProps('applicants')} className="hidden py-3 pr-4 text-right xl:table-cell" />
                            <SortableHeader label="Training" {...sortProps('training')} className="hidden py-3 pr-4 text-right lg:table-cell" />
                            <SortableHeader label="Overdue" {...sortProps('overdue')} className="hidden py-3 pr-4 text-right lg:table-cell" />
                            <SortableHeader label="Last Sync" {...sortProps('lastSync')} className="hidden py-3 pr-4 text-right md:table-cell" />
                            <th scope="col" className="w-16 py-3 text-right zone-label"><span className="visually-hidden">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {sortedRows.map((agency) => {
                            const status = STATUS[agency.status];
                            return (
                                <tr key={agency.id} className="table-row-interactive group" onClick={() => setSelectedId(agency.id)}>
                                    <td className="max-w-0 py-3 pr-4 sm:max-w-none">
                                        <p className="truncate text-sm font-medium text-foreground">{agency.name}</p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {agency.connections.length > 0
                                                ? agency.connections.map((connection) => sourceLabel(connection.source)).join(', ')
                                                : 'No connected systems'}
                                        </p>
                                        <div className="mt-1 sm:hidden"><StatusBadge status={status.label} tone={status.tone} /></div>
                                    </td>
                                    <td className="hidden py-3 pr-4 sm:table-cell"><StatusBadge status={status.label} tone={status.tone} /></td>
                                    <td className="hidden py-3 pr-4 text-right text-sm tabular-nums text-secondary-foreground md:table-cell">{agency.employees}</td>
                                    <td className="hidden py-3 pr-4 text-right text-sm tabular-nums text-muted-foreground xl:table-cell">{agency.employeesOnboarding}</td>
                                    <td className="hidden py-3 pr-4 text-right text-sm tabular-nums text-muted-foreground xl:table-cell">{agency.applicants}</td>
                                    <td className="hidden whitespace-nowrap py-3 pr-4 text-right text-sm tabular-nums text-muted-foreground lg:table-cell">
                                        {agency.training?.completedPct != null ? `${agency.training.completedPct}%` : 'Not tracked yet'}
                                    </td>
                                    <td className="hidden py-3 pr-4 text-right text-sm tabular-nums text-muted-foreground lg:table-cell">
                                        {agency.training ? agency.training.recurringOverdue : '—'}
                                    </td>
                                    <td className="hidden whitespace-nowrap py-3 pr-4 text-right text-sm text-muted-foreground md:table-cell">
                                        {agency.connections.length > 0 ? timeAgo(agency.lastSyncAt) : 'Not connected'}
                                    </td>
                                    <td className="py-3 text-right">
                                        <button
                                            type="button"
                                            aria-label={`Open ${agency.name}`}
                                            onClick={(event) => { event.stopPropagation(); setSelectedId(agency.id); }}
                                            className="min-h-8 text-sm font-medium text-primary transition-opacity hover:text-accent-hi focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                                        >
                                            Open
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {sortedRows.length === 0 && (
                            <tr>
                                <td colSpan={9}>
                                    <div className="empty-state">
                                        <Building2 size={28} className="empty-state-icon" strokeWidth={1.75} aria-hidden="true" />
                                        <p className="empty-state-title">No agencies yet</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <SlideOver isOpen={!!selected} onClose={() => setSelectedId(null)} title="Agency" width="lg">
                {selected && <AgencyDetails agency={selected} syncWindowDays={syncWindowDays} />}
            </SlideOver>
        </div>
    );
}
