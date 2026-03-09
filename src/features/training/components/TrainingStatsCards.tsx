import { Users, ShieldCheck, AlertTriangle, ClipboardEdit, RefreshCw } from 'lucide-react';
import { StatsCard } from '@/features/dashboard/components/StatsCard';
import { formatDistanceToNow } from 'date-fns';
import type { TrainingEmployee } from '../types';

interface TrainingStatsCardsProps {
  employees: TrainingEmployee[];
  lastSyncAt: string | null;
  pendingAdjustments: number;
}

export function TrainingStatsCards({ employees, lastSyncAt, pendingAdjustments }: TrainingStatsCardsProps) {
  const totalEmployees = employees.length;
  const fullyCompliant = employees.filter(e => e.complianceStatus === 'compliant').length;
  const overdue = employees.filter(e => e.complianceStatus === 'overdue').length;
  const noCourses = employees.filter(e => e.complianceStatus === 'no_courses').length;

  const lastSyncLabel = lastSyncAt
    ? formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true })
    : 'Never';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      <StatsCard
        title="Total Employees"
        value={totalEmployees}
        icon={Users}
        subtitle={noCourses > 0 ? `${noCourses} with no courses` : 'All have courses'}
        intent="info"
        stagger={0}
      />
      <StatsCard
        title="Fully Compliant"
        value={fullyCompliant}
        icon={ShieldCheck}
        subtitle="All courses current"
        intent="success"
        stagger={1}
      />
      <StatsCard
        title="Overdue / Expired"
        value={overdue}
        icon={AlertTriangle}
        subtitle="Needs attention"
        intent="danger"
        stagger={2}
      />
      <StatsCard
        title="Pending Adjustments"
        value={pendingAdjustments}
        icon={ClipboardEdit}
        subtitle="Last 7 days"
        intent="warning"
        stagger={3}
      />
      <div className="col-span-2 md:col-span-1">
        <StatsCard
          title="Last Sync"
          value={lastSyncLabel}
          icon={RefreshCw}
          subtitle="LearnDash"
          intent="info"
          stagger={4}
        />
      </div>
    </div>
  );
}
