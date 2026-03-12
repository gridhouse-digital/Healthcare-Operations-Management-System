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

const SOURCE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    jotform:  { bg: 'color-mix(in srgb, var(--severity-medium) 12%, transparent)', text: 'var(--severity-high)', border: 'color-mix(in srgb, var(--severity-medium) 22%, transparent)' },
    bamboohr: { bg: 'color-mix(in srgb, var(--severity-low) 12%, transparent)', text: 'var(--severity-low)', border: 'color-mix(in srgb, var(--severity-low) 22%, transparent)' },
    jazzhr:   { bg: 'color-mix(in srgb, var(--primary) 12%, transparent)', text: 'var(--primary)', border: 'color-mix(in srgb, var(--primary) 22%, transparent)' },
};

function SourceBadge({ source }: { source?: string }) {
    const s = source?.toLowerCase() || 'unknown';
    const label = s === 'bamboohr' ? 'BambooHR' : s === 'jazzhr' ? 'JazzHR' : s === 'jotform' ? 'JotForm' : s;
    const colors = SOURCE_COLORS[s];

    if (!colors) {
        return (
            <span className="text-[10px] font-semibold uppercase tracking-[0.03em] text-muted-foreground/50">
                {label}
            </span>
        );
    }

    return (
        <span
            className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.03em]"
            style={{
                background: colors.bg,
                color: colors.text,
                borderColor: colors.border,
            }}
        >
            {label}
        </span>
    );
}

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

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="w-5 h-5 rounded-full border-2 border-border border-t-primary animate-spin" />
        </div>
    );
    if (error) return (
        <div className="severity-critical rounded-md border border-destructive/15 bg-destructive/8 p-4">
            <p className="text-[13px] font-semibold text-destructive">
                Failed to load applicants: {error.message}
            </p>
        </div>
    );

    return (
        <div className="space-y-4 animate-fade-in">
            {/* ── Page header ── */}
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="pl-1">
                    <h1 className="page-header-title">Applicants</h1>
                    <p className="page-header-meta">
                        {filteredApplicants.length} records
                        {isPlatformAdmin && tenantFilter !== 'all' && ` · ${tenantOptions.find((tenant) => tenant.id === tenantFilter)?.name ?? 'Selected tenant'}`}
                        {filterStatus !== 'all' && ` · ${filterStatus}`}
                        {searchTerm && ` · "${searchTerm}"`}
                    </p>
                </div>
                <Button
                    onClick={() => {
                        syncMutation.mutate(undefined, {
                            onSuccess: () => toast.success('Synced with JotForm'),
                            onError: (err) => toast.error(`Sync failed: ${err.message}`),
                        });
                    }}
                    disabled={syncMutation.isPending}
                    size="sm"
                    className="w-full sm:w-auto"
                >
                    <RefreshCw size={13} strokeWidth={2.25} className={syncMutation.isPending ? 'animate-spin' : ''} />
                    {syncMutation.isPending ? 'Syncing…' : 'Sync JotForm'}
                </Button>
            </div>

            {/* ── Filter toolbar ── */}
            <div className="flex items-center gap-2 flex-wrap">
                {/* Search */}
                <div className="relative flex-1 min-w-[180px] max-w-[300px]">
                    <Search
                        size={13}
                        strokeWidth={2}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 pointer-events-none"
                    />
                    <input
                        type="text"
                        placeholder="Search name or email…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="
                            w-full h-8 pl-8 pr-3
                            bg-card border border-border rounded-md
                            text-[13px] font-medium text-foreground
                            placeholder:text-muted-foreground/35
                            focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/50
                            transition-all
                        "
                    />
                </div>

                {/* Role select */}
                <AppSelect
                    value={filterRole}
                    onValueChange={setFilterRole}
                    options={[
                        { value: 'all', label: 'All roles' },
                        ...availableRoles.map((role) => ({ value: role, label: role })),
                    ]}
                    className="h-8 bg-card border border-border text-[13px] font-medium focus:ring-1 focus:ring-primary/40 transition-all"
                />

                {isPlatformAdmin && (
                    <AppSelect
                        value={tenantFilter}
                        onValueChange={setTenantFilter}
                        options={[
                            { value: 'all', label: 'All tenants' },
                            ...tenantOptions.map((tenant) => ({ value: tenant.id, label: tenant.name })),
                        ]}
                        className="h-8 bg-card border border-border text-[13px] font-medium focus:ring-1 focus:ring-primary/40 transition-all"
                    />
                )}

                {/* Status select */}
                <AppSelect
                    value={filterStatus}
                    onValueChange={setFilterStatus}
                    options={[
                        { value: 'all', label: 'All statuses' },
                        { value: 'New', label: 'New' },
                        { value: 'Screening', label: 'Screening' },
                        { value: 'Interview', label: 'Interview' },
                        { value: 'Offer', label: 'Offer' },
                        { value: 'Hired', label: 'Hired' },
                        { value: 'Rejected', label: 'Rejected' },
                    ]}
                    className="h-8 bg-card border border-border text-[13px] font-medium focus:ring-1 focus:ring-primary/40 transition-all"
                />
            </div>

            {/* ── Table ── */}
            <div className="bg-card rounded-lg border border-border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
                                <th className="px-4 py-2.5 text-left zone-label">Applicant</th>
                                <th className="px-4 py-2.5 text-left zone-label">Position</th>
                                <th className="px-4 py-2.5 text-left zone-label">Status</th>
                                <th className="px-4 py-2.5 text-left zone-label hidden md:table-cell">Applied</th>
                                <th className="px-4 py-2.5 text-left zone-label hidden lg:table-cell">Source</th>
                                <th className="px-4 py-2.5 text-right zone-label w-16"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {filteredApplicants.map((applicant, i) => (
                                <tr
                                    key={applicant.id}
                                    className="animate-reveal-right transition-colors duration-75 cursor-pointer group"
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--secondary)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                                    style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
                                    onClick={() => navigate(`/applicants/${applicant.id}`)}
                                >
                                    {/* Name + email */}
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            {/* Monogram */}
                                            <div
                                                className="w-7 h-7 rounded-md text-[10px] font-bold flex items-center justify-center flex-shrink-0 select-none"
                                                style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }}
                                            >
                                                {applicant.first_name?.[0]}{applicant.last_name?.[0]}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[13px] font-semibold text-foreground leading-none truncate">
                                                    {applicant.first_name} {applicant.last_name}
                                                </p>
                                                <p className="text-[11px] text-muted-foreground/55 font-medium mt-0.5 truncate">
                                                    {applicant.email}
                                                </p>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Position */}
                                    <td className="px-4 py-3">
                                        <span className="text-[13px] font-medium text-foreground/80">{applicant.position_applied}</span>
                                    </td>

                                    {/* Status */}
                                    <td className="px-4 py-3">
                                        <StatusBadge status={applicant.status} size="sm" />
                                    </td>

                                    {/* Date */}
                                    <td className="px-4 py-3 hidden md:table-cell">
                                        <span className="text-[12px] text-muted-foreground/60 font-medium tabular-nums">
                                            {format(new Date(applicant.created_at), 'MMM d, yyyy')}
                                        </span>
                                    </td>

                                    {/* Source */}
                                    <td className="px-4 py-3 hidden lg:table-cell">
                                        <SourceBadge source={applicant.source} />
                                    </td>

                                    {/* Action */}
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); navigate(`/applicants/${applicant.id}`); }}
                                            className="text-[12px] font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            Open →
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredApplicants.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-14 text-center">
                                        <p className="text-[13px] font-medium text-muted-foreground/40">
                                            No applicants match your filters
                                        </p>
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
