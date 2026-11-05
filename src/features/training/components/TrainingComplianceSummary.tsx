import { formatDistanceToNow } from 'date-fns';
import type { TrainingEmployee } from '../types';
import { employeeNeedsAction } from '../utils/compliancePresentation';

export type SummaryFilter =
  | 'all'
  | 'compliant'
  | 'action_required'
  | 'no_courses'
  | 'pending_adjustments';

interface TrainingComplianceSummaryProps {
  employees: TrainingEmployee[];
  lastSyncAt: string | null;
  pendingAdjustments: number;
  activeFilter: SummaryFilter;
  onFilterChange: (filter: SummaryFilter) => void;
}

function MetricTile({
  label,
  value,
  context,
  intent,
  selected,
  onClick,
}: {
  label: string;
  value: string | number;
  context: string;
  intent: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  selected?: boolean;
  onClick?: () => void;
}) {
  const figure =
    intent === 'warning'
      ? 'var(--severity-medium)'
      : intent === 'danger'
        ? 'var(--severity-critical)'
        : 'var(--foreground)';

  const body = (
    <>
      <span className="zone-label block truncate">
        {selected && <span aria-hidden="true" className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-signal align-middle" />}
        {label}
      </span>
      <span className={`data-value mt-2 block ${typeof value === 'string' ? 'text-md' : 'text-2xl'}`} style={{ color: figure }}>
        {value}
      </span>
      <span className="mt-2 block text-xs text-muted-foreground">{context}</span>
    </>
  );

  if (!onClick) return <div className="tally-cell">{body}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="tally-cell min-w-0 text-left transition-colors hover:bg-secondary/50"
    >
      {body}
    </button>
  );
}

export function TrainingComplianceSummary({
  employees,
  lastSyncAt,
  pendingAdjustments,
  activeFilter,
  onFilterChange,
}: TrainingComplianceSummaryProps) {
  const total = employees.length;
  const fullyCompliant = employees.filter((employee) => employee.complianceStatus === 'compliant').length;
  const actionRequired = employees.filter((employee) => employeeNeedsAction(employee)).length;
  const noCourses = employees.filter((employee) => employee.complianceStatus === 'no_courses').length;
  const lastSyncLabel = lastSyncAt
    ? formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true })
    : 'Never synced';

  return (
    <div className="tally tally-6">
      <MetricTile
        label="Total Employees"
        value={total}
        context={noCourses > 0 ? `${noCourses} without courses` : 'All assigned'}
        intent="neutral"
        selected={activeFilter === 'all'}
        onClick={() => onFilterChange('all')}
      />
      <MetricTile
        label="Fully Compliant"
        value={fullyCompliant}
        context="Effective status compliant"
        intent="success"
        selected={activeFilter === 'compliant'}
        onClick={() => onFilterChange('compliant')}
      />
      <MetricTile
        label="Action Required"
        value={actionRequired}
        context="Overdue or gate blocked"
        intent="danger"
        selected={activeFilter === 'action_required'}
        onClick={() => onFilterChange('action_required')}
      />
      <MetricTile
        label="Pending Adjustments"
        value={pendingAdjustments}
        context="Last 7 days"
        intent="warning"
        selected={activeFilter === 'pending_adjustments'}
        onClick={() => onFilterChange('pending_adjustments')}
      />
      <MetricTile
        label="No Courses"
        value={noCourses}
        context="Zero assignments"
        intent="info"
        selected={activeFilter === 'no_courses'}
        onClick={() => onFilterChange('no_courses')}
      />
      <MetricTile
        label="Last Sync"
        value={lastSyncLabel}
        context="LearnDash"
        intent="neutral"
      />
    </div>
  );
}
