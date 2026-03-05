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
  active: "bg-[#00C9B1]/15 text-[#00C9B1] border border-[#00C9B1]/30",
  not_configured: "bg-[#1A1D26] text-[#6B7280] border border-[#1F2433]",
  failed: "bg-red-500/10 text-red-400 border border-red-500/30",
};

export function ConnectorStatusBadge({ status }: ConnectorStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium font-mono",
        STYLES[status],
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "active" && "bg-[#00C9B1]",
          status === "not_configured" && "bg-[#6B7280]",
          status === "failed" && "bg-red-400",
        )}
      />
      {LABELS[status]}
    </span>
  );
}
