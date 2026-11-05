import { ShieldCheck, CheckCircle2, Circle } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useOnboardingGate } from '../hooks/useOnboardingGate';

// Onboarding completion gate — read-only visibility (handoff §5d).
// Shows every gating course for the employee's onboarding-flagged group,
// INCLUDING courses with no synced training record (not_started), so HR sees
// "2 of 6 onboarding courses complete" instead of only the synced records.
// Renders nothing when the gate is not configured or the person is not
// enrolled in an onboarding-flagged group (zero rows).
export function OnboardingGateCard({ personId }: { personId?: string }) {
  const { data: rows = [], isLoading } = useOnboardingGate(personId);

  if (isLoading || rows.length === 0) return null;

  const completed = rows.filter((r) => r.effective_status === 'completed').length;
  const allComplete = completed === rows.length;

  return (
    <section className="saas-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} strokeWidth={1.75} style={{ color: 'var(--primary)' }} aria-hidden="true" />
          <h3 className="text-sm font-medium text-foreground">Onboarding Gate</h3>
        </div>
        <StatusBadge status={`${completed} of ${rows.length} complete`} tone={allComplete ? 'done' : 'waiting'} />
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        Required courses from the employee's onboarding group. The employee
        stays in Onboarding until every course below is complete.
      </p>

      <div>
        {rows.map((row) => {
          const isComplete = row.effective_status === 'completed';
          return (
            <div
              key={row.course_id}
              className="flex items-start justify-between gap-3 border-t border-border py-2 first:border-t-0"
            >
              <div className="flex min-w-0 items-start gap-2">
                {isComplete ? (
                  <CheckCircle2 size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" style={{ color: 'var(--color-signal)' }} aria-hidden="true" />
                ) : (
                  <Circle size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    {row.course_name ?? `Course #${row.course_id}`}
                  </p>
                  {!row.has_record && !isComplete ? (
                    <p className="text-xs text-muted-foreground">No training record yet</p>
                  ) : null}
                </div>
              </div>
              <StatusBadge
                status={row.effective_status.replace('_', ' ').replace(/^./, (c) => c.toUpperCase())}
                tone={isComplete ? 'done' : row.effective_status === 'in_progress' ? 'waiting' : 'neutral'}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
