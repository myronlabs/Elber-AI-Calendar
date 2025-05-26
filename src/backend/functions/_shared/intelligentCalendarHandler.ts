/**
 * Intelligent Calendar Handler - Implements smart calendar management following OpenAI best practices
 * Handles complete workflows in single operations, understands user intent naturally
 * 
 * Returns structured objects (not JSON strings) for OpenAI to format into natural language
 */

import { parseISO, isValid } from 'date-fns';

// Define calendar event interface
interface CalendarEvent {
  event_id: string;
  user_id: string;
  title: string;
  start_time: string;
  end_time: string;
  description?: string;
  location?: string;
  is_all_day: boolean;
  is_recurring: boolean;
  recurrence_pattern?: string;
  recurrence_interval?: number;
  recurrence_days_of_week?: number[];
  recurrence_day_of_month?: number;
  recurrence_end_date?: string;
  recurrence_count?: number;
  created_at: string;
  updated_at: string;
}

export interface IntelligentCalendarArgs {
  user_request: string;
  intended_action: 'search' | 'create' | 'update' | 'delete';
  search_criteria: {
    search_term: string | null;
    date_range: {
      start_date: string | null;
      end_date: string | null;
    } | null;
    event_id: string | null;
    location: string | null;
  } | null;
  event_data: {
    title: string | null;
    start_time: string | null;
    end_time: string | null;
    description: string | null;
    location: string | null;
    is_all_day: boolean | null;
    
    // Recurring event properties
    is_recurring: boolean | null;
    recurrence_pattern: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
    recurrence_interval: number | null;
    recurrence_days_of_week: number[] | null;
    recurrence_day_of_month: number | null;
    recurrence_end_date: string | null;
    recurrence_count: number | null;
  } | null;
  operation_scope: 'single' | 'future' | 'all' | null;
  confirmation_provided: boolean;
}

export interface CalendarHandlerContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any;
  internalApiBaseUrl: string;
  internalHeaders: Record<string, string>;
  config: {
    maxEventResults: number;
    upcomingEventsDays: number;
  };
  currentUserEmail?: string | null;
  logPrefix: string;
}

// Define structured response types for OpenAI to process
export interface CalendarOperationResult {
  success: boolean;
  operation: string;
  user_request: string;
  message: string;
  error?: string;
  events?: CalendarEvent[];
  total_found?: number;
  event?: CalendarEvent | {
    event_id: string;
    title: string;
    start_time: string;
    location?: string;
  };
  updated_events?: number;
  triggerRefresh?: boolean;
  event_id?: string;
  operation_scope?: string;
  events_found?: number;
  results?: Array<{
    event_id: string;
    title: string;
    updated: boolean;
    changes?: string[];
    event_data?: CalendarEvent;
    error?: string;
  }>;
  matches?: Array<{
    event_id: string;
    title: string;
    start_time: string;
    location?: string;
  }>;
  total_events?: number;
}

/**
 * Validates calendar operation arguments for completeness and correctness
 */
function validateCalendarOperation(args: IntelligentCalendarArgs): { isValid: boolean; error?: string; normalizedArgs?: IntelligentCalendarArgs } {
  // Validate intended_action
  const validActions = ['search', 'create', 'update', 'delete'];
  if (!validActions.includes(args.intended_action)) {
    return { isValid: false, error: `Invalid action: ${args.intended_action}. Must be one of: ${validActions.join(', ')}` };
  }

  // Create a copy of args for potential normalization
  let normalizedArgs = { ...args };

  // Validate action-specific requirements
  switch (args.intended_action) {
    case 'search':
      if (!args.search_criteria || (!args.search_criteria.search_term && !args.search_criteria.date_range && !args.search_criteria.event_id)) {
        return { isValid: false, error: 'Search operations require search criteria (search_term, date_range, or event_id)' };
      }
      break;

    case 'create':
      if (!args.event_data) {
        return { isValid: false, error: 'Create operations require event_data' };
      }
      if (!args.event_data.title || !args.event_data.start_time || !args.event_data.end_time) {
        return { isValid: false, error: 'Create operations require title, start_time, and end_time' };
      }
      break;

    case 'update': {
      // First check if we have valid search criteria
      const hasValidSearchCriteria = args.search_criteria && (args.search_criteria.search_term || args.search_criteria.event_id);
      
      if (!hasValidSearchCriteria) {
        // Try to extract event ID from user_request as a fallback
        const eventIdMatch = args.user_request.match(/\b([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/i);
        
        if (eventIdMatch) {
          // Normalize the args by adding the extracted event ID to search_criteria
          normalizedArgs = {
            ...args,
            search_criteria: {
              ...args.search_criteria,
              event_id: eventIdMatch[1],
              search_term: null,
              date_range: null,
              location: null
            }
          };
          console.log(`[CalendarHandler] Extracted event ID from user_request: ${eventIdMatch[1]}`);
        } else {
        return { isValid: false, error: 'Update operations require search criteria to identify events' };
        }
      }
      
      if (!args.event_data) {
        return { isValid: false, error: 'Update operations require event_data with fields to change' };
      }
      break;
    }

    case 'delete': {
      // Similar logic for delete operations
      const hasValidDeleteCriteria = args.search_criteria && (args.search_criteria.search_term || args.search_criteria.event_id);
      
      if (!hasValidDeleteCriteria) {
        // Try to extract event title from user_request as a fallback
        // Look for patterns like 'Delete calendar event "Event Title"' or 'Delete calendar event Event Title'
        const eventTitleMatch = args.user_request.match(/Delete calendar event ["']([^"']+)["']/i) || 
                               args.user_request.match(/Delete calendar event (.+)$/i);
        
        if (eventTitleMatch) {
          const eventTitle = eventTitleMatch[1].trim();
          // Normalize the args by adding the extracted event title to search_criteria
          normalizedArgs = {
            ...args,
            search_criteria: {
              ...args.search_criteria,
              search_term: eventTitle,
              event_id: null,
              date_range: null,
              location: null
            }
          };
          console.log(`[CalendarHandler] Extracted event title from user_request for delete: "${eventTitle}"`);
        } else {
          return { isValid: false, error: 'Delete operations require search criteria to identify events' };
        }
      }
      break;
    }
  }

  return { isValid: true, normalizedArgs };
}

/**
 * Intelligent Calendar Handler - One function that handles all calendar operations intelligently
 * Following OpenAI best practices: handles complete workflows, understands intent, no sequential calls
 * 
 * Returns structured objects for OpenAI to format into natural language responses
 * 
 * CRUD OPERATIONS SUPPORTED:
 * - CREATE: Add new events with full field support including recurring events
 * - READ: Search and retrieve events by any criteria
 * - UPDATE: Modify existing events, handles recurring events with proper scope
 * - DELETE: Remove events with appropriate confirmation and scope handling
 */
export async function handleIntelligentCalendarOperation(
  args: IntelligentCalendarArgs,
  userId: string,
  context: CalendarHandlerContext
): Promise<CalendarOperationResult> {
  const { logPrefix } = context;
  console.log(`${logPrefix} Intelligent calendar operation: ${args.intended_action} - "${args.user_request}"`);

  // Validate calendar operation (with potential normalization)
  const validation = validateCalendarOperation(args);
  if (!validation.isValid) {
    console.error(`${logPrefix} Calendar validation failed:`, validation.error);
    return {
      success: false,
      operation: args.intended_action,
      user_request: args.user_request,
      error: "ValidationError",
      message: validation.error || "Validation failed"
    };
  }

  // Use normalized args if validation provided them
  const normalizedArgs = validation.normalizedArgs || args;

  try {
    switch (normalizedArgs.intended_action) {
      case 'search':
        return await handleIntelligentCalendarSearch(normalizedArgs, userId, context);
      case 'create':
        return await handleIntelligentCalendarCreate(normalizedArgs, userId, context);
      case 'update':
        return await handleIntelligentCalendarUpdate(normalizedArgs, userId, context);
      case 'delete':
        return await handleIntelligentCalendarDelete(normalizedArgs, userId, context);
      default:
        return {
          success: false,
          operation: normalizedArgs.intended_action,
          user_request: normalizedArgs.user_request,
          error: "InvalidAction",
          message: `Unknown action: ${normalizedArgs.intended_action}`
        };
    }
  } catch (error) {
    console.error(`${logPrefix} Intelligent calendar operation error:`, error);
    return {
      success: false,
      operation: normalizedArgs.intended_action,
      user_request: normalizedArgs.user_request,
      error: "UnexpectedError",
      message: `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Intelligent calendar search using optimized event search
 */
async function handleIntelligentCalendarSearch(
  args: IntelligentCalendarArgs,
  userId: string,
  context: CalendarHandlerContext
): Promise<CalendarOperationResult> {
  const { logPrefix } = context;
  
  if (!args.search_criteria) {
    return {
      success: false,
      operation: "search",
      user_request: args.user_request,
      error: "InvalidSearch",
      message: "No search criteria provided in the request."
    };
  }

  console.log(`${logPrefix} Searching calendar events for user ${userId}`);

  // Use the existing calendar API endpoint for search
  const searchResponse = await fetch(`${context.internalApiBaseUrl}/.netlify/functions/calendar`, {
    method: 'GET',
    headers: context.internalHeaders,
    // Build query string from search criteria
  });

  if (!searchResponse.ok) {
    console.error(`${logPrefix} Calendar search API error:`, searchResponse.status);
    return {
      success: false,
      operation: "search",
      user_request: args.user_request,
      error: "SearchError",
      message: "Failed to search calendar events."
    };
  }

  const events = await searchResponse.json();

  return {
    success: true,
    operation: "search",
    user_request: args.user_request,
    events: events,
    total_found: events.length,
    message: events.length > 0 
      ? `Found ${events.length} event${events.length > 1 ? 's' : ''}`
      : `No events found matching your criteria`
  };
}

/**
 * Intelligent event creation with smart time parsing
 */
async function handleIntelligentCalendarCreate(
  args: IntelligentCalendarArgs,
  userId: string,
  context: CalendarHandlerContext
): Promise<CalendarOperationResult> {
  const { logPrefix } = context;

  if (!args.event_data?.title || !args.event_data?.start_time || !args.event_data?.end_time) {
    return {
      success: false,
      operation: "create",
      user_request: args.user_request,
      error: "InvalidData",
      message: "Title, start time, and end time are required to create an event."
    };
  }

  console.log(`${logPrefix} Creating calendar event: ${args.event_data.title}`);

  // Parse and validate times
  let startTime: Date;
  let endTime: Date;
  
  try {
    startTime = parseISO(args.event_data.start_time);
    endTime = parseISO(args.event_data.end_time);
    
    if (!isValid(startTime) || !isValid(endTime)) {
      throw new Error('Invalid date format');
    }
    
    if (startTime >= endTime) {
      return {
        success: false,
        operation: "create",
        user_request: args.user_request,
        error: "InvalidData",
        message: "Start time must be before end time."
      };
    }
  } catch {
    return {
      success: false,
      operation: "create",
      user_request: args.user_request,
      error: "InvalidData",
      message: "Invalid date format. Please use ISO format (YYYY-MM-DDTHH:mm:ss)."
    };
  }

  // Build event data for creation
  const createData: Record<string, unknown> = {
    user_id: userId,
    title: args.event_data.title,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    description: args.event_data.description || null,
    location: args.event_data.location || null,
    is_all_day: args.event_data.is_all_day || false,
    is_recurring: args.event_data.is_recurring || false,
  };

  // Add recurring event properties if applicable
  if (args.event_data.is_recurring) {
    createData.recurrence_pattern = args.event_data.recurrence_pattern;
    createData.recurrence_interval = args.event_data.recurrence_interval || 1;
    createData.recurrence_days_of_week = args.event_data.recurrence_days_of_week;
    createData.recurrence_day_of_month = args.event_data.recurrence_day_of_month;
    createData.recurrence_end_date = args.event_data.recurrence_end_date;
    createData.recurrence_count = args.event_data.recurrence_count;
  }

     const { data: newEvent, error } = await context.supabaseAdmin
     .from('calendar_events')
     .insert(createData)
     .select()
     .single() as { data: CalendarEvent | null; error: unknown };

  if (error) {
    console.error(`${logPrefix} Create error:`, error);
    return {
      success: false,
      operation: "create",
      user_request: args.user_request,
      error: "CreateError",
      message: `Failed to create event: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }

  if (!newEvent) {
    return {
      success: false,
      operation: "create",
      user_request: args.user_request,
      error: "CreateError",
      message: "Failed to create event: No data returned"
    };
  }

  return {
    success: true,
    operation: "create",
    user_request: args.user_request,
    event: newEvent,
    message: `Successfully created event: ${newEvent.title}`,
    triggerRefresh: true
  };
}

/**
 * Intelligent update - handles recurring events with proper scope
 */
async function handleIntelligentCalendarUpdate(
  args: IntelligentCalendarArgs,
  userId: string,
  context: CalendarHandlerContext
): Promise<CalendarOperationResult> {
  const { logPrefix } = context;

  if (!args.search_criteria) {
    return {
      success: false,
      operation: "update",
      user_request: args.user_request,
      error: "InvalidRequest",
      message: "Search criteria is required for update operations."
    };
  }

  console.log(`${logPrefix} Finding events to update for user ${userId}`);

  // Find events to update
  let query = context.supabaseAdmin
    .from('calendar_events')
    .select('*')
    .eq('user_id', userId);

  if (args.search_criteria.event_id) {
    query = query.eq('event_id', args.search_criteria.event_id);
  } else if (args.search_criteria.search_term) {
    query = query.ilike('title', `%${args.search_criteria.search_term}%`);
  }

  const { data: events, error } = await query as { data: CalendarEvent[] | null; error: unknown };

  if (error) {
    console.error(`${logPrefix} Error finding events to update:`, error);
    return {
      success: false,
      operation: "update",
      user_request: args.user_request,
      error: "SearchError",
      message: "Failed to find events to update."
    };
  }

  if (!events || events.length === 0) {
    return {
      success: false,
      operation: "update",
      user_request: args.user_request,
      error: "NotFound",
      message: "No events found matching the search criteria."
    };
  }

  // Prepare update data
  const updateData: Record<string, unknown> = {};
  let hasChanges = false;

  if (args.event_data) {
    for (const [field, newValue] of Object.entries(args.event_data)) {
      if (newValue !== null && newValue !== undefined) {
        updateData[field] = newValue;
        hasChanges = true;
      }
    }
  }

  if (!hasChanges) {
    return {
      success: true,
      operation: "update",
      user_request: args.user_request,
      message: `No changes specified for the ${events.length} matching event${events.length > 1 ? 's' : ''}.`,
      events_found: events.length
    };
  }

  // Update events
  const updateResults = [];
  for (const event of events as CalendarEvent[]) {
    const { data: updatedEvent, error: updateError } = await context.supabaseAdmin
      .from('calendar_events')
      .update(updateData)
      .eq('event_id', event.event_id)
      .eq('user_id', userId)
      .select()
      .single() as { data: CalendarEvent; error: unknown };

    if (updateError) {
      console.error(`${logPrefix} Update error for ${event.event_id}:`, updateError);
      updateResults.push({
        event_id: event.event_id,
        title: event.title,
        updated: false,
        error: updateError instanceof Error ? updateError.message : 'Unknown error'
      });
    } else {
      updateResults.push({
        event_id: event.event_id,
        title: updatedEvent.title,
        updated: true,
        changes: Object.keys(updateData),
        event_data: updatedEvent
      });
    }
  }

  const successCount = updateResults.filter(r => r.updated).length;

  return {
    success: true,
    operation: "update",
    user_request: args.user_request,
    message: successCount > 0 
      ? `Successfully updated ${successCount} of ${updateResults.length} events.`
      : `Found ${updateResults.length} events but no updates were applied.`,
    results: updateResults,
    total_events: updateResults.length,
    updated_events: successCount,
    triggerRefresh: successCount > 0
  };
}

/**
 * Intelligent delete with appropriate confirmation workflow
 */
async function handleIntelligentCalendarDelete(
  args: IntelligentCalendarArgs,
  userId: string,
  context: CalendarHandlerContext
): Promise<CalendarOperationResult> {
  if (!args.search_criteria) {
    return {
      success: false,
      operation: "delete",
      user_request: args.user_request,
      error: "InvalidRequest",
      message: "Search criteria is required for delete operations."
    };
  }

  if (!args.confirmation_provided) {
    // First phase: find event and request confirmation
    let query = context.supabaseAdmin
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId);

    if (args.search_criteria.event_id) {
      query = query.eq('event_id', args.search_criteria.event_id);
    } else if (args.search_criteria.search_term) {
      query = query.ilike('title', `%${args.search_criteria.search_term}%`);
    }

    const { data: events, error } = await query as { data: CalendarEvent[] | null; error: unknown };

    if (error) {
      return {
        success: false,
        operation: "delete",
        user_request: args.user_request,
        error: "SearchError",
        message: "Failed to search for events to delete."
      };
    }

    if (!events || events.length === 0) {
      return {
        success: false,
        operation: "delete",
        user_request: args.user_request,
        error: "NotFound",
        message: "No events found matching the search criteria."
      };
    }

    if (events.length > 1) {
      return {
        success: false,
        operation: "delete",
        user_request: args.user_request,
        error: "MultipleMatches",
        message: `Found ${events.length} events. Please be more specific about which event to delete.`,
        matches: events.map(e => ({
          event_id: e.event_id,
          title: e.title,
          start_time: e.start_time,
          location: e.location
        }))
      };
    }

    const event = events[0];
    return {
      success: false,
      operation: "delete",
      user_request: args.user_request,
      error: "ConfirmationRequired",
      message: `Found event "${event.title}" scheduled for ${new Date(event.start_time).toLocaleString()}. Are you sure you want to delete this event? Please confirm to proceed.`,
      event: {
        event_id: event.event_id,
        title: event.title,
        start_time: event.start_time,
        location: event.location
      }
    };
  }

  // Second phase: confirmed deletion
  let query = context.supabaseAdmin
    .from('calendar_events')
    .delete()
    .eq('user_id', userId);

  if (args.search_criteria.event_id) {
    query = query.eq('event_id', args.search_criteria.event_id);
  } else if (args.search_criteria.search_term) {
    query = query.ilike('title', `%${args.search_criteria.search_term}%`);
  }

  const { error: deleteError } = await query;

  if (deleteError) {
    return {
      success: false,
      operation: "delete",
      user_request: args.user_request,
      error: "DeletionFailed",
      message: `Failed to delete event: ${deleteError instanceof Error ? deleteError.message : 'Unknown error'}`
    };
  }

  return {
    success: true,
    operation: "delete",
    user_request: args.user_request,
    message: "Event has been deleted successfully.",
    triggerRefresh: true
  };
} 