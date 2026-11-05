import { useEffect, useState, type ReactNode } from 'react';
import { PageSkeleton } from '@/components/shared/PageSkeleton';
import { employeeService } from '@/services/employeeService';
import type { Employee } from '@/types';
import { format } from 'date-fns';
import { Search, MoreHorizontal, Edit2, Save, X, Plus } from 'lucide-react';
import { StatusBadge, type StatusTone } from '@/components/shared/StatusBadge';
import { SlideOver } from '@/components/ui/SlideOver';
import { OnboardingSummaryPanel } from '@/components/ai/OnboardingSummaryPanel';
import { toast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { AppSelect } from '@/components/ui/AppSelect';
import { fetchAssignedGroupCourses } from '@/features/training/hooks/assignedGroupCourses';
import { useTableSort, type SortColumn } from '@/hooks/useTableSort';
import { SortableHeader } from '@/components/shared/SortableHeader';

const inputCls = "saas-input";
const labelCls = "form-label";

const SORT_COLUMNS = {
    name: { value: (row) => `${row.first_name} ${row.last_name}` },
    role: { value: (row) => row.job_title },
    status: { value: (row) => row.employee_status || 'Active' },
    source: { value: (row) => row.profile_source },
    department: { value: (row) => row.department },
    hired: { value: (row) => row.hired_at, kind: 'date' },
} satisfies Record<string, SortColumn<Employee>>;

const DEFAULT_SORT = { key: 'hired', direction: 'desc' } as const;

interface TrainingRecord {
    id: string;
    course_name: string;
    status: string;
    progress_pct: number;
}

interface RecurringComplianceRecord {
    instance_id: string;
    rule_id: string;
    rule_name: string;
    group_id: string;
    due_at: string;
    completed_at: string | null;
    completion_source: string | null;
    compliance_status: 'not_yet_due' | 'due_soon' | 'due' | 'overdue' | 'completed';
}

function recurringStatusLabel(status: RecurringComplianceRecord['compliance_status']) {
    switch (status) {
        case 'not_yet_due': return 'Not Yet Due';
        case 'due_soon': return 'Due Soon';
        case 'due': return 'Due';
        case 'overdue': return 'Overdue';
        case 'completed': return 'Completed';
    }
}

function recurringTone(status: RecurringComplianceRecord['compliance_status']): StatusTone {
    switch (status) {
        case 'completed': return 'done';
        case 'overdue': return 'critical';
        case 'due': return 'active';
        case 'due_soon': return 'waiting';
        case 'not_yet_due': return 'neutral';
    }
}

function trainingStatus(record: TrainingRecord): { label: string; tone: StatusTone } {
    if (record.status === 'completed') return { label: 'Completed', tone: 'done' };
    if (record.status === 'not_started') return { label: 'Not Started', tone: 'neutral' };
    return { label: 'In Progress', tone: 'waiting' };
}

type DrawerTab = 'overview' | 'training' | 'compliance';

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="grid gap-1 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words text-sm text-foreground">{children}</dd>
        </div>
    );
}

function isMissingSchema(error: unknown) {
    const code = (error as { code?: string } | null)?.code;
    const message = String((error as { message?: string } | null)?.message ?? '');
    return code === '42P01' ||
        code === 'PGRST205' ||
        /relation .* does not exist/i.test(message) ||
        /schema cache/i.test(message);
}

function formatCalendarDate(value: string | null): string {
    if (!value) return '—';

    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnlyMatch) {
        return format(
            new Date(
                Number(dateOnlyMatch[1]),
                Number(dateOnlyMatch[2]) - 1,
                Number(dateOnlyMatch[3]),
            ),
            'MMMM d, yyyy'
        );
    }

    return format(new Date(value), 'MMMM d, yyyy');
}

export function EmployeeList() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([]);
    const [recurringRecords, setRecurringRecords] = useState<RecurringComplianceRecord[]>([]);
    const [activeGroupIds, setActiveGroupIds] = useState<string[]>([]);
    const [loadingTraining, setLoadingTraining] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterDept, setFilterDept] = useState('all');

    const [drawerTab, setDrawerTab] = useState<DrawerTab>('overview');
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editFormData, setEditFormData] = useState<Partial<Employee>>({});

    useEffect(() => { loadEmployees(); }, []);

    useEffect(() => {
        if (selectedEmployee) {
            loadTrainingRecords(selectedEmployee.id);
            loadRecurringCompliance(selectedEmployee.id);
            loadActiveComplianceGroups(selectedEmployee.id);
        } else {
            setTrainingRecords([]);
            setRecurringRecords([]);
            setActiveGroupIds([]);
        }
    }, [selectedEmployee]);

    const loadEmployees = async () => {
        try {
            const data = await employeeService.getEmployees();
            setEmployees(data);
        } catch (err) {
            setError('Failed to load employees');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const loadTrainingRecords = async (personId: string) => {
        setLoadingTraining(true);
        try {
            let activeQuery = await supabase
                .from('v_onboarding_training_compliance')
                .select('training_record_id, course_name, effective_status, effective_completion_pct')
                .eq('person_id', personId)
                .order('course_name');

            if (activeQuery.error && isMissingSchema(activeQuery.error)) {
                const fallbackQuery = await supabase
                    .from('training_records')
                    .select('id, course_name, status, completion_pct')
                    .eq('person_id', personId)
                    .order('course_name');

                if (fallbackQuery.error) throw fallbackQuery.error;

                const normalized = (fallbackQuery.data || []).map((row) => ({
                    id: row.id,
                    course_name: row.course_name,
                    status: row.status,
                    progress_pct: row.completion_pct ?? 0,
                }));

                setTrainingRecords(normalized);

                return;
            }

            if (activeQuery.error) throw activeQuery.error;

            const normalized = (activeQuery.data || []).map((row) => ({
                id: row.training_record_id,
                course_name: row.course_name,
                status: row.effective_status,
                progress_pct: row.effective_completion_pct ?? 0,
            }));

            const assignedGroupCourses = await fetchAssignedGroupCourses([personId]);
            const existingCourseNames = new Set(
                normalized.map((record) => record.course_name.trim().toLowerCase())
            );

            const assignedRecords = assignedGroupCourses
                .filter((course) => {
                    const courseName = (course.course_name ?? `Course #${course.course_id}`).trim().toLowerCase();
                    return !existingCourseNames.has(courseName);
                })
                .map((course) => ({
                    id: `assigned:${personId}:${course.course_id}`,
                    course_name: course.course_name ?? `Course #${course.course_id}`,
                    status: 'not_started',
                    progress_pct: 0,
                }));

            const combinedRecords = [...normalized, ...assignedRecords]
                .sort((a, b) => a.course_name.localeCompare(b.course_name));

            setTrainingRecords(combinedRecords);
        } catch (err) {
            console.error('Failed to load training records', err);
        } finally {
            setLoadingTraining(false);
        }
    };

    const loadRecurringCompliance = async (personId: string) => {
        try {
            const { data, error: recurringErr } = await supabase
                .from('v_recurring_compliance_status')
                .select('instance_id, rule_id, rule_name, group_id, due_at, completed_at, completion_source, compliance_status, cycle_number')
                .eq('person_id', personId)
                .order('cycle_number', { ascending: false });

            if (recurringErr) {
                const message = recurringErr.message || '';
                if (/relation .* does not exist/i.test(message) || /schema cache/i.test(message)) {
                    setRecurringRecords([]);
                    return;
                }
                throw recurringErr;
            }

            const latestByRule = new Map<string, RecurringComplianceRecord>();
            for (const row of (data || []) as Array<RecurringComplianceRecord & { cycle_number?: number }>) {
                if (!latestByRule.has(row.rule_id)) {
                    latestByRule.set(row.rule_id, row);
                }
            }

            setRecurringRecords(Array.from(latestByRule.values()));
        } catch (err) {
            console.error('Failed to load recurring compliance', err);
            setRecurringRecords([]);
        }
    };

    const loadActiveComplianceGroups = async (personId: string) => {
        try {
            const { data, error: groupsErr } = await supabase
                .from('employee_group_enrollments')
                .select('group_id')
                .eq('person_id', personId)
                .eq('active', true)
                .order('group_id');

            if (groupsErr) throw groupsErr;

            setActiveGroupIds(
                Array.from(new Set((data || []).map((row) => row.group_id as string)))
            );
        } catch (err) {
            console.error('Failed to load active compliance groups', err);
            setActiveGroupIds([]);
        }
    };

    const handleEditClick = () => {
        if (selectedEmployee) {
            setEditFormData({
                first_name: selectedEmployee.first_name,
                last_name: selectedEmployee.last_name,
                email: selectedEmployee.email,
                phone: selectedEmployee.phone,
                job_title: selectedEmployee.job_title,
                department: selectedEmployee.department,
                hired_at: selectedEmployee.hired_at,
                employee_status: selectedEmployee.employee_status,
                primary_compliance_group_id: selectedEmployee.primary_compliance_group_id,
            });
            setIsEditing(true);
        }
    };

    const handleCancelEdit = () => { setIsEditing(false); setEditFormData({}); };

    const handleSaveEdit = async () => {
        if (!selectedEmployee || !editFormData) return;
        setIsSaving(true);
        try {
            const updatedEmployee = await employeeService.updateEmployee(selectedEmployee.id, editFormData);
            setSelectedEmployee(updatedEmployee);
            setEmployees(employees.map(emp => emp.id === updatedEmployee.id ? updatedEmployee : emp));
            setIsEditing(false);
            setEditFormData({});
            toast.success('Employee updated successfully!');
        } catch (err: any) {
            console.error('Failed to update employee:', err);
            toast.error(`Failed to update employee: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const filteredEmployees = employees.filter(employee => {
        const status = employee.employee_status || 'Active';
        const matchesStatus = filterStatus === 'all' || status === filterStatus;
        const matchesDept = filterDept === 'all' || employee.department === filterDept;
        const matchesSearch =
            `${employee.first_name} ${employee.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
            employee.email.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesStatus && matchesDept && matchesSearch;
    });
    const { sortedRows: sortedEmployees, sortProps } = useTableSort(filteredEmployees, SORT_COLUMNS, DEFAULT_SORT);

    if (loading) return (
        <PageSkeleton rows={8} label="Loading employees" />
    );
    if (error) return (
        <div className="flex items-center justify-center py-20">
            <span className="text-sm text-destructive">{error}</span>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                    <h1 className="page-header-title">Employees</h1>
                    <p className="page-header-meta tabular-nums">{employees.length} team members</p>
                </div>
                <Button className="w-full whitespace-nowrap sm:w-auto">
                    <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
                    Add Employee
                </Button>
            </div>

            <div>
                {/* Status as a ruled list, the same as Applicants */}
                <div className="tab-bar" aria-label="Filter by status">
                    {[
                        { value: 'all', label: 'All Statuses', count: employees.length },
                        ...['Active', 'Onboarding', 'Terminated'].map((status) => ({
                            value: status,
                            label: status,
                            count: employees.filter((employee) => (employee.employee_status || 'Active') === status).length,
                        })),
                    ].map((tab) => {
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

                {/* Search and department */}
                <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                    <div className="relative min-w-0 flex-1 sm:max-w-sm">
                        <Search size={14} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            aria-label="Search employees by name or email"
                            placeholder="Search by name or email…"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="saas-input pl-9"
                        />
                    </div>
                    <AppSelect
                        value={filterDept}
                        onValueChange={setFilterDept}
                        options={[
                            { value: 'all', label: 'All Departments' },
                            { value: 'Nursing', label: 'Nursing' },
                            { value: 'Care', label: 'Care' },
                            { value: 'Admin', label: 'Admin' },
                        ]}
                        className="min-h-10 sm:w-56"
                    />
                </div>

                {/* Employees Table */}
                <div className="overflow-x-auto border-t border-border">
                    <table className="w-full">
                        <thead className="border-b border-border">
                            <tr>
                                <SortableHeader label="Employee" {...sortProps('name')} className="py-3 pr-4 text-left" />
                                <SortableHeader label="Role" {...sortProps('role')} className="hidden py-3 pr-4 text-left sm:table-cell" />
                                <SortableHeader label="Status" {...sortProps('status')} className="hidden py-3 pr-4 text-left sm:table-cell" />
                                <SortableHeader label="Source" {...sortProps('source')} className="hidden py-3 pr-4 text-left lg:table-cell" />
                                <SortableHeader label="Dept" {...sortProps('department')} className="hidden py-3 pr-4 text-left lg:table-cell" />
                                <SortableHeader label="Hire Date" {...sortProps('hired')} className="hidden py-3 pr-4 text-right md:table-cell" />
                                <th className="px-5 py-3 text-left"><span className="zone-label sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {sortedEmployees.map((employee) => (
                                <tr
                                    key={employee.id}
                                    className="table-row-interactive"
                                    onClick={() => { setDrawerTab('overview'); setSelectedEmployee(employee); }}
                                >
                                    <td className="max-w-0 py-3 pr-4 sm:max-w-none">
                                        <div className="flex items-center gap-3">
                                            <div
                                                aria-hidden="true"
                                                className="flex h-9 w-9 flex-shrink-0 select-none items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground"
                                            >
                                                {employee.first_name[0]}{employee.last_name[0]}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm text-foreground font-medium truncate">
                                                    {employee.first_name} {employee.last_name}
                                                </span>
                                                <span className="text-xs text-muted-foreground truncate">{employee.email}</span>
                                                <span className="truncate text-xs text-muted-foreground sm:hidden">{employee.job_title || '—'}</span>
                                                <span className="mt-1 sm:hidden"><StatusBadge status={employee.employee_status || 'Active'} size="sm" /></span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="hidden py-3 pr-4 sm:table-cell">
                                        <span className="text-sm text-secondary-foreground">{employee.job_title || '—'}</span>
                                    </td>
                                    <td className="hidden py-3 pr-4 sm:table-cell">
                                        <StatusBadge status={employee.employee_status || 'Active'} size="sm" />
                                    </td>
                                    <td className="hidden py-3 pr-4 lg:table-cell">
                                        <span className="text-sm text-muted-foreground">{employee.profile_source || '—'}</span>
                                    </td>
                                    <td className="hidden py-3 pr-4 lg:table-cell">
                                        <span className="text-sm text-muted-foreground">{employee.department || '—'}</span>
                                    </td>
                                    <td className="hidden whitespace-nowrap py-3 pr-4 text-right md:table-cell">
                                        <span className="text-sm tabular-nums text-muted-foreground">
                                            {employee.hired_at ? format(new Date(employee.hired_at), 'MMM d, yyyy') : '—'}
                                        </span>
                                    </td>
                                    <td className="py-3 pr-4">
                                        <button
                                            type="button"
                                            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                            onClick={(e) => { e.stopPropagation(); setDrawerTab('overview'); setSelectedEmployee(employee); }}
                                            aria-label={`Open profile for ${employee.first_name} ${employee.last_name}`}>
                                            <MoreHorizontal size={16} aria-hidden="true" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredEmployees.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-5 py-16 text-center">
                                        <p className="text-sm text-muted-foreground">No employees match your filters.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Employee Detail Drawer */}
            <SlideOver
                isOpen={!!selectedEmployee}
                onClose={() => { setSelectedEmployee(null); setIsEditing(false); setEditFormData({}); }}
                title="Employee Profile"
                width="lg"
            >
                {selectedEmployee && (() => {
                    const completedCourses = trainingRecords.filter((record) => record.status === 'completed').length;
                    const openRecurring = recurringRecords.filter((record) => record.compliance_status !== 'completed').length;
                    const overdueRecurring = recurringRecords.filter((record) => record.compliance_status === 'overdue').length;

                    return (
                    <div className="flex min-h-[calc(100vh-7.5rem)] flex-col gap-6">
                        {/* Who this is */}
                        <div className="flex items-center gap-4">
                            <span
                                aria-hidden="true"
                                className="flex h-12 w-12 flex-shrink-0 select-none items-center justify-center rounded-full bg-secondary text-sm font-medium text-secondary-foreground"
                            >
                                {selectedEmployee.first_name[0]}{selectedEmployee.last_name[0]}
                            </span>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-section text-foreground">
                                    {selectedEmployee.first_name} {selectedEmployee.last_name}
                                </h3>
                                <p className="mt-1 truncate text-sm text-muted-foreground">
                                    {[selectedEmployee.job_title, selectedEmployee.department].filter(Boolean).join(', ') || '—'}
                                </p>
                            </div>
                            <StatusBadge status={selectedEmployee.employee_status || 'Active'} size="sm" />
                        </div>

                        {isEditing ? (
                            /* One focused edit view: every editable field together */
                            <div className="space-y-6">
                                <section className="space-y-4">
                                    <h3 className="text-title text-foreground">Contact Information</h3>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <label className="block">
                                            <span className={labelCls}>First Name</span>
                                            <input type="text" value={editFormData.first_name || ''} onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })} className={inputCls} />
                                        </label>
                                        <label className="block">
                                            <span className={labelCls}>Last Name</span>
                                            <input type="text" value={editFormData.last_name || ''} onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })} className={inputCls} />
                                        </label>
                                        <label className="block">
                                            <span className={labelCls}>Email</span>
                                            <input type="email" value={editFormData.email || ''} onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })} className={inputCls} />
                                        </label>
                                        <label className="block">
                                            <span className={labelCls}>Phone</span>
                                            <input type="tel" value={editFormData.phone || ''} onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })} className={inputCls} />
                                        </label>
                                    </div>
                                </section>

                                <section className="space-y-4">
                                    <h3 className="text-title text-foreground">Employment Details</h3>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <label className="block">
                                            <span className={labelCls}>Job Title</span>
                                            <input type="text" value={editFormData.job_title || ''} onChange={(e) => setEditFormData({ ...editFormData, job_title: e.target.value })} className={inputCls} />
                                        </label>
                                        <label className="block">
                                            <span className={labelCls}>Department</span>
                                            <input type="text" value={editFormData.department || ''} onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })} className={inputCls} />
                                        </label>
                                        <label className="block">
                                            <span className={labelCls}>Hire Date</span>
                                            <input type="date" value={editFormData.hired_at || ''} onChange={(e) => setEditFormData({ ...editFormData, hired_at: e.target.value })} className={inputCls} />
                                        </label>
                                        <label className="block">
                                            <span className={labelCls}>Status</span>
                                            <AppSelect
                                                value={editFormData.employee_status || 'Active'}
                                                onValueChange={(value) => setEditFormData({
                                                    ...editFormData,
                                                    employee_status: value,
                                                })}
                                                options={[
                                                    { value: 'Active', label: 'Active' },
                                                    { value: 'Onboarding', label: 'Onboarding' },
                                                    { value: 'Terminated', label: 'Terminated' },
                                                ]}
                                                className="min-h-10"
                                            />
                                        </label>
                                    </div>
                                    {activeGroupIds.length > 1 && (
                                        <label className="block">
                                            <span className={labelCls}>Primary Compliance Group</span>
                                            <AppSelect
                                                value={editFormData.primary_compliance_group_id || ''}
                                                onValueChange={(value) => setEditFormData({
                                                    ...editFormData,
                                                    primary_compliance_group_id: value || null,
                                                })}
                                                options={[
                                                    { value: '', label: 'All active groups' },
                                                    ...activeGroupIds.map((groupId) => ({
                                                        value: groupId,
                                                        label: `Group ${groupId}`,
                                                    })),
                                                ]}
                                                className="min-h-10"
                                            />
                                            <span className="mt-1 block text-xs text-muted-foreground">
                                                Active LearnDash groups are read-only. This setting only changes which group drives HR compliance.
                                            </span>
                                        </label>
                                    )}
                                </section>
                            </div>
                        ) : (
                            <>
                                {/* How they stand */}
                                <div className="tally tally-3">
                                    <div className="tally-cell">
                                        <p className="zone-label">Training</p>
                                        <p className="data-value mt-2 text-2xl">
                                            {loadingTraining ? '…' : `${completedCourses} of ${trainingRecords.length}`}
                                        </p>
                                        <p className="mt-2 text-xs text-muted-foreground">Courses complete</p>
                                    </div>
                                    <div className="tally-cell">
                                        <p className="zone-label">Recurring</p>
                                        <p className="data-value mt-2 text-2xl" style={{ color: overdueRecurring > 0 ? 'var(--severity-critical)' : undefined }}>
                                            {openRecurring}
                                        </p>
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            {overdueRecurring > 0 ? `Open, ${overdueRecurring} overdue` : 'Open items'}
                                        </p>
                                    </div>
                                    <div className="tally-cell">
                                        <p className="zone-label">Hire Date</p>
                                        <p className="data-value mt-2 text-md">
                                            {selectedEmployee.hired_at ? format(new Date(selectedEmployee.hired_at), 'MMM d, yyyy') : '—'}
                                        </p>
                                        <p className="mt-2 text-xs text-muted-foreground">{selectedEmployee.profile_source || 'Source unknown'}</p>
                                    </div>
                                </div>

                                <div>
                                    <div className="tab-bar" aria-label="Profile sections">
                                        {([
                                            { value: 'overview', label: 'Overview', count: null },
                                            { value: 'training', label: 'Training', count: trainingRecords.length },
                                            { value: 'compliance', label: 'Recurring Compliance', count: recurringRecords.length },
                                        ] as const).map((tab) => {
                                            const active = drawerTab === tab.value;
                                            return (
                                                <button
                                                    key={tab.value}
                                                    type="button"
                                                    aria-pressed={active}
                                                    onClick={() => setDrawerTab(tab.value)}
                                                    className={`tab-item${active ? ' active' : ''}`}
                                                >
                                                    {tab.label}
                                                    {tab.count !== null && (
                                                        <span className={`tab-count ${active ? 'tab-count-active' : 'tab-count-inactive'}`}>{tab.count}</span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {drawerTab === 'overview' && (
                                        <div className="space-y-6 pt-4">
                                            {selectedEmployee.employee_status === 'Onboarding' && (
                                                <OnboardingSummaryPanel employee={selectedEmployee} status={selectedEmployee.employee_status} />
                                            )}

                                            <section>
                                                <h3 className="text-title text-foreground">Contact Information</h3>
                                                <dl className="mt-1 divide-y divide-border">
                                                    <DetailRow label="Email">{selectedEmployee.email}</DetailRow>
                                                    <DetailRow label="Phone">{selectedEmployee.phone || '—'}</DetailRow>
                                                </dl>
                                            </section>

                                            <section>
                                                <h3 className="text-title text-foreground">Employment Details</h3>
                                                <dl className="mt-1 divide-y divide-border">
                                                    <DetailRow label="Department">{selectedEmployee.department || '—'}</DetailRow>
                                                    {selectedEmployee.employee_id && (
                                                        <DetailRow label="Employee ID">{selectedEmployee.employee_id}</DetailRow>
                                                    )}
                                                    <DetailRow label="Active LearnDash Groups">
                                                        {activeGroupIds.length > 0 ? activeGroupIds.join(', ') : '—'}
                                                    </DetailRow>
                                                    <DetailRow label="Primary Compliance Group">
                                                        {selectedEmployee.primary_compliance_group_id || 'All active groups'}
                                                        {activeGroupIds.length > 1 && !selectedEmployee.primary_compliance_group_id && (
                                                            <span className="mt-1 block text-xs text-accent-2">
                                                                Multiple active groups. Choose a primary compliance group to narrow onboarding and recurring obligations.
                                                            </span>
                                                        )}
                                                        {activeGroupIds.length > 1 && (
                                                            <span className="mt-1 block text-xs text-muted-foreground">
                                                                Use Edit Profile to change this setting.
                                                            </span>
                                                        )}
                                                    </DetailRow>
                                                </dl>
                                            </section>
                                        </div>
                                    )}

                                    {drawerTab === 'training' && (
                                        loadingTraining ? (
                                            <div className="space-y-4 pt-4" aria-busy="true" aria-label="Loading training data">
                                                {[1, 2, 3].map((row) => <div key={row} className="h-4 rounded ai-shimmer" />)}
                                            </div>
                                        ) : trainingRecords.length > 0 ? (
                                            <ul className="divide-y divide-border">
                                                {trainingRecords.map((record) => {
                                                    const status = trainingStatus(record);
                                                    return (
                                                        <li key={record.id} className="py-3">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <span className="min-w-0 text-sm text-foreground">{record.course_name}</span>
                                                                <StatusBadge status={status.label} tone={status.tone} />
                                                            </div>
                                                            <div className="mt-2 flex items-center gap-3">
                                                                <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                                                                    <div className="h-full rounded-full bg-signal" style={{ width: `${record.progress_pct}%` }} />
                                                                </div>
                                                                <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{record.progress_pct}%</span>
                                                            </div>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        ) : (
                                            <div className="empty-state">
                                                <p className="empty-state-title">No training data available.</p>
                                                <p className="empty-state-hint">Run “Sync LearnDash Training” from Settings → Connectors.</p>
                                            </div>
                                        )
                                    )}

                                    {drawerTab === 'compliance' && (
                                        recurringRecords.length > 0 ? (
                                            <ul className="divide-y divide-border">
                                                {recurringRecords.map((record) => (
                                                    <li key={record.instance_id} className="flex items-start justify-between gap-3 py-3">
                                                        <div className="min-w-0">
                                                            <p className="text-sm text-foreground">{record.rule_name}</p>
                                                            <p className="mt-1 text-xs text-muted-foreground">
                                                                Due {formatCalendarDate(record.due_at)}
                                                            </p>
                                                            {record.completed_at && (
                                                                <p className="mt-1 text-xs text-muted-foreground">
                                                                    Completed {format(new Date(record.completed_at), 'MMMM d, yyyy')}
                                                                    {record.completion_source ? ` via ${record.completion_source}` : ''}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <StatusBadge status={recurringStatusLabel(record.compliance_status)} tone={recurringTone(record.compliance_status)} />
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="empty-state">
                                                <p className="empty-state-title">No recurring compliance records available.</p>
                                                <p className="empty-state-hint">Recurring compliance will appear when this employee has an active compliance group and a recurring rule is tied to one of that group’s courses.</p>
                                            </div>
                                        )
                                    )}
                                </div>
                            </>
                        )}

                        {/* Actions stay in reach */}
                        <div className="sticky bottom-0 -mx-6 -mb-6 mt-auto flex flex-wrap justify-between gap-2 border-t border-border bg-card px-6 py-4">
                            {isEditing ? (
                                <>
                                    <span />
                                    <div className="flex gap-2">
                                        <Button variant="outline" onClick={handleCancelEdit} disabled={isSaving}>
                                            <X size={14} aria-hidden="true" />
                                            Cancel
                                        </Button>
                                        <Button onClick={handleSaveEdit} disabled={isSaving}>
                                            <Save size={14} aria-hidden="true" />
                                            {isSaving ? 'Saving…' : 'Save Changes'}
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <Button variant="outline" className="border-error/40 text-error hover:bg-error/12 hover:text-error">
                                        Terminate
                                    </Button>
                                    <Button onClick={handleEditClick}>
                                        <Edit2 size={14} aria-hidden="true" />
                                        Edit Profile
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                    );
                })()}
            </SlideOver>
        </div>
    );
}
