import { GraduationCap, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OnboardingEmployee } from '@/services/dashboardService';

interface OnboardingSnapshotProps {
    employees: OnboardingEmployee[];
    loading?: boolean;
}

function ProgressTrack({ value }: { value: number }) {
    const pct = Math.min(100, Math.max(0, value));
    const color = pct >= 75 ? 'bg-[hsl(152,58%,38%)]'
                : pct >= 40 ? 'bg-[hsl(196,84%,42%)]'
                :              'bg-[hsl(38,96%,48%)]';
    return (
        <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
            <div
                className={cn('h-full rounded-full transition-all duration-700', color)}
                style={{ width: `${pct}%` }}
            />
        </div>
    );
}

export function OnboardingSnapshot({ employees, loading }: OnboardingSnapshotProps) {
    return (
        <section className="animate-reveal-up delay-100 bg-card rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                <div className="flex items-center gap-2.5">
                    <GraduationCap size={14} strokeWidth={2} className="text-muted-foreground/60" />
                    <h3 className="text-[13px] font-semibold text-foreground">Onboarding Progress</h3>
                </div>
                <button className="text-[11px] font-medium text-primary hover:text-primary/70 transition-colors flex items-center gap-0.5">
                    All <ChevronRight size={11} strokeWidth={2.5} />
                </button>
            </div>

            {loading ? (
                <div className="px-5 py-6 space-y-4">
                    {[1, 2, 3].map(n => (
                        <div key={n} className="space-y-2 animate-pulse">
                            <div className="flex justify-between">
                                <div className="h-3 w-28 bg-secondary rounded" />
                                <div className="h-3 w-8 bg-secondary rounded" />
                            </div>
                            <div className="h-1 w-full bg-secondary rounded-full" />
                        </div>
                    ))}
                </div>
            ) : employees.length === 0 ? (
                <div className="px-5 py-8 text-center">
                    <p className="text-[13px] text-muted-foreground/50 font-medium">No onboarding in progress</p>
                </div>
            ) : (
                <div className="px-5 py-4 space-y-4">
                    {employees.map((emp, i) => (
                        <div
                            key={emp.id}
                            className="animate-reveal-right space-y-1.5"
                            style={{ animationDelay: `${(i + 2) * 60}ms` }}
                        >
                            <div className="flex items-baseline justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-[13px] font-semibold text-foreground truncate leading-none">
                                        {emp.name}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground/50 font-medium mt-0.5">
                                        {emp.role}
                                    </p>
                                </div>
                                <span className="text-[12px] font-bold tabular-nums text-foreground/80 flex-shrink-0">
                                    {emp.progress}%
                                </span>
                            </div>
                            <ProgressTrack value={emp.progress} />
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
