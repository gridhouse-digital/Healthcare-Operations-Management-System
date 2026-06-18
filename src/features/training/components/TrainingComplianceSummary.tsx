import {
  AlertTriangle,
  ClipboardEdit,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
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
  icon: Icon,
  intent,
  selected,
  onClick,
}: {
  label: string;
  value: string | number;
  context: string;
  icon: typeof Users;
  intent: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  selected?: boolean;
  onClick?: () => void;
}) {
  const accent =
    intent === 'success'
      ? 'var(--severity-low)'
      : intent === 'warning'
        ? 'var(--severity-medium)'
        : intent === 'danger'
          ? 'var(--severity-critical)'
          : intent === 'info'
            ? 'var(--chart-3)'
            : 'var(--primary)';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group relative min-w-0 rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        selected ? 'border-primary/40 bg-primary/5' : 'border-border bg-card hover:border-border-strong'
      }`}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-l-lg" style={{ background: accent }} />
      <div className="flex items-start justify-between gap-2 pl-2">
        <div className="min-w-0">
          <p className="zone-label truncate">{label}</p>
          <p
            className="mt-1 truncate text-xl font-semibold tabular-nums tracking-[-0.02em] text-foreground"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {value}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{context}</p>
        </div>
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)` }}
        >
          <Icon size={13} strokeWidth={1.75} style={{ color: accent }} />
        </div>
      </div>
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
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      <MetricTile
        label="Total Employees"
        value={total}
        context={noCourses > 0 ? `${noCourses} without courses` : 'All assigned'}
        icon={Users}
        intent="neutral"
        selected={activeFilter === 'all'}
        onClick={() => onFilterChange('all')}
      />
      <MetricTile
        label="Fully Compliant"
        value={fullyCompliant}
        context="Effective status compliant"
        icon={ShieldCheck}
        intent="success"
        selected={activeFilter === 'compliant'}
        onClick={() => onFilterChange('compliant')}
      />
      <MetricTile
        label="Action Required"
        value={actionRequired}
        context="Overdue or gate blocked"
        icon={ShieldAlert}
        intent="danger"
        selected={activeFilter === 'action_required'}
        onClick={() => onFilterChange('action_required')}
      />
      <MetricTile
        label="Pending Adjustments"
        value={pendingAdjustments}
        context="Last 7 days"
        icon={ClipboardEdit}
        intent="warning"
        selected={activeFilter === 'pending_adjustments'}
        onClick={() => onFilterChange('pending_adjustments')}
      />
      <MetricTile
        label="No Courses"
        value={noCourses}
        context="Zero assignments"
        icon={AlertTriangle}
        intent="info"
        selected={activeFilter === 'no_courses'}
        onClick={() => onFilterChange('no_courses')}
      />
      <MetricTile
        label="Last Sync"
        value={lastSyncLabel}
        context="LearnDash"
        icon={RefreshCw}
        intent="neutral"
      />
    </div>
  );
}
