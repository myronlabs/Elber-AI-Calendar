"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClientWithAuth = exports.getUserIdFromEvent = exports.isValidUUID = exports.corsHeaders = void 0;
exports.generateRecurringEventOccurrences = generateRecurringEventOccurrences;
const supabase_js_1 = require("@supabase/supabase-js");
const jwt_decode_1 = require("jwt-decode");
const date_fns_1 = require("date-fns");
const recurrence_1 = require('./types/recurrence'); // Assuming this is the correct path
// CORS headers for all responses
exports.corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};
/**
 * Helper function to validate UUID format
 */
const isValidUUID = (uuid) => {
    if (!uuid)
        return false;
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return uuidRegex.test(uuid);
};
exports.isValidUUID = isValidUUID;
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
            console.error('[calendarUtils.ts] Error decoding JWT:', error instanceof Error ? error.message : String(error));
            return null;
        }
    }
    return null;
};
exports.getUserIdFromEvent = getUserIdFromEvent;
/**
 * Creates a Supabase client with the user's JWT for operations that need to respect RLS
 */
const createClientWithAuth = (jwt) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('[calendarUtils.ts] Missing Supabase URL or anon key');
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
exports.createClientWithAuth = createClientWithAuth;
/**
 * Generate occurrences of a recurring event between start and end dates
 * Returns a list of event instances
 */
function generateRecurringEventOccurrences(baseEvent, viewStartDate, viewEndDate) {
    if (!baseEvent.is_recurring || !baseEvent.recurrence_pattern) {
        const baseEventStart = (0, date_fns_1.parseISO)(baseEvent.start_time);
        const baseEventEnd = (0, date_fns_1.parseISO)(baseEvent.end_time);
        if (baseEventStart < viewEndDate && baseEventEnd > viewStartDate) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { event_id, user_id, created_at, updated_at, ...restOfBaseEvent } = baseEvent;
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
            const { event_id, user_id, created_at, updated_at, ...restOfBaseEvent } = baseEvent;
            return [restOfBaseEvent];
        }
        return [];
    }
    const occurrences = [];
    const firstEventStartDate = (0, date_fns_1.parseISO)(baseEvent.start_time);
    const firstEventEndDate = (0, date_fns_1.parseISO)(baseEvent.end_time);
    const eventDurationMs = (0, date_fns_1.differenceInMilliseconds)(firstEventEndDate, firstEventStartDate);
    const REASONABLE_MAX_OCCURRENCES_CAP = 730;
    let definedCount = Infinity;
    if (recurrenceInfo.end?.type === 'count' && typeof recurrenceInfo.end.count === 'number' && recurrenceInfo.end.count > 0) {
        definedCount = recurrenceInfo.end.count;
    }
    const maxOccurrences = Math.min(definedCount, REASONABLE_MAX_OCCURRENCES_CAP);
    console.log(`[CALENDAR DEBUG] generateRecurringEventOccurrences: event_id=${baseEvent.event_id}, series_id=${baseEvent.series_id || 'N/A'}, firstEventStart=${firstEventStartDate.toISOString()}, viewStart=${viewStartDate instanceof Date && !isNaN(viewStartDate.valueOf()) ? viewStartDate.toISOString() : 'Invalid Date'}, viewEnd=${viewEndDate instanceof Date && !isNaN(viewEndDate.valueOf()) ? viewEndDate.toISOString() : 'Invalid Date'}, effectiveMaxOccurrences=${maxOccurrences}`);
    const seriesEndDateLimit = recurrenceInfo.end?.type === 'until' && recurrenceInfo.end.until
        ? (0, date_fns_1.parseISO)(recurrenceInfo.end.until)
        : (0, date_fns_1.addYears)(firstEventStartDate, 5);
    const iterationLimitDate = viewEndDate < seriesEndDateLimit ? viewEndDate : seriesEndDateLimit;
    const interval = typeof recurrenceInfo.interval === 'number' && recurrenceInfo.interval > 0
        ? recurrenceInfo.interval
        : 1;
    let currentInstanceStartDate = firstEventStartDate;
    let occurrenceCount = 0;
    while (currentInstanceStartDate <= iterationLimitDate && occurrenceCount < maxOccurrences) {
        const currentInstanceEndDate = (0, date_fns_1.addMilliseconds)(currentInstanceStartDate, eventDurationMs);
        if (currentInstanceStartDate < viewEndDate && currentInstanceEndDate > viewStartDate) {
            // Extract only the needed fields and exclude database-specific fields
            const relevantBaseEventData = {
                title: baseEvent.title,
                description: baseEvent.description,
                location: baseEvent.location,
                start_time: currentInstanceStartDate.toISOString(),
                end_time: (0, date_fns_1.addMilliseconds)(currentInstanceStartDate, eventDurationMs).toISOString(),
                is_all_day: baseEvent.is_all_day,
                google_event_id: baseEvent.google_event_id,
                zoom_meeting_id: baseEvent.zoom_meeting_id,
                parent_event_id: baseEvent.parent_event_id,
                is_exception: baseEvent.is_exception,
                exception_date: baseEvent.exception_date,
                series_id: baseEvent.series_id || baseEvent.event_id,
                is_recurring: true
            };
            const eventCopy = relevantBaseEventData;
            occurrences.push(eventCopy);
        }
        occurrenceCount++;
        if (occurrenceCount >= maxOccurrences) {
            break;
        }
        let nextPotentialStartDate;
        switch (recurrenceInfo.pattern) {
            case recurrence_1.RecurrencePatternType.DAILY:
                nextPotentialStartDate = (0, date_fns_1.addDays)(currentInstanceStartDate, interval);
                break;
            case recurrence_1.RecurrencePatternType.WEEKLY:
                nextPotentialStartDate = (0, date_fns_1.addDays)(currentInstanceStartDate, 7 * interval);
                break;
            case recurrence_1.RecurrencePatternType.MONTHLY:
                nextPotentialStartDate = (0, date_fns_1.addMonths)(currentInstanceStartDate, interval);
                break;
            case recurrence_1.RecurrencePatternType.YEARLY:
                nextPotentialStartDate = (0, date_fns_1.addYears)(currentInstanceStartDate, interval);
                break;
            default:
                nextPotentialStartDate = (0, date_fns_1.addDays)(currentInstanceStartDate, interval > 0 ? interval : 1);
        }
        currentInstanceStartDate = nextPotentialStartDate;
    }
    return occurrences;
}
//# sourceMappingURL=calendarUtils.js.map