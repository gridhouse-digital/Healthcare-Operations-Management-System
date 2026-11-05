import { StatusBadge, type StatusTone } from '@/components/shared/StatusBadge';
import type { ComplianceStatus } from '../types';
import { complianceStatusConfig } from '../utils/compliancePresentation';

interface ComplianceStatusBadgeProps {
  status: ComplianceStatus;
  size?: 'sm' | 'md';
}

const TONES: Record<ComplianceStatus, StatusTone> = {
  compliant: 'done',
  overdue: 'critical',
  in_progress: 'waiting',
  not_started: 'neutral',
  no_courses: 'neutral',
};

export function ComplianceStatusBadge({ status }: ComplianceStatusBadgeProps) {
  return <StatusBadge status={complianceStatusConfig[status].label} tone={TONES[status]} />;
}
