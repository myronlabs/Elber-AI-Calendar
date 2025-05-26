// src/backend/types/payloads.ts
import type { Contact } from './domain';

/**
 * Payload for creating a new contact.
 * Excludes system-generated fields like contact_id, user_id (if set by system), created_at, and updated_at.
 */
export type ContactCreatePayload = Omit<Contact, 'contact_id' | 'user_id' | 'created_at' | 'updated_at'>;

/**
 * Payload for updating an existing contact.
 * Makes all fields optional and includes the contact_id.
 */
export type ContactUpdatePayload = Partial<Omit<Contact, 'user_id' | 'created_at' | 'updated_at'>> & {
  contact_id: string;
};

/**
 * Arguments for the confirm_delete_contact tool function.
 * Includes all required fields for confirming contact deletion.
 */
export interface ConfirmDeleteContactToolArgs {
  contact_id: string;
  confirm: boolean;
  contact_name: string; // Required for confirmation
}

/**
 * Arguments for the delete_contact tool function.
 */
export interface DeleteContactToolArgs {
  contact_id: string;
}

/**
 * Arguments for the find_contacts tool function.
 */
export interface FindContactsToolArgs {
  search_term?: string | null; // Optional - if not provided, list all contacts
  contact_id?: string;        // Optional - prioritized if provided
}

// Add other payload types here as needed, e.g., CalendarEventCreatePayload, CalendarEventUpdatePayload
