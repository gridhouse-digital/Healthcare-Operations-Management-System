import { useEffect, useId, useState } from 'react';
import { Filter, Search, X } from 'lucide-react';
import { AppSelect } from '@/components/ui/AppSelect';
import type { ComplianceStatus } from '../types';
import { complianceStatusConfig } from '../utils/compliancePresentation';
import { Button } from '@/components/ui/button';

export interface TrainingComplianceFilters {
  search: string;
  status: 'all' | ComplianceStatus;
  course: string;
  gate: 'all' | 'satisfied' | 'incomplete' | 'not_applicable';
  adjustments: 'all' | 'with_adjustments';
}

interface TrainingComplianceToolbarProps {
  filters: TrainingComplianceFilters;
  onChange: (next: TrainingComplianceFilters) => void;
  courseNames: string[];
  resultCount: number;
  totalCount: number;
}

const inputCls =
  'w-full px-3 h-9 border border-border rounded-md text-[13px] text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-primary/35 transition-shadow placeholder:text-muted-foreground/60';

const statusOptions = [
  { value: 'all', label: 'All statuses' },
  ...Object.entries(complianceStatusConfig).map(([value, config]) => ({
    value,
    label: config.label,
  })),
];

export function TrainingComplianceToolbar({
  filters,
  onChange,
  courseNames,
  resultCount,
  totalCount,
}: TrainingComplianceToolbarProps) {
  const searchId = useId();
  const [sheetOpen, setSheetOpen] = useState(false);

  const activeCount = [
    filters.search.trim(),
    filters.status !== 'all' ? filters.status : '',
    filters.course !== 'all' ? filters.course : '',
    filters.gate !== 'all' ? filters.gate : '',
    filters.adjustments !== 'all' ? filters.adjustments : '',
  ].filter(Boolean).length;

  useEffect(() => {
    if (!sheetOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSheetOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [sheetOpen]);

  const clearAll = () =>
    onChange({
      search: '',
      status: 'all',
      course: 'all',
      gate: 'all',
      adjustments: 'all',
    });

  const chips = [
    filters.status !== 'all'
      ? { key: 'status', label: `Status: ${complianceStatusConfig[filters.status].label}` }
      : null,
    filters.course !== 'all' ? { key: 'course', label: `Course: ${filters.course}` } : null,
    filters.gate !== 'all'
      ? {
          key: 'gate',
          label: `Gate: ${filters.gate === 'satisfied' ? 'Satisfied' : filters.gate === 'incomplete' ? 'Incomplete' : 'Not applicable'}`,
        }
      : null,
    filters.adjustments === 'with_adjustments'
      ? { key: 'adjustments', label: 'Has adjustments' }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  const desktopFilters = (
    <>
      <AppSelect
        value={filters.status}
        onValueChange={(value) => onChange({ ...filters, status: value as TrainingComplianceFilters['status'] })}
        options={statusOptions}
        className={inputCls}
      />
      <AppSelect
        value={filters.course}
        onValueChange={(value) => onChange({ ...filters, course: value })}
        options={[{ value: 'all', label: 'All courses' }, ...courseNames.map((name) => ({ value: name, label: name }))]}
        className={inputCls}
      />
      <AppSelect
        value={filters.gate}
        onValueChange={(value) => onChange({ ...filters, gate: value as TrainingComplianceFilters['gate'] })}
        options={[
          { value: 'all', label: 'All gate states' },
          { value: 'satisfied', label: 'Gate satisfied' },
          { value: 'incomplete', label: 'Requirements incomplete' },
          { value: 'not_applicable', label: 'Gate not applicable' },
        ]}
        className={inputCls}
      />
    </>
  );

  return (
    <div className="saas-card space-y-3 p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative min-w-0 flex-1">
          <label htmlFor={searchId} className="sr-only">
            Search employees by name, email or role
          </label>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={13} strokeWidth={2} />
          <input
            id={searchId}
            type="search"
            placeholder="Search employees by name, email or role"
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
            className={`${inputCls} pl-8`}
          />
        </div>

        <div className="hidden min-w-0 flex-[2] grid-cols-3 gap-2 xl:grid">{desktopFilters}</div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="xl:hidden"
            onClick={() => setSheetOpen(true)}
          >
            <Filter size={14} />
            Filters
            {activeCount > 0 ? (
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {activeCount}
              </span>
            ) : null}
          </Button>
          <p className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
            {resultCount} of {totalCount}
          </p>
        </div>
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => {
                if (chip.key === 'status') onChange({ ...filters, status: 'all' });
                if (chip.key === 'course') onChange({ ...filters, course: 'all' });
                if (chip.key === 'gate') onChange({ ...filters, gate: 'all' });
                if (chip.key === 'adjustments') onChange({ ...filters, adjustments: 'all' });
              }}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-foreground"
            >
              {chip.label}
              <X size={12} />
            </button>
          ))}
          <button type="button" onClick={clearAll} className="text-[11px] font-medium text-primary hover:underline">
            Clear all
          </button>
        </div>
      ) : null}

      {sheetOpen ? (
        <>
          <button
            type="button"
            aria-label="Close filters"
            className="fixed inset-0 z-40 bg-background/72 backdrop-blur-sm xl:hidden"
            onClick={() => setSheetOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Compliance filters"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-border bg-popover/95 p-4 shadow-2xl backdrop-blur-sm xl:hidden"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Filters</h2>
              <button type="button" aria-label="Close" onClick={() => setSheetOpen(false)} className="rounded-md p-1 text-muted-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <AppSelect
                value={filters.status}
                onValueChange={(value) => onChange({ ...filters, status: value as TrainingComplianceFilters['status'] })}
                options={statusOptions}
                className={inputCls}
              />
              <AppSelect
                value={filters.course}
                onValueChange={(value) => onChange({ ...filters, course: value })}
                options={[{ value: 'all', label: 'All courses' }, ...courseNames.map((name) => ({ value: name, label: name }))]}
                className={inputCls}
              />
              <AppSelect
                value={filters.gate}
                onValueChange={(value) => onChange({ ...filters, gate: value as TrainingComplianceFilters['gate'] })}
                options={[
                  { value: 'all', label: 'All gate states' },
                  { value: 'satisfied', label: 'Gate satisfied' },
                  { value: 'incomplete', label: 'Requirements incomplete' },
                  { value: 'not_applicable', label: 'Gate not applicable' },
                ]}
                className={inputCls}
              />
              <AppSelect
                value={filters.adjustments}
                onValueChange={(value) => onChange({ ...filters, adjustments: value as TrainingComplianceFilters['adjustments'] })}
                options={[
                  { value: 'all', label: 'All adjustment states' },
                  { value: 'with_adjustments', label: 'Has HR adjustments' },
                ]}
                className={inputCls}
              />
            </div>
            <div className="mt-4 flex gap-2">
              <Button type="button" className="flex-1" onClick={() => setSheetOpen(false)}>
                Apply
              </Button>
              <Button type="button" variant="outline" onClick={clearAll}>
                Clear all
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
