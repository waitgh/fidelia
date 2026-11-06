import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

export type SortDirection = 'asc' | 'desc';

export interface SortState<T extends string> {
  column: T;
  direction: SortDirection;
}

interface SortableHeaderProps<T extends string> {
  label: string;
  column: T;
  current: SortState<T>;
  onSort: (col: T) => void;
  className?: string;
}

export function SortableHeader<T extends string>({
  label,
  column,
  current,
  onSort,
  className = '',
}: SortableHeaderProps<T>) {
  const isActive = current.column === column;

  return (
    <th
      className={`cursor-pointer select-none hover:bg-gray-100 transition-colors ${className}`}
      onClick={() => onSort(column)}
    >
      <div className={`flex items-center gap-1 ${className.includes('text-right') ? 'justify-end' : ''}`}>
        {label}
        {isActive ? (
          current.direction === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5 text-primary-600" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 text-primary-600" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-gray-300" />
        )}
      </div>
    </th>
  );
}

export function toggleSort<T extends string>(
  current: SortState<T>,
  column: T,
  defaultDirection: SortDirection = 'asc',
): SortState<T> {
  if (current.column === column) {
    return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { column, direction: defaultDirection };
}
