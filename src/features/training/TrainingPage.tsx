import { useEffect, useMemo, useState } from 'react';
import { Link as LinkIcon } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useTrainingCompliance } from './hooks/useTrainingCompliance';
import { useTrainingStats } from './hooks/useTrainingStats';
import { useOnboardingGateSummaries } from './hooks/useOnboardingGateSummaries';
import { RecurringComplianceDashboard } from './components/RecurringComplianceDashboard';
import { TrainingComplianceSummary, type SummaryFilter } from './components/TrainingComplianceSummary';
import {
  TrainingComplianceToolbar,
  type TrainingComplianceFilters,
} from './components/TrainingComplianceToolbar';
import {
  TrainingComplianceMobileList,
  TrainingComplianceTable,
} from './components/TrainingComplianceTable';
import { TrainingComplianceSkeleton } from './components/TrainingComplianceSkeleton';
import { EmployeeComplianceDrawer } from './components/EmployeeComplianceDrawer';
import { Button } from '@/components/ui/button';
import type { TrainingEmployee } from './types';
import {
  employeeHasAdjustments,
  employeeNeedsAction,
  type GateSummary,
} from './utils/compliancePresentation';

const PAGE_SIZE = 25;

const defaultFilters: TrainingComplianceFilters = {
  search: '',
  status: 'all',
  course: 'all',
  gate: 'all',
  adjustments: 'all',
};

function filterEmployees(
  employees: TrainingEmployee[],
  filters: TrainingComplianceFilters,
  summaryFilter: SummaryFilter,
  gateSummaries: Map<string, GateSummary>,
): TrainingEmployee[] {
  const search = filters.search.trim().toLowerCase();

  return employees.filter((employee) => {
    const gate = gateSummaries.get(employee.person_id);

    const matchesSearch =
      !search ||
      [employee.first_name, employee.last_name, employee.email, employee.job_title]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(search));

    const matchesStatus = filters.status === 'all' || employee.complianceStatus === filters.status;
    const matchesCourse =
      filters.course === 'all' || employee.records.some((record) => record.course_name === filters.course);
    const matchesGate =
      filters.gate === 'all' ||
      (filters.gate === 'satisfied' && gate?.state === 'satisfied') ||
      (filters.gate === 'incomplete' && gate?.state === 'incomplete') ||
      (filters.gate === 'not_applicable' && (gate?.state === 'not_applicable' || gate?.state === 'no_group'));
    const matchesAdjustments =
      filters.adjustments === 'all' ||
      (filters.adjustments === 'with_adjustments' && employeeHasAdjustments(employee));

    const matchesSummary =
      summaryFilter === 'all' ||
      (summaryFilter === 'compliant' && employee.complianceStatus === 'compliant') ||
      (summaryFilter === 'action_required' && employeeNeedsAction(employee, gateSummaries.get(employee.person_id))) ||
      (summaryFilter === 'no_courses' && employee.complianceStatus === 'no_courses') ||
      (summaryFilter === 'pending_adjustments' && employeeHasAdjustments(employee));

    return (
      matchesSearch &&
      matchesStatus &&
      matchesCourse &&
      matchesGate &&
      matchesAdjustments &&
      matchesSummary
    );
  });
}

export function TrainingPage() {
  const navigate = useNavigate();
  const { employeeId } = useParams<{ employeeId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const modeParam = searchParams.get('mode');
  const activeTab: 'onboarding' | 'recurring' =
    modeParam === 'recurring' ? 'recurring' : 'onboarding';

  const { data: employees = [], isLoading, error, refetch, isFetching } = useTrainingCompliance();
  const { data: stats } = useTrainingStats();

  const personIds = useMemo(() => employees.map((employee) => employee.person_id), [employees]);
  const { data: gateSummaries = new Map() } = useOnboardingGateSummaries(personIds);

  const [filters, setFilters] = useState<TrainingComplianceFilters>(defaultFilters);
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [filters, summaryFilter, activeTab]);

  const courseNames = useMemo(() => {
    const names = new Set<string>();
    for (const employee of employees) {
      for (const record of employee.records) {
        if (record.course_name) names.add(record.course_name);
      }
    }
    return Array.from(names).sort();
  }, [employees]);

  const filtered = useMemo(
    () => filterEmployees(employees, filters, summaryFilter, gateSummaries),
    [employees, filters, summaryFilter, gateSummaries],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageEmployees = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const reportingDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const setActiveTab = (tab: 'onboarding' | 'recurring') => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'recurring') next.set('mode', 'recurring');
    else next.delete('mode');
    setSearchParams(next, { replace: true });
  };

  const openEmployee = (personId: string) => {
    navigate(`/training/${personId}${activeTab === 'recurring' ? '?mode=recurring' : ''}`);
  };

  const closeEmployee = () => {
    navigate(`/training${activeTab === 'recurring' ? '?mode=recurring' : ''}`);
  };

  if (isLoading) {
    return <TrainingComplianceSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center">
        <h2 className="text-base font-semibold text-foreground">Unable to load training compliance</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          The compliance directory could not be refreshed. Retry to load the latest effective statuses from the trusted data layer.
        </p>
        <Button type="button" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (employees.length === 0 && activeTab === 'onboarding') {
    return (
      <div className="animate-fade-in space-y-6">
        <header className="pl-1">
          <h1 className="page-header-title">Training Compliance</h1>
          <p className="page-header-meta">{reportingDate}</p>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Monitor onboarding training, recurring requirements and compliance exceptions.
          </p>
        </header>

        <ModeSwitcher activeTab={activeTab} onChange={setActiveTab} onboardingCount={0} />

        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-20">
          <p className="mb-2 text-[15px] font-medium text-foreground">No training-compliance records are available.</p>
          <p className="mb-4 max-w-md text-center text-[13px] text-muted-foreground">
            Course assignment and LearnDash synchronization may still be pending for this tenant.
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
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 pl-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-header-title">Training Compliance</h1>
            <span className="rounded border border-border bg-card px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground">
              {employees.length} employees
            </span>
            {isFetching ? (
              <span className="text-[11px] text-muted-foreground">Refreshing…</span>
            ) : null}
          </div>
          <p className="page-header-meta">{reportingDate}</p>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Monitor onboarding training, recurring requirements and compliance exceptions.
          </p>
          <p className="mt-1 text-[11px] font-mono text-muted-foreground">
            Last sync {stats?.lastSyncAt ? formatDistanceToNow(new Date(stats.lastSyncAt), { addSuffix: true }) : 'unavailable'} · LearnDash
          </p>
        </div>
      </header>

      <ModeSwitcher
        activeTab={activeTab}
        onChange={setActiveTab}
        onboardingCount={employees.length}
      />

      {activeTab === 'onboarding' ? (
        <>
          <section aria-label="Compliance summary">
            <TrainingComplianceSummary
              employees={employees}
              lastSyncAt={stats?.lastSyncAt ?? null}
              pendingAdjustments={stats?.pendingAdjustments ?? 0}
              activeFilter={summaryFilter}
              onFilterChange={setSummaryFilter}
            />
          </section>

          <TrainingComplianceToolbar
            filters={filters}
            onChange={setFilters}
            courseNames={courseNames}
            resultCount={filtered.length}
            totalCount={employees.length}
          />

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-6 py-16 text-center">
              <p className="text-[15px] font-medium text-foreground">No employees match these compliance filters.</p>
              <p className="mt-2 text-sm text-muted-foreground">Adjust search or clear active filters to widen the directory.</p>
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setFilters(defaultFilters);
                  setSummaryFilter('all');
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <>
              <TrainingComplianceTable
                employees={pageEmployees}
                gateSummaries={gateSummaries}
                selectedEmployeeId={employeeId}
                onOpenEmployee={openEmployee}
              />
              <TrainingComplianceMobileList
                employees={pageEmployees}
                gateSummaries={gateSummaries}
                selectedEmployeeId={employeeId}
                onOpenEmployee={openEmployee}
              />

              <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground tabular-nums">
                  Showing {filtered.length === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <RecurringComplianceDashboard />
      )}

      {employeeId ? (
        <EmployeeComplianceDrawer employeeId={employeeId} onClose={closeEmployee} />
      ) : null}
    </div>
  );
}

function ModeSwitcher({
  activeTab,
  onChange,
  onboardingCount,
}: {
  activeTab: 'onboarding' | 'recurring';
  onChange: (tab: 'onboarding' | 'recurring') => void;
  onboardingCount: number;
}) {
  return (
    <div
      role="tablist"
      aria-label="Compliance mode"
      className="flex max-w-full gap-2 overflow-x-auto pb-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'onboarding'}
        onClick={() => onChange('onboarding')}
        className={`inline-flex h-9 shrink-0 items-center rounded-md px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
          activeTab === 'onboarding'
            ? 'bg-primary text-white'
            : 'border border-border bg-card text-muted-foreground hover:text-foreground'
        }`}
      >
        Initial Onboarding
        <span className="ml-2 rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] tabular-nums">
          {onboardingCount}
        </span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'recurring'}
        onClick={() => onChange('recurring')}
        className={`inline-flex h-9 shrink-0 items-center rounded-md px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
          activeTab === 'recurring'
            ? 'bg-primary text-white'
            : 'border border-border bg-card text-muted-foreground hover:text-foreground'
        }`}
      >
        Recurring Compliance
      </button>
    </div>
  );
}
