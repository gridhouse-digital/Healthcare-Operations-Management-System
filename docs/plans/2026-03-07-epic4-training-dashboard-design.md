# Training Compliance Dashboard — Design Doc

> **Story:** Epic 4, Story 4.3
> **Date:** 2026-03-07
> **Status:** Approved (brainstorming + UX review complete)
> **Data source:** `v_training_compliance` VIEW (Layer C effective values)

---

## Goal

Build a dedicated `/training` page that shows per-employee training compliance status, supports HR adjustments, and fits the existing dark-first design system.

## Architecture

New route `/training` under a new "Training" sidebar section. Page reads from `v_training_compliance` VIEW (joins training_records + training_adjustments, computes effective values where Layer B overrides win over Layer A raw sync). KPI stats are aggregated client-side from the same query + `integration_log` for last sync timestamp.

React Query for all data fetching. No new Edge Functions required — reads directly from Supabase views/tables via the JS client.

---

## Sidebar Change

Add a **Training** section between Workforce and AI & Admin in `navGroups`:

```ts
{
    label: 'Training',
    items: [
        { name: 'Compliance', href: '/training', icon: BookOpenCheck, adminOnly: false, isAI: false },
    ],
}
```

**Icon:** `BookOpenCheck` from lucide-react (visually communicates "training + verification" — fits compliance better than GraduationCap which is already used for onboarding on the dashboard).

**Visibility:** All roles (not adminOnly).

---

## Page Layout (top to bottom)

### 1. Page Header

- Title: "Training Compliance" (Plus Jakarta Sans 800, same pattern as other pages)
- Subtitle: date + employee count (IBM Plex Mono, uppercase)

### 2. Stats Zone — 5 KPI Cards

| Card | Intent | Query |
|------|--------|-------|
| Total Enrolled | info | `COUNT DISTINCT person_id` from v_training_compliance |
| Fully Compliant | success | Employees where ALL courses status = 'completed' AND none expired |
| Overdue / Expired | danger | Employees with ANY course past `expires_at` or incomplete past required window |
| Pending Adjustments | warning | `COUNT(*)` from training_adjustments where `reviewed_at IS NULL` |
| Last Sync | info | `MAX(completed_at)` from integration_log where source='learndash' AND status='completed' |

**Responsive grid:** `grid-cols-2 md:grid-cols-3 xl:grid-cols-5`. On mobile (2-col), Last Sync card spans `col-span-2` to avoid orphaned single card.

**KPI definitions (employee-level, matching the table below):**
- **Compliant:** All assigned courses completed AND none past `expires_at`
- **Overdue:** Any course past `expires_at` or not completed within required window
- **In Progress:** At least 1 incomplete course but none overdue
- **Not Started:** Has training records but 0% across all courses

### 3. Filter Bar

Inside a `bg-card border border-border rounded-lg p-3` container (matches EmployeeList pattern):

| Filter | Type | Options |
|--------|------|---------|
| Employee search | Text input with Search icon | Name search |
| Status | Select dropdown | All / Compliant / Overdue / In Progress / Not Started |
| Course | Select dropdown | All / dynamic list from distinct course_name |

### 4. Employee-Grouped Table

One row per employee. Columns:

| Column | Content |
|--------|---------|
| Employee | Monogram avatar + name + email (matches EmployeeList pattern) |
| Job Title | From people record |
| Courses | Fraction: "6/8" (assigned count) |
| Completed | Count where status = completed |
| Completion % | Progress bar + fraction label below (e.g., "6/8 courses") |
| Status | Badge: Compliant (teal) / Overdue (red) / In Progress (amber) / Not Started (muted) |
| Last Activity | Most recent completed_at or updated_at |

Click row opens detail drawer.

### 5. Detail Drawer (right slide, width="lg")

**Summary header strip:**
- Employee name, job title, overall completion %, compliance status badge
- Monogram avatar (same pattern as EmployeeList drawer)

**Course detail table:**

| Column | Content |
|--------|---------|
| Course Name | From training_records.course_name |
| Status | Badge (completed/in_progress/not_started) |
| Completion % | Progress bar |
| Completed Date | effective completed_at |
| Effective Values | training_hours, expires_at (from Layer C) |

**Adjustment indicator:** Rows with Layer B overrides get a 2px left border in `--color-primary` (teal) + small adjustment icon. Tooltip on icon shows "HR adjusted on {date}: {reason}".

**Overdue highlight:** Rows that cause the employee's "Overdue" status are highlighted with a subtle red left border or background tint so HR can immediately see *which* course is the problem.

**"Add Adjustment" button:** Per course row. Opens modal.

### 6. Adjustment Modal

Fields:
- **Field** (dropdown): training_hours, expires_at, status, notes
- **Value** (dynamic input): number for hours, date picker for expires_at, select for status, textarea for notes
- **Reason** (textarea, required): Why this adjustment is being made

**Guardrail:** When `status` or `expires_at` is selected, show an inline warning: "This overrides the value synced from LearnDash. The adjustment will be logged and auditable." No warning for `training_hours` or `notes` (additive fields).

Writes directly to `training_adjustments` table. Invalidates React Query cache on success.

### 7. Empty State

When no training records exist (WP/LearnDash not configured or no employees with wp_user_id):

> "No training records found. Training data syncs automatically from LearnDash once your WordPress connector is configured."
>
> [Configure Connector] → links to `/settings/connectors`

Purposeful CTA prevents confusion and drives setup completion.

---

## New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `TrainingPage.tsx` | `src/features/training/TrainingPage.tsx` | Page shell: header, stats, filters, table |
| `TrainingStatsCards.tsx` | `src/features/training/components/TrainingStatsCards.tsx` | 5 KPI cards |
| `TrainingEmployeeTable.tsx` | `src/features/training/components/TrainingEmployeeTable.tsx` | Employee-grouped table |
| `TrainingEmployeeDrawer.tsx` | `src/features/training/components/TrainingEmployeeDrawer.tsx` | Drawer: summary + course table |
| `TrainingAdjustmentModal.tsx` | `src/features/training/components/TrainingAdjustmentModal.tsx` | Modal for writing adjustments |
| `useTrainingCompliance.ts` | `src/features/training/hooks/useTrainingCompliance.ts` | React Query hook for v_training_compliance |
| `useTrainingStats.ts` | `src/features/training/hooks/useTrainingStats.ts` | React Query hook for aggregated KPIs |

---

## Data Flow

```
v_training_compliance VIEW (Supabase)
    ↓ React Query (useTrainingCompliance)
    ↓ Client-side grouping by person_id
    ├── TrainingStatsCards (aggregate counts)
    ├── TrainingEmployeeTable (one row per employee)
    └── TrainingEmployeeDrawer (course rows for selected employee)

integration_log (source='learndash', status='completed')
    ↓ React Query (useTrainingStats)
    └── Last Sync card

training_adjustments (reviewed_at IS NULL)
    ↓ React Query (useTrainingStats)
    └── Pending Adjustments card

training_adjustments (INSERT)
    ↑ TrainingAdjustmentModal (on submit)
    └── Invalidates useTrainingCompliance + useTrainingStats
```

---

## Design System Compliance

- Dark surfaces: base/surface/panel tokens (no hardcoded colors)
- StatsCard with intent prop (info/success/danger/warning)
- Monogram avatars: `bg-primary/12` with `font-mono`
- Zone labels: IBM Plex Mono, 0.5625rem, uppercase, tracking-wide
- Table styling: matches EmployeeList (hover row, cursor-pointer, divide-y)
- Drawer: reuses SlideOver component (width="lg")
- Progress bars: `bg-primary h-1.5 rounded-full` (matches existing course progress)
- Stagger animations: `animate-reveal-up` + delay classes on stats cards

---

## Router Change

Add to app router:
```ts
{ path: '/training', element: <TrainingPage /> }
```

---

## Out of Scope (MVP)

- Bulk adjustment (one employee at a time)
- Export/print from this page (Epic 6)
- Audit timeline in drawer (future enhancement)
- Alternate "Records" flat-table view (future enhancement)
