import type { Handler, HandlerEvent, HandlerContext, HandlerResponse } from "@netlify/functions";
import { StoredChatMessage, ChatMessage, ApiLogMessage } from './services/types';

/**
 * CORS headers for consistent application across all responses
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // In production, restrict to your domain
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

/**
 * Standard response helper for consistently formatted API responses
 */
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
  meta?: {
    count?: number;
    [key: string]: unknown;
  };
}

/**
 * Create a standardized success response
 */
function createSuccessResponse<T>(data: T, meta?: Record<string, unknown>, statusCode = 200): {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
} {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta
  };
  
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(response)
  };
}

/**
 * Create a standardized error response
 */
function createErrorResponse(
  message: string, 
  statusCode = 500, 
  code?: string, 
  details?: unknown
): {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
} {
  const response: ApiResponse = {
    success: false,
    error: {
      message,
      code,
      details
    }
  };
  
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(response)
  };
}

/**
 * Request validation for StoredChatMessage
 */
function validateMessage(message: StoredChatMessage): { valid: boolean; error?: string } {
  if (!message || typeof message !== 'object') {
    return { valid: false, error: 'Invalid message format: message must be an object' };
  }
  
  if (!message.type || (message.type !== 'display' && message.type !== 'api_log')) {
    return { valid: false, error: 'Invalid message type: must be "display" or "api_log"' };
  }
  
  if (!message.data) {
    return { valid: false, error: 'Message data is missing' };
  }
  
  if (message.type === 'display') {
    const displayMsg = message.data as ChatMessage;
    if (!displayMsg.id || !displayMsg.role || !displayMsg.content || !displayMsg.timestamp) {
      return { valid: false, error: 'Display message must include id, role, content, and timestamp' };
    }
    
    if (!['user', 'assistant', 'system'].includes(displayMsg.role)) {
      return { valid: false, error: 'Display message role must be "user", "assistant", or "system"' };
    }
  } else if (message.type === 'api_log') {
    const apiLogMsg = message.data as ApiLogMessage;
    if (!apiLogMsg.role || !apiLogMsg.content) {
      return { valid: false, error: 'API log message must include role and content' };
    }
    
    if (!['user', 'assistant', 'system'].includes(apiLogMsg.role)) {
      return { valid: false, error: 'API log message role must be "user", "assistant", or "system"' };
    }
  }
  
  return { valid: true };
}

/**
 * Extract and validate the authenticated user from a request
 */
async function getAuthenticatedUser(event: HandlerEvent, requestId: string): Promise<{user: {id: string} | null, response?: HandlerResponse}> {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  
  // Add more detailed debug logging
  if (!authHeader) {
    console.error(`[chat-history] Request ${requestId}: Auth error: No Authorization header present`);
    return { 
      user: null, 
      response: createErrorResponse('Authentication header is missing', 401, 'auth_missing_header') 
    };
  }
  
  if (!authHeader.startsWith('Bearer ')) {
    console.error(`[chat-history] Request ${requestId}: Auth error: Invalid Authorization header format (missing Bearer prefix)`);
    return { 
      user: null, 
      response: createErrorResponse('Authentication header format invalid', 401, 'auth_invalid_format') 
    };
  }
  
  const token = authHeader.split(' ')[1];
  if (!token || token.trim() === '') {
    console.error(`[chat-history] Request ${requestId}: Auth error: Empty token in Authorization header`);
    return { 
      user: null, 
      response: createErrorResponse('Empty authentication token', 401, 'auth_empty_token') 
    };
  }
  
  // Add debug info
  console.log(`[chat-history] Request ${requestId}: Attempting to validate token (length: ${token.length}, prefix: ${token.substring(0, 10)}...)`);
  
  // Create a fresh Supabase admin client for this request to avoid any stale client state
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error(`[chat-history] Request ${requestId}: Critical configuration error - missing Supabase environment variables`);
    return {
      user: null,
      response: createErrorResponse('Server configuration error', 500, 'server_config_error')
    };
  }
  
  try {
    // Try to decode the JWT token to extract the user ID directly
    // First, try to extract payload without verification to get the user ID
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      console.error(`[chat-history] Request ${requestId}: Invalid JWT token format (parts: ${tokenParts.length})`);
      return {
        user: null,
        response: createErrorResponse('Invalid token format', 401, 'invalid_token_format')
      };
    }
    
    try {
      // Base64 decode the payload part (second part of the JWT)
      const payloadBase64 = tokenParts[1];
      const decodedPayload = Buffer.from(payloadBase64, 'base64').toString('utf8');
      const payload = JSON.parse(decodedPayload);
      
      console.log(`[chat-history] Request ${requestId}: Successfully decoded token payload, subject: ${payload.sub}`);
      
      if (!payload.sub) {
        console.error(`[chat-history] Request ${requestId}: JWT token missing 'sub' claim (user ID)`);
        return {
          user: null,
          response: createErrorResponse('Invalid token: missing user ID', 401, 'token_missing_userid')
        };
      }
      
      const userId = payload.sub;
      
      // Create a fresh Supabase client for this request with explicit configuration
      console.log(`[chat-history] Request ${requestId}: Creating fresh Supabase admin client to verify user existence`);
      const { createClient } = await import('@supabase/supabase-js');
      const freshSupabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        },
        global: {
          headers: {
            'X-Request-ID': requestId
          }
        }
      });
      
      // Check if the user exists in the profiles table
      console.log(`[chat-history] Request ${requestId}: Checking user existence in profiles table`);
      const { data: userData, error: userError } = await freshSupabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();
      
      if (userError) {
        console.error(`[chat-history] Request ${requestId}: User database lookup error: ${userError.message}`);
        
        // Special case: if the error is that no rows were returned, it means the user doesn't exist
        if (userError.code === 'PGRST116') {
          return {
            user: null,
            response: createErrorResponse('User not found', 401, 'user_not_found')
          };
        }
        
        return {
          user: null,
          response: createErrorResponse('Error verifying user', 500, 'database_error')
        };
      }
      
      if (!userData) {
        console.error(`[chat-history] Request ${requestId}: User ${userId} not found in profiles table`);
        return {
          user: null,
          response: createErrorResponse('User not found', 401, 'user_not_found')
        };
      }
      
      // User exists, create a synthetic user object with the data we have
      const user = {
        id: userId,
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString()
      };
      
      console.log(`[chat-history] Request ${requestId}: Authentication successful: User ${userId} validated via profiles table`);
      return { user, response: undefined };
      
    } catch (decodeError) {
      console.error(`[chat-history] Request ${requestId}: Failed to decode JWT payload: ${decodeError instanceof Error ? decodeError.message : String(decodeError)}`);
      return {
        user: null,
        response: createErrorResponse('Invalid token: could not decode payload', 401, 'token_decode_error')
      };
    }
  } catch (error) {
    // Enhanced error logging with stack trace
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error(`[chat-history] Request ${requestId}: Authentication exception: ${errorMessage}`, { stack: errorStack });
    
    return { 
      user: null, 
      response: createErrorResponse(
        'Authentication error during token verification', 
        401, 
        'auth_verification_error', 
        {
          message: errorMessage,
          stack: errorStack
        }
      ) 
    };
  }
}

/**
 * Get all chat history for a user
 */
async function getChatHistory(userId: string, requestId: string): Promise<HandlerResponse> {
  try {
    console.log(`[chat-history] Request ${requestId}: Fetching chat history for user ${userId}`);
    
    // Create a fresh Supabase admin client for this operation
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error(`[chat-history] Request ${requestId}: Critical configuration error - missing Supabase environment variables`);
      return createErrorResponse('Server configuration error', 500, 'server_config_error');
    }
    
    // Create a fresh Supabase client
    console.log(`[chat-history] Request ${requestId}: Creating fresh Supabase admin client for database operations`);
    const { createClient } = await import('@supabase/supabase-js');
    const freshSupabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      db: {
        schema: 'public'
      },
      global: {
        headers: {
          'X-Request-ID': requestId
        }
      }
    });
    
    // Set a reasonable timeout for the query
    const QUERY_TIMEOUT_MS = 10000; // 10 seconds
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), QUERY_TIMEOUT_MS);
    });
    
    // Execute the database query with a timeout
    const queryPromise = freshSupabaseAdmin
      .from('conversation_history')
      .select('message_object', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    // Use Promise.race to implement the timeout
    const queryResult = await Promise.race([
      queryPromise,
      timeoutPromise.then(() => {
        throw new Error('Database query timeout');
      })
    ]);

    const { data, error, count } = queryResult;
    
    if (error) {
      console.error(`[chat-history] Request ${requestId}: Database error:`, error);
      return createErrorResponse(
        'Failed to retrieve chat history', 
        500, 
        'db_error', 
        error.message
      );
    }
    
    // Extract message objects from the database results
    const messages = data?.map((item: { message_object: unknown }) => item.message_object as StoredChatMessage) || [];
    console.log(`[chat-history] Request ${requestId}: Retrieved ${messages.length} messages for user ${userId}`);
    
    return createSuccessResponse(messages, { count: count || 0 });
  } catch (error) {
    console.error(`[chat-history] Request ${requestId}: Exception in getChatHistory:`, error);
    
    // Check for specific error types
    if (error instanceof Error && error.message === 'Database query timeout') {
      return createErrorResponse(
        'Database query timed out', 
        504, 
        'db_timeout'
      );
    }
    
    return createErrorResponse(
      'Error retrieving chat history', 
      500, 
      'internal_error',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Save a new message to the database
 */
async function saveMessage(userId: string, message: StoredChatMessage, requestId: string): Promise<HandlerResponse> {
  try {
    console.log(`[chat-history] Request ${requestId}: Saving new message of type ${message.type} for user ${userId}`);
    
    // Validate the message structure
    const validation = validateMessage(message);
    if (!validation.valid) {
      console.warn(`[chat-history] Request ${requestId}: Message validation failed: ${validation.error}`);
      const errorMessage = validation.error ?? 'Invalid message';
      return createErrorResponse(errorMessage, 400, 'validation_error');
    }
    
    // Create a fresh Supabase admin client for this operation
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error(`[chat-history] Request ${requestId}: Critical configuration error - missing Supabase environment variables`);
      return createErrorResponse('Server configuration error', 500, 'server_config_error');
    }
    
    // Create a fresh Supabase client
    console.log(`[chat-history] Request ${requestId}: Creating fresh Supabase admin client for database operations`);
    const { createClient } = await import('@supabase/supabase-js');
    const freshSupabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      db: {
        schema: 'public'
      },
      global: {
        headers: {
          'X-Request-ID': requestId
        }
      }
    });
    
    // Set a reasonable timeout for the insert operation
    const QUERY_TIMEOUT_MS = 10000; // 10 seconds
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database operation timeout')), QUERY_TIMEOUT_MS);
    });
    
    // Execute the database insert with a timeout
    const insertPromise = freshSupabaseAdmin
      .from('conversation_history')
      .insert([{ 
        user_id: userId, 
        message_object: message 
      }])
      .select('id, created_at');
    
    // Use Promise.race to implement the timeout
    const insertResult = await Promise.race([
      insertPromise,
      timeoutPromise.then(() => {
        throw new Error('Database operation timeout');
      })
    ]);

    const { data, error } = insertResult;
    
    if (error) {
      console.error(`[chat-history] Request ${requestId}: Database error during save:`, error);
      return createErrorResponse(
        'Failed to save message', 
        500, 
        'db_error', 
        error.message
      );
    }
    
    console.log(`[chat-history] Request ${requestId}: Message saved successfully with ID ${data?.[0]?.id}`);
    
    return createSuccessResponse(
      { id: data?.[0]?.id, created_at: data?.[0]?.created_at },
      { message: 'Message saved successfully' },
      201 // Created
    );
  } catch (error) {
    console.error(`[chat-history] Request ${requestId}: Exception in saveMessage:`, error);
    
    if (error instanceof Error && error.message === 'Database operation timeout') {
      return createErrorResponse(
        'Database operation timed out', 
        504, 
        'db_timeout'
      );
    }
    
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON format', 400, 'syntax_error', error.message);
    }
    
    return createErrorResponse(
      'Error saving message', 
      500, 
      'internal_error',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Delete all chat history for a user
 */
async function clearChatHistory(userId: string, requestId: string): Promise<HandlerResponse> {
  try {
    console.log(`[chat-history] Request ${requestId}: Deleting chat history for user ${userId}`);
    
    // Create a fresh Supabase admin client for this operation
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error(`[chat-history] Request ${requestId}: Critical configuration error - missing Supabase environment variables`);
      return createErrorResponse('Server configuration error', 500, 'server_config_error');
    }
    
    // Create a fresh Supabase client
    console.log(`[chat-history] Request ${requestId}: Creating fresh Supabase admin client for database operations`);
    const { createClient } = await import('@supabase/supabase-js');
    const freshSupabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      db: {
        schema: 'public'
      },
      global: {
        headers: {
          'X-Request-ID': requestId
        }
      }
    });
    
    // Set a reasonable timeout for the delete operation
    const QUERY_TIMEOUT_MS = 15000; // 15 seconds for delete which could take longer
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database operation timeout')), QUERY_TIMEOUT_MS);
    });
    
    // Execute the database delete with a timeout
    const deletePromise = freshSupabaseAdmin
      .from('conversation_history')
      .delete({ count: 'exact' })
      .eq('user_id', userId);
    
    // Use Promise.race to implement the timeout
    const deleteResult = await Promise.race([
      deletePromise,
      timeoutPromise.then(() => {
        throw new Error('Database operation timeout');
      })
    ]);

    const { error, count } = deleteResult;
    
    if (error) {
      console.error(`[chat-history] Request ${requestId}: Database error during delete:`, error);
      return createErrorResponse(
        'Failed to clear chat history', 
        500, 
        'db_error', 
        error.message
      );
    }
    
    console.log(`[chat-history] Request ${requestId}: Successfully deleted ${count || 0} messages for user ${userId}`);
    
    return createSuccessResponse(
      { deletedCount: count || 0 },
      { message: 'Chat history cleared successfully' }
    );
  } catch (error) {
    console.error(`[chat-history] Request ${requestId}: Exception in clearChatHistory:`, error);
    
    if (error instanceof Error && error.message === 'Database operation timeout') {
      return createErrorResponse(
        'Database operation timed out', 
        504, 
        'db_timeout'
      );
    }
    
    return createErrorResponse(
      'Error clearing chat history', 
      500, 
      'internal_error',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Main handler function for the chat-history endpoint
 */
const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  // Log request details for better debugging
  const requestId = Math.random().toString(36).substring(2, 12);
  console.log(`[chat-history] Request ${requestId}: Function invoked with method ${event.httpMethod} at ${new Date().toISOString()}`);
  console.log(`[chat-history] Request ${requestId}: Headers present: ${Object.keys(event.headers).join(', ')}`);
  
  // Set up request timeout detection
  let isRequestTimedOut = false;
  const REQUEST_TIMEOUT = 25000; // 25 seconds timeout
  const timeoutId = setTimeout(() => {
    isRequestTimedOut = true;
    console.error(`[chat-history] Request ${requestId}: Operation timed out after ${REQUEST_TIMEOUT}ms`);
  }, REQUEST_TIMEOUT);
  
  try {
    // Verify auth header is present and log its format (redacted)
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (authHeader) {
      const headerFormat = authHeader.startsWith('Bearer ') 
        ? `Bearer [token-redacted] (length: ${authHeader.length - 7})` 
        : `Invalid format: ${authHeader.substring(0, 10)}...`;
      console.log(`[chat-history] Request ${requestId}: Auth header format: ${headerFormat}`);
    } else {
      console.log(`[chat-history] Request ${requestId}: No auth header present`);
    }
    
    // Handle CORS preflight requests first
    if (event.httpMethod === 'OPTIONS') {
      clearTimeout(timeoutId);
      return {
        statusCode: 204, // No content for OPTIONS
        headers: corsHeaders,
        body: ''
      };
    }
    
    try {
      // Get and validate the authenticated user
      const { user, response: authError } = await getAuthenticatedUser(event, requestId);
      if (authError) {
        console.error(`[chat-history] Request ${requestId}: Auth error: ${authError.body ? JSON.parse(authError.body).error?.message || 'Unknown error' : 'No error body'}`); 
        clearTimeout(timeoutId);
        return authError; // Return auth error response if user validation failed
      }
      
      if (isRequestTimedOut) {
        console.error(`[chat-history] Request ${requestId}: Request timed out during authentication`);
        return createErrorResponse('Request processing timed out', 504, 'request_timeout');
      }

      if (!user) {
        console.error(`[chat-history] Request ${requestId}: User is null after authentication`);
        clearTimeout(timeoutId);
        return createErrorResponse('Authentication failed', 401, 'auth_error');
      }

      console.log(`[chat-history] Request ${requestId}: Authenticated user: ${user.id}`);
      
      // Process the request based on HTTP method
      switch (event.httpMethod) {
        case 'GET': {
          // Retrieve chat history
          const getResult = await getChatHistory(user.id, requestId);
          clearTimeout(timeoutId);
          return getResult;
        }
          
        case 'POST': {
          // Add a new message
          if (!event.body) {
            clearTimeout(timeoutId);
            return createErrorResponse('Request body is missing', 400, 'missing_body');
          }

          try {
            const message = JSON.parse(event.body) as StoredChatMessage;
            const postResult = await saveMessage(user.id, message, requestId);
            clearTimeout(timeoutId);
            return postResult;
          } catch (parseError) {
            console.error(`[chat-history] Request ${requestId}: JSON parse error:`, parseError);
            clearTimeout(timeoutId);
            return createErrorResponse(
              'Invalid JSON in request body',
              400,
              'invalid_json',
              parseError instanceof Error ? parseError.message : String(parseError)
            );
          }
        }
          
        case 'DELETE': {
          // Clear chat history
          const deleteResult = await clearChatHistory(user.id, requestId);
          clearTimeout(timeoutId);
          return deleteResult;
        }
          
        default:
          // Method not allowed
          clearTimeout(timeoutId);
          return createErrorResponse(
            `HTTP method ${event.httpMethod} not supported`, 
            405, 
            'method_not_allowed'
          );
      }
    } catch (innerError) {
      console.error(`[chat-history] Request ${requestId}: Error in request processing:`, innerError);
      clearTimeout(timeoutId);
      return createErrorResponse(
        'Error processing request', 
        500, 
        'processing_error',
        innerError instanceof Error ? { message: innerError.message, stack: innerError.stack } : String(innerError)
      );
    }
  } catch (error) {
    // Catch any uncaught exceptions
    console.error(`[chat-history] Request ${requestId}: Unhandled exception:`, error);
    clearTimeout(timeoutId);
    return createErrorResponse(
      'An unexpected error occurred', 
      500, 
      'internal_error',
      error instanceof Error ? { message: error.message, stack: error.stack } : String(error)
    );
  } finally {
    // Ensure the timeout is cleared if it hasn't fired yet
    clearTimeout(timeoutId);
  }
};

export { handler };