export type RecurringComplianceStatus =
  | "not_yet_due"
  | "due_soon"
  | "due"
  | "overdue"
  | "completed";

export interface RecurringComplianceInstance {
  instance_id: string;
  tenant_id: string;
  person_id: string;
  rule_id: string;
  rule_name: string;
  rule_type: string;
  rule_template: string | null;
  course_id: string;
  group_id: string;
  cycle_number: number;
  cycle_start_at: string;
  due_at: string;
  completed_at: string | null;
  completion_source: string | null;
  completion_course_id: string | null;
  completion_note: string | null;
  reminder_suppressed: boolean;
  status_override: string | null;
  policy_snapshot: Record<string, unknown>;
  max_reminder_days: number;
  compliance_status: RecurringComplianceStatus;
}

export interface RecurringComplianceEmployeeRow {
  instance_id: string;
  person_id: string;
  employee_name: string;
  email: string;
  job_title: string | null;
  rule_id: string;
  rule_name: string;
  rule_label: string;
  group_id: string;
  anchor_date: string | null;
  due_at: string;
  completed_at: string | null;
  completion_source: string | null;
  completion_note: string | null;
  status: RecurringComplianceStatus;
  cycle_number: number;
  reminder_suppressed: boolean;
}

export type RecurringComplianceAction =
  | "manual_complete"
  | "reopen_cycle"
  | "suppress_reminders"
  | "override_anchor";

export interface RecurringComplianceSummary {
  not_yet_due: number;
  due_soon: number;
  due: number;
  overdue: number;
  completed: number;
}

export interface RecurringComplianceRuleOption {
  rule_id: string;
  label: string;
}

export interface RecurringComplianceDashboardData {
  schemaReady: boolean;
  rows: RecurringComplianceEmployeeRow[];
  summary: RecurringComplianceSummary;
  ruleOptions: RecurringComplianceRuleOption[];
}
