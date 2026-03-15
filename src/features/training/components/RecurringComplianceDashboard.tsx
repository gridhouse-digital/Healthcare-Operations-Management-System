import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Search } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { SlideOver } from "@/components/ui/SlideOver";
import { AppSelect } from "@/components/ui/AppSelect";
import {
  useManageRecurringCompliance,
  useRecurringComplianceDashboard,
} from "../hooks/useRecurringComplianceDashboard";
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
    setAnchorDate(selectedRow.anchor_date ? selectedRow.anchor_date.slice(0, 10) : "");
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
          <AppSelect
            value={ruleFilter}
            onValueChange={setRuleFilter}
            options={[
              { value: "all", label: "All Rules" },
              ...((data?.ruleOptions ?? []).map((rule) => ({ value: rule.rule_id, label: rule.label }))),
            ]}
            className={inputCls}
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
            className={inputCls}
          />
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

            <div className="space-y-3 rounded-lg border border-border p-4">
              <div>
                <p className="zone-label mb-2">Manual actions</p>
                {!selectedRow.completed_at ? (
                  <div className="space-y-3">
                    <textarea
                      value={completionNote}
                      onChange={(event) => setCompletionNote(event.target.value)}
                      placeholder="Optional completion note"
                      className="min-h-[92px] w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/35"
                    />
                    <button
                      type="button"
                      disabled={manageRecurring.isPending}
                      onClick={() => void runAction("manual_complete")}
                      className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-[13px] font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {manageRecurring.isPending ? "Saving..." : "Mark Complete"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={manageRecurring.isPending}
                    onClick={() => void runAction("reopen_cycle")}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
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
                  className="inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
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
              <p className="text-[12px] text-muted-foreground">
                Changing the anchor date recalculates due dates for this group-enrollment series.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="date"
                  value={anchorDate}
                  onChange={(event) => setAnchorDate(event.target.value)}
                  className="h-9 rounded-md border border-border bg-card px-3 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/35"
                />
                <button
                  type="button"
                  disabled={manageRecurring.isPending || !anchorDate}
                  onClick={() => void runAction("override_anchor")}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
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
