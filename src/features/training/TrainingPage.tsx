import { useMemo, useState } from 'react';
import { Search, Link as LinkIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTrainingCompliance } from './hooks/useTrainingCompliance';
import { useTrainingStats } from './hooks/useTrainingStats';
import { TrainingStatsCards } from './components/TrainingStatsCards';
import { TrainingEmployeeTable } from './components/TrainingEmployeeTable';
import { RecurringComplianceDashboard } from './components/RecurringComplianceDashboard';
import type { ComplianceStatus } from './types';
import { AppSelect } from '@/components/ui/AppSelect';

const inputCls = 'w-full px-3 h-9 border border-border rounded-md text-[13px] text-foreground bg-card focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow placeholder:text-muted-foreground/60 [&_option]:bg-card [&_option]:text-foreground';

export function TrainingPage() {
  const { data: employees = [], isLoading, error } = useTrainingCompliance();
  const { data: stats } = useTrainingStats();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | ComplianceStatus>('all');
  const [filterCourse, setFilterCourse] = useState('all');
  const [activeTab, setActiveTab] = useState<'onboarding' | 'recurring'>('onboarding');

  const courseNames = useMemo(() => {
    const names = new Set<string>();
    for (const emp of employees) {
      for (const r of emp.records) {
        if (r.course_name) names.add(r.course_name);
      }
    }
    return Array.from(names).sort();
  }, [employees]);

  const filtered = useMemo(() => {
    return employees.filter(emp => {
      const matchesSearch = searchTerm === '' ||
        `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = filterStatus === 'all' || emp.complianceStatus === filterStatus;
      const matchesCourse = filterCourse === 'all' || emp.records.some(r => r.course_name === filterCourse);

      return matchesSearch && matchesStatus && matchesCourse;
    });
  }, [employees, searchTerm, filterStatus, filterCourse]);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-100px)] items-center justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-[13px] text-destructive">Failed to load training data</span>
      </div>
    );
  }

  if (employees.length === 0 && activeTab === 'onboarding') {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="pl-1">
          <h1 className="page-header-title">Training Compliance</h1>
          <p className="page-header-meta">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-white">
            Initial Onboarding
          </button>
          <button
            onClick={() => setActiveTab('recurring')}
            className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground"
          >
            Recurring Compliance
          </button>
        </div>

        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-20">
          <p className="mb-2 text-[15px] font-medium text-foreground">No training records found</p>
          <p className="mb-4 max-w-md text-center text-[13px] text-muted-foreground">
            Training data syncs automatically from LearnDash once your WordPress connector is configured.
          </p>
          <Link
            to="/settings/connectors"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-[13px] font-semibold text-white transition-colors hover:bg-primary/90"
          >
            <LinkIcon size={13} strokeWidth={2} />
            Configure Connector
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="pl-1">
        <h1 className="page-header-title">Training Compliance</h1>
        <p className="page-header-meta">
          {employees.length} employees · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab('onboarding')}
          className={`inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium transition-colors ${
            activeTab === 'onboarding'
              ? 'bg-primary text-white'
              : 'border border-border bg-card text-muted-foreground hover:text-foreground'
          }`}
        >
          Initial Onboarding
        </button>
        <button
          onClick={() => setActiveTab('recurring')}
          className={`inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium transition-colors ${
            activeTab === 'recurring'
              ? 'bg-primary text-white'
              : 'border border-border bg-card text-muted-foreground hover:text-foreground'
          }`}
        >
          Recurring Compliance
        </button>
      </div>

      {activeTab === 'onboarding' ? (
        <>
          <div>
            <p className="zone-label mb-2">Compliance Overview</p>
            <TrainingStatsCards
              employees={employees}
              lastSyncAt={stats?.lastSyncAt ?? null}
              pendingAdjustments={stats?.pendingAdjustments ?? 0}
            />
          </div>

          <div className="saas-card p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="relative md:col-span-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} strokeWidth={2} />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full rounded-md border border-border bg-transparent pl-8 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/35 h-9"
                />
              </div>
              <AppSelect
                value={filterStatus}
                onValueChange={value => setFilterStatus(value as 'all' | ComplianceStatus)}
                options={[
                  { value: 'all', label: 'All Statuses' },
                  { value: 'compliant', label: 'Compliant' },
                  { value: 'overdue', label: 'Overdue' },
                  { value: 'in_progress', label: 'In Progress' },
                  { value: 'not_started', label: 'Not Started' },
                  { value: 'no_courses', label: 'No Courses' },
                ]}
                className={inputCls}
              />
              <AppSelect
                value={filterCourse}
                onValueChange={setFilterCourse}
                options={[
                  { value: 'all', label: 'All Courses' },
                  ...courseNames.map(name => ({ value: name, label: name })),
                ]}
                className={inputCls}
              />
            </div>
          </div>

          <TrainingEmployeeTable employees={filtered} />
        </>
      ) : (
        <RecurringComplianceDashboard />
      )}
    </div>
  );
}
