import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Check,
  ChevronLeft,
  Circle,
  ClipboardEdit,
  PenLine,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEmployeeTrainingDetail } from './hooks/useEmployeeTrainingDetail';
import { TrainingAdjustmentModal } from './components/TrainingAdjustmentModal';
import type { TrainingComplianceRecord } from './types';
import { Button } from '@/components/ui/button';

const courseStatusStyles: Record<string, { text: string; bg: string; border: string; label: string }> = {
  completed: { text: 'hsl(152 54% 56%)', bg: 'hsl(152 58% 38% / 0.10)', border: 'hsl(152 58% 38% / 0.20)', label: 'Completed' },
  in_progress: { text: 'hsl(38 90% 60%)', bg: 'hsl(38 96% 48% / 0.08)', border: 'hsl(38 96% 48% / 0.20)', label: 'In Progress' },
  not_started: { text: 'hsl(0 0% 56%)', bg: 'hsl(0 0% 100% / 0.04)', border: 'hsl(0 0% 100% / 0.08)', label: 'Not Started' },
  overdue: { text: 'hsl(4 82% 52%)', bg: 'hsl(4 82% 52% / 0.10)', border: 'hsl(4 82% 52% / 0.18)', label: 'Overdue' },
};

const eventStyles = {
  enrolled: { icon: Circle, color: 'var(--muted-foreground)', label: 'Enrolled' },
  completed: { icon: Check, color: 'var(--primary)', label: 'Completed' },
  adjusted: { icon: PenLine, color: 'var(--primary)', label: 'Adjusted' },
  expired: { icon: Circle, color: 'hsl(4 82% 52%)', label: 'Expired' },
} as const;

function formatDate(value: string | null) {
  if (!value) return '—';
  return format(new Date(value), 'MMM d, yyyy');
}

function formatHours(minutes: number | null) {
  if (minutes == null) return '—';
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours === 0) return `${remaining}m`;
  if (remaining === 0) return `${hours}h`;
  return `${hours}h ${remaining}m`;
}

function formatAdjustmentValue(field: string, value: string) {
  if (field === 'completed_at') return formatDate(value);
  if (field === 'training_hours') return formatHours(Number(value));
  if (field === 'completion_pct') return `${value}%`;
  return value.replace('_', ' ');
}

function getComparisonLines(record: TrainingComplianceRecord) {
  const comparisons: string[] = [];

  if (record.raw_status !== record.effective_status && record.effective_status) {
    comparisons.push(`Original: ${record.raw_status ?? '—'} -> Adjusted: ${record.effective_status}`);
  }

  if (record.raw_completion_pct !== record.effective_completion_pct && record.effective_completion_pct != null) {
    comparisons.push(
      `Original: ${record.raw_completion_pct ?? 0}% -> Adjusted: ${record.effective_completion_pct}%`,
    );
  }

  if (record.raw_completed_at !== record.effective_completed_at && record.effective_completed_at) {
    comparisons.push(
      `Original: ${formatDate(record.raw_completed_at)} -> Adjusted: ${formatDate(record.effective_completed_at)}`,
    );
  }

  if (record.raw_training_hours !== record.effective_training_hours && record.effective_training_hours != null) {
    comparisons.push(
      `Original: ${formatHours(record.raw_training_hours)} -> Adjusted: ${formatHours(record.effective_training_hours)}`,
    );
  }

  return comparisons;
}

function getSummaryChipClass(label: string) {
  if (label.includes('overdue')) return 'status-chip status-chip-amber';
  if (label.includes('adjusted')) return 'status-chip status-chip-cyan';
  if (label.includes('% complete')) return 'status-chip status-chip-green';
  return 'status-chip status-chip-muted';
}

export function EmployeeTrainingDetailPage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const [adjustRecord, setAdjustRecord] = useState<TrainingComplianceRecord | null>(null);

  const { data, isLoading, error } = useEmployeeTrainingDetail(employeeId);

  const courseNameById = useMemo(() => {
    return new Map(
      (data?.courses ?? []).map((course) => [
        course.course_id,
        course.course_name ?? `Course #${course.course_id}`,
      ]),
    );
  }, [data?.courses]);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-100px)] items-center justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-[13px] text-destructive">
          Failed to load employee training detail: {error.message}
        </span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-[13px] text-muted-foreground">Employee not found.</span>
      </div>
    );
  }

  const { employee, courses, adjustments, events, stats } = data;
  const fullName = `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim() || employee.email;
  const monogram = `${employee.first_name?.[0] ?? ''}${employee.last_name?.[0] ?? ''}` || employee.email[0]?.toUpperCase();

  return (
    <div className="animate-fade-in space-y-6">
      <div className="space-y-5">
        <Button
          onClick={() => navigate('/training')}
          variant="ghost"
          size="sm"
          className="px-0 text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={16} strokeWidth={2} />
          Back to Compliance
        </Button>

        <div className="saas-card space-y-5 p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-center gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-base font-semibold"
                style={{ background: 'color-mix(in srgb, var(--primary) 16%, transparent)', color: 'var(--primary)' }}
              >
                {monogram}
              </div>
              <div className="min-w-0 pl-1">
                <h1 className="page-header-title">{fullName}</h1>
                <p className="page-header-meta">
                  {employee.job_title ?? 'No job title'} · {employee.employee_status ?? 'Active'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                `${stats.completed}/${stats.total} courses`,
                `${stats.completionPct}% complete`,
                `${stats.overdue} overdue`,
                `${stats.adjusted} adjusted`,
                stats.totalHours > 0 ? `${formatHours(stats.totalHours)} recorded` : null,
              ].map((label) => (
                label && (
                <span
                  key={label}
                  className={getSummaryChipClass(label)}
                >
                  {label}
                </span>
                )
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${stats.completionPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{stats.inProgress} in progress</span>
              <span>{stats.notStarted} not started</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
        <div className="space-y-4">
          {courses.length === 0 ? (
            <div className="saas-card p-10 text-center">
              <p className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">No courses assigned</p>
              <p className="mt-2 text-[13px] text-muted-foreground">
                This employee has no training records in LearnDash yet.
              </p>
            </div>
          ) : (
            courses.map((record) => {
              const isOverdue = !!record.expires_at && new Date(record.expires_at) < new Date();
              const statusKey = isOverdue ? 'overdue' : (record.effective_status ?? 'not_started');
              const statusStyle = courseStatusStyles[statusKey] ?? courseStatusStyles.not_started;
              const comparisonLines = getComparisonLines(record);

              return (
                <div
                  key={record.training_record_id}
                  className="saas-card p-5"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <h2 className="text-base font-semibold tracking-[-0.008em] text-foreground">
                          {record.course_name ?? `Course #${record.course_id}`}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.03em]"
                            style={{
                              color: statusStyle.text,
                              background: statusStyle.bg,
                              border: `1px solid ${statusStyle.border}`,
                            }}
                          >
                            {statusStyle.label}
                          </span>
                          {record.has_overrides && (
                            <span className="status-chip status-chip-cyan">
                              Adjusted
                            </span>
                          )}
                        </div>
                      </div>

                      <Button
                        onClick={() => setAdjustRecord(record)}
                        variant="outline"
                        size="sm"
                        className="self-start"
                      >
                        <PenLine size={13} strokeWidth={2} />
                        Adjust
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${record.effective_completion_pct ?? 0}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {record.effective_completion_pct ?? 0}% complete
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground xl:grid-cols-4">
                      <div>
                        <p className="meta-label mb-1">Completed</p>
                        <p>{formatDate(record.effective_completed_at)}</p>
                      </div>
                      <div>
                        <p className="meta-label mb-1">Time Spent</p>
                        <p>{formatHours(record.effective_training_hours)}</p>
                      </div>
                      <div>
                        <p className="meta-label mb-1">Expiry</p>
                        <p style={isOverdue ? { color: 'var(--destructive)' } : undefined}>
                          {formatDate(record.expires_at)}
                        </p>
                      </div>
                      <div>
                        <p className="meta-label mb-1">Last Sync</p>
                        <p>{formatDate(record.last_synced_at)}</p>
                      </div>
                    </div>

                    {comparisonLines.length > 0 && (
                      <div
                        className="rounded-md border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground"
                      >
                        {comparisonLines.map((line) => (
                          <p key={line}>{line}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="space-y-5">
          <section className="saas-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <ClipboardEdit size={14} strokeWidth={2} style={{ color: 'var(--primary)' }} />
              <h3 className="text-sm font-semibold text-foreground">Adjustment History</h3>
            </div>

            {adjustments.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No adjustments recorded</p>
            ) : (
              <div className="space-y-3">
                {adjustments.map((adjustment) => (
                  <div key={adjustment.id} className="rounded-md border border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {courseNameById.get(adjustment.course_id) ?? `Course #${adjustment.course_id}`}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {adjustment.field.replace('_', ' ')} · {formatAdjustmentValue(adjustment.field, adjustment.value)}
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(adjustment.created_at)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{adjustment.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="saas-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Circle size={12} strokeWidth={2} style={{ color: 'var(--muted-foreground)' }} />
              <h3 className="text-sm font-semibold text-foreground">Training Events</h3>
            </div>

            {events.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No events recorded</p>
            ) : (
              <div className="space-y-4">
                {events.map((event, index) => {
                  const style = eventStyles[event.event_type] ?? eventStyles.enrolled;
                  const Icon = style.icon;

                  return (
                    <div key={event.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary"
                          style={{ color: style.color }}
                        >
                          <Icon size={13} strokeWidth={2} />
                        </div>
                        {index < events.length - 1 && (
                          <div className="mt-1 w-px flex-1 bg-border" style={{ minHeight: '22px' }} />
                        )}
                      </div>

                      <div className="min-w-0 pb-2">
                        <p className="text-sm font-medium text-foreground">
                          {courseNameById.get(event.course_id) ?? `Course #${event.course_id}`}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {style.label} · {formatDate(event.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      <TrainingAdjustmentModal
        record={adjustRecord}
        employeeName={fullName}
        onClose={() => setAdjustRecord(null)}
      />
    </div>
  );
}
