import { format } from 'date-fns';
import type { TrainingEmployee, ComplianceStatus } from '../types';

const statusStyles: Record<ComplianceStatus, { dot: string; text: string; bg: string; border: string; label: string }> = {
  compliant:   { dot: 'hsl(152 58% 42%)', text: 'hsl(152 54% 56%)', bg: 'hsl(152 58% 38% / 0.10)', border: 'hsl(152 58% 38% / 0.20)', label: 'Compliant' },
  overdue:     { dot: 'hsl(4 82% 56%)',   text: 'hsl(4 76% 66%)',   bg: 'hsl(4 82% 52% / 0.08)',   border: 'hsl(4 82% 52% / 0.20)',   label: 'Overdue' },
  in_progress: { dot: 'hsl(38 96% 52%)',  text: 'hsl(38 90% 60%)',  bg: 'hsl(38 96% 48% / 0.08)',  border: 'hsl(38 96% 48% / 0.20)',  label: 'In Progress' },
  not_started: { dot: 'hsl(0 0% 42%)',    text: 'hsl(0 0% 56%)',    bg: 'hsl(0 0% 100% / 0.04)',   border: 'hsl(0 0% 100% / 0.08)',   label: 'Not Started' },
};

interface TrainingEmployeeTableProps {
  employees: TrainingEmployee[];
  onSelect: (employee: TrainingEmployee) => void;
}

export function TrainingEmployeeTable({ employees, onSelect }: TrainingEmployeeTableProps) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
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
                  className="transition-colors duration-75 cursor-pointer"
                  onClick={() => onSelect(emp)}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--secondary)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-8 w-8 rounded-full text-[11px] font-mono font-semibold flex items-center justify-center flex-shrink-0"
                        style={{ background: 'hsl(196 84% 52% / 0.12)', color: 'hsl(196 84% 62%)' }}
                      >
                        {emp.first_name?.[0] ?? ''}{emp.last_name?.[0] ?? ''}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] text-foreground font-medium truncate">
                          {emp.first_name} {emp.last_name}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono truncate">{emp.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-[13px] text-foreground">{emp.job_title ?? '—'}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-[13px] text-foreground font-mono">
                      {emp.coursesCompleted}/{emp.coursesAssigned}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="w-24">
                      <div className="w-full bg-border rounded-full h-1.5 mb-1">
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${emp.completionPct}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground font-mono">{emp.completionPct}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className="inline-flex items-center rounded font-semibold tracking-[0.04em]"
                      style={{
                        padding: '2px 6px',
                        fontSize: '10px',
                        gap: '4px',
                        color: s.text,
                        background: s.bg,
                        border: `1px solid ${s.border}`,
                      }}
                    >
                      <span
                        className="flex-shrink-0 rounded-full"
                        style={{ width: '5px', height: '5px', background: s.dot }}
                      />
                      {s.label}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-[13px] text-foreground font-mono">
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
