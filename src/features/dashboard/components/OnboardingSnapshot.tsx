import { GraduationCap, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { OnboardingEmployee } from '@/services/dashboardService';

interface OnboardingSnapshotProps {
    employees: OnboardingEmployee[];
    loading?: boolean;
}

export function OnboardingSnapshot({ employees, loading }: OnboardingSnapshotProps) {
    return (
        <section className="panel">
            <div className="panel-header justify-between">
                <div className="flex items-center gap-2.5">
                    <GraduationCap size={14} strokeWidth={2} className="text-muted-foreground" />
                    <h3 className="text-title text-foreground">Onboarding Progress</h3>
                </div>
                <Link to="/employees" className="inline-flex min-h-8 items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-accent-hi">
                    All <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />
                </Link>
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
                    <p className="text-[13px] text-muted-foreground font-medium">No onboarding in progress</p>
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
                                    <p className="text-[13px] font-medium text-foreground truncate leading-none">
                                        {emp.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground font-medium mt-0.5">
                                        {emp.role}
                                    </p>
                                </div>
                                {/* Course progress isn't computed here yet, so no percentage is shown */}
                                <span className="text-xs text-muted-foreground flex-shrink-0">Not tracked yet</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
