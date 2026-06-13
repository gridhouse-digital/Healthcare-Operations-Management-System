import { ShieldCheck, CheckCircle2, Circle } from 'lucide-react';
import { useOnboardingGate } from '../hooks/useOnboardingGate';

// Onboarding completion gate — read-only visibility (handoff §5d).
// Shows every gating course for the tenant's designated onboarding group,
// INCLUDING courses with no synced training record (not_started), so HR sees
// "2 of 6 onboarding courses complete" instead of only the synced records.
// Renders nothing when the gate is not configured or the person is not
// enrolled in the designated group (zero rows).
export function OnboardingGateCard({ personId }: { personId?: string }) {
  const { data: rows = [], isLoading } = useOnboardingGate(personId);

  if (isLoading || rows.length === 0) return null;

  const completed = rows.filter((r) => r.effective_status === 'completed').length;
  const allComplete = completed === rows.length;

  return (
    <section className="saas-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} strokeWidth={2} style={{ color: 'var(--primary)' }} />
          <h3 className="text-sm font-semibold text-foreground">Onboarding Gate</h3>
        </div>
        <span className={allComplete ? 'status-chip status-chip-green' : 'status-chip status-chip-amber'}>
          {completed} of {rows.length} complete
        </span>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        Required courses from the designated onboarding group. The employee
        stays in Onboarding until every course below is complete.
      </p>

      <div className="space-y-2">
        {rows.map((row) => {
          const isComplete = row.effective_status === 'completed';
          return (
            <div
              key={row.course_id}
              className="flex items-start justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
            >
              <div className="flex min-w-0 items-start gap-2">
                {isComplete ? (
                  <CheckCircle2 size={14} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: 'hsl(152 54% 56%)' }} />
                ) : (
                  <Circle size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {row.course_name ?? `Course #${row.course_id}`}
                  </p>
                  {!row.has_record && !isComplete ? (
                    <p className="text-[11px] text-muted-foreground">No training record yet</p>
                  ) : null}
                </div>
              </div>
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {row.effective_status.replace('_', ' ')}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
