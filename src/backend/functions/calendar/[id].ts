import { Handler, HandlerContext, HandlerResponse } from "@netlify/functions";
import { SupabaseClient } from '@supabase/supabase-js';
import { parseISO } from 'date-fns';

// Import shared types and utilities
import { HandlerEvent, RecurringCalendarEvent, RawEventUpdatePayload } from '../_shared/calendarTypes';
import { 
    corsHeaders, 
    getUserIdFromEvent, 
    createClientWithAuth, 
    isValidUUID,
    generateRecurringEventOccurrences // For GET /:id with expand_recurring
} from '../_shared/calendarUtils';

// Main handler for /api/calendar/:id (get by ID, update, delete)
const handler: Handler = async (event: HandlerEvent, _context: HandlerContext): Promise<HandlerResponse> => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return { statusCode: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Unauthorized: Invalid or missing token' }) };
  }

  const requestEventId = event.pathParameters?.id;
  if (!requestEventId) {
    // This should ideally not happen if Netlify routes correctly to [id].ts
    console.error('[calendar/[id].ts] Event ID missing in path parameters.');
    return { statusCode: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Bad Request: Event ID is required in the path.' }) };
  }

  if (!isValidUUID(requestEventId)) {
    return { statusCode: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Bad Request: Invalid Event ID format.' }) };
  }

  const responseHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
  let supabaseClient: SupabaseClient;
  try {
    const jwt = event.headers?.authorization?.substring(7);
    if (!jwt) throw new Error('JWT not found for creating authed Supabase client');
    supabaseClient = createClientWithAuth(jwt);
  } catch (error) {
    console.error('[calendar/[id].ts] Error creating authenticated Supabase client:', error);
    return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ message: 'Server error: Could not initialize authenticated database access.' }) };
  }

  try {
    if (event.httpMethod === 'GET') {
      return await handleGetEventById(event, userId, requestEventId, supabaseClient, responseHeaders);
    } else if (event.httpMethod === 'PUT') {
      return await handleUpdateEvent(event, userId, requestEventId, supabaseClient, responseHeaders);
    } else if (event.httpMethod === 'DELETE') {
      return await handleDeleteEvent(event, userId, requestEventId, supabaseClient, responseHeaders);
    } else {
      return { statusCode: 405, headers: responseHeaders, body: JSON.stringify({ message: `HTTP method ${event.httpMethod} is not supported.` }) };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[calendar/[id].ts] Unhandled error for event ID ${requestEventId}: ${errorMessage}`, error);
    return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ message: "An unexpected server error occurred.", error: errorMessage }) };
  }
};

async function handleGetEventById(
  event: HandlerEvent,
  userId: string,
  eventId: string,
  supabaseClient: SupabaseClient,
  responseHeaders: { [header: string]: string | number | boolean; }
): Promise<HandlerResponse> {
  console.log(`[calendar/[id].ts] --- handleGetEventById --- User: ${userId}, EventID: ${eventId}`);
  const { expand_recurring, start_date, end_date } = event.queryStringParameters || {};
  const expandRecurringBool = expand_recurring === 'true';

  const { data, error } = await supabaseClient
    .from('calendar_events')
    .select('*')
    .eq('event_id', eventId)
    // .eq('user_id', userId) // RLS handles this
    .single<RecurringCalendarEvent>();

  if (error) {
    const statusCode = error.code === 'PGRST116' ? 404 : 500; // PGRST116: Not found
    console.error(`[calendar/[id].ts] Error fetching event ${eventId} for user ${userId}:`, error);
    return { statusCode, headers: responseHeaders, body: JSON.stringify({ message: statusCode === 404 ? 'Event not found or access denied.' : 'Failed to fetch event.', details: error.message }) };
  }
  if (!data) { // Should be caught by PGRST116, but as a safeguard
      return { statusCode: 404, headers: responseHeaders, body: JSON.stringify({ message: 'Event not found.'}) };
  }

  if (expandRecurringBool && data.is_recurring && start_date && end_date) {
    try {
      const viewStartDate = parseISO(start_date);
      const viewEndDate = parseISO(end_date);
      if (isNaN(viewStartDate.valueOf()) || isNaN(viewEndDate.valueOf())) {
        return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ message: 'Invalid start_date or end_date for expanding recurring event.' }) };
      }
      const occurrences = generateRecurringEventOccurrences(data, viewStartDate, viewEndDate);
      // Note: The original code created synthetic event_ids for occurrences.
      // This might be desired by the frontend, but for now, occurrences are returned as part of the main event.
      const expandedEvent = { 
        ...data, 
        // Create a distinct ID for frontend keying if needed, otherwise occurrences are just data
        occurrences: occurrences.map(occ => ({...occ, instance_id: `${data.event_id}_${occ.start_time}`})) 
      };
      return { statusCode: 200, headers: responseHeaders, body: JSON.stringify(expandedEvent) };
    } catch {
      return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ message: 'Invalid date format for start_date or end_date.' }) };
    }
  }
  
  return { statusCode: 200, headers: responseHeaders, body: JSON.stringify(data) };
}

async function handleUpdateEvent(
  event: HandlerEvent,
  userId: string,
  eventId: string,
  supabaseClient: SupabaseClient,
  responseHeaders: { [header: string]: string | number | boolean; }
): Promise<HandlerResponse> {
  console.log(`[calendar/[id].ts] --- handleUpdateEvent --- User: ${userId}, EventID: ${eventId}`);
  if (!event.body) {
    return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ message: 'Bad Request: Missing request body' }) };
  }

  let updatePayload: Partial<Omit<RecurringCalendarEvent, 'event_id' | 'user_id' | 'created_at'>>;
  try {
    // Note: RawEventUpdatePayload might have fields like update_scope not directly part of RecurringCalendarEvent
    const rawPayload = JSON.parse(event.body) as RawEventUpdatePayload;
    // TODO: Handle update_scope ('single', 'future', 'all') if recurring event logic needs it.
    // For now, treating as a simple update to the master event or a single non-recurring event.
    const { update_scope, ...eventDataToUpdate } = rawPayload;
    if (update_scope) {
        console.log(`[calendar/[id].ts] Received update_scope: ${update_scope} - currently not implemented for full series edit.`);
    }
    updatePayload = eventDataToUpdate;

  } catch {
    return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ message: 'Bad Request: Invalid JSON format' }) };
  }

  // Validate dates if provided
  try {
    if (updatePayload.start_time) parseISO(updatePayload.start_time);
    if (updatePayload.end_time) parseISO(updatePayload.end_time);
    if (updatePayload.recurrence_end_date) parseISO(updatePayload.recurrence_end_date);
    if (updatePayload.exception_date) parseISO(updatePayload.exception_date);
  } catch {
    return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ message: 'Bad Request: Invalid date format. Use ISO 8601.' }) };
  }

  // user_id and created_at are omitted by the type and should not be in updatePayload from client data meant for update.
  // updated_at is set server-side.
  updatePayload.updated_at = new Date().toISOString();

  // Remove fields that are undefined to avoid PostgreSQL errors with undefined values
  Object.keys(updatePayload).forEach(key => {
    if (updatePayload[key as keyof typeof updatePayload] === undefined) {
      delete updatePayload[key as keyof typeof updatePayload];
    }
  });

  if (Object.keys(updatePayload).length === 1 && updatePayload.updated_at) {
      return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ message: 'Bad Request: No updatable fields provided.' }) };
  }

  const { data, error } = await supabaseClient
    .from('calendar_events')
    .update(updatePayload)
    .eq('event_id', eventId)
    // .eq('user_id', userId) // RLS handles this
    .select()
    .single<RecurringCalendarEvent>();

  if (error) {
    const statusCode = error.code === 'PGRST116' ? 404 : 500; // PGRST116: Not found / no rows updated (check RLS)
    console.error(`[calendar/[id].ts] Error updating event ${eventId} for user ${userId}:`, error);
    return { statusCode, headers: responseHeaders, body: JSON.stringify({ message: statusCode === 404 ? 'Event not found, access denied, or no changes made.' : 'Failed to update event.', details: error.message }) };
  }
  if (!data) { // Should be caught by PGRST116 or if .select() returns null
    return { statusCode: 404, headers: responseHeaders, body: JSON.stringify({ message: 'Event not found or no update performed.' }) };
  }

  return { statusCode: 200, headers: responseHeaders, body: JSON.stringify(data) };
}

async function handleDeleteEvent(
  event: HandlerEvent, // Parameter kept for consistency, though not directly used in this simplified version
  userId: string,
  eventId: string,
  supabaseClient: SupabaseClient,
  responseHeaders: { [header: string]: string | number | boolean; }
): Promise<HandlerResponse> {
  console.log(`[calendar/[id].ts] --- handleDeleteEvent --- User: ${userId}, EventID: ${eventId}`);

  // TODO: Implement logic for deleting series ('all') or future instances ('future') if applicable.
  // For now, this deletes a single event record (master or an exception).

  // First, verify the event exists and belongs to the user (or RLS handles it)
  // This also fetches the title for a more informative response, though not strictly necessary for delete op.
  const { data: existingEvent, error: fetchError } = await supabaseClient
    .from('calendar_events')
    .select('event_id, title') // RLS ensures user_id match
    .eq('event_id', eventId)
    .single();

  if (fetchError) {
    const statusCode = fetchError.code === 'PGRST116' ? 404 : 500;
    console.error(`[calendar/[id].ts] Error fetching event for delete verification ${eventId} for user ${userId}:`, fetchError);
    return { statusCode, headers: responseHeaders, body: JSON.stringify({ message: statusCode === 404 ? 'Event not found or access denied.' : 'Failed to verify event for deletion.', details: fetchError.message }) };
  }
  if (!existingEvent) {
      return { statusCode: 404, headers: responseHeaders, body: JSON.stringify({ message: 'Event not found for deletion.'}) };
  }

  const { error: deleteError } = await supabaseClient
    .from('calendar_events')
    .delete()
    .eq('event_id', eventId);
    // RLS will ensure the user can only delete their own events.

  if (deleteError) {
    console.error(`[calendar/[id].ts] Error deleting event ${eventId} for user ${userId}:`, deleteError);
    return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ message: 'Failed to delete event.', details: deleteError.message }) };
  }

  return { statusCode: 200, headers: responseHeaders, body: JSON.stringify({ success: true, message: `Event '${existingEvent.title}' (ID: ${eventId}) deleted successfully.` }) };
}

export { handler }; 