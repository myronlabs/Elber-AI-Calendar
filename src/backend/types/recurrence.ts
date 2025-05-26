/**
 * Type definitions for recurring calendar events
 */

/**
 * Enum for recurrence pattern types
 * Matches the PostgreSQL ENUM type defined in the database
 */
export enum RecurrencePatternType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  CUSTOM = 'custom'
}

/**
 * Days of the week, using ISO 8601 numbering (1-7, Monday-Sunday)
 */
export enum DayOfWeek {
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6,
  SUNDAY = 7
}

/**
 * Type for recurrence end specification
 * Either by count or by date
 */
export type RecurrenceEnd = 
  | { type: 'count'; count: number }
  | { type: 'until'; until: string }  // ISO 8601 date string
  | { type: 'never' };

/**
 * Interface for recurring event information
 */
export interface RecurrenceInfo {
  /** Whether the event is recurring */
  isRecurring: boolean;
  
  /** The recurrence pattern (daily, weekly, monthly, yearly, custom) */
  pattern?: RecurrencePatternType;
  
  /** The recurrence interval (e.g., every 2 weeks) */
  interval?: number;
  
  /** Days of week for weekly recurrence */
  daysOfWeek?: DayOfWeek[];
  
  /** Day of month for monthly recurrence */
  dayOfMonth?: number;
  
  /** Month for yearly recurrence */
  month?: number;
  
  /** When recurrence ends (by count or date) */
  end?: RecurrenceEnd;
  
  /** Optional iCalendar RRULE for complex patterns */
  rule?: string;
  
  /** Optional timezone for recurrence calculations */
  timezone?: string;
}

/**
 * Extended calendar event with recurrence information
 */
export interface RecurringCalendarEvent {
  /** Event ID (UUID) */
  event_id: string;
  
  /** User ID owning the event */
  user_id: string;
  
  /** Event title */
  title: string;
  
  /** Start time (ISO 8601) */
  start_time: string;
  
  /** End time (ISO 8601) */
  end_time: string;
  
  /** Creation timestamp */
  created_at: string;
  
  /** Last update timestamp */
  updated_at: string;
  
  /** Whether it's an all-day event */
  is_all_day: boolean;
  
  /** Optional event description */
  description?: string | null;
  
  /** Optional event location */
  location?: string | null;
  
  /** Optional Google Calendar event ID for sync */
  google_event_id?: string | null;
  
  /** Optional Zoom meeting ID for sync */
  zoom_meeting_id?: string | null;
  
  /** Whether the event is recurring */
  is_recurring: boolean;
  
  /** Recurrence pattern type */
  recurrence_pattern?: RecurrencePatternType | null;
  
  /** Recurrence interval (e.g., every 2 weeks) */
  recurrence_interval?: number | null;
  
  /** Days of week for weekly recurrence */
  recurrence_day_of_week?: number[] | null;
  
  /** Day of month for monthly recurrence */
  recurrence_day_of_month?: number | null;
  
  /** Month for yearly recurrence */
  recurrence_month?: number | null;
  
  /** When recurrence ends (date) */
  recurrence_end_date?: string | null;
  
  /** Number of occurrences */
  recurrence_count?: number | null;
  
  /** iCalendar RRULE for complex patterns */
  recurrence_rule?: string | null;
  
  /** Parent event ID for linked events */
  parent_event_id?: string | null;
  
  /** Whether this is an exception to a recurring pattern */
  is_exception?: boolean;
  
  /** Original date this exception replaces */
  exception_date?: string | null;
  
  /** Series ID for grouping related events */
  series_id?: string | null;
  
  /** Timezone for recurrence calculations */
  recurrence_timezone?: string | null;
}

/**
 * Helper type for creating a new recurring event
 */
export type NewRecurringCalendarEvent = Omit<
  RecurringCalendarEvent,
  'event_id' | 'created_at' | 'updated_at' | 'user_id'
>;

/**
 * Helper function to convert database model to RecurrenceInfo interface
 */
export function extractRecurrenceInfo(event: RecurringCalendarEvent): RecurrenceInfo | null {
  if (!event.is_recurring) {
    return null;
  }
  
  // Build the recurrence end specification
  let end: RecurrenceEnd | undefined;
  if (event.recurrence_count) {
    end = { type: 'count', count: event.recurrence_count };
  } else if (event.recurrence_end_date) {
    end = { type: 'until', until: event.recurrence_end_date };
  } else {
    end = { type: 'never' };
  }
  
  return {
    isRecurring: true,
    pattern: event.recurrence_pattern || undefined,
    interval: event.recurrence_interval || undefined,
    daysOfWeek: event.recurrence_day_of_week?.map(day => day as DayOfWeek) || undefined,
    dayOfMonth: event.recurrence_day_of_month || undefined,
    month: event.recurrence_month || undefined,
    end,
    rule: event.recurrence_rule || undefined,
    timezone: event.recurrence_timezone || undefined
  };
}

/**
 * Helper function to convert RecurrenceInfo to database model properties
 */
export function createRecurrenceFields(info: RecurrenceInfo): Partial<RecurringCalendarEvent> {
  const result: Partial<RecurringCalendarEvent> = {
    is_recurring: info.isRecurring,
  };
  
  if (!info.isRecurring) {
    return result;
  }
  
  // Add pattern fields if recurring
  if (info.pattern) {
    result.recurrence_pattern = info.pattern;
  }
  
  if (info.interval) {
    result.recurrence_interval = info.interval;
  }
  
  if (info.daysOfWeek && info.daysOfWeek.length > 0) {
    result.recurrence_day_of_week = info.daysOfWeek;
  }
  
  if (info.dayOfMonth) {
    result.recurrence_day_of_month = info.dayOfMonth;
  }
  
  if (info.month) {
    result.recurrence_month = info.month;
  }
  
  // Handle recurrence end
  if (info.end) {
    if (info.end.type === 'count') {
      result.recurrence_count = info.end.count;
    } else if (info.end.type === 'until') {
      result.recurrence_end_date = info.end.until;
    }
  }
  
  if (info.rule) {
    result.recurrence_rule = info.rule;
  }
  
  if (info.timezone) {
    result.recurrence_timezone = info.timezone;
  }
  
  return result;
}

/**
 * Generates a human-readable summary of a recurrence pattern
 */
export function formatRecurrenceSummary(info: RecurrenceInfo): string {
  if (!info.isRecurring || !info.pattern) {
    return 'Not recurring';
  }
  
  const interval = info.interval && info.interval > 1 ? `every ${info.interval} ` : '';
  let base = '';
  
  switch (info.pattern) {
    case RecurrencePatternType.DAILY:
      base = `${interval}day${info.interval && info.interval > 1 ? 's' : ''}`;
      break;
    case RecurrencePatternType.WEEKLY:
      base = `${interval}week${info.interval && info.interval > 1 ? 's' : ''}`;
      if (info.daysOfWeek && info.daysOfWeek.length > 0) {
        const days = info.daysOfWeek.map(day => {
          switch (day) {
            case DayOfWeek.MONDAY: return 'Mon';
            case DayOfWeek.TUESDAY: return 'Tue';
            case DayOfWeek.WEDNESDAY: return 'Wed';
            case DayOfWeek.THURSDAY: return 'Thu';
            case DayOfWeek.FRIDAY: return 'Fri';
            case DayOfWeek.SATURDAY: return 'Sat';
            case DayOfWeek.SUNDAY: return 'Sun';
            default: return '';
          }
        }).filter(d => d).join(', ');
        base += ` on ${days}`;
      }
      break;
    case RecurrencePatternType.MONTHLY:
      base = `${interval}month${info.interval && info.interval > 1 ? 's' : ''}`;
      if (info.dayOfMonth) {
        base += ` on day ${info.dayOfMonth}`;
      }
      break;
    case RecurrencePatternType.YEARLY:
      base = `${interval}year${info.interval && info.interval > 1 ? 's' : ''}`;
      if (info.month) {
        const months = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        base += ` in ${months[info.month - 1]}`;
        
        if (info.dayOfMonth) {
          base += ` on day ${info.dayOfMonth}`;
        }
      }
      break;
    case RecurrencePatternType.CUSTOM:
      base = 'custom pattern';
      if (info.rule) {
        base += ` (${info.rule})`;
      }
      break;
  }
  
  // Add ending information
  if (info.end) {
    if (info.end.type === 'count') {
      base += `, ${info.end.count} time${info.end.count > 1 ? 's' : ''}`;
    } else if (info.end.type === 'until') {
      // Format the end date more nicely
      const endDate = new Date(info.end.until);
      base += `, until ${endDate.toLocaleDateString()}`;
    }
  }
  
  return `Repeats ${base}`;
}