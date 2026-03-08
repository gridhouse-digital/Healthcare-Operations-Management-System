import { format } from 'date-fns';
import { PenLine } from 'lucide-react';
import { SlideOver } from '@/components/ui/SlideOver';
import type { TrainingEmployee, TrainingComplianceRecord } from '../types';

interface TrainingEmployeeDrawerProps {
  employee: TrainingEmployee | null;
  onClose: () => void;
  onAdjust: (record: TrainingComplianceRecord) => void;
}

const courseStatusStyles: Record<string, { text: string; bg: string; border: string; label: string }> = {
  completed:   { text: 'hsl(152 54% 52%)', bg: 'hsl(152 58% 38% / 0.08)', border: 'hsl(152 58% 38% / 0.20)', label: 'Completed' },
  in_progress: { text: 'hsl(38 90% 56%)',  bg: 'hsl(38 96% 48% / 0.08)',  border: 'hsl(38 96% 48% / 0.20)',  label: 'In Progress' },
  not_started: { text: 'hsl(0 0% 56%)',    bg: 'hsl(0 0% 100% / 0.04)',   border: 'hsl(0 0% 100% / 0.08)',   label: 'Not Started' },
};

export function TrainingEmployeeDrawer({ employee, onClose, onAdjust }: TrainingEmployeeDrawerProps) {
  if (!employee) return null;

  return (
    <SlideOver
      isOpen={!!employee}
      onClose={onClose}
      title="Training Details"
      width="lg"
    >
      <div className="space-y-6">
        {/* Summary Header */}
        <div className="flex items-center gap-4 pb-5 border-b border-border">
          <div
            className="h-14 w-14 rounded-full text-lg font-mono font-semibold flex items-center justify-center flex-shrink-0"
            style={{ background: 'hsl(196 84% 52% / 0.12)', color: 'hsl(196 84% 62%)' }}
          >
            {employee.first_name?.[0]}{employee.last_name?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-semibold text-foreground leading-tight">
              {employee.first_name} {employee.last_name}
            </h3>
            <p className="text-[13px] text-muted-foreground mt-0.5">{employee.job_title ?? 'No title'}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[11px] font-mono text-muted-foreground">
                {employee.coursesCompleted}/{employee.coursesAssigned} courses
              </span>
              <span className="text-[11px] font-mono text-muted-foreground">
                {employee.completionPct}% complete
              </span>
            </div>
          </div>
        </div>

        {/* Course Detail Table */}
        <div>
          <p className="zone-label mb-3">Course Progress</p>
          <div className="space-y-2.5">
            {employee.records.map((record) => {
              const status = record.effective_status ?? 'not_started';
              const s = courseStatusStyles[status] ?? courseStatusStyles.not_started;
              const isOverdue = record.expires_at && new Date(record.expires_at) < new Date();

              return (
                <div
                  key={record.training_record_id}
                  className="p-3.5 rounded-md border relative overflow-hidden"
                  style={{
                    background: 'var(--muted)',
                    borderColor: isOverdue ? 'hsl(4 82% 52% / 0.30)' : 'var(--border)',
                  }}
                >
                  {/* Left accent: teal for adjusted, red for overdue */}
                  {(record.has_overrides || isOverdue) && (
                    <div
                      className="absolute left-0 top-0 bottom-0 w-[2px]"
                      style={{
                        background: isOverdue
                          ? 'hsl(4 82% 56%)'
                          : 'var(--primary)',
                      }}
                    />
                  )}

                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-[13px] text-foreground font-medium truncate">
                        {record.course_name ?? `Course #${record.course_id}`}
                      </span>
                      {record.has_overrides && (
                        <span
                          className="flex-shrink-0 text-[9px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{
                            color: 'var(--primary)',
                            background: 'hsl(196 84% 52% / 0.10)',
                            border: '1px solid hsl(196 84% 52% / 0.20)',
                          }}
                          title={record.last_adjusted_at
                            ? `HR adjusted on ${format(new Date(record.last_adjusted_at), 'MMM d, yyyy')}`
                            : 'HR adjusted'}
                        >
                          Adjusted
                        </span>
                      )}
                    </div>
                    <span
                      className="inline-flex items-center rounded font-semibold tracking-[0.04em] flex-shrink-0"
                      style={{
                        padding: '2px 6px',
                        fontSize: '10px',
                        color: s.text,
                        background: s.bg,
                        border: `1px solid ${s.border}`,
                      }}
                    >
                      {s.label}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-border rounded-full h-1.5 mb-2">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${record.effective_completion_pct ?? 0}%` }}
                    />
                  </div>

                  {/* Details row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground font-mono">
                      <span>{record.effective_completion_pct ?? 0}%</span>
                      {record.effective_completed_at && (
                        <span>Completed {format(new Date(record.effective_completed_at), 'MMM d, yyyy')}</span>
                      )}
                      {record.effective_training_hours != null && (
                        <span>{record.effective_training_hours} min</span>
                      )}
                      {record.expires_at && (
                        <span style={isOverdue ? { color: 'hsl(4 76% 66%)' } : undefined}>
                          {isOverdue ? 'Expired' : 'Expires'} {format(new Date(record.expires_at), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => onAdjust(record)}
                      className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-primary transition-colors"
                      title="Add adjustment"
                    >
                      <PenLine size={11} strokeWidth={1.75} />
                      Adjust
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </SlideOver>
  );
}
