# Training Compliance Dashboard — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a `/training` page with 5 KPI cards, employee-grouped compliance table, detail drawer, and HR adjustment modal — reading from `v_training_compliance` VIEW.

**Architecture:** New feature module at `src/features/training/`. React Query hooks fetch from Supabase `v_training_compliance` VIEW (Layer C effective values), `integration_log`, and `training_adjustments`. Employee-grouped table with click-to-open drawer pattern (same as EmployeeList). Adjustment modal writes to `training_adjustments` (append-only, RLS INSERT policy).

**Tech Stack:** React 19, TypeScript, TailwindCSS v4, React Query v5, Supabase JS client, lucide-react icons, sonner toasts.

**Design doc:** `docs/plans/2026-03-07-epic4-training-dashboard-design.md`

---

## Reference Files (read these before starting)

| File | Why |
|------|-----|
| `src/features/dashboard/DashboardPage.tsx` | Page layout pattern, StatsCard zones, zone-label class |
| `src/features/dashboard/components/StatsCard.tsx` | StatsCard component API (title, value, icon, intent, subtitle, stagger) |
| `src/features/employees/EmployeeList.tsx` | Table + drawer + filter pattern, StatusBadge usage, SlideOver usage |
| `src/components/ui/SlideOver.tsx` | Drawer component API (isOpen, onClose, title, children, width) |
| `src/components/shared/StatusBadge.tsx` | StatusBadge API (status string, size) |
| `src/components/layout/Sidebar.tsx` | navGroups array structure, icon imports |
| `src/App.tsx` | Route definitions, ProtectedRoute nesting |
| `src/lib/supabase.ts` | Supabase client import |
| `supabase/migrations/20260307000001_epic4_training_ledger.sql:281-334` | v_training_compliance VIEW columns |

---

## Task 1: TypeScript Types

**Files:**
- Create: `src/features/training/types.ts`

**Step 1: Create the types file**

```typescript
// src/features/training/types.ts

/** Row from v_training_compliance VIEW */
export interface TrainingComplianceRecord {
  training_record_id: string;
  tenant_id: string;
  person_id: string;
  course_id: string;
  course_name: string | null;
  // Effective values (Layer B wins over Layer A)
  effective_status: string | null;
  effective_completion_pct: number | null;
  effective_completed_at: string | null;
  effective_training_hours: number | null;
  // Raw Layer A values
  raw_status: string | null;
  raw_completion_pct: number | null;
  raw_completed_at: string | null;
  raw_training_hours: number | null;
  // Metadata
  expires_at: string | null;
  last_synced_at: string | null;
  last_adjusted_at: string | null;
  has_overrides: boolean;
}

/** Employee with joined people fields + aggregated compliance */
export interface TrainingEmployee {
  person_id: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string | null;
  records: TrainingComplianceRecord[];
  // Computed aggregates
  coursesAssigned: number;
  coursesCompleted: number;
  completionPct: number;
  complianceStatus: ComplianceStatus;
  lastActivity: string | null;
}

export type ComplianceStatus = 'compliant' | 'overdue' | 'in_progress' | 'not_started';

/** For the adjustment modal form */
export interface AdjustmentFormData {
  field: 'status' | 'completion_pct' | 'completed_at' | 'training_hours';
  value: string;
  reason: string;
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd prolific-hr-app && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to training/types.ts

**Step 3: Commit**

```bash
cd prolific-hr-app
git add src/features/training/types.ts
git commit -m "feat(training): add TypeScript types for compliance dashboard"
```

---

## Task 2: React Query Hooks

**Files:**
- Create: `src/features/training/hooks/useTrainingCompliance.ts`
- Create: `src/features/training/hooks/useTrainingStats.ts`

**Step 1: Create useTrainingCompliance hook**

This hook fetches from `v_training_compliance` VIEW joined with `people` table, then groups by person.

```typescript
// src/features/training/hooks/useTrainingCompliance.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TrainingComplianceRecord, TrainingEmployee, ComplianceStatus } from '../types';

function computeComplianceStatus(records: TrainingComplianceRecord[]): ComplianceStatus {
  if (records.length === 0) return 'not_started';

  const hasOverdue = records.some(r => r.expires_at && new Date(r.expires_at) < new Date());
  if (hasOverdue) return 'overdue';

  const allCompleted = records.every(r => r.effective_status === 'completed');
  if (allCompleted) return 'compliant';

  const anyStarted = records.some(
    r => r.effective_status === 'in_progress' || r.effective_status === 'completed'
  );
  if (anyStarted) return 'in_progress';

  return 'not_started';
}

async function fetchTrainingCompliance(): Promise<TrainingEmployee[]> {
  // Fetch compliance records joined with people
  const { data: records, error } = await supabase
    .from('v_training_compliance')
    .select(`
      *,
      people!inner (
        id,
        first_name,
        last_name,
        email,
        job_title
      )
    `)
    .order('person_id');

  if (error) throw error;
  if (!records || records.length === 0) return [];

  // Group by person_id
  const grouped = new Map<string, {
    person: { id: string; first_name: string; last_name: string; email: string; job_title: string | null };
    records: TrainingComplianceRecord[];
  }>();

  for (const row of records) {
    const person = (row as any).people;
    const personId = person.id as string;

    if (!grouped.has(personId)) {
      grouped.set(personId, { person, records: [] });
    }
    grouped.get(personId)!.records.push(row as unknown as TrainingComplianceRecord);
  }

  // Build TrainingEmployee array
  return Array.from(grouped.values()).map(({ person, records }) => {
    const coursesAssigned = records.length;
    const coursesCompleted = records.filter(r => r.effective_status === 'completed').length;
    const completionPct = coursesAssigned > 0
      ? Math.round((coursesCompleted / coursesAssigned) * 100)
      : 0;
    const complianceStatus = computeComplianceStatus(records);

    // Latest activity: most recent effective_completed_at or last_synced_at
    const dates = records
      .flatMap(r => [r.effective_completed_at, r.last_synced_at, r.last_adjusted_at])
      .filter(Boolean)
      .sort()
      .reverse();

    return {
      person_id: person.id,
      first_name: person.first_name,
      last_name: person.last_name,
      email: person.email,
      job_title: person.job_title,
      records,
      coursesAssigned,
      coursesCompleted,
      completionPct,
      complianceStatus,
      lastActivity: dates[0] ?? null,
    };
  });
}

export function useTrainingCompliance() {
  return useQuery({
    queryKey: ['training-compliance'],
    queryFn: fetchTrainingCompliance,
    staleTime: 60_000, // 1 minute
  });
}
```

**Step 2: Create useTrainingStats hook**

```typescript
// src/features/training/hooks/useTrainingStats.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

interface TrainingStats {
  lastSyncAt: string | null;
  pendingAdjustments: number;
}

async function fetchTrainingStats(): Promise<TrainingStats> {
  // Last sync: most recent completed learndash sync
  const { data: syncData } = await supabase
    .from('integration_log')
    .select('completed_at')
    .eq('source', 'learndash')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1);

  // Pending adjustments: count of adjustments (append-only, so all are "applied")
  // For MVP, count adjustments created in last 7 days as "recent"
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('training_adjustments')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sevenDaysAgo);

  return {
    lastSyncAt: syncData?.[0]?.completed_at ?? null,
    pendingAdjustments: count ?? 0,
  };
}

export function useTrainingStats() {
  return useQuery({
    queryKey: ['training-stats'],
    queryFn: fetchTrainingStats,
    staleTime: 60_000,
  });
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd prolific-hr-app && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
cd prolific-hr-app
git add src/features/training/hooks/
git commit -m "feat(training): add React Query hooks for compliance data"
```

---

## Task 3: TrainingStatsCards Component

**Files:**
- Create: `src/features/training/components/TrainingStatsCards.tsx`

**Step 1: Create the component**

```typescript
// src/features/training/components/TrainingStatsCards.tsx
import { Users, ShieldCheck, AlertTriangle, ClipboardEdit, RefreshCw } from 'lucide-react';
import { StatsCard } from '@/features/dashboard/components/StatsCard';
import { formatDistanceToNow } from 'date-fns';
import type { TrainingEmployee } from '../types';

interface TrainingStatsCardsProps {
  employees: TrainingEmployee[];
  lastSyncAt: string | null;
  pendingAdjustments: number;
}

export function TrainingStatsCards({ employees, lastSyncAt, pendingAdjustments }: TrainingStatsCardsProps) {
  const totalEnrolled = employees.length;
  const fullyCompliant = employees.filter(e => e.complianceStatus === 'compliant').length;
  const overdue = employees.filter(e => e.complianceStatus === 'overdue').length;

  const lastSyncLabel = lastSyncAt
    ? formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true })
    : 'Never';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      <StatsCard
        title="Total Enrolled"
        value={totalEnrolled}
        icon={Users}
        subtitle="With training records"
        intent="info"
        stagger={0}
      />
      <StatsCard
        title="Fully Compliant"
        value={fullyCompliant}
        icon={ShieldCheck}
        subtitle="All courses current"
        intent="success"
        stagger={1}
      />
      <StatsCard
        title="Overdue / Expired"
        value={overdue}
        icon={AlertTriangle}
        subtitle="Needs attention"
        intent="danger"
        stagger={2}
      />
      <StatsCard
        title="Pending Adjustments"
        value={pendingAdjustments}
        icon={ClipboardEdit}
        subtitle="Last 7 days"
        intent="warning"
        stagger={3}
      />
      <div className="col-span-2 md:col-span-1">
        <StatsCard
          title="Last Sync"
          value={lastSyncLabel}
          icon={RefreshCw}
          subtitle="LearnDash"
          intent="info"
          stagger={4}
        />
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd prolific-hr-app && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
cd prolific-hr-app
git add src/features/training/components/TrainingStatsCards.tsx
git commit -m "feat(training): add 5-card stats zone component"
```

---

## Task 4: TrainingEmployeeTable Component

**Files:**
- Create: `src/features/training/components/TrainingEmployeeTable.tsx`

**Step 1: Create the component**

```typescript
// src/features/training/components/TrainingEmployeeTable.tsx
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
                  {/* Employee */}
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

                  {/* Job Title */}
                  <td className="px-5 py-3.5">
                    <span className="text-[13px] text-foreground">{emp.job_title ?? '—'}</span>
                  </td>

                  {/* Courses fraction */}
                  <td className="px-5 py-3.5">
                    <span className="text-[13px] text-foreground font-mono">
                      {emp.coursesCompleted}/{emp.coursesAssigned}
                    </span>
                  </td>

                  {/* Completion % bar + fraction */}
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

                  {/* Status badge */}
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

                  {/* Last Activity */}
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
```

**Step 2: Verify TypeScript compiles**

Run: `cd prolific-hr-app && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
cd prolific-hr-app
git add src/features/training/components/TrainingEmployeeTable.tsx
git commit -m "feat(training): add employee-grouped compliance table"
```

---

## Task 5: TrainingEmployeeDrawer Component

**Files:**
- Create: `src/features/training/components/TrainingEmployeeDrawer.tsx`

**Step 1: Create the component**

```typescript
// src/features/training/components/TrainingEmployeeDrawer.tsx
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
```

**Step 2: Verify TypeScript compiles**

Run: `cd prolific-hr-app && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
cd prolific-hr-app
git add src/features/training/components/TrainingEmployeeDrawer.tsx
git commit -m "feat(training): add employee detail drawer with course rows"
```

---

## Task 6: TrainingAdjustmentModal Component

**Files:**
- Create: `src/features/training/components/TrainingAdjustmentModal.tsx`

**Step 1: Create the component**

```typescript
// src/features/training/components/TrainingAdjustmentModal.tsx
import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { TrainingComplianceRecord, AdjustmentFormData } from '../types';

interface TrainingAdjustmentModalProps {
  record: TrainingComplianceRecord | null;
  employeeName: string;
  onClose: () => void;
}

const FIELD_OPTIONS = [
  { value: 'status', label: 'Status' },
  { value: 'completion_pct', label: 'Completion %' },
  { value: 'completed_at', label: 'Completed Date' },
  { value: 'training_hours', label: 'Training Hours (minutes)' },
] as const;

const COMPLIANCE_WARNING_FIELDS = ['status', 'completed_at'];

export function TrainingAdjustmentModal({ record, employeeName, onClose }: TrainingAdjustmentModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AdjustmentFormData>({
    field: 'status',
    value: '',
    reason: '',
  });

  const mutation = useMutation({
    mutationFn: async (data: AdjustmentFormData) => {
      if (!record) throw new Error('No record selected');

      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) throw new Error('Not authenticated');

      const { error } = await supabase.from('training_adjustments').insert({
        tenant_id: record.tenant_id,
        person_id: record.person_id,
        course_id: record.course_id,
        field: data.field,
        value: data.value,
        reason: data.reason,
        actor_id: user.user.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Adjustment saved');
      queryClient.invalidateQueries({ queryKey: ['training-compliance'] });
      queryClient.invalidateQueries({ queryKey: ['training-stats'] });
      onClose();
    },
    onError: (err: Error) => {
      toast.error(`Failed to save adjustment: ${err.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.value.trim() || !form.reason.trim()) {
      toast.error('Value and reason are required');
      return;
    }
    mutation.mutate(form);
  };

  if (!record) return null;

  const showWarning = COMPLIANCE_WARNING_FIELDS.includes(form.field);
  const inputCls = 'w-full px-3 h-8 border border-border rounded-md text-[13px] text-foreground bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow';
  const labelCls = 'block text-[11px] font-mono uppercase tracking-[0.06em] text-muted-foreground mb-1.5';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[560px] z-[70] rounded-lg overflow-hidden"
        style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-xl, 0 20px 60px hsl(0 0% 0% / 0.6))' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">Add Adjustment</h3>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {employeeName} — {record.course_name ?? `Course #${record.course_id}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
            style={{ color: 'hsl(0 0% 40%)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'hsl(0 0% 100% / 0.06)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Field select */}
          <div>
            <label className={labelCls}>Field</label>
            <select
              value={form.field}
              onChange={e => setForm({ ...form, field: e.target.value as AdjustmentFormData['field'], value: '' })}
              className={inputCls}
            >
              {FIELD_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Value input — dynamic by field */}
          <div>
            <label className={labelCls}>Value</label>
            {form.field === 'status' ? (
              <select
                value={form.value}
                onChange={e => setForm({ ...form, value: e.target.value })}
                className={inputCls}
              >
                <option value="">Select status…</option>
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            ) : form.field === 'completed_at' ? (
              <input
                type="date"
                value={form.value}
                onChange={e => setForm({ ...form, value: e.target.value })}
                className={inputCls}
              />
            ) : (
              <input
                type="number"
                placeholder={form.field === 'completion_pct' ? '0-100' : 'Minutes'}
                value={form.value}
                onChange={e => setForm({ ...form, value: e.target.value })}
                className={inputCls}
              />
            )}
          </div>

          {/* Compliance warning */}
          {showWarning && (
            <div
              className="flex items-start gap-2.5 p-3 rounded-md"
              style={{ background: 'hsl(38 96% 48% / 0.06)', border: '1px solid hsl(38 96% 48% / 0.18)' }}
            >
              <AlertTriangle size={13} strokeWidth={2} className="flex-shrink-0 mt-0.5" style={{ color: 'hsl(38 90% 56%)' }} />
              <p className="text-[12px] leading-snug" style={{ color: 'hsl(38 90% 60%)' }}>
                This overrides the value synced from LearnDash. The adjustment will be logged and auditable.
              </p>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className={labelCls}>Reason (required)</label>
            <textarea
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              rows={3}
              placeholder="Why is this adjustment being made?"
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] text-foreground bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow resize-none placeholder:text-muted-foreground/60"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 pt-2">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 inline-flex items-center justify-center h-8 px-4 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? 'Saving…' : 'Save Adjustment'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
              className="flex-1 inline-flex items-center justify-center h-8 px-4 rounded-md border border-border text-[13px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd prolific-hr-app && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
cd prolific-hr-app
git add src/features/training/components/TrainingAdjustmentModal.tsx
git commit -m "feat(training): add adjustment modal with compliance warnings"
```

---

## Task 7: TrainingPage — Main Page Shell

**Files:**
- Create: `src/features/training/TrainingPage.tsx`

**Step 1: Create the page component**

```typescript
// src/features/training/TrainingPage.tsx
import { useState, useMemo } from 'react';
import { Search, Link as LinkIcon } from 'lucide-react';
import { useTrainingCompliance } from './hooks/useTrainingCompliance';
import { useTrainingStats } from './hooks/useTrainingStats';
import { TrainingStatsCards } from './components/TrainingStatsCards';
import { TrainingEmployeeTable } from './components/TrainingEmployeeTable';
import { TrainingEmployeeDrawer } from './components/TrainingEmployeeDrawer';
import { TrainingAdjustmentModal } from './components/TrainingAdjustmentModal';
import type { TrainingEmployee, TrainingComplianceRecord, ComplianceStatus } from './types';
import { Link } from 'react-router-dom';

const inputCls = 'w-full px-3 h-8 border border-border rounded-md text-[13px] text-foreground bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow placeholder:text-muted-foreground/60';

export function TrainingPage() {
  const { data: employees = [], isLoading, error } = useTrainingCompliance();
  const { data: stats } = useTrainingStats();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | ComplianceStatus>('all');
  const [filterCourse, setFilterCourse] = useState('all');

  const [selectedEmployee, setSelectedEmployee] = useState<TrainingEmployee | null>(null);
  const [adjustRecord, setAdjustRecord] = useState<TrainingComplianceRecord | null>(null);

  // Distinct course names for filter dropdown
  const courseNames = useMemo(() => {
    const names = new Set<string>();
    for (const emp of employees) {
      for (const r of emp.records) {
        if (r.course_name) names.add(r.course_name);
      }
    }
    return Array.from(names).sort();
  }, [employees]);

  // Filter employees
  const filtered = useMemo(() => {
    return employees.filter(emp => {
      const matchesSearch = searchTerm === '' ||
        `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = filterStatus === 'all' || emp.complianceStatus === filterStatus;

      const matchesCourse = filterCourse === 'all' ||
        emp.records.some(r => r.course_name === filterCourse);

      return matchesSearch && matchesStatus && matchesCourse;
    });
  }, [employees, searchTerm, filterStatus, filterCourse]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-100px)]">
        <div
          className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-[13px] text-[hsl(4,82%,52%)]">Failed to load training data</span>
      </div>
    );
  }

  // Empty state: no training data at all
  if (employees.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="pl-1">
          <h1
            style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.75rem', fontWeight: 400, letterSpacing: '-0.025em', lineHeight: 1.1, color: 'var(--foreground)' }}
          >
            Training Compliance
          </h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted-foreground)', opacity: 0.5, marginTop: '4px' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <div className="flex flex-col items-center justify-center py-20 bg-card border border-border rounded-lg">
          <p className="text-[15px] text-foreground font-medium mb-2">No training records found</p>
          <p className="text-[13px] text-muted-foreground mb-4 max-w-md text-center">
            Training data syncs automatically from LearnDash once your WordPress connector is configured.
          </p>
          <Link
            to="/settings/connectors"
            className="inline-flex items-center gap-2 h-8 px-4 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary/90 transition-colors"
          >
            <LinkIcon size={13} strokeWidth={2} />
            Configure Connector
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="pl-1">
        <h1
          style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.75rem', fontWeight: 400, letterSpacing: '-0.025em', lineHeight: 1.1, color: 'var(--foreground)' }}
        >
          Training Compliance
        </h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted-foreground)', opacity: 0.5, marginTop: '4px' }}>
          {employees.length} employees enrolled · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* Stats Zone */}
      <div>
        <p className="zone-label mb-2">Compliance Overview</p>
        <TrainingStatsCards
          employees={employees}
          lastSyncAt={stats?.lastSyncAt ?? null}
          pendingAdjustments={stats?.pendingAdjustments ?? 0}
        />
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} strokeWidth={2} />
            <input
              type="text"
              placeholder="Search by name or email…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 h-8 border border-border rounded-md text-[13px] text-foreground bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/35 transition-shadow placeholder:text-muted-foreground/60"
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as 'all' | ComplianceStatus)}
            className={inputCls}
          >
            <option value="all">All Statuses</option>
            <option value="compliant">Compliant</option>
            <option value="overdue">Overdue</option>
            <option value="in_progress">In Progress</option>
            <option value="not_started">Not Started</option>
          </select>
          <select
            value={filterCourse}
            onChange={e => setFilterCourse(e.target.value)}
            className={inputCls}
          >
            <option value="all">All Courses</option>
            {courseNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Employee Table */}
      <TrainingEmployeeTable
        employees={filtered}
        onSelect={setSelectedEmployee}
      />

      {/* Detail Drawer */}
      <TrainingEmployeeDrawer
        employee={selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
        onAdjust={(record) => setAdjustRecord(record)}
      />

      {/* Adjustment Modal */}
      <TrainingAdjustmentModal
        record={adjustRecord}
        employeeName={selectedEmployee ? `${selectedEmployee.first_name} ${selectedEmployee.last_name}` : ''}
        onClose={() => setAdjustRecord(null)}
      />
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd prolific-hr-app && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
cd prolific-hr-app
git add src/features/training/TrainingPage.tsx
git commit -m "feat(training): add main TrainingPage with filters, empty state, and wiring"
```

---

## Task 8: Sidebar — Add Training Section

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Add `BookOpenCheck` to icon imports (line 2)**

Change line 2 from:
```typescript
import { LayoutDashboard, Users, FileText, Briefcase, Sparkles, PanelLeftClose, PanelLeftOpen, Plug, UserCog, Wrench } from 'lucide-react';
```
to:
```typescript
import { LayoutDashboard, Users, FileText, Briefcase, Sparkles, PanelLeftClose, PanelLeftOpen, Plug, UserCog, Wrench, BookOpenCheck } from 'lucide-react';
```

**Step 2: Add Training nav group between Workforce and AI & Admin (after line 28)**

Insert this new group between the Workforce group (ending line 28) and AI & Admin group (starting line 29):

```typescript
    {
        label: 'Training',
        items: [
            { name: 'Compliance', href: '/training', icon: BookOpenCheck, adminOnly: false, isAI: false },
        ],
    },
```

**Step 3: Verify the app renders**

Run: `cd prolific-hr-app && npm run build 2>&1 | tail -10`
Expected: Build succeeds with no errors

**Step 4: Commit**

```bash
cd prolific-hr-app
git add src/components/layout/Sidebar.tsx
git commit -m "feat(training): add Training section to sidebar navigation"
```

---

## Task 9: Router — Add /training Route

**Files:**
- Modify: `src/App.tsx`

**Step 1: Add TrainingPage import (after line 15)**

Add:
```typescript
import { TrainingPage } from '@/features/training/TrainingPage';
```

**Step 2: Add route (after the employees route, line 44)**

After the line:
```typescript
<Route path="employees" element={<EmployeeList />} />
```

Add:
```typescript
<Route path="training" element={<TrainingPage />} />
```

**Step 3: Verify build**

Run: `cd prolific-hr-app && npm run build 2>&1 | tail -10`
Expected: Build succeeds

**Step 4: Verify route works**

Run: `cd prolific-hr-app && npm run dev`
Navigate to `http://localhost:5173/training`
Expected: Training Compliance page renders (shows empty state if no training data exists yet)

**Step 5: Commit**

```bash
cd prolific-hr-app
git add src/App.tsx
git commit -m "feat(training): wire /training route in App.tsx"
```

---

## Task 10: Update Project Docs

**Files:**
- Modify: `docs/Project Docs/SPRINT_PLAN.md` — Mark Story 4.3 as complete
- Modify: `docs/Project Docs/PROJECT_LOG.md` — Add session entry

**Step 1: Update SPRINT_PLAN.md**

Change Story 4.3 status from:
```
- Status: [ ] Not started
```
to:
```
- Status: [x] Complete — DEPLOYED 2026-03-07
```

**Step 2: Add PROJECT_LOG.md entry**

Add new entry at the appropriate location:

```markdown
## 2026-03-07 (session 3) — Epic 4 Story 4.3: Training Compliance Dashboard

### What shipped

- Training Compliance page at `/training`
  - 5 KPI StatsCards: Total Enrolled, Fully Compliant, Overdue/Expired, Pending Adjustments, Last Sync
  - Employee-grouped table with compliance status badges (Compliant/Overdue/In Progress/Not Started)
  - Completion % progress bars with fraction labels
  - Filter bar: employee search, status filter, course filter
  - Detail drawer with course-level progress, adjustment badges (2px left accent), and overdue highlighting
  - Adjustment modal with field-specific inputs and compliance warnings for status/date overrides
  - Empty state with CTA to configure WordPress connector
  - Responsive grid: 2-col mobile / 3-col tablet / 5-col desktop for stats cards
- Sidebar: new "Training" section with BookOpenCheck icon, Compliance nav item
- Router: `/training` route added to App.tsx

### Design decisions

- Employee-grouped layout (not flat course table) — matches existing EmployeeList mental model
- Client-side aggregation from v_training_compliance VIEW — avoids custom SQL functions for MVP
- ComplianceStatus computed client-side: compliant (all complete + none expired), overdue (any expired), in_progress (any started), not_started
- Adjustment modal writes directly to training_adjustments (append-only RLS) — auto-generates training_events via DB trigger
- BookOpenCheck icon chosen over GraduationCap (already used for onboarding)

### Files changed

- src/features/training/types.ts (new)
- src/features/training/hooks/useTrainingCompliance.ts (new)
- src/features/training/hooks/useTrainingStats.ts (new)
- src/features/training/components/TrainingStatsCards.tsx (new)
- src/features/training/components/TrainingEmployeeTable.tsx (new)
- src/features/training/components/TrainingEmployeeDrawer.tsx (new)
- src/features/training/components/TrainingAdjustmentModal.tsx (new)
- src/features/training/TrainingPage.tsx (new)
- src/components/layout/Sidebar.tsx (modified — added Training section)
- src/App.tsx (modified — added /training route)
- docs/Project Docs/SPRINT_PLAN.md (Story 4.3 marked complete)
- docs/Project Docs/PROJECT_LOG.md (this entry)

### Next

- Epic 4 Gate: Sync runs for 48 hours without overwriting any adjustment values
- Epic 5: JotForm ingestion (multi-tenant aware)
```

**Step 3: Commit**

```bash
cd prolific-hr-app
git add docs/
git commit -m "docs: update sprint plan and project log for Story 4.3"
```

---

## Verification Checklist (after all tasks)

Run from `prolific-hr-app/`:

1. `npm run build` — must succeed with zero errors
2. `npm run dev` → navigate to `/training`:
   - Empty state shows if no training data (with connector CTA link)
   - If training data exists: 5 stats cards, filter bar, employee table all render
3. Click employee row → drawer opens with course details
4. Click "Adjust" on a course → modal opens, select "status" → warning banner appears
5. Sidebar shows "Training" section between Workforce and AI & Admin
6. Collapsed sidebar shows BookOpenCheck icon with tooltip "Compliance"
