import { cn } from "@/lib/utils";
import type { ConnectorStatus } from "../types/tenant-settings";

interface ConnectorStatusBadgeProps {
  status: ConnectorStatus;
}

const LABELS: Record<ConnectorStatus, string> = {
  active: "Active",
  not_configured: "Not configured",
  failed: "Failed",
};

const STYLES: Record<ConnectorStatus, string> = {
  active: "bg-primary/15 text-primary border border-primary/30",
  not_configured: "bg-muted/10 text-muted-foreground border border-border",
  failed: "bg-red-500/10 text-red-400 border border-red-500/30",
};

const DOT_STYLES: Record<ConnectorStatus, string> = {
  active: "bg-primary",
  not_configured: "bg-muted-foreground",
  failed: "bg-red-400",
};

export function ConnectorStatusBadge({ status }: ConnectorStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium font-mono",
        STYLES[status],
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT_STYLES[status])} />
      {LABELS[status]}
    </span>
  );
}
