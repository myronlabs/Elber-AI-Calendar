// src/frontend/types/assistantShared.ts

/**
 * Represents a function that the AI model can call.
 */
export interface ToolFunction {
  name: string;
  arguments: string; // JSON string of arguments
}

/**
 * Represents a tool call requested by the AI model.
 */
export interface ToolCall {
  id: string; // Unique ID for the tool call
  type: 'function';
  function: ToolFunction;
}

/**
 * Represents a message in the conversation, compatible with OpenAI's API structure.
 */
export interface ApiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null; // Content can be null, e.g., for assistant messages with only tool calls
  name?: string; // Optional: for tool messages, the name of the tool that was called
  tool_calls?: ToolCall[];
  tool_call_id?: string; // Optional: for tool messages, the ID of the tool call this message is a result for
  _metadata?: { // Optional metadata, e.g. for usage stats or refresh flags
    usage?: unknown;
    tool_calls_made?: number;
    should_refresh_contacts?: boolean;
    should_refresh_calendar?: boolean;
    should_refresh_alerts?: boolean;
    // Add other metadata fields as needed
  };
}

/**
 * Available action types for entities
 */
export type EntityActionType = 'create' | 'update' | 'delete' | 'find';

/**
 * Available entity types for confirmation
 */
export type EntityType = 'calendar' | 'contact';

/**
 * Context information about a pending confirmation action
 */
export interface ConfirmationContext {
  entityId: string;               // ID of the entity being confirmed (e.g., contact_id, event_id)
  entityName: string;             // Name of the entity for display purposes
  type: EntityType;               // Type of entity
  actionType: EntityActionType;   // Action being confirmed (e.g., 'delete', 'create')
  requiresFollowUp?: boolean;     // Flag to indicate if additional questions are needed (default: false)
}

/**
 * Represents a pending confirmation in the assistant router
 */
export interface PendingConfirmation extends ConfirmationContext {
  toolCallId?: string;            // ID of the assistant's tool call that prompted confirmation
  toolName?: string;              // Name of the tool function that prompted confirmation
  timestamp: number;              // When this confirmation was created
  parameters?: Record<string, unknown>; // Additional parameters for the action
  originalEntityId?: string;      // Original entity ID from the API parameters
}

/**
 * Configuration for tools that should not prompt for additional information
 */
export interface NoFollowUpToolConfig {
  toolName: string;               // Name of the tool
  entityType: EntityType;         // Type of entity this tool operates on
  actionType: EntityActionType;   // Action this tool performs
}

/**
 * Known proceed message patterns
 * 
 * NOTE: These are fallback patterns only. The primary confirmation analysis
 * is performed by the backend's confirmationAnalyzer service, which uses OpenAI
 * for natural language understanding and provides much better results. These patterns
 * are only used as a backup in case the confirmation analyzer is unavailable.
 */
export const PROCEED_MESSAGE_PATTERNS: RegExp[] = [
  // Basic affirmative responses
  /^(yes|yeah|yep|yup|ok|okay|sure|fine)$/i,
  /^proceed$/i,
  /^confirm$/i,
  /^continue$/i,
  /^go\s+ahead$/i,
  /^do\s+it$/i,
  
  // Combined affirmative phrases
  /^yes,?\s+(please|proceed|confirm|go\s+ahead|that'?s\s+(correct|right))$/i,
  /^proceed\s+with\s+(this|that|it)$/i,
  /^confirm\s+(this|that|it|and\s+proceed)$/i,
  /^go\s+ahead\s+(and\s+proceed|with\s+(this|that|it))?$/i,
  
  // Action-specific phrases
  /^(delete|remove)\s+(it|this|that|them)$/i,
  /^yes,?\s+(delete|remove)\s+(it|this|that|them)$/i
];

/**
 * Common interface for all tool execution results
 */
export interface ToolExecutionResult {
  success: boolean;
  message?: string;
  error?: string;
  details?: unknown;
}

/**
 * Direct tool execution response from backend
 */
export interface DirectToolExecutionResponse {
  tool_call_id: string;
  role: 'tool';
  content: string; // Stringified JSON or error
}

/**
 * Interface for find_contacts tool arguments
 */
export interface FindContactsArgs {
  search_term: string | null;
  contact_id?: string | null;
}

/**
 * Interface for find_duplicate_contacts tool arguments
 */
export interface FindDuplicateContactsArgs {
  threshold?: number | null;
  include_archived?: boolean | null;
  page?: number | null;
  limit?: number | null;
  sort_by?: 'confidence' | 'name' | 'email' | null;
}

/**
 * Interface for contact match information in duplicate search results
 */
export interface ContactMatch {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  confidence?: number;
  match_reasons?: string;
}

/**
 * Interface for duplicate contacts group
 */
export interface DuplicateContactGroup {
  contact: ContactMatch;
  duplicates: ContactMatch[];
}

/**
 * Interface for find_duplicate_contacts tool result
 */
export interface FindDuplicateContactsResult extends ToolExecutionResult {
  duplicate_groups?: DuplicateContactGroup[];
  total_groups?: number;
  total_duplicates?: number;
  pagination?: {
    current_page: number;
    total_pages: number;
    limit: number;
    has_more: boolean;
  };
}

/**
 * Type guard to check if an object is a FindDuplicateContactsResult
 */
export function isFindDuplicateContactsResult(obj: unknown): obj is FindDuplicateContactsResult {
  if (typeof obj !== 'object' || obj === null) return false;
  
  const result = obj as Record<string, unknown>;
  return (
    typeof result.success === 'boolean' &&
    (result.duplicate_groups === undefined || Array.isArray(result.duplicate_groups))
  );
}
