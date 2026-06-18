import type { ComplianceStatus } from '../types';
import { complianceStatusConfig } from '../utils/compliancePresentation';

interface ComplianceStatusBadgeProps {
  status: ComplianceStatus;
  size?: 'sm' | 'md';
}

export function ComplianceStatusBadge({ status, size = 'md' }: ComplianceStatusBadgeProps) {
  const config = complianceStatusConfig[status];
  const fontSize = size === 'sm' ? '10px' : '11px';
  const padding = size === 'sm' ? '2px 6px' : '2px 8px';

  return (
    <span
      className="inline-flex items-center rounded-full font-semibold tracking-[0.04em]"
      style={{
        gap: '5px',
        padding,
        fontSize,
        color: config.text,
        background: config.bg,
        border: `1px solid ${config.border}`,
      }}
    >
      <span
        className="shrink-0 rounded-full"
        aria-hidden
        style={{ width: '5px', height: '5px', background: config.dot }}
      />
      {config.label}
    </span>
  );
}
