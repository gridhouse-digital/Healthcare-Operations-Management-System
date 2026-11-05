import { useEffect, useMemo, useState } from "react";
import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { StatusBadge, type StatusTone } from "@/components/shared/StatusBadge";
import { CalendarClock, Search } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { SlideOver } from "@/components/ui/SlideOver";
import { AppSelect } from "@/components/ui/AppSelect";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort, type SortColumn } from "@/hooks/useTableSort";
import {
  useManageRecurringCompliance,
  useRecurringComplianceDashboard,
} from "../hooks/useRecurringComplianceDashboard";
import type {
  RecurringComplianceEmployeeRow,
  RecurringComplianceStatus,
} from "../types/recurring-compliance";


function parseDisplayDate(value: string): Date {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    return new Date(
      Number(dateOnlyMatch[1]),
      Number(dateOnlyMatch[2]) - 1,
      Number(dateOnlyMatch[3]),
    );
  }

  return new Date(value);
}

function toDateInputValue(value: string | null): string {
  if (!value) return "";

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) return value;

  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return format(parseDisplayDate(value), "MMM d, yyyy");
}

function statusTone(status: RecurringComplianceStatus): StatusTone {
  switch (status) {
    case "completed": return "done";
    case "overdue": return "critical";
    case "due": return "active";
    case "due_soon": return "waiting";
    case "not_yet_due": return "neutral";
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

const SORT_COLUMNS = {
  employee: { value: (row) => row.employee_name },
  rule: { value: (row) => row.rule_label },
  anchor: { value: (row) => row.anchor_date, kind: "date" },
  due: { value: (row) => row.due_at, kind: "date" },
  status: { value: (row) => statusLabel(row.status) },
  completed: { value: (row) => row.completed_at, kind: "date" },
  source: { value: (row) => row.completion_source },
} satisfies Record<string, SortColumn<RecurringComplianceEmployeeRow>>;

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
    <div className="tally-cell">
      <p className="zone-label">{label}</p>
      <p className={`data-value mt-2 text-3xl ${tone}`}>{value}</p>
    </div>
  );
}

export function RecurringComplianceDashboard() {
  const { data, isLoading, error } = useRecurringComplianceDashboard();
  const manageRecurring = useManageRecurringCompliance();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RecurringComplianceStatus>("all");
  const [ruleFilter, setRuleFilter] = useState("all");
  const [selectedRow, setSelectedRow] = useState<RecurringComplianceEmployeeRow | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [anchorDate, setAnchorDate] = useState("");

  useEffect(() => {
    if (!selectedRow) return;
    setCompletionNote(selectedRow.completion_note ?? "");
    setAnchorDate(toDateInputValue(selectedRow.anchor_date));
  }, [selectedRow]);

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
  const { sortedRows, sortProps } = useTableSort(rows, SORT_COLUMNS);

  if (isLoading) {
    return (
      <PageSkeleton label="Loading recurring compliance" />
    );
  }

  if (error) {
    return (
      <div className="saas-card p-5 text-sm text-destructive">
        Failed to load recurring compliance data.
      </div>
    );
  }

  if (!data?.schemaReady) {
    return (
      <div className="saas-card p-5 space-y-2">
        <p className="text-[14px] font-medium text-foreground">
          Recurring compliance schema not available yet
        </p>
        <p className="text-sm text-muted-foreground">
          Apply the Epic 5.9 migration before using the recurring compliance dashboard.
        </p>
      </div>
    );
  }

  async function runAction(
    action: "manual_complete" | "reopen_cycle" | "suppress_reminders" | "override_anchor",
  ) {
    if (!selectedRow) return;

    try {
      if (action === "manual_complete") {
        await manageRecurring.mutateAsync({
          instance_id: selectedRow.instance_id,
          action,
          completion_note: completionNote.trim() || undefined,
        });
        toast.success("Recurring compliance cycle marked complete");
      }

      if (action === "reopen_cycle") {
        await manageRecurring.mutateAsync({
          instance_id: selectedRow.instance_id,
          action,
        });
        toast.success("Recurring compliance cycle reopened");
      }

      if (action === "suppress_reminders") {
        const suppressed = !selectedRow.reminder_suppressed;
        await manageRecurring.mutateAsync({
          instance_id: selectedRow.instance_id,
          action,
          reminder_suppressed: suppressed,
        });
        toast.success(suppressed ? "Reminders suppressed" : "Reminders re-enabled");
      }

      if (action === "override_anchor") {
        if (!anchorDate) {
          toast.error("Choose a valid anchor date first");
          return;
        }
        await manageRecurring.mutateAsync({
          instance_id: selectedRow.instance_id,
          action,
          anchor_date: anchorDate,
        });
        toast.success("Anchor date updated");
      }

      setSelectedRow(null);
    } catch (mutationError) {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to update recurring compliance",
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="zone-label mb-2">Recurring Compliance</p>
        <div className="tally tally-5">
          <SummaryCard label="Not Yet Due" value={data.summary.not_yet_due} tone="text-muted-foreground" />
          <SummaryCard label="Due Soon" value={data.summary.due_soon} tone="text-[var(--severity-medium)]" />
          <SummaryCard label="Due" value={data.summary.due} tone="text-primary" />
          <SummaryCard label="Overdue" value={data.summary.overdue} tone="text-error" />
          <SummaryCard label="Completed" value={data.summary.completed} tone="text-[var(--severity-low)]" />
        </div>
      </div>

      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search size={14} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              aria-label="Search employees"
              placeholder="Search employee…"
              className="saas-input pl-9"
            />
          </div>
          <AppSelect
            value={ruleFilter}
            onValueChange={setRuleFilter}
            options={[
              { value: "all", label: "All Rules" },
              ...((data?.ruleOptions ?? []).map((rule) => ({ value: rule.rule_id, label: rule.label }))),
            ]}
            className="min-h-10 sm:w-56"
          />
          <AppSelect
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as "all" | RecurringComplianceStatus)}
            options={[
              { value: "all", label: "All Statuses" },
              { value: "not_yet_due", label: "Not Yet Due" },
              { value: "due_soon", label: "Due Soon" },
              { value: "due", label: "Due" },
              { value: "overdue", label: "Overdue" },
              { value: "completed", label: "Completed" },
            ]}
            className="min-h-10 sm:w-56"
          />
        </div>
      </div>

      <div>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                <SortableHeader label="Employee" {...sortProps("employee")} className="py-3 pr-4 text-left" />
                <SortableHeader label="Rule" {...sortProps("rule")} className="py-3 pr-4 text-left" />
                <SortableHeader label="Anchor Date" {...sortProps("anchor")} className="py-3 pr-4 text-left" />
                <SortableHeader label="Due Date" {...sortProps("due")} className="py-3 pr-4 text-left" />
                <SortableHeader label="Status" {...sortProps("status")} className="py-3 pr-4 text-left" />
                <SortableHeader label="Completed" {...sortProps("completed")} className="py-3 pr-4 text-left" />
                <SortableHeader label="Source" {...sortProps("source")} className="py-3 pr-4 text-left" />
                <th className="px-5 py-3 text-right"><span className="zone-label">Action</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {sortedRows.map((row) => (
                <tr key={`${row.person_id}:${row.rule_id}`}>
                  <td className="py-3 pr-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{row.employee_name}</span>
                      <span className="text-xs text-muted-foreground">{row.email}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-sm text-foreground">{row.rule_label}</td>
                  <td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(row.anchor_date)}</td>
                  <td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(row.due_at)}</td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={statusLabel(row.status)} tone={statusTone(row.status)} />
                  </td>
                  <td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(row.completed_at)}</td>
                  <td className="py-3 pr-4 text-xs text-muted-foreground">{row.completion_source ?? "—"}</td>
                  <td className="py-3 pr-4 text-right">
                    <button
                      className="text-sm font-medium text-primary hover:text-primary/80"
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
                    <p className="text-sm text-muted-foreground">
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
                <CalendarClock size={16} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-[15px] font-medium text-foreground">{selectedRow.employee_name}</h3>
                <p className="text-sm text-muted-foreground">{selectedRow.rule_label}</p>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex justify-between gap-4">
                <span className="zone-label">Status</span>
                <StatusBadge status={statusLabel(selectedRow.status)} tone={statusTone(selectedRow.status)} />
              </div>
              <div className="flex justify-between gap-4">
                <span className="zone-label">Anchor Date</span>
                <span className="text-sm text-foreground">{formatDate(selectedRow.anchor_date)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="zone-label">Due Date</span>
                <span className="text-sm text-foreground">{formatDate(selectedRow.due_at)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="zone-label">Completed Date</span>
                <span className="text-sm text-foreground">{formatDate(selectedRow.completed_at)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="zone-label">Completion Source</span>
                <span className="text-sm text-foreground">{selectedRow.completion_source ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="zone-label">Cycle</span>
                <span className="text-sm text-foreground">Cycle {selectedRow.cycle_number}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="zone-label">Reminders</span>
                <span className="text-sm text-foreground">
                  {selectedRow.reminder_suppressed ? "Suppressed" : "Active"}
                </span>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4">
              <div>
                <p className="zone-label mb-2">Manual actions</p>
                {!selectedRow.completed_at ? (
                  <div className="space-y-3">
                    <textarea
                      value={completionNote}
                      onChange={(event) => setCompletionNote(event.target.value)}
                      placeholder="Optional completion note"
                      className="min-h-[92px] w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                    />
                    <button
                      type="button"
                      disabled={manageRecurring.isPending}
                      onClick={() => void runAction("manual_complete")}
                      className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-accent-hi disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {manageRecurring.isPending ? "Saving..." : "Mark Complete"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={manageRecurring.isPending}
                    onClick={() => void runAction("reopen_cycle")}
                    className="inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {manageRecurring.isPending ? "Saving..." : "Reopen Cycle"}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={manageRecurring.isPending}
                  onClick={() => void runAction("suppress_reminders")}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {manageRecurring.isPending
                    ? "Saving..."
                    : selectedRow.reminder_suppressed
                      ? "Resume Reminders"
                      : "Suppress Reminders"}
                </button>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4">
              <p className="zone-label">Anchor override</p>
              <p className="text-xs text-muted-foreground">
                Changing the anchor date recalculates due dates for this group-enrollment series.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="date"
                  value={anchorDate}
                  onChange={(event) => setAnchorDate(event.target.value)}
                  className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground"
                />
                <button
                  type="button"
                  disabled={manageRecurring.isPending || !anchorDate}
                  onClick={() => void runAction("override_anchor")}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {manageRecurring.isPending ? "Saving..." : "Update Anchor Date"}
                </button>
              </div>
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
