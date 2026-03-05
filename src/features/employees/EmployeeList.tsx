import { useEffect, useState } from 'react';
import { employeeService } from '@/services/employeeService';
import { wordpressService } from '@/services/wordpressService';
import type { Employee } from '@/types';
import type { CourseProgress } from '@/types/wordpress';
import { format } from 'date-fns';
import { Search, Mail, Phone, MapPin, Calendar, Building, MoreHorizontal, BookOpen, RefreshCw, Edit2, Save, X, Plus } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { SlideOver } from '@/components/ui/SlideOver';
import { OnboardingSummaryPanel } from '@/components/ai/OnboardingSummaryPanel';
import { toast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const inputCls = 'w-full px-3 h-8 border border-border rounded-md text-[13px] text-foreground bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow';
const labelCls = 'block text-[11px] font-mono uppercase tracking-[0.06em] text-muted-foreground mb-1.5';

export function EmployeeList() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [courseProgress, setCourseProgress] = useState<CourseProgress[]>([]);
    const [loadingProgress, setLoadingProgress] = useState(false);
    const [syncingToWordPress, setSyncingToWordPress] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterDept, setFilterDept] = useState('all');

    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editFormData, setEditFormData] = useState<Partial<Employee>>({});

    const { confirm, confirmState, handleClose, handleConfirm } = useConfirm();

    useEffect(() => { loadEmployees(); }, []);

    useEffect(() => {
        if (selectedEmployee?.wp_user_id) {
            loadCourseProgress(selectedEmployee.wp_user_id);
        } else {
            setCourseProgress([]);
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

    const loadCourseProgress = async (userId: number) => {
        setLoadingProgress(true);
        try {
            const progress = await wordpressService.getCourseProgress(userId);
            setCourseProgress(progress);

            const allCoursesCompleted = progress.length > 0 && progress.every(course => course.status === 'completed');
            if (allCoursesCompleted && selectedEmployee && selectedEmployee.status === 'Onboarding') {
                await employeeService.updateEmployee(selectedEmployee.id, { status: 'Active' });
                toast.success('All courses completed! Employee status updated to Active.');
                await loadEmployees();
                setSelectedEmployee({ ...selectedEmployee, status: 'Active' });
            }
        } catch (err) {
            console.error('Failed to load course progress', err);
        } finally {
            setLoadingProgress(false);
        }
    };

    const handleSyncToWordPress = async (createIfNotExists: boolean = false) => {
        if (!selectedEmployee) return;
        setSyncingToWordPress(true);
        try {
            const result = await employeeService.syncEmployeeToWordPress(selectedEmployee.id, createIfNotExists);
            if (result.success) {
                toast.success(result.message);
                setSelectedEmployee({ ...selectedEmployee, wp_user_id: result.wp_user_id });
                await loadEmployees();
                if (result.wp_user_id) {
                    await loadCourseProgress(result.wp_user_id);
                    const progress = await wordpressService.getCourseProgress(result.wp_user_id);
                    const allCoursesCompleted = progress.length > 0 && progress.every(course => course.status === 'completed');
                    if (allCoursesCompleted && selectedEmployee.status === 'Onboarding') {
                        await employeeService.updateEmployee(selectedEmployee.id, { status: 'Active' });
                        toast.success('All courses completed! Employee status updated to Active.');
                        await loadEmployees();
                        setSelectedEmployee({ ...selectedEmployee, status: 'Active' });
                    }
                }
            } else {
                const shouldCreate = await confirm({
                    title: 'WordPress User Not Found',
                    description: `${result.message}\n\nWould you like to create a new WordPress user for this employee?`,
                    confirmText: 'Create User',
                    cancelText: 'Cancel',
                });
                if (shouldCreate) await handleSyncToWordPress(true);
            }
        } catch (err: any) {
            console.error('Failed to sync to WordPress:', err);
            toast.error(`Sync failed: ${err.message}`);
        } finally {
            setSyncingToWordPress(false);
        }
    };

    const handleEditClick = () => {
        if (selectedEmployee) {
            setEditFormData({
                first_name: selectedEmployee.first_name,
                last_name: selectedEmployee.last_name,
                email: selectedEmployee.email,
                phone: selectedEmployee.phone,
                position: selectedEmployee.position,
                start_date: selectedEmployee.start_date,
                status: selectedEmployee.status,
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

    const handleSyncApplicantStatus = async () => {
        if (!selectedEmployee) return;
        try {
            await employeeService.syncApplicantStatusToHired(selectedEmployee.id);
            toast.success('Applicant status synced to "Hired"');
        } catch (err: any) {
            console.error('Failed to sync applicant status:', err);
            toast.error(`Failed to sync: ${err.message}`);
        }
    };

    const filteredEmployees = employees.filter(employee => {
        const matchesStatus = filterStatus === 'all' || employee.status === filterStatus;
        const matchesSearch =
            `${employee.first_name} ${employee.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
            employee.email.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesStatus && matchesSearch;
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
                    <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.875rem', fontStyle: 'italic', letterSpacing: '-0.025em', lineHeight: 1.15 }}
                        className="text-foreground">
                        Employees
                    </h1>
                    <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6875rem', letterSpacing: '0.07em' }}
                        className="uppercase text-muted-foreground mt-1">
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
                        <option value="Suspended">Suspended</option>
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
                                <th className="px-5 py-3 text-left">
                                    <span className="zone-label">Employee</span>
                                </th>
                                <th className="px-5 py-3 text-left">
                                    <span className="zone-label">Role</span>
                                </th>
                                <th className="px-5 py-3 text-left">
                                    <span className="zone-label">Status</span>
                                </th>
                                <th className="px-5 py-3 text-left">
                                    <span className="zone-label">Start Date</span>
                                </th>
                                <th className="px-5 py-3 text-left">
                                    <span className="zone-label">Dept</span>
                                </th>
                                <th className="px-5 py-3 text-left">
                                    <span className="zone-label sr-only">Actions</span>
                                </th>
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
                                                className="h-8 w-8 rounded-full text-[11px] font-mono font-semibold flex items-center justify-center flex-shrink-0"
                                                style={{ background: 'hsl(196 84% 52% / 0.12)', color: 'hsl(196 84% 62%)' }}
                                            >
                                                {employee.first_name[0]}{employee.last_name[0]}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[13px] text-foreground font-medium truncate">
                                                    {employee.first_name} {employee.last_name}
                                                </span>
                                                <span className="text-[11px] text-muted-foreground font-mono truncate">{employee.email}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className="text-[13px] text-foreground">{employee.position}</span>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <StatusBadge status={employee.status} size="sm" />
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className="text-[13px] text-foreground font-mono">
                                            {employee.start_date ? format(new Date(employee.start_date), 'MMM d, yyyy') : '—'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className="text-[13px] text-muted-foreground">Nursing</span>
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
                                    className="h-16 w-16 rounded-full text-xl font-mono font-semibold flex items-center justify-center flex-shrink-0"
                                    style={{ background: 'hsl(196 84% 52% / 0.12)', color: 'hsl(196 84% 62%)' }}
                                >
                                    {selectedEmployee.first_name[0]}{selectedEmployee.last_name[0]}
                                </div>
                                <div>
                                    <h3 className="text-[15px] font-semibold text-foreground leading-tight">
                                        {selectedEmployee.first_name} {selectedEmployee.last_name}
                                    </h3>
                                    <p className="text-[13px] text-muted-foreground mt-0.5">{selectedEmployee.position}</p>
                                    <div className="mt-2">
                                        <StatusBadge status={selectedEmployee.status} size="sm" />
                                    </div>
                                </div>
                            </div>
                            {selectedEmployee.applicant_id && (
                                <button
                                    onClick={handleSyncApplicantStatus}
                                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-mono font-semibold uppercase tracking-[0.04em] transition-colors"
                                    style={{ background: 'hsl(196 84% 52% / 0.1)', color: 'hsl(196 84% 60%)', border: '1px solid hsl(196 84% 52% / 0.2)' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'hsl(196 84% 52% / 0.16)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'hsl(196 84% 52% / 0.1)'}
                                >
                                    <RefreshCw size={11} />
                                    Fix Status
                                </button>
                            )}
                        </div>

                        {/* AI Onboarding Summary */}
                        {selectedEmployee.status === 'Onboarding' && (
                            <OnboardingSummaryPanel employee={selectedEmployee} status={selectedEmployee.status} />
                        )}

                        {/* Training Progress */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <BookOpen size={13} className="text-primary" strokeWidth={2} />
                                    <span className="zone-label">Training Progress</span>
                                </div>
                                {!selectedEmployee.wp_user_id && (
                                    <button
                                        onClick={() => handleSyncToWordPress(false)}
                                        disabled={syncingToWordPress}
                                        className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-semibold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <RefreshCw size={11} className={syncingToWordPress ? 'animate-spin' : ''} />
                                        {syncingToWordPress ? 'Syncing…' : 'Sync WordPress'}
                                    </button>
                                )}
                            </div>
                            {loadingProgress ? (
                                <div className="text-[12px] text-muted-foreground font-mono">Loading progress…</div>
                            ) : courseProgress.length > 0 ? (
                                <div className="space-y-3">
                                    {courseProgress.map((course) => (
                                        <div key={course.course_id} className="p-3.5 bg-muted/30 rounded-md border border-border">
                                            <div className="flex justify-between items-center mb-2.5">
                                                <span className="text-[13px] text-foreground font-medium">
                                                    {course.course_title || `Course #${course.course_id}`}
                                                </span>
                                                {course.status === 'completed' ? (
                                                    <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.04em] px-2 py-0.5 rounded border bg-[hsl(152,58%,38%)]/8 text-[hsl(152,50%,30%)] dark:text-[hsl(152,54%,52%)] border-[hsl(152,58%,38%)]/20">
                                                        Completed
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.04em] px-2 py-0.5 rounded border bg-[hsl(38,96%,48%)]/8 text-[hsl(38,74%,36%)] dark:text-[hsl(38,90%,56%)] border-[hsl(38,96%,48%)]/20">
                                                        In Progress
                                                    </span>
                                                )}
                                            </div>
                                            <div className="w-full bg-border rounded-full h-1.5 mb-2">
                                                <div
                                                    className="bg-primary h-1.5 rounded-full transition-all duration-500"
                                                    style={{ width: `${course.percentage}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
                                                <span>{course.steps_completed} / {course.steps_total} steps</span>
                                                <span>{course.percentage}%</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 bg-muted/20 rounded-md border border-border text-center">
                                    <p className="text-[12px] text-muted-foreground">No training data available.</p>
                                    {!selectedEmployee.wp_user_id && (
                                        <p className="text-[11px] text-[hsl(4,82%,52%)] mt-1 font-mono">Employee not synced to WordPress.</p>
                                    )}
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
                                        <label className={labelCls}>Position</label>
                                        <input type="text" value={editFormData.position || ''} onChange={(e) => setEditFormData({ ...editFormData, position: e.target.value })} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Start Date</label>
                                        <input type="date" value={editFormData.start_date || ''} onChange={(e) => setEditFormData({ ...editFormData, start_date: e.target.value })} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Status</label>
                                        <select value={editFormData.status || ''} onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })} className={inputCls}>
                                            <option value="Active">Active</option>
                                            <option value="Onboarding">Onboarding</option>
                                            <option value="Suspended">Suspended</option>
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
                                        <p className="zone-label mb-0.5">Start Date</p>
                                        <p className="text-[13px] text-foreground font-mono">
                                            {selectedEmployee.start_date ? format(new Date(selectedEmployee.start_date), 'MMMM d, yyyy') : '—'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 px-4 py-3">
                                    <Building size={13} className="text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
                                    <div>
                                        <p className="zone-label mb-0.5">Department</p>
                                        <p className="text-[13px] text-foreground">Nursing</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 px-4 py-3">
                                    <MapPin size={13} className="text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
                                    <div>
                                        <p className="zone-label mb-0.5">Location</p>
                                        <p className="text-[13px] text-foreground">Main Branch</p>
                                    </div>
                                </div>
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

            <ConfirmDialog
                isOpen={confirmState.isOpen}
                onClose={handleClose}
                onConfirm={handleConfirm}
                title={confirmState.title}
                description={confirmState.description}
                confirmText={confirmState.confirmText}
                cancelText={confirmState.cancelText}
                variant={confirmState.variant}
            />
        </div>
    );
}
