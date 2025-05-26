// src/backend/functions/calendar-batch.ts
import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { supabaseAdmin } from '../services';
import { CalendarEvent } from '../types/domain';

interface EventCreatePayload {
  title: string;
  start_time: string;
  end_time: string;
  description?: string | null;
  location?: string | null;
  all_day?: boolean;
}

interface EventUpdatePayload extends Partial<EventCreatePayload> {
  id: string;
}

interface CalendarBatchOperation {
  type: 'create' | 'update' | 'delete' | 'get';
  data?: EventCreatePayload | EventUpdatePayload | { id: string } | { ids: string[] };
}

interface CalendarBatchRequestBody {
  operations: CalendarBatchOperation[];
}

interface CalendarBatchResponse {
  results: Array<{
    success: boolean;
    data?: CalendarEvent | CalendarEvent[] | null;
    error?: string;
    operation: string;
  }>;
  statistics: {
    total: number;
    successful: number;
    failed: number;
  };
}

// Helper function to get authenticated user ID
export const getAuthenticatedUserId = (event: HandlerEvent, context: HandlerContext): string | null => {
  // First, try to get user from the clientContext (direct browser calls via Netlify Identity)
  const { user: clientContextUser } = context.clientContext || {};
  if (clientContextUser && clientContextUser.sub) {
    return clientContextUser.sub;
  }

  // If clientContext auth fails, check for Authorization header (when called from another function or frontend)
  const authHeader = event.headers.authorization || event.headers.Authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.replace('Bearer ', '');
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }
      const payloadBase64 = parts[1];
      const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
      const payload = JSON.parse(payloadJson);
      return payload.sub || null;
    } catch (error) {
      console.error("[authHelper] Error parsing JWT from Authorization header:", error);
      return null;
    }
  }

  return null;
};

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Only allow POST method
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  // Get authenticated user
  const userId = getAuthenticatedUserId(event, context);
  if (!userId) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  // Parse request body
  const requestBody: CalendarBatchRequestBody = JSON.parse(event.body || '{}');
  const { operations } = requestBody;

  if (!operations || !Array.isArray(operations) || operations.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Operations array is required' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  // Process operations
  const results = await Promise.allSettled(
    operations.map(async (operation) => {
      try {
        let result;
        
        switch (operation.type) {
          case 'create': {
            const data = operation.data as EventCreatePayload;
            const { data: event, error } = await supabaseAdmin
              .from('calendar_events')
              .insert({ ...data, user_id: userId })
              .select()
              .single();
            
            if (error) throw error;
            result = event;
            break;
          }
          
          case 'update': {
            const data = operation.data as EventUpdatePayload;
            const { id, ...updateData } = data;
            
            const { data: event, error } = await supabaseAdmin
              .from('calendar_events')
              .update(updateData)
              .match({ id, user_id: userId })
              .select()
              .single();
            
            if (error) throw error;
            result = event;
            break;
          }
          
          case 'delete': {
            const data = operation.data as { id: string };
            const { error } = await supabaseAdmin
              .from('calendar_events')
              .delete()
              .match({ id: data.id, user_id: userId });
            
            if (error) throw error;
            result = null;
            break;
          }
          
          case 'get': {
            const data = operation.data as { ids: string[] };
            const { data: events, error } = await supabaseAdmin
              .from('calendar_events')
              .select('*')
              .eq('user_id', userId)
              .in('id', data.ids);
            
            if (error) throw error;
            result = events;
            break;
          }
          
          default:
            throw new Error(`Unknown operation type: ${operation.type}`);
        }
        
        return {
          success: true,
          data: result,
          operation: operation.type
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          operation: operation.type
        };
      }
    })
  );

  const processedResults = results.map((result) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        success: false,
        error: result.reason?.message || 'Unknown error',
        operation: 'unknown'
      };
    }
  });

  const response: CalendarBatchResponse = {
    results: processedResults,
    statistics: {
      total: processedResults.length,
      successful: processedResults.filter(r => r.success).length,
      failed: processedResults.filter(r => !r.success).length
    }
  };

  return {
    statusCode: 200,
    body: JSON.stringify(response),
    headers: { 'Content-Type': 'application/json' }
  };
};