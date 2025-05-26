import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { getUserIdFromEvent } from './_shared/utils';
import { supabaseAdmin } from '../services/supabaseAdmin';
import type { 
  Alert, 
  CreateAlertPayload, 
  UpdateAlertPayload
} from '../types/domain';
import { 
  AlertType, 
  AlertStatus, 
  AlertPriority 
} from '../types/domain';

// Define proper response type for our handlers
interface ApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const TABLE_NAME = 'alerts';
const COMMON_HEADERS = { 
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
} as const;

/**
 * Validates alert data for creation
 */
const validateCreateAlertPayload = (data: unknown): CreateAlertPayload => {
  if (!data || typeof data !== 'object') {
    throw new Error('Request body must be an object');
  }

  const payload = data as Record<string, unknown>;

  // Required fields
  if (!payload.title || typeof payload.title !== 'string' || payload.title.trim() === '') {
    throw new Error('title is required and must be a non-empty string');
  }

  if (!payload.alert_type || !Object.values(AlertType).includes(payload.alert_type as AlertType)) {
    throw new Error('alert_type is required and must be a valid AlertType');
  }

  if (!payload.due_date || typeof payload.due_date !== 'string') {
    throw new Error('due_date is required and must be an ISO string');
  }

  // Validate due_date is a valid ISO string
  try {
    const dueDate = new Date(payload.due_date);
    if (isNaN(dueDate.getTime())) {
      throw new Error('Invalid date');
    }
  } catch {
    throw new Error('due_date must be a valid ISO date string');
  }

  // Optional fields with validation
  if (payload.priority !== undefined && !Object.values(AlertPriority).includes(payload.priority as AlertPriority)) {
    throw new Error('priority must be a valid AlertPriority');
  }

  if (payload.description !== undefined && payload.description !== null && typeof payload.description !== 'string') {
    throw new Error('description must be a string or null');
  }

  if (payload.contact_id !== undefined && payload.contact_id !== null && typeof payload.contact_id !== 'string') {
    throw new Error('contact_id must be a string UUID or null');
  }

  if (payload.event_id !== undefined && payload.event_id !== null && typeof payload.event_id !== 'string') {
    throw new Error('event_id must be a string UUID or null');
  }

  if (payload.recurring !== undefined && typeof payload.recurring !== 'boolean') {
    throw new Error('recurring must be a boolean');
  }

  if (payload.recurrence_rule !== undefined && payload.recurrence_rule !== null && typeof payload.recurrence_rule !== 'string') {
    throw new Error('recurrence_rule must be a string or null');
  }

  if (payload.tags !== undefined && payload.tags !== null) {
    if (!Array.isArray(payload.tags) || !payload.tags.every(tag => typeof tag === 'string')) {
      throw new Error('tags must be an array of strings or null');
    }
  }

  return {
    title: payload.title.trim(),
    description: payload.description as string | null | undefined,
    alert_type: payload.alert_type as AlertType,
    due_date: payload.due_date,
    priority: payload.priority as AlertPriority | undefined,
    contact_id: payload.contact_id as string | null | undefined,
    event_id: payload.event_id as string | null | undefined,
    recurring: payload.recurring as boolean | undefined,
    recurrence_rule: payload.recurrence_rule as string | null | undefined,
    metadata: payload.metadata as Record<string, unknown> | null | undefined,
    tags: payload.tags as string[] | null | undefined
  };
};

/**
 * Validates alert data for updates
 */
const validateUpdateAlertPayload = (data: unknown): UpdateAlertPayload => {
  if (!data || typeof data !== 'object') {
    throw new Error('Request body must be an object');
  }

  const payload = data as Record<string, unknown>;

  // All fields are optional for updates, but must be valid if provided
  if (payload.title !== undefined) {
    if (typeof payload.title !== 'string' || payload.title.trim() === '') {
      throw new Error('title must be a non-empty string if provided');
    }
  }

  if (payload.alert_type !== undefined && !Object.values(AlertType).includes(payload.alert_type as AlertType)) {
    throw new Error('alert_type must be a valid AlertType if provided');
  }

  if (payload.status !== undefined && !Object.values(AlertStatus).includes(payload.status as AlertStatus)) {
    throw new Error('status must be a valid AlertStatus if provided');
  }

  if (payload.priority !== undefined && !Object.values(AlertPriority).includes(payload.priority as AlertPriority)) {
    throw new Error('priority must be a valid AlertPriority if provided');
  }

  if (payload.due_date !== undefined) {
    if (typeof payload.due_date !== 'string') {
      throw new Error('due_date must be an ISO string if provided');
    }
    try {
      const dueDate = new Date(payload.due_date);
      if (isNaN(dueDate.getTime())) {
        throw new Error('Invalid date');
      }
    } catch {
      throw new Error('due_date must be a valid ISO date string if provided');
    }
  }

  return payload as UpdateAlertPayload;
};

/**
 * Processes alert action operations (dismiss, snooze, reactivate)
 */
const processAlertAction = (action: string, data?: Record<string, unknown>): Partial<Alert> => {
  const now = new Date().toISOString();

  switch (action) {
    case 'dismiss':
      return {
        status: AlertStatus.DISMISSED,
        dismissed_at: now,
        snoozed_until: null
      };

    case 'snooze': {
      const hours = data?.hours as number || 1;
      const snoozeUntil = new Date(Date.now() + (hours * 60 * 60 * 1000)).toISOString();
      return {
        status: AlertStatus.SNOOZED,
        snoozed_until: snoozeUntil,
        dismissed_at: null
      };
    }

    case 'reactivate':
    case 'activate':
      return {
        status: AlertStatus.PENDING,
        snoozed_until: null,
        dismissed_at: null
      };

    default:
      throw new Error(`Unknown action: ${action}`);
  }
};

/**
 * Internal handler with proper typing
 */
const alertsHandler = async (event: HandlerEvent, _context: HandlerContext): Promise<ApiResponse> => {
  const { httpMethod, path, queryStringParameters, body: eventBodyString } = event;
  const logPrefix = `[alerts.ts:${httpMethod}:${path}]`;

  console.log(`${logPrefix} Invoked. Query: ${JSON.stringify(queryStringParameters || {})}. Body length: ${eventBodyString?.length || 0}`);

  // Handle CORS preflight
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: COMMON_HEADERS,
      body: ''
    };
  }

  // Extract alert ID from path for individual alert operations
  const pathParts = path?.split('/') || [];
  const alertId = pathParts.length > 2 ? pathParts[pathParts.length - 1] : undefined;

  try {
    // Authentication
    const userId = await getUserIdFromEvent(event);
    if (!userId) {
      console.error(`${logPrefix} Authentication required`);
      return {
        statusCode: 401,
        headers: COMMON_HEADERS,
        body: JSON.stringify({ error: 'Authentication required' })
      };
    }

    console.log(`${logPrefix} Authenticated user: ${userId}`);

    // Route to appropriate handler
    switch (httpMethod) {
      case 'GET':
        return await handleGetAlerts(userId, queryStringParameters, logPrefix);
      
      case 'POST':
        return await handleCreateAlert(userId, eventBodyString, logPrefix);
      
      case 'PUT':
      case 'PATCH':
        if (!alertId) {
          return {
            statusCode: 400,
            headers: COMMON_HEADERS,
            body: JSON.stringify({ error: 'Alert ID is required for updates' })
          };
        }
        return await handleUpdateAlert(userId, alertId, eventBodyString, logPrefix);
      
      case 'DELETE':
        if (!alertId) {
          return {
            statusCode: 400,
            headers: COMMON_HEADERS,
            body: JSON.stringify({ error: 'Alert ID is required for deletion' })
          };
        }
        return await handleDeleteAlert(userId, alertId, logPrefix);

      default:
        return {
          statusCode: 405,
          headers: COMMON_HEADERS,
          body: JSON.stringify({ error: `Method ${httpMethod} not allowed` })
        };
    }

  } catch (error) {
    console.error(`${logPrefix} Unexpected error:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      statusCode: 500,
      headers: COMMON_HEADERS,
      body: JSON.stringify({ error: 'Internal server error', message: errorMessage })
    };
  }
};

/**
 * Handle GET requests - fetch alerts with optional filtering
 */
async function handleGetAlerts(
  userId: string, 
  queryParams: Record<string, string | undefined> | null, 
  logPrefix: string
): Promise<ApiResponse> {
  try {
    let query = supabaseAdmin
      .from(TABLE_NAME)
      .select('*')
      .eq('user_id', userId)
      .order('due_date', { ascending: true });

    // Apply filters if provided
    if (queryParams?.status && queryParams.status !== 'all') {
      query = query.eq('status', queryParams.status);
    }

    if (queryParams?.alert_type && queryParams.alert_type !== 'all') {
      query = query.eq('alert_type', queryParams.alert_type);
    }

    if (queryParams?.priority && queryParams.priority !== 'all') {
      query = query.eq('priority', parseInt(queryParams.priority));
    }

    // Pagination
    const limit = parseInt(queryParams?.limit || '50');
    const offset = parseInt(queryParams?.offset || '0');
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error(`${logPrefix} Supabase error:`, error);
      return {
        statusCode: 500,
        headers: COMMON_HEADERS,
        body: JSON.stringify({ error: 'Failed to fetch alerts', details: error.message })
      };
    }

    console.log(`${logPrefix} Successfully fetched ${data?.length || 0} alerts`);

    return {
      statusCode: 200,
      headers: COMMON_HEADERS,
      body: JSON.stringify({
        alerts: data || [],
        total: count || 0,
        limit,
        offset
      })
    };

  } catch (error) {
    console.error(`${logPrefix} Error in handleGetAlerts:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      statusCode: 500,
      headers: COMMON_HEADERS,
      body: JSON.stringify({ error: 'Failed to fetch alerts', message: errorMessage })
    };
  }
}

/**
 * Handle POST requests - create new alert
 */
async function handleCreateAlert(
  userId: string, 
  eventBodyString: string | null, 
  logPrefix: string
): Promise<ApiResponse> {
  try {
    if (!eventBodyString) {
      return {
        statusCode: 400,
        headers: COMMON_HEADERS,
        body: JSON.stringify({ error: 'Request body is required' })
      };
    }

    const requestData = JSON.parse(eventBodyString);
    const validatedPayload = validateCreateAlertPayload(requestData);

    // Create alert data with defaults
    const alertData = {
      user_id: userId,
      title: validatedPayload.title,
      description: validatedPayload.description || null,
      alert_type: validatedPayload.alert_type,
      due_date: validatedPayload.due_date,
      priority: validatedPayload.priority || AlertPriority.MEDIUM,
      contact_id: validatedPayload.contact_id || null,
      event_id: validatedPayload.event_id || null,
      recurring: validatedPayload.recurring || false,
      recurrence_rule: validatedPayload.recurrence_rule || null,
      metadata: validatedPayload.metadata || null,
      tags: validatedPayload.tags || null,
      status: AlertStatus.PENDING
    };

    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .insert(alertData)
      .select()
      .single();

    if (error) {
      console.error(`${logPrefix} Supabase error:`, error);
      return {
        statusCode: 500,
        headers: COMMON_HEADERS,
        body: JSON.stringify({ error: 'Failed to create alert', details: error.message })
      };
    }

    console.log(`${logPrefix} Successfully created alert: ${data.alert_id}`);

    return {
      statusCode: 201,
      headers: COMMON_HEADERS,
      body: JSON.stringify({ alert: data })
    };

  } catch (error) {
    console.error(`${logPrefix} Error in handleCreateAlert:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      statusCode: 400,
      headers: COMMON_HEADERS,
      body: JSON.stringify({ error: 'Failed to create alert', message: errorMessage })
    };
  }
}

/**
 * Handle PUT/PATCH requests - update alert or handle actions
 */
async function handleUpdateAlert(
  userId: string, 
  alertId: string, 
  eventBodyString: string | null, 
  logPrefix: string
): Promise<ApiResponse> {
  try {
    if (!eventBodyString) {
      return {
        statusCode: 400,
        headers: COMMON_HEADERS,
        body: JSON.stringify({ error: 'Request body is required' })
      };
    }

    const requestData = JSON.parse(eventBodyString);

    // Check if this is an action request (dismiss, snooze, etc.)
    if (requestData.action) {
      const actionUpdates = processAlertAction(requestData.action, requestData);
      
      const { data, error } = await supabaseAdmin
        .from(TABLE_NAME)
        .update({ ...actionUpdates, updated_at: new Date().toISOString() })
        .eq('alert_id', alertId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error(`${logPrefix} Supabase error for action:`, error);
        return {
          statusCode: 500,
          headers: COMMON_HEADERS,
          body: JSON.stringify({ error: `Failed to ${requestData.action} alert`, details: error.message })
        };
      }

      if (!data) {
        return {
          statusCode: 404,
          headers: COMMON_HEADERS,
          body: JSON.stringify({ error: 'Alert not found' })
        };
      }

      console.log(`${logPrefix} Successfully performed action ${requestData.action} on alert: ${alertId}`);

      return {
        statusCode: 200,
        headers: COMMON_HEADERS,
        body: JSON.stringify({ alert: data })
      };
    }

    // Regular update
    const validatedPayload = validateUpdateAlertPayload(requestData);
    const updateData = {
      ...validatedPayload,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .update(updateData)
      .eq('alert_id', alertId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error(`${logPrefix} Supabase error:`, error);
      return {
        statusCode: 500,
        headers: COMMON_HEADERS,
        body: JSON.stringify({ error: 'Failed to update alert', details: error.message })
      };
    }

    if (!data) {
      return {
        statusCode: 404,
        headers: COMMON_HEADERS,
        body: JSON.stringify({ error: 'Alert not found' })
      };
    }

    console.log(`${logPrefix} Successfully updated alert: ${alertId}`);

    return {
      statusCode: 200,
      headers: COMMON_HEADERS,
      body: JSON.stringify({ alert: data })
    };

  } catch (error) {
    console.error(`${logPrefix} Error in handleUpdateAlert:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      statusCode: 400,
      headers: COMMON_HEADERS,
      body: JSON.stringify({ error: 'Failed to update alert', message: errorMessage })
    };
  }
}

/**
 * Handle DELETE requests - delete alert
 */
async function handleDeleteAlert(
  userId: string, 
  alertId: string, 
  logPrefix: string
): Promise<ApiResponse> {
  try {
    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .delete()
      .eq('alert_id', alertId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error(`${logPrefix} Supabase error:`, error);
      return {
        statusCode: 500,
        headers: COMMON_HEADERS,
        body: JSON.stringify({ error: 'Failed to delete alert', details: error.message })
      };
    }

    if (!data) {
      return {
        statusCode: 404,
        headers: COMMON_HEADERS,
        body: JSON.stringify({ error: 'Alert not found' })
      };
    }

    console.log(`${logPrefix} Successfully deleted alert: ${alertId}`);

    return {
      statusCode: 200,
      headers: COMMON_HEADERS,
      body: JSON.stringify({ message: 'Alert deleted successfully', alert_id: alertId })
    };

  } catch (error) {
    console.error(`${logPrefix} Error in handleDeleteAlert:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      statusCode: 500,
      headers: COMMON_HEADERS,
      body: JSON.stringify({ error: 'Failed to delete alert', message: errorMessage })
    };
  }
}

// Export as Netlify Handler
const handler: Handler = alertsHandler;

export { handler }; 