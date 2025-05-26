/**
 * Recurrence Rule Formatter
 * 
 * A utility for formatting recurring calendar event patterns into human-readable strings.
 * This formatter handles various recurrence patterns (daily, weekly, monthly, yearly) with
 * support for intervals, specific days of week, month, etc.
 */

/**
 * Maps day of week numbers to their names
 */
const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
];

/**
 * Maps month numbers to their names
 */
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

/**
 * Gets an ordinal suffix for a number (1st, 2nd, 3rd, etc.)
 */
const getOrdinalSuffix = (day: number): string => {
  if (day >= 11 && day <= 13) {
    return `${day}th`;
  }
  
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
};

/**
 * Formats an array of weekday numbers into a readable string
 */
const formatWeekdays = (daysOfWeek: number[]): string => {
  if (!daysOfWeek || daysOfWeek.length === 0) {
    return '';
  }
  
  // Sort days to ensure they're in order
  const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
  
  // Handle special cases
  if (sortedDays.length === 7) {
    return 'every day';
  }
  
  if (sortedDays.length === 5 && 
      sortedDays.includes(1) && 
      sortedDays.includes(2) && 
      sortedDays.includes(3) && 
      sortedDays.includes(4) && 
      sortedDays.includes(5)) {
    return 'every weekday';
  }
  
  if (sortedDays.length === 2 && 
      sortedDays.includes(0) && 
      sortedDays.includes(6)) {
    return 'weekends';
  }
  
  // General case: format list of days
  const dayNames = sortedDays.map(day => WEEKDAYS[day]);
  
  if (dayNames.length === 1) {
    return dayNames[0];
  }
  
  if (dayNames.length === 2) {
    return `${dayNames[0]} and ${dayNames[1]}`;
  }
  
  const lastDay = dayNames.pop();
  return `${dayNames.join(', ')}, and ${lastDay}`;
};

/**
 * Formats a recurrence end type
 */
const formatRecurrenceEnd = (
  endDate?: string | null,
  count?: number | null
): string => {
  if (count && count > 0) {
    return count === 1 ? 'once' : `${count} times`;
  }
  
  if (endDate) {
    return `until ${new Date(endDate).toLocaleDateString()}`;
  }
  
  return 'with no end date';
};

/**
 * Interface for recurrence rule properties
 */
export interface RecurrenceRule {
  pattern?: string | null;
  interval?: number | null;
  dayOfWeek?: number[] | null;
  dayOfMonth?: number | null;
  month?: number | null;
  endDate?: string | null;
  count?: number | null;
  timezone?: string | null;
}

/**
 * Formats a recurrence rule into a human-readable string
 * 
 * @param recurrence The recurrence rule to format
 * @returns A human-readable description of the recurrence pattern
 */
export const formatRecurrenceRule = (recurrence: RecurrenceRule): string => {
  if (!recurrence || !recurrence.pattern) {
    return 'No recurrence pattern specified';
  }
  
  const {
    pattern,
    interval = 1,
    dayOfWeek,
    dayOfMonth,
    month,
    endDate,
    count
  } = recurrence;
  
  let result = '';
  const intervalText = interval && interval > 1 ? `every ${interval} ` : 'every ';
  
  switch (pattern.toLowerCase()) {
    case 'daily':
      result = `${intervalText}day`;
      break;
      
    case 'weekly':
      result = `${intervalText}week`;
      if (dayOfWeek && dayOfWeek.length > 0) {
        result += ` on ${formatWeekdays(dayOfWeek)}`;
      }
      break;
      
    case 'monthly':
      result = `${intervalText}month`;
      if (dayOfMonth && dayOfMonth > 0) {
        result += ` on the ${getOrdinalSuffix(dayOfMonth)}`;
      } else if (dayOfWeek && dayOfWeek.length > 0) {
        // For "nth weekday of the month" patterns
        // This is a simplified version, actual implementation would handle "first Monday", etc.
        result += ` on ${formatWeekdays(dayOfWeek)}`;
      }
      break;
      
    case 'yearly':
      result = `${intervalText}year`;
      if (month && month > 0 && month <= 12) {
        result += ` in ${MONTHS[month - 1]}`;
        if (dayOfMonth && dayOfMonth > 0) {
          result += ` on the ${getOrdinalSuffix(dayOfMonth)}`;
        }
      }
      break;
      
    default:
      result = pattern; // Just use the raw pattern if unrecognized
      break;
  }
  
  // Add end information
  const endInfo = formatRecurrenceEnd(endDate, count);
  if (endInfo) {
    result += `, ${endInfo}`;
  }
  
  return result;
};

/**
 * Interface for recurrence patterns adapted to match the RecurringCalendarEvent fields
 */
export interface RecurringCalendarEventFields {
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePatternType | string | null;
  recurrence_interval?: number | null;
  recurrence_day_of_week?: number[] | null;
  recurrence_day_of_month?: number | null;
  recurrence_month?: number | null;
  recurrence_end_date?: string | null;
  recurrence_count?: number | null;
  recurrence_timezone?: string | null;
}

/**
 * Add RecurrencePatternType enum if it's not already globally available or imported
 * For the purpose of this edit, assuming RecurrencePatternType is defined elsewhere (e.g., ../types/recurrence)
 * If not, it should be defined here or imported:
 */
export enum RecurrencePatternType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

/**
 * Formats a RecurringCalendarEvent object's recurrence fields into a human-readable string
 * 
 * @param event The RecurringCalendarEvent with recurrence fields
 * @returns A human-readable description of the recurrence pattern
 */
export const formatEventRecurrence = (event: RecurringCalendarEventFields): string => {
  if (!event.is_recurring || !event.recurrence_pattern) {
    return 'Not recurring'; // Handles null or undefined recurrence_pattern implicitly
  }
  
  let patternAsString: string;
  if (typeof event.recurrence_pattern === 'string') {
    patternAsString = event.recurrence_pattern;
  } else {
    // At this point, event.recurrence_pattern is RecurrencePatternType (enum)
    // as the !event.recurrence_pattern check above handles null/undefined.
    patternAsString = event.recurrence_pattern as string; // Enum values are strings
  }

  return formatRecurrenceRule({
    pattern: patternAsString,
    interval: event.recurrence_interval,
    dayOfWeek: event.recurrence_day_of_week,
    dayOfMonth: event.recurrence_day_of_month,
    month: event.recurrence_month,
    endDate: event.recurrence_end_date,
    count: event.recurrence_count,
    timezone: event.recurrence_timezone
  });
};