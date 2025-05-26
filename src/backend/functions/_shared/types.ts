import OpenAI from 'openai';
import type { Contact, ContactIdentifier, ContactUpdateData, CreateContactData, MinimalContactUpdateData, Paginated, GroupedContact, ContactWithFormatIssue } from '../../types/domain';

export interface DecodedJwt {
  sub: string; // User ID
  email?: string;
  // other JWT claims...
}

export type ConfirmationStatus = 'confirmed' | 'denied' | 'pending' | 'ambiguous';

// A more generic ChatMessage type that can accommodate variations
// across different assistant functions and align with OpenAI's expectations.
export type GenericChatMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null; // Content can be null for assistant messages with tool_calls
  name?: string; // Optional: Used by OpenAI for tool names or can be used to identify the source of a message.
  tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
  tool_call_id?: string; // For messages with role 'tool'
};

// Represents the structure for making a direct tool call,
// often when the client has executed a tool and is sending the result back,
// or when a function itself decides to execute a tool call.
export interface DirectToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // Arguments are stringified JSON
  };
}

// Type definition for tool execution results
export interface ToolExecutionResult {
  success?: boolean;
  data?: Record<string, unknown>;
  error?: string;
  details?: string;
  message?: string;
  conflictingEvents?: string[];
  events?: Array<Record<string, unknown>>;
}

// Type definition for confirmation context
export interface ConfirmationContext {
  entityId: string;     // ID of the entity being confirmed (e.g., contact_id)
  entityName: string;   // Name of the entity for display purposes
  type: 'calendar' | 'contact'; // Type of entity
  actionType: string;   // Action being confirmed (e.g., 'delete')
}

// A common structure for request bodies to assistant functions.
// It can accommodate conversation messages or direct tool calls/responses.
export interface AssistantRequestBody {
  messages: GenericChatMessage[];
  tool_call?: DirectToolCall; // For initiating a direct tool call from the client or another function
  tool_response?: { // For sending back the result of a tool execution
    tool_call_id: string;
    output: ToolExecutionResult; // The actual result from the tool
  };
  confirmationContext?: ConfirmationContext; // For scenarios where an assistant seeks confirmation
  stream?: boolean; // To indicate if a streaming response is expected
  currentUserEmail?: string | null; // Added to pass the current user's email
  localTimeZone?: string | null; // Add localTimeZone
}

// Type for a single contact record as typically returned by the contacts-api or used in search results
export type ContactData = CreateContactToolArgs & { 
  contact_id: string;
  user_id: string; // Assuming user_id is always present on a contact record from the DB
  created_at?: string; // Optional, depending on what the API returns
  updated_at?: string; // Optional, depending on what the API returns
  // Add any other universally present fields not in CreateContactToolArgs if necessary
};

// Type for the response from the /contacts-api endpoint (GET single or POST/PUT)
// For GET all, it would be ContactData[]
export type SingleContactApiResponse = ContactData;
export type MultipleContactsApiResponse = ContactData[];

// Type for the response from the /contacts-search endpoint
export interface ContactSearchApiResponse {
  contacts: ContactData[];
  total: number;
  pagination?: {
    hasMore: boolean;
    page: number;
    limit: number;
    totalPages?: number; // Often useful to have total pages
    totalResults?: number; // total can also be here, sometimes separate from root total
  };
  cached?: boolean;
  message?: string; // Sometimes search might return a message, e.g., "No results found"
}

// Base properties for creating a contact - to be used by ContactData
// This is effectively what CreateContactToolArgs from assistant-contacts.ts represents.
// If we define it here, assistant-contacts.ts can import it.
export interface BaseContactDetails {
  first_name: string;
  middle_name?: string | null;
  last_name: string | null;
  nickname?: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title?: string | null;
  address?: string | null;
  website?: string | null;
  birthday?: string | null;
  notes: string | null;
}

// Update ContactData to use BaseContactDetails if CreateContactToolArgs is not globally available
// This assumes CreateContactToolArgs is similar to BaseContactDetails.
// If CreateContactToolArgs is imported in assistant-contacts.ts from elsewhere, this redefinition might be redundant
// or need to replace that import.
// For now, I will *not* redefine CreateContactToolArgs here to avoid conflicts until I refactor assistant-contacts.ts itself.
// The current ContactData relies on CreateContactToolArgs being in scope where it's used (i.e. in assistant-contacts.ts)

// --- Tool Argument Types (moved from assistant-contacts.ts for centralization) ---

// Use a type alias instead of an empty interface to avoid linting error
export type CreateContactToolArgs = BaseContactDetails;
// Note: BaseContactDetails already covers all fields of CreateContactToolArgs.
// If there were additional fields specific to CreateContactToolArgs not in BaseContactDetails,
// they would be added here.

export interface UpdateContactToolArgs extends Partial<BaseContactDetails> {
  contact_id: string;
}

export interface FindContactsToolArgs {
  search_term: string | null; // Allow null for listing all contacts
  contact_id?: string | null;
  job_title_keywords?: string[] | null; // Array of keywords for job title search
  max_results?: number | null; // Maximum number of results to return
  birthday_query_type?: 'upcoming' | 'on_date' | 'in_month' | 'in_range' | null;
  date_range_start?: string | null; // YYYY-MM-DD
  date_range_end?: string | null; // YYYY-MM-DD
  month?: number | null; // 1-12
}

export interface ConfirmDeleteContactToolArgs {
  contact_id: string; 
  confirm: boolean;
  contact_name: string; // Name used for confirmation prompt, crucial for context
}

export interface FindDuplicateContactsToolArgs {
  threshold?: number | null;
  include_archived?: boolean | null;
  page?: number | null;
  limit?: number | null;
  sort_by?: 'confidence' | 'name' | 'email' | null;
}

export interface FindContactsWithImproperPhoneFormatsToolArgs {
  include_empty?: boolean | null;
  page?: number | null;
  limit?: number | null;
}

// Export all to ensure they are available for import elsewhere
export type { Contact, ContactIdentifier, ContactUpdateData, CreateContactData, MinimalContactUpdateData, Paginated, GroupedContact, ContactWithFormatIssue };