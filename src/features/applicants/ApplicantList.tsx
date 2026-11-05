import { useState, useEffect } from 'react';
import { useApplicantTenants, useApplicants, useSyncApplicants } from '@/hooks/useApplicants';
import { settingsService } from '@/services/settingsService';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { format } from 'date-fns';
import { Search, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AppSelect } from '@/components/ui/AppSelect';
import { useUserRole } from '@/hooks/useUserRole';
import { useTableSort, type SortColumn } from '@/hooks/useTableSort';
import { SortableHeader } from '@/components/shared/SortableHeader';
import type { Applicant } from '@/types';

const STATUS_TABS = ['New', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'];

function sourceLabel(source?: string) {
    const s = source?.toLowerCase() || 'unknown';
    return s === 'bamboohr' ? 'BambooHR' : s === 'jazzhr' ? 'JazzHR' : s === 'jotform' ? 'JotForm' : s;
}

const SORT_COLUMNS = {
    name: { value: (row) => `${row.first_name} ${row.last_name}` },
    position: { value: (row) => row.position_applied },
    status: { value: (row) => row.status },
    source: { value: (row) => sourceLabel(row.source) },
    applied: { value: (row) => row.created_at, kind: 'date' },
} satisfies Record<string, SortColumn<Applicant>>;

const DEFAULT_SORT = { key: 'applied', direction: 'desc' } as const;

export function ApplicantList() {
    const { isPlatformAdmin } = useUserRole();
    const [tenantFilter, setTenantFilter] = useState('all');
    const { data: applicants = [], isLoading: loading, error } = useApplicants(
        isPlatformAdmin ? tenantFilter : undefined,
    );
    const { data: tenantOptions = [] } = useApplicantTenants(isPlatformAdmin);
    const syncMutation = useSyncApplicants();
    const navigate = useNavigate();

    // UI States
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterRole, setFilterRole] = useState('all');
    const [availableRoles, setAvailableRoles] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const loadRoles = async () => {
            const roles = await settingsService.getJobRoles();
            setAvailableRoles(roles);
        };
        loadRoles();
    }, []);

    const filteredApplicants = applicants.filter(applicant => {
        const matchesStatus = filterStatus === 'all' || applicant.status === filterStatus;
        const matchesRole = filterRole === 'all' || applicant.position_applied === filterRole;
        const fullName = `${applicant.first_name} ${applicant.last_name}`.toLowerCase();
        const matchesSearch = fullName.includes(searchTerm.toLowerCase()) ||
            applicant.email.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesStatus && matchesRole && matchesSearch;
    });
    const { sortedRows: sortedApplicants, sortProps } = useTableSort(filteredApplicants, SORT_COLUMNS, DEFAULT_SORT);

    if (loading) return (
        <div className="space-y-6" aria-busy="true" aria-label="Loading applicants">
            <div className="h-9 w-48 rounded-md ai-shimmer" />
            <div className="divide-y divide-border border-y border-border">
                {[1, 2, 3, 4, 5, 6].map((row) => (
                    <div key={row} className="flex items-center gap-3 py-3">
                        <div className="h-9 w-9 rounded-full ai-shimmer" />
                        <div className="h-3 w-1/4 rounded ai-shimmer" />
                        <div className="ml-auto h-3 w-1/5 rounded ai-shimmer" />
                    </div>
                ))}
            </div>
        </div>
    );
    if (error) return (
        <div className="severity-critical rounded-md border border-destructive/15 bg-destructive/8 p-4">
            <p className="text-[13px] font-semibold text-destructive">
                Failed to load applicants: {error.message}
            </p>
        </div>
    );

    const countFor = (status: string) => applicants.filter((applicant) => applicant.status === status).length;
    const tenantName = isPlatformAdmin && tenantFilter !== 'all'
        ? tenantOptions.find((tenant) => tenant.id === tenantFilter)?.name ?? 'Selected tenant'
        : null;

    return (
        <div className="space-y-6">
            {/* ── Page header ── */}
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                    <h1 className="page-header-title">Applicants</h1>
                    <p className="page-header-meta tabular-nums">
                        {[
                            `${filteredApplicants.length} records`,
                            tenantName,
                            filterStatus !== 'all' ? filterStatus : null,
                            searchTerm ? `“${searchTerm}”` : null,
                        ].filter(Boolean).join(', ')}
                    </p>
                </div>
                <Button
                    onClick={() => {
                        syncMutation.mutate(undefined, {
                            onSuccess: () => toast.success('Synced with JotForm'),
                            onError: (err) => toast.error(err.message),
                        });
                    }}
                    disabled={syncMutation.isPending}
                    className="w-full sm:w-auto"
                >
                    <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" className={syncMutation.isPending ? 'animate-spin' : ''} />
                    {syncMutation.isPending ? 'Syncing…' : 'Sync JotForm'}
                </Button>
            </div>

            <div>
                {/* ── The pipeline: status as a ruled list ── */}
                <div className="tab-bar" aria-label="Filter by status">
                    {[{ value: 'all', label: 'All statuses', count: applicants.length }, ...STATUS_TABS.map((status) => ({ value: status, label: status, count: countFor(status) }))].map((tab) => {
                        const active = filterStatus === tab.value;
                        return (
                            <button
                                key={tab.value}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setFilterStatus(tab.value)}
                                className={`tab-item${active ? ' active' : ''}`}
                            >
                                {tab.label}
                                <span className={`tab-count ${active ? 'tab-count-active' : 'tab-count-inactive'}`}>{tab.count}</span>
                            </button>
                        );
                    })}
                </div>

                {/* ── Filter toolbar ── */}
                <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                    <div className="relative min-w-0 flex-1 sm:max-w-sm">
                        <Search size={14} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            aria-label="Search applicants by name or email"
                            placeholder="Search name or email…"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="saas-input pl-9"
                        />
                    </div>

                    <AppSelect
                        value={filterRole}
                        onValueChange={setFilterRole}
                        options={[
                            { value: 'all', label: 'All roles' },
                            ...availableRoles.map((role) => ({ value: role, label: role })),
                        ]}
                        className="min-h-10 sm:w-56"
                    />

                    {isPlatformAdmin && (
                        <AppSelect
                            value={tenantFilter}
                            onValueChange={setTenantFilter}
                            options={[
                                { value: 'all', label: 'All tenants' },
                                ...tenantOptions.map((tenant) => ({ value: tenant.id, label: tenant.name })),
                            ]}
                            className="min-h-10 sm:w-56"
                        />
                    )}
                </div>

                {/* ── The list: rules only, no box around it ── */}
                <div className="overflow-x-auto border-t border-border">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border">
                                <SortableHeader label="Applicant" {...sortProps('name')} className="py-3 pr-4 text-left" />
                                <SortableHeader label="Position" {...sortProps('position')} className="hidden py-3 pr-4 text-left sm:table-cell" />
                                <SortableHeader label="Status" {...sortProps('status')} className="hidden py-3 pr-4 text-left sm:table-cell" />
                                <SortableHeader label="Source" {...sortProps('source')} className="hidden py-3 pr-4 text-left lg:table-cell" />
                                <SortableHeader label="Applied" {...sortProps('applied')} className="hidden py-3 pr-4 text-right md:table-cell" />
                                <th className="w-16 py-3 text-right zone-label"><span className="visually-hidden">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {sortedApplicants.map((applicant) => (
                                <tr
                                    key={applicant.id}
                                    className="table-row-interactive group"
                                    onClick={() => navigate(`/applicants/${applicant.id}`)}
                                >
                                    {/* Name + email */}
                                    <td className="max-w-0 py-3 pr-4 sm:max-w-none">
                                        <div className="flex items-center gap-3">
                                            <span
                                                aria-hidden="true"
                                                className="flex h-9 w-9 flex-shrink-0 select-none items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground"
                                            >
                                                {applicant.first_name?.[0]}{applicant.last_name?.[0]}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-foreground">
                                                    {applicant.first_name} {applicant.last_name}
                                                </p>
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {applicant.email}
                                                </p>
                                                <p className="truncate text-xs text-muted-foreground sm:hidden">
                                                    {applicant.position_applied}
                                                </p>
                                                <div className="mt-1 sm:hidden">
                                                    <StatusBadge status={applicant.status} size="sm" />
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Position */}
                                    <td className="hidden py-3 pr-4 sm:table-cell">
                                        <span className="text-sm text-secondary-foreground">{applicant.position_applied}</span>
                                    </td>

                                    {/* Status */}
                                    <td className="hidden py-3 pr-4 sm:table-cell">
                                        <StatusBadge status={applicant.status} size="sm" />
                                    </td>

                                    {/* Source */}
                                    <td className="hidden py-3 pr-4 lg:table-cell">
                                        <span className="text-sm text-muted-foreground">{sourceLabel(applicant.source)}</span>
                                    </td>

                                    {/* Date */}
                                    <td className="hidden whitespace-nowrap py-3 pr-4 text-right md:table-cell">
                                        <span className="text-sm tabular-nums text-muted-foreground">
                                            {format(new Date(applicant.created_at), 'MMM d, yyyy')}
                                        </span>
                                    </td>

                                    {/* Action */}
                                    <td className="py-3 text-right">
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); navigate(`/applicants/${applicant.id}`); }}
                                            className="min-h-8 text-sm font-medium text-primary transition-opacity hover:text-accent-hi focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                                        >
                                            Open
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredApplicants.length === 0 && (
                                <tr>
                                    <td colSpan={6}>
                                        <div className="empty-state">
                                            <p className="empty-state-title">No applicants match your filters</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
