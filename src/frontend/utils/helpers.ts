// src/frontend/utils/helpers.ts
import {
  formatDateToLocale,
  parseLocaleDateToISO,
  initializeLocale
} from './localeUtils';

// Initialize locale detection on first import
initializeLocale();

/**
 * Formats a date object or ISO string into a more readable format.
 * Includes time formatting with localization.
 * Example: 'MM-DD-YYYY HH:mm' for US locale
 * @param dateInput - The date to format (Date object or ISO string).
 * @param options - Intl.DateTimeFormatOptions for custom formatting.
 * @returns Formatted date string.
 */
export const formatDate = (
  dateInput: string | Date | undefined | null,
  options?: Intl.DateTimeFormatOptions
): string => {
  if (!dateInput) return '';
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false, // Use 24-hour format by default
      ...options,
    };
    // Use browser's locale detection for Intl formatter
    return new Intl.DateTimeFormat(navigator.language, defaultOptions).format(date);
  } catch (error) {
    console.error('Error formatting date:', dateInput, error);
    return 'Invalid Date';
  }
};

/**
 * Formats a date string from ISO format to user's locale format
 * @param dateInput - The date to format (ISO string, YYYY-MM-DD)
 * @returns Formatted date string in user's locale format (e.g., MM-DD-YYYY for US)
 */
export const formatDateMMDDYYYY = (dateInput: string | undefined | null): string => {
  // This function name is kept for backward compatibility
  // But now it returns dates formatted according to user's locale
  return formatDateToLocale(dateInput);
};

/**
 * Converts a date from user's locale format to ISO format (YYYY-MM-DD)
 * @param localDateInput - Date string in user's locale format
 * @returns ISO formatted date string (YYYY-MM-DD)
 */
export const formatDateToISO = (localDateInput: string | undefined | null): string => {
  try {
    // If input is empty/null, return empty string
    if (!localDateInput) return '';
    
    // If the input is already in ISO format, return it directly
    if (/^\d{4}-\d{2}-\d{2}$/.test(localDateInput)) return localDateInput;
    
    // EXPLICITLY HANDLE THE DATE PICKER'S FORMAT (MM/DD/YYYY with slashes)
    // This is the most common case when using the date picker UI
    const datePickerMatch = localDateInput.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (datePickerMatch) {
      const [, month, day, year] = datePickerMatch;
      // Pad with leading zeros if needed
      const paddedMonth = month.padStart(2, '0');
      const paddedDay = day.padStart(2, '0');
      return `${year}-${paddedMonth}-${paddedDay}`;
    }
    
    // First try the standard locale parsing as fallback
    const isoDate = parseLocaleDateToISO(localDateInput);
    if (isoDate) return isoDate;
    
    // If that fails, try a more permissive approach
    // Strip all whitespace
    const stripped = localDateInput.replace(/\s+/g, '');
    
    // Try different formats
    // MM/DD/YYYY or MM-DD-YYYY format (supporting slash, dash, dot separators)
    // Use character class without escaping the forward slash
    const mdyMatch = stripped.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (mdyMatch) {
      const [, month, day, year] = mdyMatch;
      // Pad with leading zeros if needed
      const paddedMonth = month.padStart(2, '0');
      const paddedDay = day.padStart(2, '0');
      return `${year}-${paddedMonth}-${paddedDay}`;
    }
    
    // DD/MM/YYYY or DD-MM-YYYY format (supporting slash, dash, dot separators)
    const dmyMatch = stripped.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (dmyMatch) {
      const [, day, month, year] = dmyMatch;
      // Pad with leading zeros if needed
      const paddedMonth = month.padStart(2, '0');
      const paddedDay = day.padStart(2, '0');
      return `${year}-${paddedMonth}-${paddedDay}`;
    }
    
    // YYYY/MM/DD or YYYY-MM-DD format (supporting slash, dash, dot separators)
    const ymdMatch = stripped.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
    if (ymdMatch) {
      const [, year, month, day] = ymdMatch;
      // Pad with leading zeros if needed
      const paddedMonth = month.padStart(2, '0');
      const paddedDay = day.padStart(2, '0');
      return `${year}-${paddedMonth}-${paddedDay}`;
    }
    
    // If all else fails, return the result from standard parsing
    return parseLocaleDateToISO(localDateInput);
  } catch (error) {
    console.error('Error in formatDateToISO:', error);
    return '';
  }
};

/**
 * Simple utility to capitalize the first letter of a string.
 * @param text The string to capitalize.
 * @returns The capitalized string.
 */
export const capitalizeFirstLetter = (text: string | undefined | null): string => {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Truncates a string to a maximum length and appends an ellipsis if truncated.
 * @param text The string to truncate.
 * @param maxLength The maximum length of the string.
 * @returns The truncated string, or the original string if it's shorter than maxLength.
 */
export const truncateText = (
  text: string | undefined | null,
  maxLength: number
): string => {
  if (!text) return '';
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '...';
};

// Add other general-purpose helper functions here as needed.
