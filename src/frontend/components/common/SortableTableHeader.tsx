import React from 'react';
import type { SortDirection } from '../../hooks/table/useSortableTable';

interface SortableTableHeaderProps<T> {
  /**
   * The field key this header represents
   */
  field: T;
  /**
   * The current field being sorted
   */
  currentSortField: T;
  /**
   * The current sort direction
   */
  sortDirection: SortDirection;
  /**
   * Handler for when the header is clicked for sorting
   */
  onSort: (_field: T) => void;
  /**
   * Header label to display
   */
  children: React.ReactNode;
  /**
   * Whether this header is sortable (defaults to true)
   */
  sortable?: boolean;
  /**
   * Optional CSS class name
   */
  className?: string;
}

/**
 * A reusable component for sortable table headers with accessibility features
 */
export function SortableTableHeader<T>({
  field,
  currentSortField,
  sortDirection,
  onSort,
  children,
  sortable = true,
  className = ''
}: SortableTableHeaderProps<T>): JSX.Element {
  const isSorted = currentSortField === field;
  const ariaSort = isSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined;
  
  // Compound class names
  const classNames = [
    className,
    sortable ? 'sortable' : 'no-sort',
    isSorted ? `sorted-${sortDirection}` : ''
  ].filter(Boolean).join(' ');
  
  // If not sortable, just render a regular th
  if (!sortable) {
    return (
      <th className={classNames}>
        {children}
      </th>
    );
  }
  
  // Create accessible sort button
  return (
    <th 
      className={classNames}
      aria-sort={ariaSort}
      role="columnheader"
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className="sort-button"
        aria-label={`Sort by ${String(children)}${isSorted ? ` (currently sorted ${sortDirection === 'asc' ? 'ascending' : 'descending'})` : ''}`}
      >
        {children}
        {isSorted && (
          <span className="sort-icon" aria-hidden="true">
            {sortDirection === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </button>
    </th>
  );
}