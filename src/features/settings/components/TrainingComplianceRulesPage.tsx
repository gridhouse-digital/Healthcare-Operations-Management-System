import { useState } from "react";
import { BookCheck, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SlideOver } from "@/components/ui/SlideOver";
import { toast } from "@/hooks/useToast";
import {
  useSaveTrainingComplianceRule,
  useTrainingComplianceRules,
} from "../hooks/useTrainingComplianceRules";
import type {
  TrainingComplianceRule,
  TrainingComplianceRuleDraft,
} from "../types/training-compliance-rules";

const inputCls =
  "w-full h-9 px-3 border border-border rounded-md text-[13px] text-foreground bg-card focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow placeholder:text-muted-foreground/50 [&_option]:bg-card [&_option]:text-foreground";
const labelCls = "block text-[11px] font-medium tracking-[-0.01em] text-muted-foreground mb-1.5";

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

function statusPill(active: boolean): string {
  return active
    ? "border-[color-mix(in_srgb,var(--severity-low)_25%,transparent)] bg-[color-mix(in_srgb,var(--severity-low)_10%,transparent)] text-[var(--severity-low)]"
    : "border-border bg-muted/40 text-muted-foreground";
}

export function TrainingComplianceRulesPage() {
  const { data, isLoading, error } = useTrainingComplianceRules();
  const saveRule = useSaveTrainingComplianceRule();

  const [isOpen, setIsOpen] = useState(false);
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

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="pl-1">
          <div className="flex items-center gap-2">
            <BookCheck size={18} className="text-primary" />
            <h1 className="page-header-title">Training Compliance Rules</h1>
          </div>
          <p className="page-header-meta">
            Choose which LearnDash courses are recurring compliance items instead of onboarding.
          </p>
        </div>
        <Button onClick={openNewRule} size="sm">
          <Plus size={13} />
          Add Rule
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
      )}

      {!isLoading && error && (
        <div className="saas-card p-5 text-[13px] text-destructive">
          Failed to load training compliance rules.
        </div>
      )}

      {!isLoading && !error && data && !data.schemaReady && (
        <div className="saas-card p-5 space-y-2">
          <p className="text-[14px] font-semibold text-foreground">
            Recurring compliance schema not available yet
          </p>
          <p className="text-[13px] text-muted-foreground">
            Apply the Epic 5.9 recurring compliance migration before using this screen.
          </p>
        </div>
      )}

      {!isLoading && !error && data?.schemaReady && (
        <>
          <div className="saas-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr>
                    <th className="px-5 py-3 text-left"><span className="zone-label">Rule Name</span></th>
                    <th className="px-5 py-3 text-left"><span className="zone-label">LearnDash Course</span></th>
                    <th className="px-5 py-3 text-left"><span className="zone-label">Applies To</span></th>
                    <th className="px-5 py-3 text-left"><span className="zone-label">Due Every</span></th>
                    <th className="px-5 py-3 text-left"><span className="zone-label">Reminders</span></th>
                    <th className="px-5 py-3 text-left"><span className="zone-label">Status</span></th>
                    <th className="px-5 py-3 text-right"><span className="zone-label">Action</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.rules.map((rule) => (
                    <tr key={rule.id}>
                      <td className="px-5 py-3.5 text-[13px] font-medium text-foreground">{rule.rule_name}</td>
                      <td className="px-5 py-3.5 text-[13px] text-foreground">{rule.course_name ?? rule.course_id}</td>
                      <td className="px-5 py-3.5 text-[12px] text-muted-foreground">
                        {rule.applies_to_type === "group_members" ? "Everyone in group" : rule.applies_to_type}
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-muted-foreground">
                        {rule.recurrence_interval_months} months
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-muted-foreground">
                        {rule.reminder_days.length > 0
                          ? rule.reminder_days.map((day) => (day === 0 ? "Due date" : `${day}d`)).join(", ")
                          : "None"}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusPill(rule.active)}`}>
                          {rule.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEditRule(rule)}>
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {data.rules.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-16 text-center">
                        <p className="text-[13px] text-muted-foreground">
                          No recurring compliance rules configured yet.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="saas-card p-5">
              <p className="text-[13px] font-semibold text-foreground">Available LearnDash Groups</p>
              <div className="mt-3 space-y-2">
                {data.groups.length > 0 ? data.groups.map((group) => (
                  <div key={group.group_id} className="rounded-md border border-border px-3 py-2 text-[12px] text-muted-foreground">
                    {group.label}
                  </div>
                )) : (
                  <p className="text-[12px] text-muted-foreground">
                    No group mappings found yet. Add LearnDash group mappings first.
                  </p>
                )}
              </div>
            </div>
            <div className="saas-card p-5">
              <p className="text-[13px] font-semibold text-foreground">Available LearnDash Courses</p>
              <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                {data.courses.length > 0 ? data.courses.map((course) => (
                  <div key={course.course_id} className="rounded-md border border-border px-3 py-2 text-[12px] text-muted-foreground">
                    {course.course_name ?? course.course_id}
                  </div>
                )) : (
                  <p className="text-[12px] text-muted-foreground">
                    No synced LearnDash courses found yet. Run a training sync after WordPress is connected.
                  </p>
                )}
              </div>
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
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>Rule Name</label>
              <input
                value={draft.rule_name}
                onChange={(event) => updateDraft("rule_name", event.target.value)}
                className={inputCls}
                placeholder="Annual Employee Review"
              />
            </div>
            <div>
              <label className={labelCls}>Rule Template</label>
              <select
                value={draft.rule_template ?? ""}
                onChange={(event) => updateDraft("rule_template", event.target.value || null)}
                className={inputCls}
              >
                <option value="">Custom</option>
                {templateOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Rule Type</label>
              <select
                value={draft.rule_type}
                onChange={(event) => updateDraft("rule_type", event.target.value as TrainingComplianceRuleDraft["rule_type"])}
                className={inputCls}
              >
                <option value="annual_recurring">Annual Recurring</option>
                <option value="interval_recurring">Interval Recurring</option>
                <option value="assignment_specific">Assignment-Specific</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Anchor Date</label>
              <select
                value={draft.anchor_type}
                onChange={(event) => updateDraft("anchor_type", event.target.value as TrainingComplianceRuleDraft["anchor_type"])}
                className={inputCls}
              >
                <option value="group_enrollment">Group enrollment date</option>
                <option value="hire_date">Hire date</option>
                <option value="manual">Manual anchor</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>LearnDash Group</label>
              <select
                value={draft.group_id}
                onChange={(event) => updateDraft("group_id", event.target.value)}
                className={inputCls}
              >
                <option value="">Select group</option>
                {data?.groups.map((group) => (
                  <option key={group.group_id} value={group.group_id}>{group.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>LearnDash Course</label>
              <select
                value={draft.course_id}
                onChange={(event) => updateDraft("course_id", event.target.value)}
                className={inputCls}
              >
                <option value="">Select course</option>
                {data?.courses.map((course) => (
                  <option key={course.course_id} value={course.course_id}>
                    {course.course_name ?? course.course_id}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Courses come from synced LearnDash catalog data, with fallback to existing training history if the catalog is still empty.
              </p>
            </div>
            <div>
              <label className={labelCls}>First Due</label>
              <select
                value={draft.initial_due_offset_months}
                onChange={(event) => updateDraft("initial_due_offset_months", Number(event.target.value))}
                className={inputCls}
              >
                <option value={12}>12 months after anchor date</option>
                <option value={24}>24 months after anchor date</option>
                <option value={6}>6 months after anchor date</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Repeats Every</label>
              <select
                value={draft.recurrence_interval_months}
                onChange={(event) => updateDraft("recurrence_interval_months", Number(event.target.value))}
                className={inputCls}
              >
                <option value={12}>12 months</option>
                <option value={24}>24 months</option>
                <option value={36}>36 months</option>
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-[13px] font-semibold text-foreground">Reminder Schedule</p>
            <div className="space-y-2">
              {reminderChoices.map((choice) => (
                <label key={choice.day} className="flex items-center gap-2 text-[13px] text-foreground">
                  <input
                    type="checkbox"
                    checked={draft.reminder_days.includes(choice.day)}
                    onChange={() => toggleReminder(choice.day)}
                  />
                  <span>{choice.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border p-4 space-y-2">
              <p className="text-[13px] font-semibold text-foreground">Notify</p>
              <label className="flex items-center gap-2 text-[13px] text-foreground">
                <input
                  type="checkbox"
                  checked={draft.notify_employee}
                  onChange={(event) => updateDraft("notify_employee", event.target.checked)}
                />
                <span>Employee</span>
              </label>
              <label className="flex items-center gap-2 text-[13px] text-foreground">
                <input
                  type="checkbox"
                  checked={draft.notify_admin}
                  onChange={(event) => updateDraft("notify_admin", event.target.checked)}
                />
                <span>HR/Admin</span>
              </label>
            </div>
            <div className="rounded-lg border border-border p-4 space-y-2">
              <p className="text-[13px] font-semibold text-foreground">Completion Source</p>
              <label className="flex items-center gap-2 text-[13px] text-foreground">
                <input
                  type="checkbox"
                  checked={draft.accept_learndash_completion}
                  onChange={(event) => updateDraft("accept_learndash_completion", event.target.checked)}
                />
                <span>Accept LearnDash completion</span>
              </label>
              <label className="flex items-center gap-2 text-[13px] text-foreground">
                <input
                  type="checkbox"
                  checked={draft.allow_manual_completion}
                  onChange={(event) => updateDraft("allow_manual_completion", event.target.checked)}
                />
                <span>Allow manual HR completion</span>
              </label>
              <label className="flex items-center gap-2 text-[13px] text-foreground">
                <input
                  type="checkbox"
                  checked={draft.allow_early_completion}
                  onChange={(event) => updateDraft("allow_early_completion", event.target.checked)}
                />
                <span>Allow early completion</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="text-[13px] font-semibold text-foreground">Rule Status</p>
              <p className="text-[12px] text-muted-foreground">
                Inactive rules stay in history but stop generating future cycles.
              </p>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-foreground">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) => updateDraft("active", event.target.checked)}
              />
              <span>Active</span>
            </label>
          </div>

          <div className="flex justify-between gap-2 pt-2">
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
                <Save size={13} />
                {saveRule.isPending ? "Saving..." : "Save Rule"}
              </Button>
            </div>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
