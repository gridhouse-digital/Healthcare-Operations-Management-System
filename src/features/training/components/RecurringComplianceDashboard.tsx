import { useMemo, useState } from "react";
import { CalendarClock, Search } from "lucide-react";
import { format } from "date-fns";
import { SlideOver } from "@/components/ui/SlideOver";
import { useRecurringComplianceDashboard } from "../hooks/useRecurringComplianceDashboard";
import type {
  RecurringComplianceEmployeeRow,
  RecurringComplianceStatus,
} from "../types/recurring-compliance";

const inputCls =
  "w-full px-3 h-9 border border-border rounded-md text-[13px] text-foreground bg-card focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow placeholder:text-muted-foreground/60 [&_option]:bg-card [&_option]:text-foreground";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return format(new Date(value), "MMM d, yyyy");
}

function statusStyles(status: RecurringComplianceStatus): string {
  switch (status) {
    case "completed":
      return "border-[color-mix(in_srgb,var(--severity-low)_25%,transparent)] bg-[color-mix(in_srgb,var(--severity-low)_10%,transparent)] text-[var(--severity-low)]";
    case "overdue":
      return "border-[hsl(4,82%,52%)]/25 bg-[hsl(4,82%,52%)]/10 text-[hsl(4,76%,60%)]";
    case "due":
      return "border-[color-mix(in_srgb,var(--primary)_25%,transparent)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-primary";
    case "due_soon":
      return "border-[color-mix(in_srgb,var(--severity-medium)_25%,transparent)] bg-[color-mix(in_srgb,var(--severity-medium)_10%,transparent)] text-[var(--severity-medium)]";
    case "not_yet_due":
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

function statusLabel(status: RecurringComplianceStatus): string {
  switch (status) {
    case "not_yet_due":
      return "Not Yet Due";
    case "due_soon":
      return "Due Soon";
    case "due":
      return "Due";
    case "overdue":
      return "Overdue";
    case "completed":
      return "Completed";
  }
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="saas-card p-4">
      <p className="zone-label mb-1">{label}</p>
      <p className={`text-[28px] font-semibold tracking-[-0.03em] ${tone}`}>{value}</p>
    </div>
  );
}

export function RecurringComplianceDashboard() {
  const { data, isLoading, error } = useRecurringComplianceDashboard();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RecurringComplianceStatus>("all");
  const [ruleFilter, setRuleFilter] = useState("all");
  const [selectedRow, setSelectedRow] = useState<RecurringComplianceEmployeeRow | null>(null);

  const rows = useMemo(() => {
    return (data?.rows ?? []).filter((row) => {
      const matchesSearch = !searchTerm ||
        row.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesRule = ruleFilter === "all" || row.rule_id === ruleFilter;
      return matchesSearch && matchesStatus && matchesRule;
    });
  }, [data?.rows, ruleFilter, searchTerm, statusFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="saas-card p-5 text-[13px] text-destructive">
        Failed to load recurring compliance data.
      </div>
    );
  }

  if (!data?.schemaReady) {
    return (
      <div className="saas-card p-5 space-y-2">
        <p className="text-[14px] font-semibold text-foreground">
          Recurring compliance schema not available yet
        </p>
        <p className="text-[13px] text-muted-foreground">
          Apply the Epic 5.9 migration before using the recurring compliance dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="zone-label mb-2">Recurring Compliance</p>
        <div className="grid gap-3 md:grid-cols-5">
          <SummaryCard label="Not Yet Due" value={data.summary.not_yet_due} tone="text-muted-foreground" />
          <SummaryCard label="Due Soon" value={data.summary.due_soon} tone="text-[var(--severity-medium)]" />
          <SummaryCard label="Due" value={data.summary.due} tone="text-primary" />
          <SummaryCard label="Overdue" value={data.summary.overdue} tone="text-[hsl(4,76%,60%)]" />
          <SummaryCard label="Completed" value={data.summary.completed} tone="text-[var(--severity-low)]" />
        </div>
      </div>

      <div className="saas-card p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} strokeWidth={2} />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search employee..."
              className="w-full rounded-md border border-border bg-transparent pl-8 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/35 h-9"
            />
          </div>
          <select value={ruleFilter} onChange={(event) => setRuleFilter(event.target.value)} className={inputCls}>
            <option value="all">All Rules</option>
            {(data?.ruleOptions ?? []).map((rule) => (
              <option key={rule.rule_id} value={rule.rule_id}>{rule.label}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | RecurringComplianceStatus)} className={inputCls}>
            <option value="all">All Statuses</option>
            <option value="not_yet_due">Not Yet Due</option>
            <option value="due_soon">Due Soon</option>
            <option value="due">Due</option>
            <option value="overdue">Overdue</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      <div className="saas-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                <th className="px-5 py-3 text-left"><span className="zone-label">Employee</span></th>
                <th className="px-5 py-3 text-left"><span className="zone-label">Rule</span></th>
                <th className="px-5 py-3 text-left"><span className="zone-label">Anchor Date</span></th>
                <th className="px-5 py-3 text-left"><span className="zone-label">Due Date</span></th>
                <th className="px-5 py-3 text-left"><span className="zone-label">Status</span></th>
                <th className="px-5 py-3 text-left"><span className="zone-label">Completed</span></th>
                <th className="px-5 py-3 text-left"><span className="zone-label">Source</span></th>
                <th className="px-5 py-3 text-right"><span className="zone-label">Action</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((row) => (
                <tr key={`${row.person_id}:${row.rule_id}`}>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-col">
                      <span className="text-[13px] font-medium text-foreground">{row.employee_name}</span>
                      <span className="text-[11px] text-muted-foreground">{row.email}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-foreground">{row.rule_label}</td>
                  <td className="px-5 py-3.5 text-[12px] text-muted-foreground">{formatDate(row.anchor_date)}</td>
                  <td className="px-5 py-3.5 text-[12px] text-muted-foreground">{formatDate(row.due_at)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusStyles(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-muted-foreground">{formatDate(row.completed_at)}</td>
                  <td className="px-5 py-3.5 text-[12px] text-muted-foreground">{row.completion_source ?? "—"}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      className="text-[13px] font-medium text-primary hover:text-primary/80"
                      onClick={() => setSelectedRow(row)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <p className="text-[13px] text-muted-foreground">
                      No recurring compliance rows match the current filters.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SlideOver
        isOpen={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        title="Recurring Compliance Detail"
        width="md"
      >
        {selectedRow && (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CalendarClock size={16} />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-foreground">{selectedRow.employee_name}</h3>
                <p className="text-[13px] text-muted-foreground">{selectedRow.rule_label}</p>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex justify-between gap-4">
                <span className="zone-label">Status</span>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusStyles(selectedRow.status)}`}>
                  {statusLabel(selectedRow.status)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="zone-label">Anchor Date</span>
                <span className="text-[13px] text-foreground">{formatDate(selectedRow.anchor_date)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="zone-label">Due Date</span>
                <span className="text-[13px] text-foreground">{formatDate(selectedRow.due_at)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="zone-label">Completed Date</span>
                <span className="text-[13px] text-foreground">{formatDate(selectedRow.completed_at)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="zone-label">Completion Source</span>
                <span className="text-[13px] text-foreground">{selectedRow.completion_source ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="zone-label">Cycle</span>
                <span className="text-[13px] text-foreground">Cycle {selectedRow.cycle_number}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="zone-label">Reminders</span>
                <span className="text-[13px] text-foreground">
                  {selectedRow.reminder_suppressed ? "Suppressed" : "Active"}
                </span>
              </div>
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
