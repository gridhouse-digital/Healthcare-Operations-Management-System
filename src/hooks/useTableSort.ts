import { useCallback, useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc';
export type SortKind = 'text' | 'number' | 'date';
type SortValue = string | number | null | undefined;

export interface SortColumn<T> {
    value: (row: T) => SortValue;
    kind?: SortKind;
}

export interface SortState<K extends string> {
    key: K;
    direction: SortDirection;
}

function isBlank(value: SortValue, kind: SortKind) {
    if (value === null || value === undefined || value === '') return true;
    return kind === 'date' && Number.isNaN(new Date(value).getTime());
}

function compare(a: NonNullable<SortValue>, b: NonNullable<SortValue>, kind: SortKind) {
    if (kind === 'date') return new Date(a).getTime() - new Date(b).getTime();
    if (kind === 'number') return Number(a) - Number(b);
    return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
}

/* Blanks stay last in both directions, and ties keep the order the rows arrived in */
export function sortRows<T>(rows: T[], column: SortColumn<T>, direction: SortDirection) {
    const kind = column.kind ?? 'text';
    const sign = direction === 'asc' ? 1 : -1;

    return [...rows].sort((rowA, rowB) => {
        const a = column.value(rowA);
        const b = column.value(rowB);
        const blankA = isBlank(a, kind);
        const blankB = isBlank(b, kind);
        if (blankA || blankB) return Number(blankA) - Number(blankB);
        return sign * compare(a as NonNullable<SortValue>, b as NonNullable<SortValue>, kind);
    });
}

/**
 * Click-to-sort for a table. Dates and numbers start newest or highest first,
 * text starts A to Z, and a second click reverses. Keep `columns` stable
 * (module scope or useMemo) so rows are only re-sorted when something changes.
 */
export function useTableSort<T, K extends string>(
    rows: T[],
    columns: Record<K, SortColumn<T>>,
    initial: SortState<NoInfer<K>> | null = null,
) {
    const [sort, setSort] = useState<SortState<K> | null>(initial);

    const sortedRows = useMemo(
        () => (sort ? sortRows(rows, columns[sort.key], sort.direction) : rows),
        [rows, columns, sort],
    );

    const toggle = useCallback((key: K) => {
        setSort((current) => {
            if (current?.key === key) {
                return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: (columns[key].kind ?? 'text') === 'text' ? 'asc' : 'desc' };
        });
    }, [columns]);

    const sortProps = useCallback((key: K) => ({
        direction: sort?.key === key ? sort.direction : null,
        onSort: () => toggle(key),
    }), [sort, toggle]);

    return { sortedRows, sortProps };
}
