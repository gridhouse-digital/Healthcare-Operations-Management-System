import { useState, useMemo } from 'react';
import { Search, Link as LinkIcon } from 'lucide-react';
import { useTrainingCompliance } from './hooks/useTrainingCompliance';
import { useTrainingStats } from './hooks/useTrainingStats';
import { TrainingStatsCards } from './components/TrainingStatsCards';
import { TrainingEmployeeTable } from './components/TrainingEmployeeTable';
import { TrainingEmployeeDrawer } from './components/TrainingEmployeeDrawer';
import { TrainingAdjustmentModal } from './components/TrainingAdjustmentModal';
import type { TrainingEmployee, TrainingComplianceRecord, ComplianceStatus } from './types';
import { Link } from 'react-router-dom';

const inputCls = 'w-full px-3 h-8 border border-border rounded-md text-[13px] text-foreground bg-card focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow placeholder:text-muted-foreground/60 [&_option]:bg-card [&_option]:text-foreground';

export function TrainingPage() {
  const { data: employees = [], isLoading, error } = useTrainingCompliance();
  const { data: stats } = useTrainingStats();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | ComplianceStatus>('all');
  const [filterCourse, setFilterCourse] = useState('all');

  const [selectedEmployee, setSelectedEmployee] = useState<TrainingEmployee | null>(null);
  const [adjustRecord, setAdjustRecord] = useState<TrainingComplianceRecord | null>(null);

  // Distinct course names for filter dropdown
  const courseNames = useMemo(() => {
    const names = new Set<string>();
    for (const emp of employees) {
      for (const r of emp.records) {
        if (r.course_name) names.add(r.course_name);
      }
    }
    return Array.from(names).sort();
  }, [employees]);

  // Filter employees
  const filtered = useMemo(() => {
    return employees.filter(emp => {
      const matchesSearch = searchTerm === '' ||
        `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = filterStatus === 'all' || emp.complianceStatus === filterStatus;

      const matchesCourse = filterCourse === 'all' ||
        emp.records.some(r => r.course_name === filterCourse);

      return matchesSearch && matchesStatus && matchesCourse;
    });
  }, [employees, searchTerm, filterStatus, filterCourse]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-100px)]">
        <div
          className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-[13px] text-[hsl(4,82%,52%)]">Failed to load training data</span>
      </div>
    );
  }

  // Empty state: no training data at all
  if (employees.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="pl-1">
          <h1
            style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.75rem', fontWeight: 400, letterSpacing: '-0.025em', lineHeight: 1.1, color: 'var(--foreground)' }}
          >
            Training Compliance
          </h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted-foreground)', opacity: 0.5, marginTop: '4px' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <div className="flex flex-col items-center justify-center py-20 bg-card border border-border rounded-lg">
          <p className="text-[15px] text-foreground font-medium mb-2">No training records found</p>
          <p className="text-[13px] text-muted-foreground mb-4 max-w-md text-center">
            Training data syncs automatically from LearnDash once your WordPress connector is configured.
          </p>
          <Link
            to="/settings/connectors"
            className="inline-flex items-center gap-2 h-8 px-4 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors"
          >
            <LinkIcon size={13} strokeWidth={2} />
            Configure Connector
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="pl-1">
        <h1
          style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.75rem', fontWeight: 400, letterSpacing: '-0.025em', lineHeight: 1.1, color: 'var(--foreground)' }}
        >
          Training Compliance
        </h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted-foreground)', opacity: 0.5, marginTop: '4px' }}>
          {employees.length} employees · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* Stats Zone */}
      <div>
        <p className="zone-label mb-2">Compliance Overview</p>
        <TrainingStatsCards
          employees={employees}
          lastSyncAt={stats?.lastSyncAt ?? null}
          pendingAdjustments={stats?.pendingAdjustments ?? 0}
        />
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} strokeWidth={2} />
            <input
              type="text"
              placeholder="Search by name or email…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 h-8 border border-border rounded-md text-[13px] text-foreground bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow placeholder:text-muted-foreground/60"
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as 'all' | ComplianceStatus)}
            className={inputCls}
          >
            <option value="all">All Statuses</option>
            <option value="compliant">Compliant</option>
            <option value="overdue">Overdue</option>
            <option value="in_progress">In Progress</option>
            <option value="not_started">Not Started</option>
            <option value="no_courses">No Courses</option>
          </select>
          <select
            value={filterCourse}
            onChange={e => setFilterCourse(e.target.value)}
            className={inputCls}
          >
            <option value="all">All Courses</option>
            {courseNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Employee Table */}
      <TrainingEmployeeTable
        employees={filtered}
        onSelect={setSelectedEmployee}
      />

      {/* Detail Drawer */}
      <TrainingEmployeeDrawer
        employee={selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
        onAdjust={(record) => setAdjustRecord(record)}
      />

      {/* Adjustment Modal */}
      <TrainingAdjustmentModal
        record={adjustRecord}
        employeeName={selectedEmployee ? `${selectedEmployee.first_name} ${selectedEmployee.last_name}` : ''}
        onClose={() => setAdjustRecord(null)}
      />
    </div>
  );
}
