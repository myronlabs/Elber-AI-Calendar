// services/domain.ts
// Copy of the necessary types from backend/types/domain.ts

/**
 * Represents a Contact, aligning with the Supabase 'contacts' table.
 */
export interface Contact {
  contact_id: string; // UUID, Primary Key
  user_id: string; // UUID, Foreign Key to auth.users(id)
  first_name: string | null; // TEXT, Optional
  middle_name?: string | null; // TEXT, Optional
  last_name: string | null; // TEXT, Optional
  nickname?: string | null; // TEXT, Optional
  email: string | null; // TEXT, Optional
  phone: string | null; // TEXT, Optional
  company: string | null; // TEXT, Optional
  job_title?: string | null; // TEXT, Optional
  address?: string | null; // TEXT, Optional
  website?: string | null; // TEXT, Optional
  birthday?: string | null; // DATE, Optional
  notes: string | null; // TEXT, Optional
  created_at: string; // TIMESTAMPTZ, NOT NULL
  updated_at: string; // TIMESTAMPTZ, NOT NULL
  google_contact_id?: string | null; // ID from Google Contacts API
  import_source?: string | null; // Source of the import, e.g., "google", "csv"
  imported_at?: string | null; // Timestamp of import
  import_batch_id?: string | null; // ID for a batch import operation
  // Derived or FTS related fields that might come from DB but not part of core entity
  fts_document?: string | null; 
}

/**
 * Represents a Calendar Event.
 * This is a basic structure; it can be expanded based on requirements.
 */
export interface CalendarEvent {
  id: string;
  user_id: string;
  title: string;
  start_time: string; // ISO 8601 format
  end_time: string; // ISO 8601 format
  description?: string | null;
  location?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;                    // UUID, matches auth.users.id
  updated_at: string;            // ISO 8601 timestamp, non-nullable from DB
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  is_custom_verified: boolean;   // Indicates if the user has verified their email via our custom flow
}