import { useMemo, useState, type ReactNode } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ChevronDown, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SlideOver } from "@/components/ui/SlideOver";
import { AppSelect } from "@/components/ui/AppSelect";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort, type SortColumn } from "@/hooks/useTableSort";
import { toast } from "@/hooks/useToast";
import {
  useSaveTrainingComplianceRule,
  useTrainingComplianceRules,
} from "../hooks/useTrainingComplianceRules";
import type {
  TrainingComplianceRule,
  TrainingComplianceRuleDraft,
} from "../types/training-compliance-rules";

const selectCls = "min-h-10";

const templateOptions = [
  { value: "annual_employee_review", label: "Annual Employee Review" },
  { value: "annual_in_service", label: "Annual In-Service" },
  { value: "fire_safety", label: "Fire Safety" },
  { value: "cpr_first_aid", label: "CPR / First Aid" },
  { value: "medication_administration", label: "Medication Administration" },
  { value: "client_specific_training", label: "Client-Specific Training" },
] as const;

const reminderChoices = [
  { day: 60, label: "60 days before due date" },
  { day: 30, label: "30 days before due date" },
  { day: 0, label: "On due date" },
];

function createDefaultDraft(): TrainingComplianceRuleDraft {
  return {
    rule_name: "",
    rule_type: "annual_recurring",
    rule_template: "annual_employee_review",
    compliance_track: "recurring",
    applies_to_type: "group_members",
    course_id: "",
    group_id: "",
    anchor_type: "group_enrollment",
    initial_due_offset_months: 12,
    recurrence_interval_months: 12,
    reminder_days: [60, 30],
    notify_employee: true,
    notify_admin: true,
    accept_learndash_completion: true,
    allow_manual_completion: true,
    allow_early_completion: true,
    active: true,
  };
}

function toDraft(rule: TrainingComplianceRule): TrainingComplianceRuleDraft {
  return {
    id: rule.id,
    rule_name: rule.rule_name,
    rule_type: rule.rule_type,
    rule_template: rule.rule_template,
    compliance_track: rule.compliance_track,
    applies_to_type: rule.applies_to_type,
    course_id: rule.course_id,
    group_id: rule.group_id,
    anchor_type: rule.anchor_type,
    initial_due_offset_months: rule.initial_due_offset_months,
    recurrence_interval_months: rule.recurrence_interval_months,
    reminder_days: [...(rule.reminder_days ?? [])],
    notify_employee: rule.notify_employee,
    notify_admin: rule.notify_admin,
    accept_learndash_completion: rule.accept_learndash_completion,
    allow_manual_completion: rule.allow_manual_completion,
    allow_early_completion: rule.allow_early_completion,
    active: rule.active,
  };
}

const anchorLabels: Record<TrainingComplianceRuleDraft["anchor_type"], string> = {
  group_enrollment: "group enrollment",
  hire_date: "hire date",
  manual: "the manual anchor date",
};

function firstDueText(months: number, anchor: TrainingComplianceRuleDraft["anchor_type"]) {
  return `First due ${months} months after ${anchorLabels[anchor]}`;
}

function reminderText(day: number) {
  return day === 0 ? "Due date" : `${day} days`;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="form-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function CatalogDisclosure({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{title}</span>
          <span className="tab-count tab-count-inactive">{count}</span>
        </span>
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" className="text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="max-h-72 overflow-y-auto pb-3">{children}</div>
    </details>
  );
}

export function TrainingComplianceRulesPage() {
  const { data, isLoading, error } = useTrainingComplianceRules();
  const saveRule = useSaveTrainingComplianceRule();

  const [isOpen, setIsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [draft, setDraft] = useState<TrainingComplianceRuleDraft>(createDefaultDraft());

  function openNewRule() {
    setDraft(createDefaultDraft());
    setIsOpen(true);
  }

  function openEditRule(rule: TrainingComplianceRule) {
    setDraft(toDraft(rule));
    setIsOpen(true);
  }

  function updateDraft<K extends keyof TrainingComplianceRuleDraft>(
    key: K,
    value: TrainingComplianceRuleDraft[K],
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function toggleReminder(day: number) {
    setDraft((prev) => {
      const exists = prev.reminder_days.includes(day);
      return {
        ...prev,
        reminder_days: exists
          ? prev.reminder_days.filter((value) => value !== day)
          : [...prev.reminder_days, day].sort((a, b) => b - a),
      };
    });
  }

  async function handleSave() {
    if (!draft.rule_name.trim()) {
      toast.error("Rule name is required");
      return;
    }
    if (!draft.group_id) {
      toast.error("LearnDash group is required");
      return;
    }
    if (!draft.course_id) {
      toast.error("LearnDash course is required");
      return;
    }

    try {
      await saveRule.mutateAsync({
        ...draft,
        rule_name: draft.rule_name.trim(),
      });
      toast.success(draft.id ? "Rule updated" : "Rule created");
      setIsOpen(false);
      setDraft(createDefaultDraft());
    } catch (err) {
      console.error("Failed to save recurring compliance rule", err);
      toast.error("Failed to save rule");
    }
  }

  async function handleDeactivate() {
    if (!draft.id) return;
    try {
      await saveRule.mutateAsync({ ...draft, active: false });
      toast.success("Rule deactivated");
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to deactivate recurring compliance rule", err);
      toast.error("Failed to deactivate rule");
    }
  }

  const rules = data?.rules ?? [];
  const visibleRules = rules.filter((rule) =>
    statusFilter === "all" ? true : statusFilter === "active" ? rule.active : !rule.active,
  );
  const coursesWithRule = new Set(rules.map((rule) => rule.course_id));
  const groups = data?.groups;
  const sortColumns = useMemo(() => ({
    rule: { value: (rule) => rule.rule_name },
    appliesTo: { value: (rule) => groups?.find((group) => group.group_id === rule.group_id)?.label ?? rule.group_id },
    schedule: { value: (rule) => rule.recurrence_interval_months, kind: "number" },
    reminders: { value: (rule) => rule.reminder_days.length, kind: "number" },
    status: { value: (rule) => (rule.active ? "Active" : "Inactive") },
  } satisfies Record<string, SortColumn<TrainingComplianceRule>>), [groups]);
  const { sortedRows: sortedRules, sortProps } = useTableSort(visibleRules, sortColumns);
  const groupLabel = (groupId: string) =>
    data?.groups.find((group) => group.group_id === groupId)?.label ?? groupId;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-header-title">Training Compliance Rules</h1>
          <p className="page-header-meta">
            Choose which LearnDash courses are recurring compliance items instead of onboarding.
          </p>
        </div>
        <Button onClick={openNewRule} className="w-full sm:w-auto">
          <Plus size={14} aria-hidden="true" />
          Add Rule
        </Button>
      </div>

      {isLoading && (
        <div className="divide-y divide-border border-y border-border" aria-busy="true" aria-label="Loading rules">
          {[1, 2, 3].map((row) => (
            <div key={row} className="flex items-center gap-4 py-4">
              <div className="h-3 w-1/3 rounded ai-shimmer" />
              <div className="ml-auto h-3 w-1/4 rounded ai-shimmer" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="saas-card p-6 text-sm text-destructive">
          Failed to load training compliance rules.
        </div>
      )}

      {!isLoading && !error && data && !data.schemaReady && (
        <div className="saas-card p-6 space-y-2">
          <p className="text-sm font-medium text-foreground">
            Recurring compliance schema not available yet
          </p>
          <p className="text-sm text-muted-foreground">
            Apply the Epic 5.9 recurring compliance migration before using this screen.
          </p>
        </div>
      )}

      {!isLoading && !error && data?.schemaReady && (
        <>
          <div>
            <div className="tab-bar" aria-label="Filter rules by status">
              {[
                { value: "all" as const, label: "All rules", count: rules.length },
                { value: "active" as const, label: "Active", count: rules.filter((rule) => rule.active).length },
                { value: "inactive" as const, label: "Inactive", count: rules.filter((rule) => !rule.active).length },
              ].map((tab) => {
                const active = statusFilter === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setStatusFilter(tab.value)}
                    className={`tab-item${active ? " active" : ""}`}
                  >
                    {tab.label}
                    <span className={`tab-count ${active ? "tab-count-active" : "tab-count-inactive"}`}>{tab.count}</span>
                  </button>
                );
              })}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr>
                    <SortableHeader label="Rule" {...sortProps("rule")} className="py-3 pr-4 text-left" />
                    <SortableHeader label="Applies To" {...sortProps("appliesTo")} className="hidden py-3 pr-4 text-left xl:table-cell" />
                    <SortableHeader label="Schedule" {...sortProps("schedule")} className="hidden py-3 pr-4 text-left md:table-cell" />
                    <SortableHeader label="Reminders" {...sortProps("reminders")} className="hidden py-3 pr-4 text-left lg:table-cell" />
                    <SortableHeader label="Status" {...sortProps("status")} className="hidden py-3 pr-4 text-left sm:table-cell" />
                    <th className="w-16 py-3 text-right zone-label"><span className="visually-hidden">Action</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedRules.map((rule) => (
                    <tr key={rule.id} className="table-row-interactive" onClick={() => openEditRule(rule)}>
                      <td className="max-w-0 py-4 pr-4 md:max-w-none">
                        <p className="text-sm font-medium text-foreground">{rule.rule_name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{rule.course_name ?? rule.course_id}</p>
                        <p className="mt-1 text-xs text-muted-foreground md:hidden">
                          Every {rule.recurrence_interval_months} months
                        </p>
                        <span className="mt-2 inline-flex sm:hidden"><StatusBadge status={rule.active ? "Active" : "Inactive"} tone={rule.active ? "done" : "neutral"} /></span>
                      </td>
                      <td className="hidden py-4 pr-4 xl:table-cell">
                        <p className="text-sm text-secondary-foreground">
                          {rule.applies_to_type === "group_members" ? "Everyone in group" : rule.applies_to_type}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{groupLabel(rule.group_id)}</p>
                      </td>
                      <td className="hidden py-4 pr-4 md:table-cell">
                        <p className="whitespace-nowrap text-sm tabular-nums text-secondary-foreground">
                          Every {rule.recurrence_interval_months} months
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {firstDueText(rule.initial_due_offset_months, rule.anchor_type)}
                        </p>
                      </td>
                      <td className="hidden py-4 pr-4 lg:table-cell">
                        {rule.reminder_days.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {rule.reminder_days.map((day) => (
                              <span key={day} className="status-chip status-chip-muted tabular-nums">{reminderText(day)}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">None</span>
                        )}
                      </td>
                      <td className="hidden py-4 pr-4 sm:table-cell">
                        <StatusBadge status={rule.active ? "Active" : "Inactive"} tone={rule.active ? "done" : "neutral"} />
                      </td>
                      <td className="py-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Edit ${rule.rule_name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditRule(rule);
                          }}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {visibleRules.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty-state">
                          <p className="empty-state-title">
                            {rules.length === 0 ? "No recurring compliance rules configured yet." : `No ${statusFilter} rules.`}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="zone-label mb-1">Synced from LearnDash</p>
            <div className="divide-y divide-border border-y border-border">
              <CatalogDisclosure title="Available LearnDash Groups" count={data.groups.length}>
                {data.groups.length > 0 ? (
                  <ul className="divide-y divide-border">
                    {data.groups.map((group) => (
                      <li key={group.group_id} className="py-2 text-sm text-secondary-foreground">{group.label}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No group mappings found yet. Add LearnDash group mappings first.
                  </p>
                )}
              </CatalogDisclosure>
              <CatalogDisclosure title="Available LearnDash Courses" count={data.courses.length}>
                {data.courses.length > 0 ? (
                  <ul className="divide-y divide-border">
                    {data.courses.map((course) => (
                      <li key={course.course_id} className="flex items-center justify-between gap-3 py-2 text-sm text-secondary-foreground">
                        <span className="min-w-0">{course.course_name ?? course.course_id}</span>
                        {coursesWithRule.has(course.course_id) && (
                          <StatusBadge status="Has a rule" tone="done" />
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No synced LearnDash courses found yet. Run a training sync after WordPress is connected.
                  </p>
                )}
              </CatalogDisclosure>
            </div>
          </div>
        </>
      )}

      <SlideOver
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={draft.id ? "Edit Compliance Rule" : "Add Compliance Rule"}
        width="lg"
      >
        <div className="space-y-8">
          <section className="space-y-4">
            <h3 className="text-title text-foreground">What it tracks</h3>
            <Field label="Rule Name">
              <input
                value={draft.rule_name}
                onChange={(event) => updateDraft("rule_name", event.target.value)}
                className="saas-input"
                placeholder="Annual Employee Review"
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Rule Template">
                <AppSelect
                  value={draft.rule_template ?? ""}
                  onValueChange={(value) => updateDraft("rule_template", value || null)}
                  options={[
                    { value: "", label: "Custom" },
                    ...templateOptions.map((option) => ({ value: option.value, label: option.label })),
                  ]}
                  className={selectCls}
                />
              </Field>
              <Field label="Rule Type">
                <AppSelect
                  value={draft.rule_type}
                  onValueChange={(value) => updateDraft("rule_type", value as TrainingComplianceRuleDraft["rule_type"])}
                  options={[
                    { value: "annual_recurring", label: "Annual Recurring" },
                    { value: "interval_recurring", label: "Interval Recurring" },
                    { value: "assignment_specific", label: "Assignment-Specific" },
                  ]}
                  className={selectCls}
                />
              </Field>
              <Field label="LearnDash Group">
                <AppSelect
                  value={draft.group_id}
                  onValueChange={(value) => updateDraft("group_id", value)}
                  options={[
                    { value: "", label: "Select group" },
                    ...((data?.groups ?? []).map((group) => ({ value: group.group_id, label: group.label }))),
                  ]}
                  className={selectCls}
                />
              </Field>
              <Field
                label="LearnDash Course"
                hint="Courses come from synced LearnDash catalog data, with fallback to existing training history if the catalog is still empty."
              >
                <AppSelect
                  value={draft.course_id}
                  onValueChange={(value) => updateDraft("course_id", value)}
                  options={[
                    { value: "", label: "Select course" },
                    ...((data?.courses ?? []).map((course) => ({
                      value: course.course_id,
                      label: course.course_name ?? course.course_id,
                    }))),
                  ]}
                  className={selectCls}
                />
              </Field>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-title text-foreground">When it's due</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2"><Field label="Anchor Date">
                <AppSelect
                  value={draft.anchor_type}
                  onValueChange={(value) => updateDraft("anchor_type", value as TrainingComplianceRuleDraft["anchor_type"])}
                  options={[
                    { value: "group_enrollment", label: "Group enrollment date" },
                    { value: "hire_date", label: "Hire date" },
                    { value: "manual", label: "Manual anchor" },
                  ]}
                  className={selectCls}
                />
              </Field></div>
              <Field label="First Due">
                <AppSelect
                  value={String(draft.initial_due_offset_months)}
                  onValueChange={(value) => updateDraft("initial_due_offset_months", Number(value))}
                  options={[
                    { value: "12", label: "12 months after anchor date" },
                    { value: "24", label: "24 months after anchor date" },
                    { value: "6", label: "6 months after anchor date" },
                  ]}
                  className={selectCls}
                />
              </Field>
              <Field label="Repeats Every">
                <AppSelect
                  value={String(draft.recurrence_interval_months)}
                  onValueChange={(value) => updateDraft("recurrence_interval_months", Number(value))}
                  options={[
                    { value: "12", label: "12 months" },
                    { value: "24", label: "24 months" },
                    { value: "36", label: "36 months" },
                  ]}
                  className={selectCls}
                />
              </Field>
            </div>
            <div className="well">
              <p className="text-sm font-medium" style={{ color: "var(--color-well-ink)" }}>
                {firstDueText(draft.initial_due_offset_months, draft.anchor_type)}, then every {draft.recurrence_interval_months} months.
              </p>
              <p className="mt-1 text-xs">
                {draft.reminder_days.length > 0
                  ? `Reminders: ${draft.reminder_days.map((day) => (day === 0 ? "on the due date" : `${day} days before`)).join(", ")}.`
                  : "No reminders are set."}
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-title text-foreground">Reminder Schedule</h3>
            <div className="flex flex-wrap gap-2">
              {reminderChoices.map((choice) => (
                <label key={choice.day} className="choice-chip">
                  <input
                    type="checkbox"
                    className="visually-hidden"
                    checked={draft.reminder_days.includes(choice.day)}
                    onChange={() => toggleReminder(choice.day)}
                  />
                  <span>{choice.label}</span>
                </label>
              ))}
            </div>
          </section>

          <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
            <section>
              <h3 className="text-title mb-1 text-foreground">Notify</h3>
              <div className="divide-y divide-border">
                <ToggleRow label="Employee" checked={draft.notify_employee} onChange={(value) => updateDraft("notify_employee", value)} />
                <ToggleRow label="HR/Admin" checked={draft.notify_admin} onChange={(value) => updateDraft("notify_admin", value)} />
              </div>
            </section>
            <section>
              <h3 className="text-title mb-1 text-foreground">Completion Source</h3>
              <div className="divide-y divide-border">
                <ToggleRow label="Accept LearnDash completion" checked={draft.accept_learndash_completion} onChange={(value) => updateDraft("accept_learndash_completion", value)} />
                <ToggleRow label="Allow manual HR completion" checked={draft.allow_manual_completion} onChange={(value) => updateDraft("allow_manual_completion", value)} />
                <ToggleRow label="Allow early completion" checked={draft.allow_early_completion} onChange={(value) => updateDraft("allow_early_completion", value)} />
              </div>
            </section>
          </div>

          <section className="border-t border-border pt-2">
            <ToggleRow
              label="Active"
              hint="Inactive rules stay in history but stop generating future cycles."
              checked={draft.active}
              onChange={(value) => updateDraft("active", value)}
            />
          </section>

          <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap justify-between gap-2 border-t border-border bg-card px-6 py-4">
            <div>
              {draft.id && (
                <Button variant="outline" onClick={() => void handleDeactivate()} disabled={saveRule.isPending}>
                  Deactivate Rule
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsOpen(false)} disabled={saveRule.isPending}>
                Cancel
              </Button>
              <Button onClick={() => void handleSave()} disabled={saveRule.isPending}>
                <Save size={14} aria-hidden="true" />
                {saveRule.isPending ? "Saving…" : "Save Rule"}
              </Button>
            </div>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
