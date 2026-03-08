/** Row from v_training_compliance VIEW */
export interface TrainingComplianceRecord {
  training_record_id: string;
  tenant_id: string;
  person_id: string;
  course_id: string;
  course_name: string | null;
  // Effective values (Layer B wins over Layer A)
  effective_status: string | null;
  effective_completion_pct: number | null;
  effective_completed_at: string | null;
  effective_training_hours: number | null;
  // Raw Layer A values
  raw_status: string | null;
  raw_completion_pct: number | null;
  raw_completed_at: string | null;
  raw_training_hours: number | null;
  // Metadata
  expires_at: string | null;
  last_synced_at: string | null;
  last_adjusted_at: string | null;
  has_overrides: boolean;
}

/** Employee with joined people fields + aggregated compliance */
export interface TrainingEmployee {
  person_id: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string | null;
  records: TrainingComplianceRecord[];
  // Computed aggregates
  coursesAssigned: number;
  coursesCompleted: number;
  completionPct: number;
  complianceStatus: ComplianceStatus;
  lastActivity: string | null;
}

export type ComplianceStatus = 'compliant' | 'overdue' | 'in_progress' | 'not_started';

/** For the adjustment modal form */
export interface AdjustmentFormData {
  field: 'status' | 'completion_pct' | 'completed_at' | 'training_hours';
  value: string;
  reason: string;
}
