export type ComplianceRuleType =
  | "annual_recurring"
  | "interval_recurring"
  | "assignment_specific";

export type ComplianceTrack = "recurring" | "assignment";

export type AnchorType = "group_enrollment" | "hire_date" | "manual";

export interface TrainingCourseOption {
  course_id: string;
  course_name: string | null;
}

export interface TrainingGroupOption {
  group_id: string;
  label: string;
}

export interface TrainingComplianceRule {
  id: string;
  rule_name: string;
  rule_type: ComplianceRuleType;
  rule_template: string | null;
  compliance_track: ComplianceTrack;
  applies_to_type: "group_members" | "job_roles" | "manual_assignment";
  course_id: string;
  group_id: string;
  anchor_type: AnchorType;
  initial_due_offset_months: number;
  recurrence_interval_months: number;
  reminder_days: number[];
  notify_employee: boolean;
  notify_admin: boolean;
  accept_learndash_completion: boolean;
  allow_manual_completion: boolean;
  allow_early_completion: boolean;
  active: boolean;
  course_name?: string | null;
}

export interface TrainingComplianceRuleDraft {
  id?: string;
  rule_name: string;
  rule_type: ComplianceRuleType;
  rule_template: string | null;
  compliance_track: ComplianceTrack;
  applies_to_type: "group_members" | "job_roles" | "manual_assignment";
  course_id: string;
  group_id: string;
  anchor_type: AnchorType;
  initial_due_offset_months: number;
  recurrence_interval_months: number;
  reminder_days: number[];
  notify_employee: boolean;
  notify_admin: boolean;
  accept_learndash_completion: boolean;
  allow_manual_completion: boolean;
  allow_early_completion: boolean;
  active: boolean;
}

export interface TrainingComplianceRulesData {
  schemaReady: boolean;
  rules: TrainingComplianceRule[];
  courses: TrainingCourseOption[];
  groups: TrainingGroupOption[];
}
