import { StatusBadge, type StatusTone } from "@/components/shared/StatusBadge";
import type { ConnectorStatus } from "../types/tenant-settings";

interface ConnectorStatusBadgeProps {
  status: ConnectorStatus;
}

const LABELS: Record<ConnectorStatus, string> = {
  active: "Active",
  not_configured: "Not configured",
  failed: "Failed",
};

const TONES: Record<ConnectorStatus, StatusTone> = {
  active: "done",
  not_configured: "neutral",
  failed: "critical",
};

export function ConnectorStatusBadge({ status }: ConnectorStatusBadgeProps) {
  return <StatusBadge status={LABELS[status]} tone={TONES[status]} />;
}
