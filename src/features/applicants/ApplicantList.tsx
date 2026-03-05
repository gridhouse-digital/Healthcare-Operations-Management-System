import { useState, useEffect } from 'react';
import { useApplicants, useSyncApplicants } from '@/hooks/useApplicants';
import { settingsService } from '@/services/settingsService';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { format } from 'date-fns';
import { Search, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export function ApplicantList() {
    const { data: applicants = [], isLoading: loading, error } = useApplicants();
    const syncMutation = useSyncApplicants();
    const navigate = useNavigate();

    console.log('ApplicantList: applicants data:', applicants);
    console.log('ApplicantList: loading:', loading);
    console.log('ApplicantList: error:', error);

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
        <div className="severity-critical rounded-md bg-[hsl(4,82%,54%)]/6 border border-[hsl(4,82%,54%)]/20 p-4">
            <p className="text-[13px] font-semibold text-[hsl(4,64%,44%)] dark:text-[hsl(4,72%,62%)]">
                Failed to load applicants: {error.message}
            </p>
        </div>
    );

    return (
        <div className="space-y-4 animate-fade-in">
            {/* ── Page header ── */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                    <h1 className="text-foreground" style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.875rem', fontWeight: 400, letterSpacing: '-0.025em', lineHeight: 1.1 }}>
                        Applicants
                    </h1>
                    <p className="mt-1 text-muted-foreground/55" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                        {filteredApplicants.length} records
                        {filterStatus !== 'all' && ` · ${filterStatus}`}
                        {searchTerm && ` · "${searchTerm}"`}
                    </p>
                </div>
                <button
                    onClick={() => {
                        syncMutation.mutate(undefined, {
                            onSuccess: () => toast.success('Synced with JotForm'),
                            onError: (err) => toast.error(`Sync failed: ${err.message}`),
                        });
                    }}
                    disabled={syncMutation.isPending}
                    className="
                        flex items-center justify-center gap-2
                        h-8 px-3.5
                        bg-primary text-primary-foreground
                        rounded-md text-[13px] font-semibold
                        hover:bg-primary/90 active:scale-[0.98]
                        transition-all duration-100
                        whitespace-nowrap w-full sm:w-auto
                        disabled:opacity-40 disabled:cursor-not-allowed
                        shadow-sm
                    "
                >
                    <RefreshCw size={13} strokeWidth={2.25} className={syncMutation.isPending ? 'animate-spin' : ''} />
                    {syncMutation.isPending ? 'Syncing…' : 'Sync JotForm'}
                </button>
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
                <select
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value)}
                    className="h-8 px-2.5 pr-7 bg-card border border-border rounded-md text-[13px] font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all appearance-none cursor-pointer"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%23888' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
                >
                    <option value="all">All roles</option>
                    {availableRoles.map((role) => (
                        <option key={role} value={role}>{role}</option>
                    ))}
                </select>

                {/* Status select */}
                <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="h-8 px-2.5 pr-7 bg-card border border-border rounded-md text-[13px] font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all appearance-none cursor-pointer"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%23888' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
                >
                    <option value="all">All statuses</option>
                    <option value="New">New</option>
                    <option value="Screening">Screening</option>
                    <option value="Interview">Interview</option>
                    <option value="Offer">Offer</option>
                    <option value="Hired">Hired</option>
                    <option value="Rejected">Rejected</option>
                </select>
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
                                                style={{ fontFamily: 'var(--font-mono)', background: 'hsl(196 84% 52% / 0.12)', color: 'hsl(196 84% 62%)' }}
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
                                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
                                            JotForm
                                        </span>
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
