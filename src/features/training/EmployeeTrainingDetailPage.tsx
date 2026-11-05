import { useMemo, useState } from 'react';
import { PageSkeleton } from '@/components/shared/PageSkeleton';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { format } from 'date-fns';
import { Check, ChevronLeft, Circle, ClipboardEdit, PenLine } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEmployeeTrainingDetail } from './hooks/useEmployeeTrainingDetail';
import { TrainingAdjustmentModal } from './components/TrainingAdjustmentModal';
import { OnboardingGateCard } from './components/OnboardingGateCard';
import type { TrainingComplianceRecord, TrainingEvent } from './types';
import { Button } from '@/components/ui/button';

const courseStatusStyles: Record<string, { text: string; bg: string; border: string; label: string }> = {
  completed: { text: 'var(--color-signal)', bg: 'color-mix(in oklab, var(--color-signal) 10%, transparent)', border: 'color-mix(in oklab, var(--color-signal) 20%, transparent)', label: 'Completed' },
  in_progress: { text: 'var(--color-accent-2)', bg: 'color-mix(in oklab, var(--color-accent-2) 8%, transparent)', border: 'color-mix(in oklab, var(--color-accent-2) 20%, transparent)', label: 'In Progress' },
  not_started: { text: 'var(--muted-foreground)', bg: 'color-mix(in oklab, var(--tint) 4%, transparent)', border: 'color-mix(in oklab, var(--tint) 8%, transparent)', label: 'Not Started' },
  overdue: { text: 'var(--color-error)', bg: 'color-mix(in oklab, var(--color-error) 10%, transparent)', border: 'color-mix(in oklab, var(--color-error) 18%, transparent)', label: 'Overdue' },
};

const eventStyles = {
  enrolled: { icon: Circle, color: 'var(--muted-foreground)', label: 'Enrolled' },
  completed: { icon: Check, color: 'var(--primary)', label: 'Completed' },
  adjusted: { icon: PenLine, color: 'var(--primary)', label: 'Adjusted' },
  expired: { icon: Circle, color: 'var(--color-error)', label: 'Expired' },
} as const;

type DisplayEvent = {
  id: string;
  courseLabel: string;
  eventType: TrainingEvent['event_type'];
  occurredAt: string;
};

function formatDate(value: string | null) {
  if (!value) return '-';
  return format(new Date(value), 'MMM d, yyyy h:mm a');
}

function formatCalendarDate(value: string | null) {
  if (!value) return '-';

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    return format(
      new Date(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3]),
      ),
      'MMM d, yyyy',
    );
  }

  return format(new Date(value), 'MMM d, yyyy');
}

function formatHours(minutes: number | null) {
  if (minutes == null) return '-';
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours === 0) return `${remaining}m`;
  if (remaining === 0) return `${hours}h`;
  return `${hours}h ${remaining}m`;
}

function normalizeCourseTitle(raw: string) {
  if (!raw) return raw;
  return raw.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
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
    comparisons.push(`Original: ${(record.raw_status ?? 'none').replace(/_/g, ' ')}, adjusted: ${record.effective_status.replace(/_/g, ' ')}`);
  }

  if (record.raw_completion_pct !== record.effective_completion_pct && record.effective_completion_pct != null) {
    comparisons.push(`Original: ${record.raw_completion_pct ?? 0}%, adjusted: ${record.effective_completion_pct}%`);
  }

  if (record.raw_completed_at !== record.effective_completed_at && record.effective_completed_at) {
    comparisons.push(`Original: ${formatDate(record.raw_completed_at)}, adjusted: ${formatDate(record.effective_completed_at)}`);
  }

  if (record.raw_training_hours !== record.effective_training_hours && record.effective_training_hours != null) {
    comparisons.push(`Original: ${formatHours(record.raw_training_hours)}, adjusted: ${formatHours(record.effective_training_hours)}`);
  }

  return comparisons;
}

function historicalVisibilityLabel(state: string) {
  switch (state) {
    case 'superseded':
      return 'Superseded';
    case 'inactive_group':
      return 'Inactive Group';
    case 'historical_series':
      return 'Prior Series';
    case 'primary_group_filtered':
      return 'Primary Group Filtered';
    default:
      return 'Historical';
  }
}

function getPayloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];

  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return null;
}

function getEventCourseId(event: TrainingEvent) {
  return event.course_id ?? getPayloadString(event.payload, 'course_id');
}

function getEventCourseLabel(event: TrainingEvent, courseNameById: Map<string, string>) {
  const courseId = getEventCourseId(event);

  if (courseId) {
    const knownLabel = courseNameById.get(courseId);
    if (knownLabel) return normalizeCourseTitle(knownLabel);
  }

  const payloadLabel =
    getPayloadString(event.payload, 'course_name') ??
    getPayloadString(event.payload, 'course_title');

  return payloadLabel ? normalizeCourseTitle(payloadLabel) : null;
}

function getEventOccurredAt(
  event: TrainingEvent,
  courseEnrolledAtById: Map<string, string | null>,
  courseId: string | null,
) {
  if (event.event_type === 'enrolled') {
    return (
      (courseId ? courseEnrolledAtById.get(courseId) : null) ??
      getPayloadString(event.payload, 'enrolled_at') ??
      event.created_at
    );
  }

  if (event.event_type === 'completed') {
    return getPayloadString(event.payload, 'completed_at') ?? event.created_at;
  }

  if (event.event_type === 'expired') {
    return getPayloadString(event.payload, 'expired_at') ?? event.created_at;
  }

  return getPayloadString(event.payload, 'adjusted_at') ?? event.created_at;
}

interface EmployeeTrainingDetailPageProps {
  embedded?: boolean;
  employeeId?: string;
  onClose?: () => void;
}

export function EmployeeTrainingDetailPage({
  embedded = false,
  employeeId: employeeIdProp,
  onClose,
}: EmployeeTrainingDetailPageProps) {
  const { employeeId: routeEmployeeId } = useParams<{ employeeId: string }>();
  const employeeId = employeeIdProp ?? routeEmployeeId;
  const navigate = useNavigate();
  const [adjustRecord, setAdjustRecord] = useState<TrainingComplianceRecord | null>(null);

  const { data, isLoading, error } = useEmployeeTrainingDetail(employeeId);

  const courseNameById = useMemo(
    () => new Map((data?.courses ?? []).map((course) => [course.course_id, course.course_name ?? `Course #${course.course_id}`])),
    [data?.courses],
  );

  const courseEnrolledAtById = useMemo(
    () => new Map((data?.courses ?? []).map((course) => [course.course_id, course.enrolled_at ?? null])),
    [data?.courses],
  );

  const displayEvents = useMemo<DisplayEvent[]>(() => {
    const dedupedEvents: DisplayEvent[] = [];
    const seen = new Set<string>();

    for (const event of data?.events ?? []) {
      const courseId = getEventCourseId(event);
      const courseLabel = getEventCourseLabel(event, courseNameById);

      if (!courseLabel) {
        continue;
      }

      const occurredAt = getEventOccurredAt(event, courseEnrolledAtById, courseId);
      const dedupeKey = `${event.event_type}|${courseId ?? courseLabel.toLowerCase()}|${occurredAt}`;

      if (seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);
      dedupedEvents.push({
        id: event.id,
        courseLabel,
        eventType: event.event_type,
        occurredAt,
      });
    }

    return dedupedEvents;
  }, [courseEnrolledAtById, courseNameById, data?.events]);

  if (isLoading) {
    return (
      <PageSkeleton label="Loading employee compliance" />
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-destructive">
          Failed to load employee training detail: {error.message}
        </span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-muted-foreground">Employee not found.</span>
      </div>
    );
  }

  const { employee, courses, historicalCourses, recurringHistory, adjustments, stats } = data;
  const fullName = `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim() || employee.email;
  const monogram = `${employee.first_name?.[0] ?? ''}${employee.last_name?.[0] ?? ''}` || employee.email[0]?.toUpperCase();

  return (
    <div className="animate-fade-in space-y-6">
      <div className="space-y-5">
        {!embedded ? (
          <Button
            onClick={() => navigate('/training')}
            variant="ghost"
            size="sm"
            className="px-0 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
            Back to Compliance
          </Button>
        ) : onClose ? (
          <Button
            onClick={onClose}
            variant="ghost"
            size="sm"
            className="px-0 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
            Back to directory
          </Button>
        ) : null}

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 select-none items-center justify-center rounded-full bg-secondary text-sm font-medium text-secondary-foreground"
            >
              {monogram}
            </span>
            <div className="min-w-0">
              <h1 className={embedded ? 'text-section text-foreground' : 'page-header-title'}>{fullName}</h1>
              <p className="page-header-meta">
                {employee.job_title ?? 'No job title'}, {employee.employee_status ?? 'Active'}
              </p>
            </div>
          </div>

          <div className="tally">
            <div className="tally-cell">
              <p className="zone-label">Courses</p>
              <p className="data-value mt-2 text-2xl">{stats.completed} of {stats.total}</p>
            </div>
            <div className="tally-cell">
              <p className="zone-label">Complete</p>
              <p className="data-value mt-2 text-2xl">{stats.completionPct}%</p>
            </div>
            <div className="tally-cell">
              <p className="zone-label">Overdue</p>
              <p className="data-value mt-2 text-2xl" style={{ color: stats.overdue > 0 ? 'var(--severity-critical)' : undefined }}>{stats.overdue}</p>
            </div>
            <div className="tally-cell">
              <p className="zone-label">Adjusted</p>
              <p className="data-value mt-2 text-2xl">{stats.adjusted}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-signal" style={{ width: `${stats.completionPct}%` }} />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{stats.inProgress} in progress</span>
              {stats.totalHours > 0 ? <span>{formatHours(stats.totalHours)} recorded</span> : null}
              <span>{stats.notStarted} not started</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
        <div className="space-y-4">
          {courses.length === 0 ? (
            <div className="saas-card p-10 text-center">
              <p className="text-title text-foreground">No courses assigned</p>
              <p className="mt-2 text-sm text-muted-foreground">
                This employee has no training records in LearnDash yet.
              </p>
            </div>
          ) : (
            <div className="panel divide-y divide-border">
              {courses.map((record) => {
                const isOverdue = Boolean(record.expires_at) && new Date(record.expires_at as string) < new Date();
                const statusKey = isOverdue ? 'overdue' : (record.effective_status ?? 'not_started');
                const statusStyle = courseStatusStyles[statusKey] ?? courseStatusStyles.not_started;
                const comparisonLines = record.has_overrides ? getComparisonLines(record) : [];
                const pct = record.effective_completion_pct ?? 0;

                return (
                  <div key={record.training_record_id} className="space-y-3 px-6 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-sm font-medium text-foreground">
                          {normalizeCourseTitle(record.course_name ?? `Course #${record.course_id}`)}
                        </h2>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <StatusBadge
                            status={statusStyle.label}
                            tone={statusKey === 'completed' ? 'done' : statusKey === 'overdue' ? 'critical' : statusKey === 'in_progress' ? 'waiting' : 'neutral'}
                          />
                          {record.has_overrides ? <StatusBadge status="Adjusted" tone="active" /> : null}
                        </div>
                      </div>

                      <Button onClick={() => setAdjustRecord(record)} variant="outline" size="sm">
                        <PenLine size={14} strokeWidth={1.75} aria-hidden="true" />
                        Adjust
                      </Button>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-signal" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
                    </div>

                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <dt className="text-xs text-muted-foreground">Completed</dt>
                        <dd className="text-sm text-foreground">{formatDate(record.effective_completed_at)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Time Spent</dt>
                        <dd className="text-sm text-foreground">{formatHours(record.effective_training_hours)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Expiry</dt>
                        <dd className="text-sm text-foreground" style={isOverdue ? { color: 'var(--destructive)' } : undefined}>
                          {formatDate(record.expires_at)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Last Sync</dt>
                        <dd className="text-sm text-foreground">{formatDate(record.last_synced_at)}</dd>
                      </div>
                    </dl>

                    {comparisonLines.length > 0 ? (
                      <div className="text-xs text-muted-foreground">
                        {comparisonLines.map((line) => (
                          <p key={line} className="text-xs">{line}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {historicalCourses.length > 0 ? (
            <div className="saas-card p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium text-foreground">
                    Historical / Superseded Training
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    These records stay visible for audit review but do not count toward the employee&apos;s active group obligations.
                  </p>
                </div>
                <span className="status-chip status-chip-muted">{historicalCourses.length} records</span>
              </div>

              <div className="space-y-3">
                {historicalCourses.map((record) => (
                  <div key={record.training_record_id} className="rounded-md border border-border bg-secondary/35 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {normalizeCourseTitle(record.course_name ?? `Course #${record.course_id}`)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Status: {(record.effective_status ?? 'not_started').replace('_', ' ')}
                        </p>
                      </div>
                      <span className="status-chip status-chip-muted">Historical</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-5">
          <OnboardingGateCard personId={employee.id} />

          {recurringHistory.length > 0 ? (
            <section className="saas-card p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-foreground">Recurring Compliance History</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Prior-series and superseded recurring cycles remain audit-visible here while active dashboards show only the current obligation set.
                  </p>
                </div>
                <span className="status-chip status-chip-muted">{recurringHistory.length} rows</span>
              </div>

              <div className="space-y-3">
                {recurringHistory.map((record) => (
                  <div key={record.instance_id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {record.rule_name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Group {record.group_id}, cycle {record.cycle_number}, due {formatCalendarDate(record.due_at)}
                        </p>
                        {record.completed_at ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Completed {formatDate(record.completed_at)}
                            {record.completion_source ? ` via ${record.completion_source}` : ''}
                          </p>
                        ) : null}
                      </div>
                      <span className="status-chip status-chip-muted">
                        {historicalVisibilityLabel(record.visibility_state)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="saas-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <ClipboardEdit size={14} strokeWidth={1.75} style={{ color: 'var(--primary)' }} aria-hidden="true" />
              <h3 className="text-sm font-medium text-foreground">Adjustment History</h3>
            </div>

            {adjustments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No adjustments recorded</p>
            ) : (
              <div className="space-y-3">
                {adjustments.map((adjustment) => (
                  <div key={adjustment.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {courseNameById.get(adjustment.course_id) ?? `Course #${adjustment.course_id}`}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {adjustment.field.replace('_', ' ')} - {formatAdjustmentValue(adjustment.field, adjustment.value)}
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

          <section className="saas-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <Circle size={14} strokeWidth={1.75} style={{ color: 'var(--muted-foreground)' }} aria-hidden="true" />
              <h3 className="text-sm font-medium text-foreground">Training Events</h3>
            </div>

            {displayEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events recorded</p>
            ) : (
              <div className="space-y-4">
                {displayEvents.map((event, index) => {
                  const style = eventStyles[event.eventType] ?? eventStyles.enrolled;
                  const Icon = style.icon;

                  return (
                    <div key={event.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary"
                          style={{ color: style.color }}
                        >
                          <Icon size={14} strokeWidth={1.75} />
                        </div>
                        {index < displayEvents.length - 1 ? (
                          <div className="mt-1 w-px flex-1 bg-border" style={{ minHeight: '22px' }} />
                        ) : null}
                      </div>

                      <div className="min-w-0 pb-2">
                        <p className="text-sm font-medium text-foreground">
                          {event.courseLabel}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {style.label} - {formatDate(event.occurredAt)}
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
