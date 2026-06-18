import { format, formatDistanceToNow } from 'date-fns';
import { ArrowRight, MoreHorizontal, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import type { TrainingEmployee } from '../types';
import type { GateSummary } from '../utils/compliancePresentation';
import {
  assignmentLabel,
  completionLabel,
  priorityEdgeClass,
} from '../utils/compliancePresentation';
import { ComplianceStatusBadge } from './ComplianceStatusBadge';

interface TrainingComplianceTableProps {
  employees: TrainingEmployee[];
  gateSummaries: Map<string, GateSummary>;
  selectedEmployeeId?: string | null;
  onOpenEmployee: (employeeId: string) => void;
}

function formatActivity(value: string | null) {
  if (!value) return 'No activity recorded';
  const date = new Date(value);
  return format(date, 'MMM d, yyyy');
}

function formatActivityTitle(value: string | null) {
  if (!value) return 'No activity recorded';
  return format(new Date(value), "MMM d, yyyy 'at' h:mm a");
}

export function TrainingComplianceTable({
  employees,
  gateSummaries,
  selectedEmployeeId,
  onOpenEmployee,
}: TrainingComplianceTableProps) {
  return (
    <div className="hidden overflow-hidden rounded-xl border border-border bg-card xl:block">
      <table className="w-full table-fixed">
        <thead className="border-b border-border bg-muted/20">
          <tr>
            <th scope="col" className="w-[24%] px-5 py-3 text-left"><span className="zone-label">Employee</span></th>
            <th scope="col" className="w-[14%] px-4 py-3 text-left"><span className="zone-label">Assignment</span></th>
            <th scope="col" className="w-[14%] px-4 py-3 text-left"><span className="zone-label">Completion</span></th>
            <th scope="col" className="w-[14%] px-4 py-3 text-left"><span className="zone-label">Gate</span></th>
            <th scope="col" className="w-[14%] px-4 py-3 text-left"><span className="zone-label">Effective Status</span></th>
            <th scope="col" className="hidden w-[12%] px-4 py-3 text-left 2xl:table-cell"><span className="zone-label">Last Activity</span></th>
            <th scope="col" className="w-[8%] px-5 py-3 text-right"><span className="zone-label">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {employees.map((employee) => {
            const gate = gateSummaries.get(employee.person_id);
            const edge = priorityEdgeClass(employee, gate);
            const selected = selectedEmployeeId === employee.person_id;
            const showProgress = employee.coursesAssigned > 0;

            return (
              <tr
                key={employee.person_id}
                className={`${edge ?? ''} ${selected ? 'bg-primary/5' : ''} hover:bg-muted/20`}
              >
                <td className="px-5 py-4">
                  <button
                    type="button"
                    onClick={() => onOpenEmployee(employee.person_id)}
                    className="flex min-w-0 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                      style={{ background: 'color-mix(in srgb, var(--primary) 16%, transparent)', color: 'var(--primary)' }}
                    >
                      {employee.first_name?.[0] ?? ''}
                      {employee.last_name?.[0] ?? ''}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {employee.first_name} {employee.last_name}
                      </p>
                      <p className="truncate text-[12px] text-muted-foreground">{employee.email}</p>
                      {employee.job_title ? (
                        <p className="truncate text-[11px] text-muted-foreground">{employee.job_title}</p>
                      ) : null}
                    </div>
                  </button>
                </td>
                <td className="px-4 py-4">
                  <p className="truncate text-[13px] font-medium text-foreground">{assignmentLabel(employee)}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {employee.coursesAssigned > 0 ? `${employee.coursesAssigned} required courses` : 'Assignment gap'}
                  </p>
                </td>
                <td className="px-4 py-4">
                  {showProgress ? (
                    <>
                      <div className="mb-1.5 h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${employee.completionPct}%` }}
                        />
                      </div>
                      <p className="text-[11px] tabular-nums text-muted-foreground">
                        {employee.coursesCompleted}/{employee.coursesAssigned} · {employee.completionPct}%
                      </p>
                      <p className="text-[11px] text-muted-foreground">{completionLabel(employee)}</p>
                    </>
                  ) : (
                    <p className="text-[12px] font-medium text-muted-foreground">No assignment</p>
                  )}
                </td>
                <td className="px-4 py-4">
                  <p className="truncate text-[12px] font-medium text-foreground">{gate?.label ?? 'Gate not applicable'}</p>
                  {gate && gate.total > 0 ? (
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {gate.completed}/{gate.total} complete
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-4">
                  <ComplianceStatusBadge status={employee.complianceStatus} />
                </td>
                <td className="hidden px-4 py-4 2xl:table-cell">
                  <span className="text-[13px] text-foreground" title={formatActivityTitle(employee.lastActivity)}>
                    {formatActivity(employee.lastActivity)}
                  </span>
                  {employee.lastActivity ? (
                    <p className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(employee.lastActivity), { addSuffix: true })}
                    </p>
                  ) : null}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="hidden 2xl:inline-flex"
                      onClick={() => onOpenEmployee(employee.person_id)}
                    >
                      View details
                      <ArrowRight size={14} />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${employee.first_name} ${employee.last_name}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <MoreHorizontal size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                        <DropdownMenuItem onClick={() => onOpenEmployee(employee.person_id)}>
                          View compliance details
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to={`/employees?person=${employee.person_id}`}>Open employee profile</Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            );
          })}
          {employees.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-5 py-16 text-center">
                <p className="text-[13px] text-muted-foreground">No employees match these compliance filters.</p>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export function TrainingComplianceMobileList({
  employees,
  gateSummaries,
  selectedEmployeeId,
  onOpenEmployee,
}: TrainingComplianceTableProps) {
  return (
    <div className="space-y-3 xl:hidden">
      {employees.map((employee) => {
        const gate = gateSummaries.get(employee.person_id);
        const selected = selectedEmployeeId === employee.person_id;
        const showProgress = employee.coursesAssigned > 0;

        return (
          <article
            key={employee.person_id}
            className={`rounded-xl border bg-card p-4 ${selected ? 'border-primary/40 bg-primary/5' : 'border-border'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-foreground">
                  {employee.first_name} {employee.last_name}
                </p>
                <p className="truncate text-[12px] text-muted-foreground">{employee.email}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Record actions">
                    <MoreHorizontal size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onOpenEmployee(employee.person_id)}>
                    View compliance details
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to={`/employees?person=${employee.person_id}`}>Open employee profile</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ComplianceStatusBadge status={employee.complianceStatus} size="sm" />
              <span className="text-[11px] text-muted-foreground">{employee.job_title ?? 'No job title'}</span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <p className="zone-label">Assignment</p>
                <p className="mt-1 font-medium text-foreground">{assignmentLabel(employee)}</p>
              </div>
              <div>
                <p className="zone-label">Gate</p>
                <p className="mt-1 font-medium text-foreground">{gate?.label ?? 'Gate not applicable'}</p>
              </div>
            </div>

            {showProgress ? (
              <div className="mt-3">
                <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-border">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${employee.completionPct}%` }} />
                </div>
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {employee.coursesCompleted}/{employee.coursesAssigned} · {completionLabel(employee)}
                </p>
              </div>
            ) : null}

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">{formatActivity(employee.lastActivity)}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => onOpenEmployee(employee.person_id)}>
                <UserRound size={14} />
                View details
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
