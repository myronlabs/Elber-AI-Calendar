// src/backend/types.ts

/**
 * Represents an import queue item for batch processing of contacts.
 * This aligns with the import_processing_queue table structure.
 */
export interface ImportQueueItem {
  id: string;
  user_id: string;
  provider: string; // 'google', 'csv', etc.
  contacts_to_import: string[]; // Array of contact identifiers to import
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at?: string;
  completed_at?: string;
  batch_size: number;
  current_batch?: number;
  total_batches?: number;
  processed_count?: number;
  error_details?: Record<string, unknown>;
  import_batch_id?: string; // UUID for tracking batch imports
}

/**
 * Re-export the Contact interface from domain.ts
 *
 * @deprecated Direct import from 'src/backend/types/domain.ts' is preferred for clarity and to avoid circular dependencies.
 */
export type { Contact } from './types/domain';

/**
 * Re-export ContactCreatePayload from the canonical location.
 *
 * @see src/backend/functions/services/types.ts
 */
export type { ContactCreatePayload } from './functions/services/types';

/**
 * Re-export ContactUpdatePayload from the canonical location.
 *
 * @see src/backend/functions/services/types.ts
 */
export type { ContactUpdatePayload } from './functions/services/types';

/**
 * Represents a Calendar Event.
 */
export interface CalendarEvent {
  event_id: string; // Was id, changed to match schema, non-optional for retrieved events
  user_id: string;
  title: string;
  description?: string | null; // Changed to allow null
  start_time: string; // Non-optional
  end_time: string;   // Non-optional
  is_all_day: boolean; // Indicates if this is an all-day event
  location?: string | null;  // Changed to allow null
  google_event_id?: string | null; // Added from schema
  zoom_meeting_id?: string | null; // Added from schema
  created_at: string; // Non-optional for retrieved events
  updated_at: string; // Non-optional for retrieved events
  // Attendees field removed as it's not in the schema table
}

// Comments moved above the type alias for clarity
// user_id will be inferred by the backend function.
// created_at and updated_at are set by the database.
// event_id is generated by the database.
// title, start_time, end_time are required from client for creation.
// description, location, google_event_id, zoom_meeting_id are optional.
export type CalendarEventCreatePayload = Omit<CalendarEvent, 'event_id' | 'user_id' | 'created_at' | 'updated_at'>;

// --- Integration Types ---

/**
 * Defines the supported integration providers.
 */
export type IntegrationProvider = 'google' | 'zoom';

/**
 * Represents the structure of an integration record, storing OAuth tokens
 * and related information for services like Google or Zoom.
 * Timestamps are represented as ISO 8601 strings, consistent with Supabase responses.
 */
export interface Integration {
  integration_id: string;          // UUID
  user_id: string;                 // UUID, foreign key to profiles.id
  provider: IntegrationProvider;
  access_token: string;
  refresh_token?: string | null;
  expires_at?: string | null;       // ISO 8601 date string
  scopes?: string[] | null;         // Array of granted OAuth scopes
  created_at: string;              // ISO 8601 date string
  updated_at: string;              // ISO 8601 date string
}

// --- Profile Type ---

/**
 * Represents the structure of a user's profile data as stored in the
 * public.profiles table, linked to auth.users.
 */
export interface Profile {
  id: string;                    // UUID, matches auth.users.id
  updated_at: string;            // ISO 8601 timestamp, non-nullable from DB
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  is_custom_verified: boolean;   // Indicates if the user has verified their email via our custom flow
}
