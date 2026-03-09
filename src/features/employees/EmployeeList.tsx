import { useEffect, useState } from 'react';
import { employeeService } from '@/services/employeeService';
import type { Employee } from '@/types';
import { format } from 'date-fns';
import { Search, Mail, Phone, Calendar, Building, MoreHorizontal, BookOpen, Edit2, Save, X, Plus } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { SlideOver } from '@/components/ui/SlideOver';
import { OnboardingSummaryPanel } from '@/components/ai/OnboardingSummaryPanel';
import { toast } from '@/hooks/useToast';
import { supabase } from '@/lib/supabase';

const inputCls = 'w-full px-3 h-8 border border-border rounded-md text-[13px] text-foreground bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow';
const labelCls = 'block text-[11px] font-medium tracking-[-0.01em] text-muted-foreground mb-1.5';

interface TrainingRecord {
    id: string;
    course_name: string;
    status: string;
    progress_pct: number;
    steps_completed: number;
    steps_total: number;
}

export function EmployeeList() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([]);
    const [loadingTraining, setLoadingTraining] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterDept, setFilterDept] = useState('all');

    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editFormData, setEditFormData] = useState<Partial<Employee>>({});

    useEffect(() => { loadEmployees(); }, []);

    useEffect(() => {
        if (selectedEmployee) {
            loadTrainingRecords(selectedEmployee.id);
        } else {
            setTrainingRecords([]);
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
            const { data, error: trErr } = await supabase
                .from('training_records')
                .select('id, course_name, status, progress_pct, steps_completed, steps_total')
                .eq('person_id', personId)
                .order('course_name');

            if (trErr) throw trErr;
            setTrainingRecords(data || []);

            // Auto-update status if all courses completed
            const allDone = data && data.length > 0 && data.every((r: TrainingRecord) => r.status === 'completed');
            if (allDone && selectedEmployee && selectedEmployee.employee_status === 'Onboarding') {
                await employeeService.updateEmployee(selectedEmployee.id, { employee_status: 'Active' } as Partial<Employee>);
                toast.success('All courses completed! Status updated to Active.');
                await loadEmployees();
                setSelectedEmployee({ ...selectedEmployee, employee_status: 'Active' });
            }
        } catch (err) {
            console.error('Failed to load training records', err);
        } finally {
            setLoadingTraining(false);
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

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <span className="text-[13px] text-muted-foreground font-mono uppercase tracking-[0.06em]">Loading employees…</span>
        </div>
    );
    if (error) return (
        <div className="flex items-center justify-center py-20">
            <span className="text-[13px] text-[hsl(4,82%,52%)]">{error}</span>
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pl-1">
                <div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.875rem', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.15 }}
                        className="text-foreground">
                        Employees
                    </h1>
                    <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.8rem', letterSpacing: '-0.01em' }}
                        className="text-muted-foreground mt-1">
                        {employees.length} team members
                    </p>
                </div>
                <button className="inline-flex items-center gap-2 h-8 px-4 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors whitespace-nowrap">
                    <Plus size={14} strokeWidth={2.5} />
                    Add Employee
                </button>
            </div>

            {/* Filters & Search */}
            <div className="bg-card border border-border rounded-lg p-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2 relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} strokeWidth={2} />
                        <input
                            type="text"
                            placeholder="Search by name or email…"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 h-8 border border-border rounded-md text-[13px] text-foreground bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow placeholder:text-muted-foreground/60"
                        />
                    </div>
                    <select
                        value={filterDept}
                        onChange={(e) => setFilterDept(e.target.value)}
                        className={inputCls}
                    >
                        <option value="all">All Departments</option>
                        <option value="Nursing">Nursing</option>
                        <option value="Care">Care</option>
                        <option value="Admin">Admin</option>
                    </select>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className={inputCls}
                    >
                        <option value="all">All Statuses</option>
                        <option value="Active">Active</option>
                        <option value="Onboarding">Onboarding</option>
                        <option value="Terminated">Terminated</option>
                    </select>
                </div>
            </div>

            {/* Employees Table */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="border-b border-border">
                            <tr>
                                <th className="px-5 py-3 text-left"><span className="zone-label">Employee</span></th>
                                <th className="px-5 py-3 text-left"><span className="zone-label">Role</span></th>
                                <th className="px-5 py-3 text-left"><span className="zone-label">Status</span></th>
                                <th className="px-5 py-3 text-left"><span className="zone-label">Source</span></th>
                                <th className="px-5 py-3 text-left"><span className="zone-label">Dept</span></th>
                                <th className="px-5 py-3 text-left"><span className="zone-label sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {filteredEmployees.map((employee) => (
                                <tr
                                    key={employee.id}
                                    className="transition-colors duration-75 cursor-pointer"
                                    onClick={() => setSelectedEmployee(employee)}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--secondary)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                                >
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="h-8 w-8 rounded-full text-[11px] font-semibold flex items-center justify-center flex-shrink-0"
                                                style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }}
                                            >
                                                {employee.first_name[0]}{employee.last_name[0]}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[13px] text-foreground font-medium truncate">
                                                    {employee.first_name} {employee.last_name}
                                                </span>
                                                <span className="text-[11px] text-muted-foreground truncate">{employee.email}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className="text-[13px] text-foreground">{employee.job_title || '—'}</span>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <StatusBadge status={employee.employee_status || 'Active'} size="sm" />
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className="text-[11px] text-muted-foreground">{employee.profile_source || '—'}</span>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className="text-[13px] text-muted-foreground">{employee.department || '—'}</span>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <button
                                            className="text-muted-foreground/50 hover:text-primary transition-colors"
                                            onClick={(e) => { e.stopPropagation(); setSelectedEmployee(employee); }}
                                        >
                                            <MoreHorizontal size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredEmployees.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-5 py-16 text-center">
                                        <p className="text-[13px] text-muted-foreground">No employees match your filters.</p>
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
                {selectedEmployee && (
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="flex items-start justify-between pb-5 border-b border-border">
                            <div className="flex items-center gap-4">
                                <div
                                    className="h-16 w-16 rounded-full text-xl font-semibold flex items-center justify-center flex-shrink-0"
                                    style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)' }}
                                >
                                    {selectedEmployee.first_name[0]}{selectedEmployee.last_name[0]}
                                </div>
                                <div>
                                    <h3 className="text-[15px] font-semibold text-foreground leading-tight">
                                        {selectedEmployee.first_name} {selectedEmployee.last_name}
                                    </h3>
                                    <p className="text-[13px] text-muted-foreground mt-0.5">{selectedEmployee.job_title || '—'}</p>
                                    <div className="mt-2 flex items-center gap-2">
                                        <StatusBadge status={selectedEmployee.employee_status || 'Active'} size="sm" />
                                        {selectedEmployee.profile_source && (
                                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-muted/30 text-muted-foreground border-border">
                                                {selectedEmployee.profile_source}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* AI Onboarding Summary */}
                        {selectedEmployee.employee_status === 'Onboarding' && (
                            <OnboardingSummaryPanel employee={selectedEmployee} status={selectedEmployee.employee_status} />
                        )}

                        {/* Training Progress (from training_records table) */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <BookOpen size={13} className="text-primary" strokeWidth={2} />
                                <span className="zone-label">Training Progress</span>
                            </div>
                            {loadingTraining ? (
                                <div className="text-[12px] text-muted-foreground">Loading training data…</div>
                            ) : trainingRecords.length > 0 ? (
                                <div className="space-y-3">
                                    {trainingRecords.map((record) => (
                                        <div key={record.id} className="p-3.5 bg-muted/30 rounded-md border border-border">
                                            <div className="flex justify-between items-center mb-2.5">
                                                <span className="text-[13px] text-foreground font-medium">
                                                    {record.course_name}
                                                </span>
                                                {record.status === 'completed' ? (
                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-[color-mix(in_srgb,var(--severity-low)_10%,transparent)] text-[var(--severity-low)] border-[color-mix(in_srgb,var(--severity-low)_20%,transparent)]">
                                                        Completed
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-[color-mix(in_srgb,var(--severity-medium)_10%,transparent)] text-[var(--severity-medium)] border-[color-mix(in_srgb,var(--severity-medium)_20%,transparent)]">
                                                        In Progress
                                                    </span>
                                                )}
                                            </div>
                                            <div className="w-full bg-border rounded-full h-1.5 mb-2">
                                                <div
                                                    className="bg-primary h-1.5 rounded-full transition-all duration-500"
                                                    style={{ width: `${record.progress_pct}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between text-[11px] text-muted-foreground">
                                                <span>{record.steps_completed} / {record.steps_total} steps</span>
                                                <span>{record.progress_pct}%</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 bg-muted/20 rounded-md border border-border text-center">
                                    <p className="text-[12px] text-muted-foreground">No training data available.</p>
                                    <p className="mt-1 text-[11px] text-muted-foreground/70">Run "Sync LearnDash Training" from Settings → Connectors.</p>
                                </div>
                            )}
                        </div>

                        {/* Contact Information */}
                        <div>
                            <p className="zone-label mb-3">Contact Information</p>
                            {isEditing ? (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className={labelCls}>First Name</label>
                                            <input type="text" value={editFormData.first_name || ''} onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })} className={inputCls} />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Last Name</label>
                                            <input type="text" value={editFormData.last_name || ''} onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })} className={inputCls} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Email</label>
                                        <input type="email" value={editFormData.email || ''} onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Phone</label>
                                        <input type="tel" value={editFormData.phone || ''} onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Job Title</label>
                                        <input type="text" value={editFormData.job_title || ''} onChange={(e) => setEditFormData({ ...editFormData, job_title: e.target.value })} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Department</label>
                                        <input type="text" value={editFormData.department || ''} onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Hire Date</label>
                                        <input type="date" value={editFormData.hired_at || ''} onChange={(e) => setEditFormData({ ...editFormData, hired_at: e.target.value })} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Status</label>
                                        <select value={editFormData.employee_status || ''} onChange={(e) => setEditFormData({ ...editFormData, employee_status: e.target.value })} className={inputCls}>
                                            <option value="Active">Active</option>
                                            <option value="Onboarding">Onboarding</option>
                                            <option value="Terminated">Terminated</option>
                                        </select>
                                    </div>
                                </div>
                            ) : (
                                <div className="divide-y divide-border/60 rounded-md border border-border overflow-hidden">
                                    <div className="flex items-center gap-3 px-4 py-3">
                                        <Mail size={13} className="text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
                                        <div className="min-w-0">
                                            <p className="zone-label mb-0.5">Email</p>
                                            <p className="text-[13px] text-foreground truncate">{selectedEmployee.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 px-4 py-3">
                                        <Phone size={13} className="text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
                                        <div>
                                            <p className="zone-label mb-0.5">Phone</p>
                                            <p className="text-[13px] text-foreground">{selectedEmployee.phone || '—'}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Employment Details */}
                        <div>
                            <p className="zone-label mb-3">Employment Details</p>
                            <div className="divide-y divide-border/60 rounded-md border border-border overflow-hidden">
                                <div className="flex items-center gap-3 px-4 py-3">
                                    <Calendar size={13} className="text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
                                    <div>
                                        <p className="zone-label mb-0.5">Hire Date</p>
                                        <p className="text-[13px] text-foreground font-mono">
                                            {selectedEmployee.hired_at ? format(new Date(selectedEmployee.hired_at), 'MMMM d, yyyy') : '—'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 px-4 py-3">
                                    <Building size={13} className="text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
                                    <div>
                                        <p className="zone-label mb-0.5">Department</p>
                                        <p className="text-[13px] text-foreground">{selectedEmployee.department || '—'}</p>
                                    </div>
                                </div>
                                {selectedEmployee.employee_id && (
                                    <div className="flex items-center gap-3 px-4 py-3">
                                        <span className="text-[11px] font-mono text-muted-foreground flex-shrink-0">#</span>
                                        <div>
                                            <p className="zone-label mb-0.5">Employee ID</p>
                                            <p className="text-[13px] text-foreground font-mono">{selectedEmployee.employee_id}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2.5 pt-4 border-t border-border">
                            {isEditing ? (
                                <>
                                    <button
                                        onClick={handleSaveEdit}
                                        disabled={isSaving}
                                        className="flex-1 inline-flex items-center justify-center gap-2 h-8 px-4 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Save size={13} />
                                        {isSaving ? 'Saving…' : 'Save Changes'}
                                    </button>
                                    <button
                                        onClick={handleCancelEdit}
                                        disabled={isSaving}
                                        className="flex-1 inline-flex items-center justify-center gap-2 h-8 px-4 rounded-md border border-border text-[13px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <X size={13} />
                                        Cancel
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={handleEditClick}
                                        className="flex-1 inline-flex items-center justify-center gap-2 h-8 px-4 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors"
                                    >
                                        <Edit2 size={13} />
                                        Edit Profile
                                    </button>
                                    <button className="flex-1 inline-flex items-center justify-center h-8 px-4 rounded-md border border-[hsl(4,82%,52%)]/30 text-[hsl(4,70%,44%)] dark:text-[hsl(4,76%,60%)] text-[13px] font-semibold hover:bg-[hsl(4,82%,52%)]/6 transition-colors">
                                        Terminate
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </SlideOver>
        </div>
    );
}
