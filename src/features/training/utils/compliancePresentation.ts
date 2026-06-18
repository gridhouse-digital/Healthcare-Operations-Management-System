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
    dot: 'hsl(152 58% 42%)',
    text: 'hsl(152 54% 56%)',
    bg: 'hsl(152 58% 38% / 0.10)',
    border: 'hsl(152 58% 38% / 0.20)',
    priority: 1,
  },
  overdue: {
    label: 'Overdue',
    dot: 'hsl(4 82% 56%)',
    text: 'hsl(4 76% 66%)',
    bg: 'hsl(4 82% 52% / 0.08)',
    border: 'hsl(4 82% 52% / 0.20)',
    priority: 5,
  },
  in_progress: {
    label: 'In Progress',
    dot: 'hsl(38 96% 52%)',
    text: 'hsl(38 90% 60%)',
    bg: 'hsl(38 96% 48% / 0.08)',
    border: 'hsl(38 96% 48% / 0.20)',
    priority: 3,
  },
  not_started: {
    label: 'Not Started',
    dot: 'hsl(220 10% 48%)',
    text: 'hsl(220 10% 62%)',
    bg: 'hsl(220 10% 50% / 0.08)',
    border: 'hsl(220 10% 50% / 0.14)',
    priority: 2,
  },
  no_courses: {
    label: 'No Courses',
    dot: 'hsl(262 18% 52%)',
    text: 'hsl(262 16% 68%)',
    bg: 'hsl(262 18% 50% / 0.10)',
    border: 'hsl(262 18% 50% / 0.18)',
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
