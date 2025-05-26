"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const jwt_decode_1 = require("jwt-decode"); // For decoding JWTs
const supabase_js_1 = require("@supabase/supabase-js"); // Import SupabaseClient
const recurrence_1 = require("../types/recurrence");
const date_fns_1 = require("date-fns"); // Added date-fns imports
/**
 * Helper function to validate UUID format
 */
const isValidUUID = (uuid) => {
    if (!uuid)
        return false;
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return uuidRegex.test(uuid);
};
/**
 * Helper to get user ID from JWT
 */
const getUserIdFromEvent = (event) => {
    const authHeader = event.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7); // Remove "Bearer " prefix
        try {
            const decodedToken = (0, jwt_decode_1.jwtDecode)(token);
            return decodedToken.sub || null;
        }
        catch (error) {
            console.error('[calendar.ts] Error decoding JWT:', error instanceof Error ? error.message : String(error));
            return null;
        }
    }
    return null;
};
/**
 * Creates a Supabase client with the user's JWT for operations that need to respect RLS
 */
const createClientWithAuth = (jwt) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('[calendar.ts] Missing Supabase URL or anon key');
        // Consistently throw an error here for the caller to handle or for it to bubble up
        throw new Error('Server configuration error: Missing Supabase URL or anonymous key.');
    }
    return (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey, {
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
 * This is a simplified implementation that can be replaced with a more robust library
 */
function generateRecurringEventOccurrences(baseEvent, viewStartDate, viewEndDate) {
    if (!baseEvent.is_recurring || !baseEvent.recurrence_pattern) {
        const baseEventStart = (0, date_fns_1.parseISO)(baseEvent.start_time);
        const baseEventEnd = (0, date_fns_1.parseISO)(baseEvent.end_time);
        if (baseEventStart < viewEndDate && baseEventEnd > viewStartDate) {
            // Return a compatible type, ensure all required fields of the return type are present
            // This simplified path should still strip event_id etc.
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { event_id: _event_id, user_id: _user_id, created_at: _created_at, updated_at: _updated_at, ...restOfBaseEvent } = baseEvent;
            return [restOfBaseEvent];
        }
        return [];
    }
    const recurrenceInfo = (0, recurrence_1.extractRecurrenceInfo)(baseEvent);
    if (!recurrenceInfo) {
        const baseEventStart = (0, date_fns_1.parseISO)(baseEvent.start_time);
        const baseEventEnd = (0, date_fns_1.parseISO)(baseEvent.end_time);
        if (baseEventStart < viewEndDate && baseEventEnd > viewStartDate) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { event_id: _event_id, user_id: _user_id, created_at: _created_at, updated_at: _updated_at, ...restOfBaseEvent } = baseEvent;
            return [restOfBaseEvent];
        }
        return [];
    }
    const occurrences = [];
    const firstEventStartDate = (0, date_fns_1.parseISO)(baseEvent.start_time);
    const firstEventEndDate = (0, date_fns_1.parseISO)(baseEvent.end_time);
    // Use date-fns for duration calculation
    const eventDurationMs = (0, date_fns_1.differenceInMilliseconds)(firstEventEndDate, firstEventStartDate);
    // More reasonable default for production, e.g., ~2 years of daily events or 10 years of weekly
    const REASONABLE_MAX_OCCURRENCES_CAP = 730;
    let definedCount = Infinity;
    if (recurrenceInfo.end?.type === 'count' && typeof recurrenceInfo.end.count === 'number' && recurrenceInfo.end.count > 0) {
        definedCount = recurrenceInfo.end.count;
    }
    // Use the smaller of the event's defined count (if any and positive) or our safety cap.
    // If no count is defined by the event, or it's not positive, use the safety cap.
    const maxOccurrences = Math.min(definedCount, REASONABLE_MAX_OCCURRENCES_CAP);
    console.log(`[CALENDAR DEBUG] generateRecurringEventOccurrences: event_id=${baseEvent.event_id}, series_id=${baseEvent.series_id || 'N/A'}, firstEventStart=${firstEventStartDate.toISOString()}, viewStart=${viewStartDate instanceof Date && !isNaN(viewStartDate.valueOf()) ? viewStartDate.toISOString() : 'Invalid Date'}, viewEnd=${viewEndDate instanceof Date && !isNaN(viewEndDate.valueOf()) ? viewEndDate.toISOString() : 'Invalid Date'}, effectiveMaxOccurrences=${maxOccurrences}`);
    const seriesEndDateLimit = recurrenceInfo.end?.type === 'until' && recurrenceInfo.end.until
        ? (0, date_fns_1.parseISO)(recurrenceInfo.end.until)
        : (0, date_fns_1.addYears)(firstEventStartDate, 5); // Default to 5 years if 'never' or no end date for safety
    // The loop should check against the overall series end, and also the view window's end
    const iterationLimitDate = viewEndDate < seriesEndDateLimit ? viewEndDate : seriesEndDateLimit;
    const interval = typeof recurrenceInfo.interval === 'number' && recurrenceInfo.interval > 0
        ? recurrenceInfo.interval
        : 1;
    let currentInstanceStartDate = firstEventStartDate;
    let occurrenceCount = 0;
    // Create recurring instances
    while (currentInstanceStartDate <= iterationLimitDate && occurrenceCount < maxOccurrences) {
        const currentInstanceEndDate = (0, date_fns_1.addMilliseconds)(currentInstanceStartDate, eventDurationMs);
        // Check if the current instance overlaps with the view window [viewStartDate, viewEndDate)
        // An event overlaps if: event.start < view.end AND event.end > view.start
        if (currentInstanceStartDate < viewEndDate && currentInstanceEndDate > viewStartDate) {
            // Create event copy by explicitly picking the fields we want to keep
            const relevantBaseEventData = {
                title: baseEvent.title,
                description: baseEvent.description,
                location: baseEvent.location,
                is_all_day: baseEvent.is_all_day,
                is_recurring: baseEvent.is_recurring,
                series_id: baseEvent.series_id,
                exception_date: baseEvent.exception_date
            };
            const eventCopy = {
                ...relevantBaseEventData, // Spread relevant parts of baseEvent first
                start_time: currentInstanceStartDate.toISOString(),
                end_time: currentInstanceEndDate.toISOString(),
                series_id: baseEvent.series_id || baseEvent.event_id, // Keep series_id, ensure it's set from original if it's the first in series
                is_recurring: true, // This instance is part of a recurring series
                // parent_event_id: baseEvent.event_id, // This is for exceptions, not regular generated occurrences
            };
            occurrences.push(eventCopy);
        }
        occurrenceCount++;
        if (occurrenceCount >= maxOccurrences) {
            break;
        }
        // Advance to next occurrence's start date using date-fns
        let nextPotentialStartDate;
        switch (recurrenceInfo.pattern) {
            case recurrence_1.RecurrencePatternType.DAILY:
                nextPotentialStartDate = (0, date_fns_1.addDays)(currentInstanceStartDate, interval);
                break;
            case recurrence_1.RecurrencePatternType.WEEKLY:
                // Simplified: advance by interval weeks.
                // This does not handle specific daysOfWeek if they are set in recurrenceInfo.daysOfWeek.
                // A full solution for "every N weeks on specific daysOfWeek" is more complex.
                nextPotentialStartDate = (0, date_fns_1.addDays)(currentInstanceStartDate, 7 * interval);
                break;
            case recurrence_1.RecurrencePatternType.MONTHLY:
                nextPotentialStartDate = (0, date_fns_1.addMonths)(currentInstanceStartDate, interval);
                break;
            case recurrence_1.RecurrencePatternType.YEARLY:
                nextPotentialStartDate = (0, date_fns_1.addYears)(currentInstanceStartDate, interval);
                break;
            default: // Includes RecurrencePatternType.CUSTOM or unhandled
                // Fallback: advance by interval days to ensure progress
                nextPotentialStartDate = (0, date_fns_1.addDays)(currentInstanceStartDate, interval > 0 ? interval : 1);
        }
        currentInstanceStartDate = nextPotentialStartDate;
    }
    return occurrences;
}
/**
 * Main handler function for the calendar API
 */
const handler = async (event, _context) => {
    // CORS headers for all responses
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    };
    // Handle OPTIONS request (CORS preflight)
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: corsHeaders,
            body: ''
        };
    }
    // Get user ID from JWT token
    const userId = getUserIdFromEvent(event);
    if (!userId) {
        return {
            statusCode: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Unauthorized: Invalid or missing authentication token' })
        };
    }
    // --- BEGIN ID EXTRACTION LOGIC ---
    let manuallyExtractedId = null;
    if (event.path) {
        // Example path: /.netlify/functions/calendar/b6f328c1-1f31-408d-a8de-71ab4a34757f
        // Or from an API gateway: /api/calendar/b6f328c1-1f31-408d-a8de-71ab4a34757f
        const pathParts = event.path.split('/');
        // The ID is expected to be the last part if the path matches /.../calendar/[id]
        // Check if 'calendar' is the second to last part, then the ID is the last.
        if (pathParts.length > 1 && pathParts[pathParts.length - 2] === 'calendar') {
            const potentialId = pathParts[pathParts.length - 1];
            if (isValidUUID(potentialId)) { // Use your existing UUID validator
                manuallyExtractedId = potentialId;
                console.log(`[calendar.ts] Manually extracted event ID from path: ${manuallyExtractedId}`);
            }
        }
    }
    // --- END ID EXTRACTION LOGIC ---
    // Supabase client for database access
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl) {
        console.error(`[calendar.ts] Missing Supabase URL. Available env vars: ${Object.keys(process.env).filter(key => key.includes('SUPABASE')).join(', ')}`);
        return {
            statusCode: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Server configuration error: Missing Supabase URL' })
        };
    }
    if (!supabaseKey) {
        console.error(`[calendar.ts] Missing Supabase key. Available env vars: ${Object.keys(process.env).filter(key => key.includes('SUPABASE')).join(', ')}`);
        return {
            statusCode: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Server configuration error: Missing Supabase key' })
        };
    }
    console.log(`[calendar.ts] Using Supabase URL: ${supabaseUrl?.substring(0, 15)}... and key starting with: ${supabaseKey?.substring(0, 5)}...`);
    const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
    try {
        // GET all events or search
        if (event.httpMethod === 'GET' && !event.pathParameters?.id) {
            const { search_term, start_date, end_date, limit = '50', offset = '0', force_refresh = 'false' } = event.queryStringParameters || {};
            const limitNum = parseInt(limit, 10);
            const offsetNum = parseInt(offset, 10);
            const forceRefresh = force_refresh === 'true';
            console.log(`[calendar.ts] GET query params: search_term=${search_term}, start_date=${start_date}, end_date=${end_date}, limit=${limitNum}, offset=${offsetNum}, force_refresh=${forceRefresh}`);
            // OPTIMIZATION: Use the cached RPC function for better performance
            try {
                // First try to use the optimized cached function if available
                const { data: cachedResults, error: cacheError } = await supabase.rpc('get_calendar_events_cached', {
                    p_user_id: userId,
                    p_query: search_term || null,
                    p_start_date: start_date || null,
                    p_end_date: end_date || null,
                    p_limit: limitNum,
                    p_offset: offsetNum,
                    p_force_refresh: forceRefresh
                });
                if (!cacheError && cachedResults) {
                    console.log(`[calendar.ts] Successfully retrieved calendar events from optimized cached function. Found ${cachedResults.events?.length || 0} events.`);
                    // Return the cached results directly
                    return {
                        statusCode: 200,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        body: JSON.stringify(cachedResults.events || [])
                    };
                }
                else {
                    console.log(`[calendar.ts] Cache function unavailable or error: ${cacheError?.message}. Falling back to standard query.`);
                }
            }
            catch (rpcError) {
                console.error(`[calendar.ts] Error using optimized RPC: ${rpcError}. Falling back to standard query.`);
                // Continue with the standard query path below
            }
            // Fall back to standard event fetching logic
            return await handleGetRequest(event, userId, null, { ...corsHeaders, 'Content-Type': 'application/json' });
        }
        else if (event.httpMethod === 'GET' && event.pathParameters?.id) {
            // Handle GET for a specific event by ID
            return await handleGetRequest(event, userId, event.pathParameters.id, { ...corsHeaders, 'Content-Type': 'application/json' });
        }
        else if (event.httpMethod === 'POST') {
            // Handle POST request for creating new events
            return await handlePostRequest(event, userId, { ...corsHeaders, 'Content-Type': 'application/json' });
        }
        else if (event.httpMethod === 'PUT') {
            const requestEventId = event.pathParameters?.id || manuallyExtractedId;
            return await handlePutRequest(event, userId, requestEventId || null, { ...corsHeaders, 'Content-Type': 'application/json' });
        }
        else if (event.httpMethod === 'DELETE') {
            const requestEventId = event.pathParameters?.id || manuallyExtractedId;
            console.log(`[calendar.ts] DELETE: Effective requestEventId before calling handleDeleteRequest: ${requestEventId}`);
            return await handleDeleteRequest(event, userId, requestEventId || null, { ...corsHeaders, 'Content-Type': 'application/json' });
        }
        else {
            // Handle unsupported methods
            return {
                statusCode: 405,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: `HTTP method ${event.httpMethod} is not supported on this endpoint.` })
            };
        }
    }
    catch (error) {
        // Main error handler for all uncaught errors
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[calendar.ts] Unhandled error in main handler: ${errorMessage}`, error);
        return {
            statusCode: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: "An unexpected server error occurred.",
                error: errorMessage,
                stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
            })
        };
    }
};
exports.handler = handler;
// New helper function to encapsulate GET request logic
async function handleGetRequest(event, userId, requestEventId, responseHeaders) {
    try { // Inner try specifically for GET logic
        console.log("--- calendar.ts handling GET request ---  User:", userId);
        const authHeader = event.headers?.authorization;
        let supabaseDataClient; // Use SupabaseClient type
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            try {
                supabaseDataClient = createClientWithAuth(token);
                console.log('[calendar.ts] GET: Using RLS-aware auth client for data fetching.');
            }
            catch (clientError) {
                const errorMessage = clientError instanceof Error ? clientError.message : String(clientError);
                console.error('[calendar.ts] GET: Error creating auth client for RLS.', errorMessage);
                return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ message: "Internal server error: Could not initialize authenticated database access.", details: errorMessage }) };
            }
        }
        else {
            console.error('[calendar.ts] GET: Auth header not found after userId validation.');
            return { statusCode: 401, headers: responseHeaders, body: JSON.stringify({ message: "Unauthorized: Missing token for data fetching operations." }) };
        }
        console.log("[CALENDAR DEBUG] Request params:", event.queryStringParameters);
        const searchTerm = event.queryStringParameters?.search_term || null;
        const startDateString = event.queryStringParameters?.start_date || null;
        const endDateString = event.queryStringParameters?.end_date || null;
        const expandRecurring = event.queryStringParameters?.expand_recurring === 'true';
        if (requestEventId) {
            return fetchEventById(requestEventId, supabaseDataClient, expandRecurring, startDateString, endDateString, responseHeaders, userId);
        }
        else if (searchTerm) {
            return searchEvents(searchTerm, supabaseDataClient, expandRecurring, startDateString, endDateString, responseHeaders, userId);
        }
        else {
            return listEvents(supabaseDataClient, expandRecurring, startDateString, endDateString, responseHeaders, userId);
        }
    }
    catch (getLogicError) {
        const errorMessage = getLogicError instanceof Error ? getLogicError.message : String(getLogicError);
        const errorStack = getLogicError instanceof Error ? getLogicError.stack : undefined;
        console.error("[calendar.ts] Error in GET handler logic:", getLogicError);
        return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ message: "Internal server error during GET request processing.", error: errorMessage, stack: process.env.NODE_ENV === 'development' ? errorStack : undefined }) };
    }
}
// Helper function to fetch a single event by ID
async function fetchEventById(eventId, supabaseClient, expandRecurring, startDateString, endDateString, responseHeaders, userId // Added userId for logging
) {
    if (!isValidUUID(eventId)) {
        return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ message: `Invalid event ID format: ${eventId}. Must be a UUID.` }) };
    }
    console.log(`[calendar.ts] Fetching event by ID: ${eventId} for user ${userId}`);
    const { data: eventData, error } = await supabaseClient
        .from('calendar_events')
        .select('*')
        .eq('event_id', eventId)
        .single();
    if (error) {
        console.error(`[calendar.ts] Error fetching event by ID ${eventId} for user ${userId}:`, error);
        const statusCode = error.code === 'PGRST116' ? 404 : 500;
        return { statusCode, headers: responseHeaders, body: JSON.stringify({ message: `Event not found or access denied.`, details: error.message }) };
    }
    if (eventData && expandRecurring && eventData.is_recurring && startDateString && endDateString) {
        const viewStartDate = (0, date_fns_1.parseISO)(startDateString);
        const viewEndDate = (0, date_fns_1.parseISO)(endDateString);
        const occurrences = generateRecurringEventOccurrences(eventData, viewStartDate, viewEndDate);
        const expandedEvent = {
            ...eventData,
            occurrences: occurrences.map(occ => ({ ...occ, event_id: `${eventData.event_id}_instance_${occ.start_time}` }))
        };
        return { statusCode: 200, headers: responseHeaders, body: JSON.stringify(expandedEvent) };
    }
    return { statusCode: 200, headers: responseHeaders, body: JSON.stringify(eventData || null) };
}
// Helper function to search events
async function searchEvents(searchTerm, supabaseClient, expandRecurring, startDateString, endDateString, responseHeaders, userId // Added userId for logging
) {
    console.log(`[calendar.ts] Searching events with term: "${searchTerm}" for user ${userId}, start: ${startDateString}, end: ${endDateString}`);
    let query = supabaseClient
        .from('calendar_events')
        .select('*');
    // .eq('user_id', userId) // RLS should handle
    // Handle search term
    if (searchTerm) {
        const searchTerms = searchTerm.split(/\s*\/\s*|\s*,\s*|\s+/).map(term => term.trim()).filter(term => term.length > 0);
        if (searchTerms.length > 0) {
            const orConditions = searchTerms.map(term => `title.ilike.%${term}%`).join(',');
            query = query.or(orConditions);
            console.log(`[calendar.ts] Applied search term conditions: ${orConditions}`);
        }
    }
    if (startDateString) {
        query = query.gte('start_time', startDateString);
        console.log(`[calendar.ts] Applied start_date filter: >= ${startDateString}`);
    }
    if (endDateString) {
        // Corrected to find events STARTING within the date range, or implement full overlap
        // For simplicity, using start_time <= endDateString.
        // Full overlap would be: .lte('start_time', endDateString).gte('end_time', startDateString)
        query = query.lte('start_time', endDateString);
        console.log(`[calendar.ts] Applied end_date filter (for start_time): <= ${endDateString}`);
    }
    const { data: events, error } = await query.returns();
    if (error) {
        console.error(`[calendar.ts] Error searching events for user ${userId}:`, error);
        return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ message: "Failed to search events.", details: error.message }) };
    }
    if (expandRecurring && events && events.length > 0 && startDateString && endDateString) {
        const expandedEvents = [];
        const viewStartDate = (0, date_fns_1.parseISO)(startDateString);
        const viewEndDate = (0, date_fns_1.parseISO)(endDateString);
        for (const event of events) {
            if (event.is_recurring) {
                const occurrences = generateRecurringEventOccurrences(event, viewStartDate, viewEndDate);
                for (const occurrence of occurrences) {
                    expandedEvents.push({
                        ...occurrence,
                        event_id: (typeof event.event_id === 'string' ? event.event_id : String(event.event_id)) + `_instance_${occurrence.start_time}`
                    });
                }
            }
            else {
                expandedEvents.push(event);
            }
        }
        return { statusCode: 200, headers: responseHeaders, body: JSON.stringify(expandedEvents) };
    }
    return { statusCode: 200, headers: responseHeaders, body: JSON.stringify(events || []) };
}
// Helper function to list all events (with optional date range)
async function listEvents(supabaseClient, expandRecurring, startDateString, endDateString, responseHeaders, userId // Added userId for logging
) {
    console.log(`[calendar.ts] Fetching all events for user ${userId} (with date range if provided)`);
    let query = supabaseClient
        .from('calendar_events')
        .select('*');
    // .eq('user_id', userId); // RLS will handle user ID filtering
    if (startDateString && endDateString) {
        console.log(`[calendar.ts] Applying date range: ${startDateString} to ${endDateString}`);
        // Create an OR condition for events that overlap with the given range
        // An event overlaps if: event.start_time < query.end_date AND event.end_time > query.start_date
        query = query.or(`start_time.lte.${endDateString},end_time.gte.${startDateString},and(start_time.gte.${startDateString},end_time.lte.${endDateString})`);
    }
    else if (startDateString) {
        query = query.gte('start_time', startDateString);
    }
    else if (endDateString) {
        // This case might be less common (only end_date), but supported
        query = query.lte('end_time', endDateString);
    }
    // Add ordering
    query = query.order('start_time', { ascending: true });
    const { data: events, error } = await query.returns();
    if (error) {
        console.error(`[calendar.ts] Error fetching events for user ${userId}:`, error);
        return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ message: "Failed to fetch events.", details: error.message }) };
    }
    if (expandRecurring && events && events.length > 0 && startDateString && endDateString) {
        const expandedEvents = [];
        const viewStartDate = (0, date_fns_1.parseISO)(startDateString);
        const viewEndDate = (0, date_fns_1.parseISO)(endDateString);
        for (const event of events) {
            if (event.is_recurring) {
                const occurrences = generateRecurringEventOccurrences(event, viewStartDate, viewEndDate);
                for (const occurrence of occurrences) {
                    expandedEvents.push({
                        ...occurrence,
                        event_id: (typeof event.event_id === 'string' ? event.event_id : String(event.event_id)) + `_instance_${occurrence.start_time}`
                    });
                }
            }
            else {
                // Only add non-recurring events if they fall within the view window
                // This check is important if the main query was broader than the expansion window
                const eventStart = (0, date_fns_1.parseISO)(event.start_time);
                const eventEnd = (0, date_fns_1.parseISO)(event.end_time);
                if (eventStart < viewEndDate && eventEnd > viewStartDate) {
                    expandedEvents.push(event);
                }
            }
        }
        return { statusCode: 200, headers: responseHeaders, body: JSON.stringify(expandedEvents) };
    }
    return { statusCode: 200, headers: responseHeaders, body: JSON.stringify(events || []) };
}
async function handlePutRequest(event, userId, requestEventId, responseHeaders) {
    console.log(`[calendar.ts] --- handlePutRequest --- User: ${userId}, EventID: ${requestEventId}`);
    if (!requestEventId) {
        console.error('[calendar.ts] PUT Error: Missing event ID');
        return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ message: 'Bad Request: Event ID is required for update' }) };
    }
    if (!isValidUUID(requestEventId)) {
        console.error(`[calendar.ts] PUT Error: Invalid UUID format for requestEventId: ${requestEventId}`);
        return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ message: 'Bad Request: Invalid Event ID format' }) };
    }
    if (!event.body) {
        console.error('[calendar.ts] PUT Error: Missing request body');
        return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ message: 'Bad Request: Missing request body' }) };
    }
    let updatePayload;
    try {
        console.log('[calendar.ts] PUT: Raw event.body:', event.body);
        const rawPayload = JSON.parse(event.body);
        console.log('[calendar.ts] PUT: Parsed rawPayload:', JSON.stringify(rawPayload, null, 2));
        // Remove update_scope if present (not part of the database schema)
        const { update_scope, ...eventDataToUpdate } = rawPayload;
        if (update_scope) {
            console.log(`[calendar.ts] PUT: Received update_scope: ${update_scope} - currently not implemented for full series edit.`);
        }
        updatePayload = eventDataToUpdate;
    }
    catch (parseError) {
        const parseErrorMessage = parseError instanceof Error ? parseError.message : String(parseError);
        console.error('[calendar.ts] PUT Error: Invalid JSON format - ', parseErrorMessage);
        return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ message: 'Bad Request: Invalid JSON format', details: parseErrorMessage }) };
    }
    // Validate dates if provided
    try {
        if (updatePayload.start_time)
            (0, date_fns_1.parseISO)(updatePayload.start_time);
        if (updatePayload.end_time)
            (0, date_fns_1.parseISO)(updatePayload.end_time);
        if (updatePayload.recurrence_end_date)
            (0, date_fns_1.parseISO)(updatePayload.recurrence_end_date);
        if (updatePayload.exception_date)
            (0, date_fns_1.parseISO)(updatePayload.exception_date);
    }
    catch (dateError) {
        const dateErrorMessage = dateError instanceof Error ? dateError.message : String(dateError);
        console.error('[calendar.ts] PUT Error: Invalid date format - ', dateErrorMessage);
        return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ message: 'Bad Request: Invalid date format. Use ISO 8601.', details: dateErrorMessage }) };
    }
    const jwt = event.headers?.authorization?.substring(7);
    if (!jwt) {
        console.error('[calendar.ts] PUT Error: Unauthorized - Missing token.');
        return { statusCode: 401, headers: responseHeaders, body: JSON.stringify({ message: 'Unauthorized: Missing token for update operation.' }) };
    }
    let supabaseClientWithAuth;
    try {
        supabaseClientWithAuth = createClientWithAuth(jwt);
    }
    catch (clientError) {
        const clientErrorMessage = clientError instanceof Error ? clientError.message : String(clientError);
        console.error('[calendar.ts] PUT Error: Could not initialize authenticated database client - ', clientErrorMessage);
        return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ message: 'Server error: Could not initialize authenticated database client.', details: clientErrorMessage }) };
    }
    // Set updated_at timestamp
    updatePayload.updated_at = new Date().toISOString();
    // Remove fields that are undefined to avoid PostgreSQL errors
    Object.keys(updatePayload).forEach(key => {
        if (updatePayload[key] === undefined) {
            delete updatePayload[key];
        }
    });
    if (Object.keys(updatePayload).length === 1 && updatePayload.updated_at) {
        console.error('[calendar.ts] PUT Error: No updatable fields provided.');
        return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ message: 'Bad Request: No updatable fields provided.' }) };
    }
    console.log('[calendar.ts] PUT: Attempting to update event with payload:', JSON.stringify(updatePayload, null, 2));
    const { data, error } = await supabaseClientWithAuth
        .from('calendar_events')
        .update(updatePayload)
        .eq('event_id', requestEventId)
        .select()
        .single();
    if (error) {
        const statusCode = error.code === 'PGRST116' ? 404 : 500; // PGRST116: Not found / no rows updated
        console.error(`[calendar.ts] PUT Error: Supabase update error for event ${requestEventId}:`, JSON.stringify(error, null, 2));
        return { statusCode, headers: responseHeaders, body: JSON.stringify({ message: statusCode === 404 ? 'Event not found, access denied, or no changes made.' : 'Failed to update event.', details: error.message, code: error.code }) };
    }
    if (!data) {
        console.error(`[calendar.ts] PUT Error: No data returned after update for event ${requestEventId}.`);
        return { statusCode: 404, headers: responseHeaders, body: JSON.stringify({ message: 'Event not found or no update performed.' }) };
    }
    console.log('[calendar.ts] PUT: Successfully updated event:', JSON.stringify(data, null, 2));
    return { statusCode: 200, headers: responseHeaders, body: JSON.stringify(data) };
}
async function handlePostRequest(event, userId, responseHeaders) {
    console.log(`[calendar.ts] --- handlePostRequest --- User: ${userId}`);
    if (!event.body) {
        console.error('[calendar.ts] Create Event Error: Missing request body');
        return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ message: 'Bad Request: Missing request body' }) };
    }
    let newEventData;
    try {
        console.log('[calendar.ts] Create Event: Raw event.body:', event.body);
        newEventData = JSON.parse(event.body);
        console.log('[calendar.ts] Create Event: Parsed newEventData:', JSON.stringify(newEventData, null, 2));
    }
    catch (error) {
        const parseErrorMessage = error instanceof Error ? error.message : String(error);
        console.error('[calendar.ts] Create Event Error: Invalid JSON format - ', parseErrorMessage);
        return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ message: 'Bad Request: Invalid JSON format', details: parseErrorMessage }) };
    }
    if (!newEventData.title || !newEventData.start_time || !newEventData.end_time) {
        console.error('[calendar.ts] Create Event Error: Missing required fields (title, start_time, end_time). Provided:', JSON.stringify(newEventData, null, 2));
        return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ message: 'Bad Request: Missing required fields (title, start_time, end_time)' }) };
    }
    try {
        (0, date_fns_1.parseISO)(newEventData.start_time);
        (0, date_fns_1.parseISO)(newEventData.end_time);
        if (newEventData.recurrence_end_date)
            (0, date_fns_1.parseISO)(newEventData.recurrence_end_date);
        if (newEventData.exception_date)
            (0, date_fns_1.parseISO)(newEventData.exception_date);
    }
    catch (dateError) {
        const dateErrorMessage = dateError instanceof Error ? dateError.message : String(dateError);
        console.error('[calendar.ts] Create Event Error: Invalid date format - ', dateErrorMessage, 'Provided dates:', { start: newEventData.start_time, end: newEventData.end_time, recurrence_end: newEventData.recurrence_end_date, exception: newEventData.exception_date });
        return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ message: 'Bad Request: Invalid date format. Use ISO 8601.', details: dateErrorMessage }) };
    }
    if ((newEventData.parent_event_id && !isValidUUID(newEventData.parent_event_id)) ||
        (newEventData.series_id && !isValidUUID(newEventData.series_id))) {
        console.error('[calendar.ts] Create Event Error: Invalid UUID format for parent_event_id or series_id. Provided:', { parent: newEventData.parent_event_id, series: newEventData.series_id });
        return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ message: 'Bad Request: Invalid UUID format for parent_event_id or series_id' }) };
    }
    const jwt = event.headers?.authorization?.substring(7);
    if (!jwt) {
        console.error('[calendar.ts] Create Event Error: Unauthorized - Missing token.');
        return { statusCode: 401, headers: responseHeaders, body: JSON.stringify({ message: 'Unauthorized: Missing token for create operation.' }) };
    }
    let supabaseClientWithAuth;
    try {
        supabaseClientWithAuth = createClientWithAuth(jwt);
    }
    catch (clientError) {
        const clientErrorMessage = clientError instanceof Error ? clientError.message : String(clientError);
        console.error('[calendar.ts] Create Event Error: Could not initialize authenticated database client - ', clientErrorMessage);
        return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ message: 'Server error: Could not initialize authenticated database client.', details: clientErrorMessage }) };
    }
    // Constructing eventToInsert with all fields from NewCalendarEvent for clarity and safety
    const eventToInsert = {
        user_id: userId, // Already validated
        title: newEventData.title,
        start_time: newEventData.start_time,
        end_time: newEventData.end_time,
        description: newEventData.description || null,
        location: newEventData.location || null,
        is_all_day: newEventData.is_all_day || false,
        google_event_id: newEventData.google_event_id || null,
        zoom_meeting_id: newEventData.zoom_meeting_id || null,
        is_recurring: newEventData.is_recurring || false,
        is_exception: newEventData.is_exception || false,
        recurrence_pattern: newEventData.is_recurring ? newEventData.recurrence_pattern : null,
        recurrence_interval: newEventData.is_recurring ? (newEventData.recurrence_interval ?? 1) : null, // ?? for explicit null check vs ||
        recurrence_day_of_week: newEventData.is_recurring ? newEventData.recurrence_day_of_week : null,
        recurrence_day_of_month: newEventData.is_recurring ? newEventData.recurrence_day_of_month : null,
        recurrence_month: newEventData.is_recurring ? newEventData.recurrence_month : null,
        recurrence_end_date: newEventData.is_recurring ? newEventData.recurrence_end_date : null,
        recurrence_count: newEventData.is_recurring ? newEventData.recurrence_count : null,
        recurrence_rule: newEventData.is_recurring ? newEventData.recurrence_rule : null,
        recurrence_timezone: newEventData.is_recurring ? newEventData.recurrence_timezone : null,
        parent_event_id: newEventData.parent_event_id || null,
        exception_date: newEventData.is_exception ? newEventData.exception_date : null,
        series_id: newEventData.series_id || null,
        // created_at and updated_at will be set by Supabase or DB triggers
    };
    // Remove any top-level undefined properties before insert, as Supabase client might handle this, but explicit is safer.
    // This was the previous logic, keeping it.
    Object.keys(eventToInsert).forEach(keyStr => {
        const key = keyStr;
        if (eventToInsert[key] === undefined) {
            delete eventToInsert[key];
        }
    });
    console.log('[calendar.ts] Create Event: Attempting to insert eventToInsert:', JSON.stringify(eventToInsert, null, 2));
    const { data, error } = await supabaseClientWithAuth
        .from('calendar_events')
        .insert([eventToInsert])
        .select()
        .single();
    if (error) {
        console.error('[calendar.ts] Create Event Error: Supabase insert error - ', JSON.stringify(error, null, 2));
        return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ message: 'Database error: Could not create event', details: error.message, code: error.code }) };
    }
    if (!data) {
        console.error('[calendar.ts] Create Event Error: Supabase insert error - No data returned after insert.');
        return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ message: 'Database error: Failed to create event (no data returned)' }) };
    }
    console.log('[calendar.ts] Create Event: Successfully created event:', JSON.stringify(data, null, 2));
    return { statusCode: 201, headers: responseHeaders, body: JSON.stringify(data) };
}
// Helper function to handle DELETE requests
async function handleDeleteRequest(event, userId, requestEventId, responseHeaders) {
    try {
        console.log(`--- calendar.ts handling DELETE request ---  User: ${userId} | Raw requestEventId: ${requestEventId} | Path params: ${JSON.stringify(event.pathParameters)}`);
        if (!requestEventId) {
            console.error('[calendar.ts] DELETE Error: requestEventId is null or undefined.');
            return {
                statusCode: 400,
                headers: responseHeaders,
                body: JSON.stringify({ message: 'Event ID is required for deletion' })
            };
        }
        // Validate UUID format
        if (!isValidUUID(requestEventId)) {
            console.error(`[calendar.ts] DELETE Error: Invalid UUID format for requestEventId: ${requestEventId}`);
            return {
                statusCode: 400,
                headers: responseHeaders,
                body: JSON.stringify({ message: 'Invalid Event ID format' })
            };
        }
        const authHeader = event.headers?.authorization;
        let supabaseDeleteClient;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            try {
                supabaseDeleteClient = createClientWithAuth(token);
                console.log('[calendar.ts] DELETE: Using RLS-aware auth client for event deletion.');
            }
            catch (authError) {
                console.error('[calendar.ts] DELETE: Error creating authenticated client:', authError);
                return {
                    statusCode: 401,
                    headers: responseHeaders,
                    body: JSON.stringify({ message: 'Authentication failed' })
                };
            }
        }
        else {
            console.error('[calendar.ts] DELETE: No valid authorization header found');
            return {
                statusCode: 401,
                headers: responseHeaders,
                body: JSON.stringify({ message: 'Authorization required' })
            };
        }
        // First, check if the event exists and belongs to the user
        const { data: existingEvent, error: fetchError } = await supabaseDeleteClient
            .from('calendar_events')
            .select('event_id, title, user_id')
            .eq('event_id', requestEventId)
            .single();
        if (fetchError) {
            console.error(`[calendar.ts] DELETE: Error fetching event ${requestEventId} for user ${userId}:`, JSON.stringify(fetchError));
            if (fetchError.code === 'PGRST116') { // PGRST116: "The result contains 0 rows"
                return {
                    statusCode: 404,
                    headers: responseHeaders,
                    body: JSON.stringify({ message: 'Event not found or access denied' })
                };
            }
            return {
                statusCode: 500,
                headers: responseHeaders,
                body: JSON.stringify({ message: 'Failed to verify event existence', details: fetchError.message, code: fetchError.code })
            };
        }
        if (!existingEvent) {
            console.error(`[calendar.ts] DELETE Error: Event not found with ID: ${requestEventId} (after fetch attempt).`);
            return {
                statusCode: 404,
                headers: responseHeaders,
                body: JSON.stringify({ message: 'Event not found' })
            };
        }
        // Now delete the event
        const { error: deleteError } = await supabaseDeleteClient
            .from('calendar_events')
            .delete()
            .eq('event_id', requestEventId);
        if (deleteError) {
            console.error(`[calendar.ts] DELETE: Error deleting event ${requestEventId}:`, JSON.stringify(deleteError));
            return {
                statusCode: 500,
                headers: responseHeaders,
                body: JSON.stringify({ message: 'Failed to delete event', details: deleteError.message })
            };
        }
        console.log(`[calendar.ts] DELETE: Successfully deleted event ${requestEventId} ("${existingEvent.title}") for user ${userId}`);
        return {
            statusCode: 200,
            headers: responseHeaders,
            body: JSON.stringify({
                success: true,
                message: 'Event deleted successfully',
                event_id: requestEventId,
                deleted_event_title: existingEvent.title
            })
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[calendar.ts] DELETE: Unhandled error in handleDeleteRequest:`, errorMessage, error);
        return {
            statusCode: 500,
            headers: responseHeaders,
            body: JSON.stringify({
                message: "An unexpected error occurred during deletion",
                error: errorMessage
            })
        };
    }
}
//# sourceMappingURL=calendar.js.map