import type { ComplianceStatus, TrainingEmployee } from '../types';
import type { OnboardingGateRow } from '../hooks/useOnboardingGate';

export type GateDisplayState =
  | 'satisfied'
  | 'incomplete'
  | 'not_applicable'
  | 'no_group'
  | 'unavailable';

export interface GateSummary {
  state: GateDisplayState;
  completed: number;
  total: number;
  label: string;
}

export const complianceStatusConfig: Record<
  ComplianceStatus,
  { label: string; dot: string; text: string; bg: string; border: string; priority: number }
> = {
  compliant: {
    label: 'Compliant',
    dot: 'var(--color-signal)',
    text: 'var(--color-signal)',
    bg: 'color-mix(in oklab, var(--color-signal) 14%, transparent)',
    border: 'color-mix(in oklab, var(--color-signal) 28%, transparent)',
    priority: 1,
  },
  overdue: {
    label: 'Overdue',
    dot: 'var(--color-error)',
    text: 'var(--color-error)',
    bg: 'color-mix(in oklab, var(--color-error) 11%, transparent)',
    border: 'color-mix(in oklab, var(--color-error) 28%, transparent)',
    priority: 5,
  },
  in_progress: {
    label: 'In Progress',
    dot: 'var(--color-accent-2)',
    text: 'var(--color-accent-2)',
    bg: 'color-mix(in oklab, var(--color-accent-2) 11%, transparent)',
    border: 'color-mix(in oklab, var(--color-accent-2) 28%, transparent)',
    priority: 3,
  },
  not_started: {
    label: 'Not Started',
    dot: 'var(--muted-foreground)',
    text: 'var(--muted-foreground)',
    bg: 'color-mix(in oklab, var(--tint) 6%, transparent)',
    border: 'color-mix(in oklab, var(--tint) 6%, transparent)',
    priority: 2,
  },
  no_courses: {
    label: 'No Courses',
    dot: 'var(--muted-foreground)',
    text: 'var(--muted-foreground)',
    bg: 'color-mix(in oklab, var(--tint) 6%, transparent)',
    border: 'color-mix(in oklab, var(--tint) 6%, transparent)',
    priority: 4,
  },
};

export function summarizeGate(rows: OnboardingGateRow[] | undefined, unavailable: boolean): GateSummary {
  if (unavailable) {
    return { state: 'unavailable', completed: 0, total: 0, label: 'Data unavailable' };
  }

  if (!rows || rows.length === 0) {
    return { state: 'not_applicable', completed: 0, total: 0, label: 'Gate not applicable' };
  }

  const completed = rows.filter((row) => row.effective_status === 'completed').length;
  const total = rows.length;

  if (completed === total) {
    return { state: 'satisfied', completed, total, label: 'Gate satisfied' };
  }

  return {
    state: 'incomplete',
    completed,
    total,
    label: 'Requirements incomplete',
  };
}

export function assignmentLabel(employee: TrainingEmployee): string {
  if (employee.coursesAssigned === 0) return 'No courses assigned';
  return `${employee.coursesCompleted} of ${employee.coursesAssigned} courses complete`;
}

export function completionLabel(employee: TrainingEmployee): string {
  if (employee.coursesAssigned === 0) return 'No assignment';
  if (employee.coursesCompleted === 0) return 'Not started';
  if (employee.coursesCompleted === employee.coursesAssigned) return 'Complete';
  return 'In progress';
}

export function employeeNeedsAction(employee: TrainingEmployee, gate?: GateSummary): boolean {
  if (employee.complianceStatus === 'overdue') return true;
  if (gate?.state === 'incomplete') return true;
  return employee.records.some((record) => record.has_overrides);
}

export function employeeHasAdjustments(employee: TrainingEmployee): boolean {
  return employee.records.some((record) => record.has_overrides || record.last_adjusted_at);
}

export function priorityEdgeClass(employee: TrainingEmployee, gate?: GateSummary): string | null {
  if (employee.complianceStatus === 'overdue') return 'border-l-[3px] border-l-[hsl(4_82%_52%)]';
  if (gate?.state === 'incomplete') return 'border-l-[3px] border-l-[hsl(38_96%_52%)]';
  if (employee.complianceStatus === 'no_courses') return 'border-l-[3px] border-l-[hsl(262_18%_52%)]';
  return null;
}
