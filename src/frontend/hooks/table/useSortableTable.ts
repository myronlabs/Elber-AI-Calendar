import { useState, useMemo, useCallback } from 'react';

/**
 * Type for sort direction
 * 
 * This is used throughout the sorting functionality to ensure consistent typing
 * and to restrict values to only valid sort directions.
 * 
 * @example
 * const direction: SortDirection = 'asc';
 * // Not allowed: const invalid: SortDirection = 'up'; // TypeScript error
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Hook for managing sortable tables
 * @template T - The data type of items in the table
 * @template K - The keys of T that can be sorted
 * @param items - The array of items to sort
 * @param initialSortField - The initial field to sort by
 * @param initialDirection - The initial sort direction
 * @returns Object containing sorted items and sort controls
 */
export function useSortableTable<T, K extends keyof T>(
  items: T[],
  initialSortField: K,
  initialDirection: SortDirection = 'desc'
) {
  // State for sort field and direction
  const [sortField, setSortField] = useState<K>(initialSortField);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialDirection);

  // Function to handle sort when a column header is clicked
  const handleSort = (field: K) => {
    if (sortField === field) {
      // Toggle direction if clicking the same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new sort field and default to ascending order
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Custom sort function for comparing values that might be null/undefined/etc.
  const sortFunction = useCallback((a: T, b: T): number => {
    // Get the values to compare
    const aValue = a[sortField];
    const bValue = b[sortField];
      
    // Handling null/undefined values - considering them as empty strings
    const aCompare = aValue ?? '';
    const bCompare = bValue ?? '';

    // Convert to lowercase if string for case-insensitive comparison
    const aCompareNormalized = typeof aCompare === 'string' ? aCompare.toLowerCase() : aCompare;
    const bCompareNormalized = typeof bCompare === 'string' ? bCompare.toLowerCase() : bCompare;
      
    // Handle date strings
    if (typeof aCompareNormalized === 'string' && typeof bCompareNormalized === 'string') {
      const aDate = Date.parse(aCompareNormalized);
      const bDate = Date.parse(bCompareNormalized);
      if (!isNaN(aDate) && !isNaN(bDate)) {
        return sortDirection === 'asc' ? aDate - bDate : bDate - aDate;
      }
    }

    // Compare the values - we need to handle the comparison differently based on types
    // but maintain type safety through all operations
    if (aCompareNormalized < bCompareNormalized) {
      return sortDirection === 'asc' ? -1 : 1;
    }
    if (aCompareNormalized > bCompareNormalized) {
      return sortDirection === 'asc' ? 1 : -1;
    }
    return 0;
  }, [sortField, sortDirection]);

  // Memoize the sorted items
  const sortedItems = useMemo(() => {
    if (!items.length) return [];
    return [...items].sort(sortFunction);
  }, [items, sortFunction]);

  return {
    sortedItems,
    sortField,
    sortDirection,
    handleSort,
    setSortField,
    setSortDirection
  };
}

/**
 * Create a specialized hook for sorting contacts
 */
export function createContactSortHook<T>(
  specialFieldHandler?: (_field: keyof T, _a: T, _b: T, _sortDirection: SortDirection) => number | null
) {
  return function useContactSort(
    items: T[],
    initialSortField: keyof T,
    initialDirection: SortDirection = 'desc'
  ) {
    // State for sort field and direction
    const [sortField, setSortField] = useState<keyof T>(initialSortField);
    const [sortDirection, setSortDirection] = useState<SortDirection>(initialDirection);

    // Function to handle sort when a column header is clicked
    const handleSort = (field: keyof T) => {
      if (sortField === field) {
        // Toggle direction if clicking the same field
        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        // Set new sort field and default to ascending order
        setSortField(field);
        setSortDirection('asc');
      }
    };

    // Custom sort function for contacts
    const sortFunction = useCallback((a: T, b: T): number => {
      // Check if there's a special handler for this field
      if (specialFieldHandler) {
        const result = specialFieldHandler(sortField, a, b, sortDirection);
        if (result !== null) return result;
      }

      // Get the values to compare
      const aValue = a[sortField];
      const bValue = b[sortField];
        
      // Handling null/undefined values - considering them as empty strings
      const aCompare = aValue ?? '';
      const bCompare = bValue ?? '';

      // Convert to lowercase if string for case-insensitive comparison
      const aCompareNormalized = typeof aCompare === 'string' ? aCompare.toLowerCase() : aCompare;
      const bCompareNormalized = typeof bCompare === 'string' ? bCompare.toLowerCase() : bCompare;
        
      // Handle date strings
      if (typeof aCompareNormalized === 'string' && typeof bCompareNormalized === 'string') {
        const aDate = Date.parse(aCompareNormalized);
        const bDate = Date.parse(bCompareNormalized);
        if (!isNaN(aDate) && !isNaN(bDate)) {
          return sortDirection === 'asc' ? aDate - bDate : bDate - aDate;
        }
      }

      // Compare the values - we need a type-safe comparison that works with any type
      if (String(aCompareNormalized) < String(bCompareNormalized)) {
        return sortDirection === 'asc' ? -1 : 1;
      }
      if (String(aCompareNormalized) > String(bCompareNormalized)) {
        return sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    }, [sortField, sortDirection]); // specialFieldHandler is a function from outer scope

    // Memoize the sorted items
    const sortedItems = useMemo(() => {
      if (!items.length) return [];
      return [...items].sort(sortFunction);
    }, [items, sortFunction]);

    return {
      sortedItems,
      sortField,
      sortDirection,
      handleSort,
      setSortField,
      setSortDirection
    };
  };
}