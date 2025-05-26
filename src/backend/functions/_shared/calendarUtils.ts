import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { jwtDecode } from 'jwt-decode';
import { addDays, addMonths, addYears, differenceInMilliseconds, addMilliseconds, parseISO } from 'date-fns';
import { HandlerEvent, DecodedAppJwt, BaseCalendarEvent } from './calendarTypes'; // Import shared types
import { RecurringCalendarEvent, RecurrencePatternType, extractRecurrenceInfo } from '../../types/recurrence'; // Assuming this is the correct path

// CORS headers for all responses
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

/**
 * Helper function to validate UUID format
 */
export const isValidUUID = (uuid: string): boolean => {
  if (!uuid) return false;
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  return uuidRegex.test(uuid);
};

/**
 * Helper to get user ID from JWT
 */
export const getUserIdFromEvent = (event: HandlerEvent): string | null => {
  const authHeader = event.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7); // Remove "Bearer " prefix
    try {
      const decodedToken = jwtDecode<DecodedAppJwt>(token);
      return decodedToken.sub || null;
    } catch (error: unknown) {
      console.error('[calendarUtils.ts] Error decoding JWT:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }
  return null;
};

/**
 * Creates a Supabase client with the user's JWT for operations that need to respect RLS
 */
export const createClientWithAuth = (jwt: string): SupabaseClient => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[calendarUtils.ts] Missing Supabase URL or anon key');
    throw new Error('Server configuration error: Missing Supabase URL or anonymous key.');
  }
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`
      }
    }
  });
};

/**
 * Generate occurrences of a recurring event between start and end dates
 * Returns a list of event instances
 */
export function generateRecurringEventOccurrences(
  baseEvent: RecurringCalendarEvent,
  viewStartDate: Date,
  viewEndDate: Date
): BaseCalendarEvent[] { // Return type changed to BaseCalendarEvent for broader use
  if (!baseEvent.is_recurring || !baseEvent.recurrence_pattern) {
    const baseEventStart = parseISO(baseEvent.start_time);
    const baseEventEnd = parseISO(baseEvent.end_time);
    if (baseEventStart < viewEndDate && baseEventEnd > viewStartDate) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { event_id, user_id, created_at, updated_at, ...restOfBaseEvent } = baseEvent;
      return [restOfBaseEvent as BaseCalendarEvent]; 
    }
    return [];
  }

  const recurrenceInfo = extractRecurrenceInfo(baseEvent);
  if (!recurrenceInfo) {
    const baseEventStart = parseISO(baseEvent.start_time);
    const baseEventEnd = parseISO(baseEvent.end_time);
    if (baseEventStart < viewEndDate && baseEventEnd > viewStartDate) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { event_id, user_id, created_at, updated_at, ...restOfBaseEvent } = baseEvent;
      return [restOfBaseEvent as BaseCalendarEvent];
    }
    return [];
  }

  const occurrences: BaseCalendarEvent[] = [];
  const firstEventStartDate = parseISO(baseEvent.start_time);
  const firstEventEndDate = parseISO(baseEvent.end_time);
  
  const eventDurationMs = differenceInMilliseconds(firstEventEndDate, firstEventStartDate);

  const REASONABLE_MAX_OCCURRENCES_CAP = 730; 
  let definedCount = Infinity;
  if (recurrenceInfo.end?.type === 'count' && typeof recurrenceInfo.end.count === 'number' && recurrenceInfo.end.count > 0) {
    definedCount = recurrenceInfo.end.count;
  }

  const maxOccurrences = Math.min(definedCount, REASONABLE_MAX_OCCURRENCES_CAP);
  console.log(`[CALENDAR DEBUG] generateRecurringEventOccurrences: event_id=${baseEvent.event_id}, series_id=${baseEvent.series_id || 'N/A'}, firstEventStart=${firstEventStartDate.toISOString()}, viewStart=${viewStartDate instanceof Date && !isNaN(viewStartDate.valueOf()) ? viewStartDate.toISOString() : 'Invalid Date'}, viewEnd=${viewEndDate instanceof Date && !isNaN(viewEndDate.valueOf()) ? viewEndDate.toISOString() : 'Invalid Date'}, effectiveMaxOccurrences=${maxOccurrences}`);

  const seriesEndDateLimit = recurrenceInfo.end?.type === 'until' && recurrenceInfo.end.until
                          ? parseISO(recurrenceInfo.end.until) 
                          : addYears(firstEventStartDate, 5);

  const iterationLimitDate = viewEndDate < seriesEndDateLimit ? viewEndDate : seriesEndDateLimit;
  
  const interval = typeof recurrenceInfo.interval === 'number' && recurrenceInfo.interval > 0 
                  ? recurrenceInfo.interval 
                  : 1;

  let currentInstanceStartDate = firstEventStartDate;
  let occurrenceCount = 0;

  while (currentInstanceStartDate <= iterationLimitDate && occurrenceCount < maxOccurrences) {
    const currentInstanceEndDate = addMilliseconds(currentInstanceStartDate, eventDurationMs);

    if (currentInstanceStartDate < viewEndDate && currentInstanceEndDate > viewStartDate) {
      // Extract only the needed fields and exclude database-specific fields
      const relevantBaseEventData = {
        title: baseEvent.title,
        description: baseEvent.description,
        location: baseEvent.location,
        start_time: currentInstanceStartDate.toISOString(),
        end_time: addMilliseconds(currentInstanceStartDate, eventDurationMs).toISOString(),
        is_all_day: baseEvent.is_all_day,
        google_event_id: baseEvent.google_event_id,
        zoom_meeting_id: baseEvent.zoom_meeting_id,
        parent_event_id: baseEvent.parent_event_id,
        is_exception: baseEvent.is_exception,
        exception_date: baseEvent.exception_date,
        series_id: baseEvent.series_id || baseEvent.event_id,
        is_recurring: true
      };

      const eventCopy: BaseCalendarEvent = relevantBaseEventData;
      occurrences.push(eventCopy);
    }
    
    occurrenceCount++;
    if (occurrenceCount >= maxOccurrences) {
      break;
    }

    let nextPotentialStartDate: Date;
    switch (recurrenceInfo.pattern) {
      case RecurrencePatternType.DAILY:
        nextPotentialStartDate = addDays(currentInstanceStartDate, interval);
        break;
      case RecurrencePatternType.WEEKLY:
        nextPotentialStartDate = addDays(currentInstanceStartDate, 7 * interval);
        break;
      case RecurrencePatternType.MONTHLY:
        nextPotentialStartDate = addMonths(currentInstanceStartDate, interval);
        break;
      case RecurrencePatternType.YEARLY:
        nextPotentialStartDate = addYears(currentInstanceStartDate, interval);
        break;
      default:
        nextPotentialStartDate = addDays(currentInstanceStartDate, interval > 0 ? interval : 1);
    }
    currentInstanceStartDate = nextPotentialStartDate;
  }

  return occurrences;
} 