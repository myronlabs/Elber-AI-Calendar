import { HandlerEvent as BaseHandlerEvent } from "@netlify/functions";
import { JwtPayload } from 'jwt-decode';
import { RecurringCalendarEvent, RecurrencePatternType } from '../../types/recurrence'; // Assuming this is the correct path

// Extended HandlerEvent to include pathParameters property
export interface HandlerEvent extends BaseHandlerEvent {
  pathParameters?: { 
    id?: string;
    [key: string]: string | undefined;
  };
}

/**
 * Interface for the decoded JWT payload, extending JwtPayload
 */
export interface DecodedAppJwt extends JwtPayload {
  sub?: string; // Subject (user ID) is standard in JwtPayload
}

/**
 * Base interface for calendar events, can be extended for specific uses.
 * This references the more detailed RecurringCalendarEvent from the main types.
 */
export type BaseCalendarEvent = Omit<RecurringCalendarEvent, 'event_id' | 'user_id' | 'created_at' | 'updated_at'>;

// Interface for the payload when updating an event (raw from client)
export interface RawEventUpdatePayload extends Partial<Omit<RecurringCalendarEvent, 'event_id' | 'created_at' | 'user_id'>> {
  update_scope?: string; // 'single', 'future', 'all' - will be removed before DB op
}

// Interface for creating a new calendar event (payload from client)
export interface NewCalendarEvent {
  title: string;
  start_time: string; // ISO string
  end_time: string; // ISO string
  description?: string;
  location?: string;
  is_all_day?: boolean;
  google_event_id?: string | null;
  zoom_meeting_id?: string | null;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePatternType | null;
  recurrence_interval?: number | null;
  recurrence_day_of_week?: Record<string, boolean> | null; // jsonb in database
  recurrence_day_of_month?: number | null;
  recurrence_month?: number | null;
  recurrence_end_date?: string | null; // ISO string
  recurrence_count?: number | null;
  parent_event_id?: string | null; // UUID
  is_exception?: boolean;
  recurrence_rule?: string | null;
  exception_date?: string | null; // ISO string
  series_id?: string | null; // UUID
  recurrence_timezone?: string | null;
}

// Re-exporting RecurringCalendarEvent for convenience if it's directly used by functions
export type { RecurringCalendarEvent }; 