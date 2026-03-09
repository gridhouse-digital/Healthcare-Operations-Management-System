import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import type { TrainingEmployee, ComplianceStatus } from '../types';

const statusStyles: Record<ComplianceStatus, { dot: string; text: string; bg: string; border: string; label: string }> = {
  compliant:   { dot: 'hsl(152 58% 42%)', text: 'hsl(152 54% 56%)', bg: 'hsl(152 58% 38% / 0.10)', border: 'hsl(152 58% 38% / 0.20)', label: 'Compliant' },
  overdue:     { dot: 'hsl(4 82% 56%)', text: 'hsl(4 76% 66%)', bg: 'hsl(4 82% 52% / 0.08)', border: 'hsl(4 82% 52% / 0.20)', label: 'Overdue' },
  in_progress: { dot: 'hsl(38 96% 52%)', text: 'hsl(38 90% 60%)', bg: 'hsl(38 96% 48% / 0.08)', border: 'hsl(38 96% 48% / 0.20)', label: 'In Progress' },
  not_started: { dot: 'hsl(0 0% 42%)', text: 'hsl(0 0% 56%)', bg: 'hsl(0 0% 100% / 0.04)', border: 'hsl(0 0% 100% / 0.08)', label: 'Not Started' },
  no_courses:  { dot: 'hsl(220 10% 42%)', text: 'hsl(220 10% 56%)', bg: 'hsl(220 10% 50% / 0.06)', border: 'hsl(220 10% 50% / 0.12)', label: 'No Courses' },
};

interface TrainingEmployeeTableProps {
  employees: TrainingEmployee[];
}

export function TrainingEmployeeTable({ employees }: TrainingEmployeeTableProps) {
  const navigate = useNavigate();

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              <th className="px-5 py-3 text-left"><span className="zone-label">Employee</span></th>
              <th className="px-5 py-3 text-left"><span className="zone-label">Job Title</span></th>
              <th className="px-5 py-3 text-left"><span className="zone-label">Courses</span></th>
              <th className="px-5 py-3 text-left"><span className="zone-label">Completion</span></th>
              <th className="px-5 py-3 text-left"><span className="zone-label">Status</span></th>
              <th className="px-5 py-3 text-left"><span className="zone-label">Last Activity</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {employees.map((emp) => {
              const s = statusStyles[emp.complianceStatus];
              return (
                <tr
                  key={emp.person_id}
                  className="table-row-interactive"
                  onClick={() => navigate(`/training/${emp.person_id}`)}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                        style={{ background: 'color-mix(in srgb, var(--primary) 16%, transparent)', color: 'var(--primary)' }}
                      >
                        {emp.first_name?.[0] ?? ''}{emp.last_name?.[0] ?? ''}
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-[13px] font-medium tracking-[-0.01em] text-foreground">
                          {emp.first_name} {emp.last_name}
                        </span>
                        <span className="truncate text-[12px] tracking-[0.005em] text-muted-foreground">{emp.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-[13px] tracking-[0.005em] text-foreground">{emp.job_title ?? '—'}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-[13px] font-medium tracking-[-0.01em] text-foreground">
                      {emp.coursesCompleted}/{emp.coursesAssigned}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="w-24">
                      <div className="mb-1 h-1.5 w-full rounded-full bg-border">
                        <div
                          className="h-1.5 rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${emp.completionPct}%` }}
                        />
                      </div>
                      <span className="text-[11px] tracking-[0.01em] text-muted-foreground">{emp.completionPct}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.04em]"
                      style={{
                        gap: '4px',
                        color: s.text,
                        background: s.bg,
                        border: `1px solid ${s.border}`,
                      }}
                    >
                      <span className="shrink-0 rounded-full" style={{ width: '5px', height: '5px', background: s.dot }} />
                      {s.label}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-[13px] tracking-[0.005em] text-foreground">
                      {emp.lastActivity ? format(new Date(emp.lastActivity), 'MMM d, yyyy') : '—'}
                    </span>
                  </td>
                </tr>
              );
            })}
            {employees.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center">
                  <p className="text-[13px] text-muted-foreground">No employees match your filters.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
