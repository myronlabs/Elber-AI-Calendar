// backend/types/domain.ts

/**
 * Type-safe discriminated union for contact identification strategies.
 * This allows identifying a contact in multiple ways without resorting to magic strings.
 */
export type ContactIdentifier = 
  | { type: 'id'; contact_id: string }
  | { type: 'name'; name: string }
  | { type: 'email'; email: string };

/**
 * Standard error structure for all contact operations
 */
export interface OperationError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Standard result type for all contact operations
 */
export interface ContactOperationResult<T> {
  success: boolean;
  data?: T;
  error?: OperationError;
}

/**
 * Represents a Contact, aligning with the Supabase 'contacts' table.
 * Includes all fields from the database schema plus import tracking fields.
 */
export interface Contact {
  // Core fields
  contact_id: string; // UUID, Primary Key
  user_id: string; // UUID, Foreign Key to auth.users(id)
  first_name?: string | null; // TEXT, Optional
  middle_name?: string | null; // TEXT, Optional
  last_name?: string | null; // TEXT, Optional
  nickname?: string | null; // TEXT, Optional
  email?: string | null; // TEXT, Optional
  phone?: string | null; // TEXT, Optional
  mobile_phone?: string | null; // TEXT, Optional
  work_phone?: string | null; // TEXT, Optional
  company?: string | null; // TEXT, Optional
  job_title?: string | null; // TEXT, Optional
  department?: string | null; // TEXT, Optional
  
  // Enhanced address fields
  street_address?: string | null; // TEXT, Primary street address
  street_address_2?: string | null; // TEXT, Optional second line of street address
  city?: string | null; // TEXT, City name
  state_province?: string | null; // TEXT, State or province
  postal_code?: string | null; // TEXT, Postal or ZIP code
  country?: string | null; // TEXT, Country name or ISO code
  
  // Formatted address field - automatically generated from address components
  formatted_address?: string | null; // TEXT, Full formatted address
  
  // Social media fields
  social_linkedin?: string | null; // TEXT, LinkedIn profile URL
  social_twitter?: string | null; // TEXT, Twitter/X handle
  
  // Tags and preferences
  tags?: string[] | null; // TEXT[], Array of tags for categorization
  preferred_contact_method?: string | null; // TEXT, Preferred method of contact
  timezone?: string | null; // TEXT, Contact timezone for scheduling
  language?: string | null; // TEXT, Preferred language for communication
  
  // Other fields
  website?: string | null; // TEXT, Optional
  birthday?: string | null; // DATE, Optional
  notes?: string | null; // TEXT, Optional
  created_at: string; // TIMESTAMPTZ, NOT NULL
  updated_at: string; // TIMESTAMPTZ, NOT NULL
  
  // Import tracking fields
  import_source?: string | null; // 'csv', 'google', 'microsoft'
  import_batch_id?: string | null; // UUID for tracking batch imports
  imported_at?: string | null; // ISO 8601 timestamp
  google_contact_id?: string | null; // Google People API resourceName
  
  // NOTE: 'full_name' is intentionally excluded, as it's derived from first_name and last_name
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

/**
 * Data for creating a contact
 */
export interface CreateContactData {
  first_name: string;
  middle_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile_phone?: string | null;
  work_phone?: string | null;
  company?: string | null;
  job_title?: string | null;
  department?: string | null;
  street_address?: string | null;
  street_address_2?: string | null;
  city?: string | null;
  state_province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  formatted_address?: string | null;
  social_linkedin?: string | null;
  social_twitter?: string | null;
  tags?: string[] | null;
  preferred_contact_method?: string | null;
  timezone?: string | null;
  language?: string | null;
  website?: string | null;
  birthday?: string | null;
  notes?: string | null;
}

/**
 * Data for updating a contact
 */
export interface ContactUpdateData extends Partial<CreateContactData> {
  contact_id: string;
}

/**
 * Minimal data for updating a contact
 */
export interface MinimalContactUpdateData extends Partial<Omit<Contact, 'contact_id' | 'user_id' | 'created_at' | 'updated_at'>> {
  contact_id: string;
  // We omit user_id, created_at, and updated_at as these should not be directly updatable by this minimal interface.
  // Other fields from Contact become optional.
}

/**
 * For paginated results
 */
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Group of contacts
 */
export interface GroupedContact {
  id: string;
  contacts: Contact[];
}

/**
 * Contact with formatting issues
 */
export interface ContactWithFormatIssue extends Contact {
  issue_type: string;
  suggested_fix?: string;
}

export enum AlertType {
  UPCOMING_BIRTHDAY = 'upcoming_birthday',
  MEETING_REMINDER = 'meeting_reminder',
  TASK_DUE = 'task_due',
  FOLLOW_UP = 'follow_up',
  CUSTOM = 'custom'
}

export enum AlertStatus {
  PENDING = 'pending',
  TRIGGERED = 'triggered',
  DISMISSED = 'dismissed',
  SNOOZED = 'snoozed'
}

export enum AlertPriority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3
}

export interface Alert {
  alert_id: string;
  user_id: string;
  title: string;
  description: string | null;
  alert_type: AlertType;
  status: AlertStatus;
  due_date: string; // ISO format
  created_at: string; // ISO format
  updated_at: string; // ISO format
  snoozed_until: string | null; // ISO format
  dismissed_at: string | null; // ISO format
  priority: AlertPriority;
  contact_id: string | null;
  event_id: string | null;
  recurring: boolean;
  recurrence_rule: string | null; // iCal RRule format
  parent_alert_id: string | null;
  metadata: Record<string, unknown> | null;
  tags: string[] | null;
}

export type AlertIdentifier = 
  | { type: 'id'; alert_id: string }
  | { type: 'title_user'; title: string; user_id: string };

export interface CreateAlertPayload {
  title: string;
  description?: string | null;
  alert_type: AlertType;
  due_date: string; // ISO format
  priority?: AlertPriority;
  contact_id?: string | null;
  event_id?: string | null;
  recurring?: boolean;
  recurrence_rule?: string | null;
  metadata?: Record<string, unknown> | null;
  tags?: string[] | null;
}

export interface UpdateAlertPayload {
  title?: string;
  description?: string | null;
  alert_type?: AlertType;
  status?: AlertStatus;
  due_date?: string; // ISO format
  snoozed_until?: string | null; // ISO format
  priority?: AlertPriority;
  contact_id?: string | null;
  event_id?: string | null;
  recurring?: boolean;
  recurrence_rule?: string | null;
  metadata?: Record<string, unknown> | null;
  tags?: string[] | null;
}
