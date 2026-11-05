import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { SortDirection } from '@/hooks/useTableSort';

interface SortableHeaderProps {
    label: string;
    direction: SortDirection | null;
    onSort: () => void;
    className?: string;
}

/* A table heading you can click: the arrow gives the direction, so colour never carries it alone */
export function SortableHeader({ label, direction, onSort, className }: SortableHeaderProps) {
    const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ChevronsUpDown;
    const ariaSort = direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : undefined;

    return (
        <th scope="col" aria-sort={ariaSort} className={className}>
            <button type="button" onClick={onSort} className={`sort-header${direction ? ' sort-header-active' : ''}`}>
                <span className="zone-label">{label}</span>
                <Icon size={13} strokeWidth={1.75} aria-hidden="true" />
            </button>
        </th>
    );
}
