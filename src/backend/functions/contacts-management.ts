import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { supabaseAdmin } from '../services';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

// Generic type for Supabase RPC responses
interface SupabaseRpcResponse<DataT> {
  data: DataT | null;
  error: PostgrestError | null;
  count?: number | null;
  status?: number;
  statusText?: string;
}

const COMMON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache'
};

// Constants for rate limiting
const MAX_BATCH_SIZE = 500;
const MAX_OPERATIONS_PER_HOUR = 20;
const MAX_CONTACTS_PER_HOUR = 2000;

// Enum for standardized error codes
enum ErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  DUPLICATE_FOUND = 'DUPLICATE_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  DATABASE_ERROR = 'DATABASE_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNEXPECTED_ERROR = 'UNEXPECTED_ERROR'
}

// Helper for setting operation context
const setOperationContext = async (supabase: SupabaseClient, context: string): Promise<void> => {
  try {
    await supabase.rpc('set_operation_context', { context });
  } catch (error) {
    console.error('[contacts-management] Failed to set operation context:', error);
    // Continue execution even if setting context fails
  }
};

// Helper function to get authenticated user ID
const getAuthenticatedUserId = async (event: HandlerEvent): Promise<string | null> => {
  const authHeader = event.headers.authorization;
  if (!authHeader) return null;

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  
  if (error || !user) return null;
  return user.id;
};

// Interface for the response
interface OperationResponse {
  success: boolean;
  message: string;
  error_code?: ErrorCode;
  affected_count?: number;
  details?: unknown;
  errors?: { message: string; code?: string; field?: string }[];
}

// Utility to validate UUID format
const isValidUuid = (uuid: string): boolean => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(uuid);
};

// Retry utility for transient errors
const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 100,
  shouldRetry?: (error: Error) => boolean
): Promise<T> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const currentError = error instanceof Error ? error : new Error(String(error));
      lastError = currentError;

      // Check if we should retry this error
      if (shouldRetry && !shouldRetry(currentError)) {
        throw currentError;
      }

      // Skip last retry's delay
      if (attempt < maxRetries - 1) {
        // Wait with exponential backoff before retry
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Operation failed after retries');
};

// Helper to check rate limits with fail-closed security model
const checkRateLimits = async (
  userId: string,
  operation: string,
  size: number
): Promise<{allowed: boolean; message?: string; error_code?: ErrorCode}> => {
  try {
    // Input validation
    if (!userId || !operation || size <= 0) {
      return {
        allowed: false,
        message: 'Invalid parameters for rate limiting',
        error_code: ErrorCode.INVALID_INPUT
      };
    }

    // Retry operation on transient database errors
    const { data, error } = await retryOperation<
      SupabaseRpcResponse<boolean>
    >(
      async () => await supabaseAdmin.rpc(
        'rate_limit_contact_operations',
        {
          p_user_id: userId,
          p_operation: operation,
          p_size: size,
          p_max_operations: MAX_OPERATIONS_PER_HOUR,
          p_max_size: MAX_CONTACTS_PER_HOUR,
          p_time_window: '1 hour'
        }
      ),
      3, // Maximum 3 retries
      100, // Start with 100ms delay
      (err) => {
        // Only retry on connection/timeout errors, not validation errors
        const errorMsg = err.message.toLowerCase();
        return errorMsg.includes('timeout') ||
               errorMsg.includes('connection') ||
               errorMsg.includes('network');
      }
    );

    if (error) {
      console.error(`[contacts-management] Rate limit check error: ${error.message}`);

      // In case of error, default to denying the operation (fail closed security model)
      return {
        allowed: false,
        message: `Unable to verify rate limits. Please try again later.`,
        error_code: ErrorCode.DATABASE_ERROR
      };
    }

    // If data is false, rate limit was exceeded
    if (data === false) {
      return {
        allowed: false,
        message: `Rate limit exceeded. You can perform up to ${MAX_OPERATIONS_PER_HOUR} operations or ${MAX_CONTACTS_PER_HOUR} contact modifications per hour.`,
        error_code: ErrorCode.RATE_LIMIT_EXCEEDED
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error(`[contacts-management] Unexpected error in rate limit check: ${error}`);

    // In case of unexpected error, fail closed for safety
    return {
      allowed: false,
      message: `Rate limit check failed due to an unexpected error.`,
      error_code: ErrorCode.UNEXPECTED_ERROR
    };
  }
};

// Batch update contacts with enhanced validation and error handling
const batchUpdateContacts = async (
  userId: string,
  contactIds: string[],
  updates: Record<string, unknown>,
  operationContext: string = 'batch_update_api'
): Promise<OperationResponse> => {
  const logPrefix = `[contacts-management:batchUpdate]`;

  // Input validation
  if (!userId || !isValidUuid(userId)) {
    return {
      success: false,
      message: 'Invalid user ID format',
      error_code: ErrorCode.INVALID_INPUT
    };
  }

  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return {
      success: false,
      message: 'Contact IDs must be a non-empty array',
      error_code: ErrorCode.INVALID_INPUT
    };
  }

  // Validate each contact ID format
  const invalidIds = contactIds.filter(id => !isValidUuid(id));
  if (invalidIds.length > 0) {
    return {
      success: false,
      message: `Invalid contact ID format for ${invalidIds.length} IDs`,
      error_code: ErrorCode.INVALID_INPUT,
      details: { invalidIds: invalidIds.length > 10 ? invalidIds.slice(0, 10) : invalidIds }
    };
  }

  // Validate batch size
  if (contactIds.length > MAX_BATCH_SIZE) {
    return {
      success: false,
      message: `Batch size exceeds maximum allowed (${MAX_BATCH_SIZE})`,
      error_code: ErrorCode.INVALID_INPUT
    };
  }

  // Validate updates object
  if (!updates || typeof updates !== 'object' || Array.isArray(updates) || Object.keys(updates).length === 0) {
    return {
      success: false,
      message: 'Updates must be a non-empty object',
      error_code: ErrorCode.INVALID_INPUT
    };
  }

  // Check for potential data issues
  const validFields = ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'address', 'notes'];
  const invalidFields = Object.keys(updates).filter(key => !validFields.includes(key));
  if (invalidFields.length > 0) {
    return {
      success: false,
      message: `Invalid update fields: ${invalidFields.join(', ')}`,
      error_code: ErrorCode.INVALID_INPUT
    };
  }

  // Email validation if present
  if (updates.email && typeof updates.email === 'string') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(updates.email)) {
      return {
        success: false,
        message: 'Invalid email format',
        error_code: ErrorCode.VALIDATION_ERROR
      };
    }
  }

  // Check rate limits
  const rateLimitCheck = await checkRateLimits(userId, 'batch_update', contactIds.length);
  if (!rateLimitCheck.allowed) {
    return {
      success: false,
      message: rateLimitCheck.message || 'Rate limit exceeded',
      error_code: rateLimitCheck.error_code || ErrorCode.RATE_LIMIT_EXCEEDED
    };
  }

  // Verify ownership of contacts before attempting update
  try {
    const { data: ownershipData, error: ownershipError } = await supabaseAdmin.rpc(
      'check_contact_ownership',
      { p_user_id: userId, p_contact_ids: contactIds }
    );

    if (ownershipError) {
      console.error(`${logPrefix} Error checking contact ownership: ${ownershipError.message}`);
      return {
        success: false,
        message: 'Error verifying contact ownership',
        error_code: ErrorCode.DATABASE_ERROR
      };
    }

    const nonOwnedContacts = ownershipData.filter((item: { contact_id: string; exists_for_user: boolean }) => !item.exists_for_user);
    if (nonOwnedContacts.length > 0) {
      return {
        success: false,
        message: `You don't have permission to modify ${nonOwnedContacts.length} of the specified contacts`,
        error_code: ErrorCode.PERMISSION_DENIED,
        details: { nonOwnedCount: nonOwnedContacts.length }
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${logPrefix} Unexpected error checking contact ownership: ${errorMessage}`);

    return {
      success: false,
      message: 'Error verifying contact ownership',
      error_code: ErrorCode.UNEXPECTED_ERROR
    };
  }

  try {
    // Set the operation context
    await setOperationContext(supabaseAdmin, operationContext);

    // Execute the batch update with retry for transient errors
    const { data, error } = await retryOperation<
      SupabaseRpcResponse<number>
    >(
      async () => await supabaseAdmin.rpc('batch_update_contacts', {
        p_user_id: userId,
        p_contact_ids: contactIds,
        p_updates: updates,
        p_operation_context: operationContext
      }),
      3, // Maximum 3 retries
      100, // Start with 100ms delay
      (err) => {
        // Only retry on connection/timeout errors, not validation errors
        const errorMsg = err.message.toLowerCase();
        return errorMsg.includes('timeout') ||
               errorMsg.includes('connection') ||
               errorMsg.includes('network');
      }
    );

    if (error) {
      console.error(`${logPrefix} Batch update error: ${error.message}`);

      // Differentiate between different types of errors
      if (error.message.includes('INVLD')) {
        return {
          success: false,
          message: 'Validation error: ' + error.message.replace(/Error: INVLD: /i, ''),
          error_code: ErrorCode.VALIDATION_ERROR
        };
      }

      return {
        success: false,
        message: `Failed to update contacts: ${error.message}`,
        error_code: ErrorCode.DATABASE_ERROR
      };
    }

    console.log(`${logPrefix} Successfully updated ${data} contacts for user ${userId}`);

    return {
      success: true,
      message: `Successfully updated ${data} contacts`,
      affected_count: data as number
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${logPrefix} Unexpected error in batch update: ${errorMessage}`);

    return {
      success: false,
      message: `An unexpected error occurred: ${errorMessage}`,
      error_code: ErrorCode.UNEXPECTED_ERROR
    };
  }
};

// Batch delete contacts
const batchDeleteContacts = async (
  userId: string,
  contactIds: string[],
  operationContext: string = 'batch_delete_api'
): Promise<OperationResponse> => {
  // Validate batch size
  if (contactIds.length > MAX_BATCH_SIZE) {
    return {
      success: false,
      message: `Batch size exceeds maximum allowed (${MAX_BATCH_SIZE})`,
    };
  }

  // Check rate limits
  const rateLimitCheck = await checkRateLimits(userId, 'batch_delete', contactIds.length);
  if (!rateLimitCheck.allowed) {
    return {
      success: false,
      message: rateLimitCheck.message || 'Rate limit exceeded',
    };
  }

  try {
    // Use the batch delete function
    const { data, error } = await supabaseAdmin.rpc('batch_delete_contacts', {
      p_user_id: userId,
      p_contact_ids: contactIds,
      p_operation_context: operationContext
    });

    if (error) {
      console.error(`[contacts-management] Batch delete error: ${error.message}`);
      return {
        success: false,
        message: `Failed to delete contacts: ${error.message}`,
      };
    }

    return {
      success: true,
      message: `Successfully deleted ${data} contacts`,
      affected_count: data
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[contacts-management] Unexpected error in batch delete: ${errorMessage}`);
    
    return {
      success: false,
      message: `An unexpected error occurred: ${errorMessage}`,
    };
  }
};

// Batch tag contacts
const batchTagContacts = async (
  userId: string,
  contactIds: string[],
  tagNames: string[],
  operationContext: string = 'batch_tag_api'
): Promise<OperationResponse> => {
  // Validate batch size
  if (contactIds.length > MAX_BATCH_SIZE) {
    return {
      success: false,
      message: `Batch size exceeds maximum allowed (${MAX_BATCH_SIZE})`,
    };
  }

  // Check rate limits
  const rateLimitCheck = await checkRateLimits(userId, 'batch_tag', contactIds.length);
  if (!rateLimitCheck.allowed) {
    return {
      success: false,
      message: rateLimitCheck.message || 'Rate limit exceeded',
    };
  }

  try {
    // Use the batch tag function
    const { data, error } = await supabaseAdmin.rpc('batch_tag_contacts', {
      p_user_id: userId,
      p_contact_ids: contactIds,
      p_tag_names: tagNames,
      p_operation_context: operationContext
    });

    if (error) {
      console.error(`[contacts-management] Batch tag error: ${error.message}`);
      return {
        success: false,
        message: `Failed to tag contacts: ${error.message}`,
      };
    }

    return {
      success: true,
      message: `Successfully tagged ${data} contacts`,
      affected_count: data
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[contacts-management] Unexpected error in batch tag: ${errorMessage}`);
    
    return {
      success: false,
      message: `An unexpected error occurred: ${errorMessage}`,
    };
  }
};

// Find duplicate contacts
const findDuplicateContacts = async (
  userId: string,
  params: {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    company?: string;
  }
): Promise<OperationResponse> => {
  try {
    // Use the find duplicates function to get potential duplicates
    const { data, error } = await supabaseAdmin.rpc('find_duplicate_contacts', {
      p_user_id: userId,
      p_email: params.email || null,
      p_phone: params.phone || null,
      p_first_name: params.first_name || null,
      p_last_name: params.last_name || null,
      p_company: params.company || null
    });

    if (error) {
      console.error(`[contacts-management] Find duplicates error: ${error.message}`);
      return {
        success: false,
        message: `Failed to find duplicate contacts: ${error.message}`,
      };
    }

    // If we found duplicates, enrich them with full contact details
    if (data && data.length > 0) {
      // Extract contact IDs from the duplicate results
      const contactIds = data.map((dup: { contact_id: string }) => dup.contact_id);

      // Fetch the full contact details for these IDs
      const { data: contactsData, error: contactsError } = await supabaseAdmin
        .from('contacts')
        .select('contact_id, first_name, last_name, email, phone, company')
        .in('contact_id', contactIds)
        .eq('user_id', userId);

      if (contactsError) {
        console.error(`[contacts-management] Error fetching contact details: ${contactsError.message}`);
        // Return just the duplicate results without enrichment
        return {
          success: true,
          message: `Found ${data.length} potential duplicate contacts (without details)`,
          details: data
        };
      }

      // Create a map for quick lookup of contact details by ID
      const contactsMap = new Map();
      contactsData.forEach((contact) => {
        contactsMap.set(contact.contact_id, contact);
      });

      // Enrich the duplicate results with contact details
      const enrichedData = data.map((duplicate: { contact_id: string; confidence: string; match_reason: string }) => {
        const contactDetails = contactsMap.get(duplicate.contact_id);
        return {
          ...duplicate,
          // Add the contact details directly to the duplicate object
          first_name: contactDetails?.first_name || null,
          last_name: contactDetails?.last_name || null,
          email: contactDetails?.email || null,
          phone: contactDetails?.phone || null,
          company: contactDetails?.company || null
        };
      });

      return {
        success: true,
        message: `Found ${enrichedData.length} potential duplicate contacts`,
        details: enrichedData
      };
    }

    // No duplicates found
    return {
      success: true,
      message: `Found ${data ? data.length : 0} potential duplicate contacts`,
      details: data || []
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[contacts-management] Unexpected error in find duplicates: ${errorMessage}`);

    return {
      success: false,
      message: `An unexpected error occurred: ${errorMessage}`,
    };
  }
};

// Get contact audit history
const getContactAuditHistory = async (
  userId: string,
  contactId: string,
  limit: number = 50,
  offset: number = 0
): Promise<OperationResponse> => {
  try {
    // First verify that the contact belongs to the user
    const { data: contactData, error: contactError } = await supabaseAdmin
      .from('contacts')
      .select('contact_id')
      .eq('user_id', userId)
      .eq('contact_id', contactId)
      .single();

    if (contactError || !contactData) {
      console.error(`[contacts-management] Contact verification error: ${contactError?.message || 'Contact not found'}`);
      return {
        success: false,
        message: `Contact not found or you don't have permission to access it`,
      };
    }

    // Get the audit history
    const { data, error } = await supabaseAdmin
      .from('contacts_audit')
      .select('*')
      .eq('contact_id', contactId)
      .order('changed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error(`[contacts-management] Audit history error: ${error.message}`);
      return {
        success: false,
        message: `Failed to retrieve audit history: ${error.message}`,
      };
    }

    return {
      success: true,
      message: `Retrieved ${data.length} audit records`,
      details: data
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[contacts-management] Unexpected error in get audit history: ${errorMessage}`);
    
    return {
      success: false,
      message: `An unexpected error occurred: ${errorMessage}`,
    };
  }
};

// Get operations history
const getOperationsHistory = async (
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<OperationResponse> => {
  try {
    // Use direct query instead of RPC for better compatibility
    const { data, error } = await supabaseAdmin
      .from('contact_operations_log')
      .select('operation, operation_size, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error(`[contacts-management] Operations history error: ${error.message}`);
      return {
        success: false,
        message: `Failed to retrieve operations history: ${error.message}`,
      };
    }

    return {
      success: true,
      message: `Retrieved ${data ? data.length : 0} operation records`,
      details: data || []
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[contacts-management] Unexpected error in get operations history: ${errorMessage}`);

    return {
      success: false,
      message: `An unexpected error occurred: ${errorMessage}`,
    };
  }
};

// Get import queue status
const getImportQueueStatus = async (
  userId: string
): Promise<OperationResponse> => {
  try {
    // Get the import queue status
    const { data, error } = await supabaseAdmin
      .from('import_processing_queue')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error(`[contacts-management] Import queue status error: ${error.message}`);
      return {
        success: false,
        message: `Failed to retrieve import queue status: ${error.message}`,
      };
    }

    // Get import history
    const { data: historyData, error: historyError } = await supabaseAdmin
      .from('import_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (historyError) {
      console.warn(`[contacts-management] Import history error: ${historyError.message}`);
    }

    return {
      success: true,
      message: `Retrieved import status`,
      details: {
        queue: data || [],
        history: historyData || []
      }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[contacts-management] Unexpected error in get import queue status: ${errorMessage}`);
    
    return {
      success: false,
      message: `An unexpected error occurred: ${errorMessage}`,
    };
  }
};

// Main handler
const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const { httpMethod, path, queryStringParameters, body: eventBodyString } = event;
  const logPrefix = `[contacts-management:${httpMethod}:${path}]`;

  console.log(`${logPrefix} Invoked. Query: ${JSON.stringify(queryStringParameters || {})}`);

  // 1. Authentication & authorization
  const userId = await getAuthenticatedUserId(event);
  if (!userId) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Authentication required." }),
      headers: COMMON_HEADERS,
    };
  }

  // Get operation from query string or path
  const operation = queryStringParameters?.operation || ((): string => {
    const pathParts = path.split('/').filter(Boolean);
    return pathParts[pathParts.length - 1];
  })();

  // Handle POST requests for batch operations
  if (httpMethod === 'POST') {
    // Parse request body
    let requestBody;
    try {
      if (!eventBodyString) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Request body is required." }),
          headers: COMMON_HEADERS,
        };
      }
      requestBody = JSON.parse(eventBodyString);
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid JSON in request body." }),
        headers: COMMON_HEADERS,
      };
    }

    let response: OperationResponse;

    // Route to appropriate operation
    switch (operation) {
      case 'import-status':
        response = await getImportQueueStatus(userId);
        break;

      case 'operations-history': {
        const opLimit = parseInt(queryStringParameters?.limit || '50', 10);
        const opOffset = parseInt(queryStringParameters?.offset || '0', 10);
        response = await getOperationsHistory(userId, opLimit, opOffset);
        break;
      }

      case 'find-duplicates':
        response = await findDuplicateContacts(
          userId,
          {
            email: requestBody.email,
            phone: requestBody.phone,
            first_name: requestBody.first_name,
            last_name: requestBody.last_name,
            company: requestBody.company
          }
        );
        break;

      case 'batch-update':
        if (!requestBody.contactIds || !Array.isArray(requestBody.contactIds) || requestBody.contactIds.length === 0) {
          return {
            statusCode: 400,
            body: JSON.stringify({ message: "contactIds array is required and must not be empty." }),
            headers: COMMON_HEADERS,
          };
        }
        if (!requestBody.updates || typeof requestBody.updates !== 'object') {
          return {
            statusCode: 400,
            body: JSON.stringify({ message: "updates object is required." }),
            headers: COMMON_HEADERS,
          };
        }
        response = await batchUpdateContacts(
          userId, 
          requestBody.contactIds, 
          requestBody.updates, 
          requestBody.operationContext
        );
        break;

      case 'batch-delete':
        if (!requestBody.contactIds || !Array.isArray(requestBody.contactIds) || requestBody.contactIds.length === 0) {
          return {
            statusCode: 400,
            body: JSON.stringify({ message: "contactIds array is required and must not be empty." }),
            headers: COMMON_HEADERS,
          };
        }
        response = await batchDeleteContacts(
          userId, 
          requestBody.contactIds, 
          requestBody.operationContext
        );
        break;

      case 'batch-tag':
        if (!requestBody.contactIds || !Array.isArray(requestBody.contactIds) || requestBody.contactIds.length === 0) {
          return {
            statusCode: 400,
            body: JSON.stringify({ message: "contactIds array is required and must not be empty." }),
            headers: COMMON_HEADERS,
          };
        }
        if (!requestBody.tagNames || !Array.isArray(requestBody.tagNames) || requestBody.tagNames.length === 0) {
          return {
            statusCode: 400,
            body: JSON.stringify({ message: "tagNames array is required and must not be empty." }),
            headers: COMMON_HEADERS,
          };
        }
        response = await batchTagContacts(
          userId, 
          requestBody.contactIds, 
          requestBody.tagNames, 
          requestBody.operationContext
        );
        break;


      default:
        return {
          statusCode: 404,
          body: JSON.stringify({ message: `Unknown operation: ${operation}` }),
          headers: COMMON_HEADERS,
        };
    }

    const statusCode = response.success ? 200 : 400;
    return {
      statusCode,
      body: JSON.stringify(response),
      headers: COMMON_HEADERS,
    };
  }
  
  // Handle GET requests for information
  else if (httpMethod === 'GET') {
    let response: OperationResponse;

    switch (operation) {
      case 'audit-history': {
        const contactId = queryStringParameters?.contact_id;
        if (!contactId) {
          return {
            statusCode: 400,
            body: JSON.stringify({ message: "contact_id is required in query parameters." }),
            headers: COMMON_HEADERS,
          };
        }
        const limit = parseInt(queryStringParameters?.limit || '50', 10);
        const offset = parseInt(queryStringParameters?.offset || '0', 10);

        response = await getContactAuditHistory(userId, contactId, limit, offset);
        break;
      }

      case 'operations-history': {
        const opLimit = parseInt(queryStringParameters?.limit || '50', 10);
        const opOffset = parseInt(queryStringParameters?.offset || '0', 10);

        response = await getOperationsHistory(userId, opLimit, opOffset);
        break;
      }

      case 'import-status':
        response = await getImportQueueStatus(userId);
        break;

      case 'find-duplicates':
        // For GET requests to find-duplicates, redirect to POST method
        return {
          statusCode: 405,
          body: JSON.stringify({ message: "Please use POST method for find-duplicates operation" }),
          headers: { ...COMMON_HEADERS, 'Allow': 'POST' },
        };

      default:
        return {
          statusCode: 404,
          body: JSON.stringify({ message: `Unknown operation: ${operation}` }),
          headers: COMMON_HEADERS,
        };
    }

    const statusCode = response.success ? 200 : 400;
    return {
      statusCode,
      body: JSON.stringify(response),
      headers: COMMON_HEADERS,
    };
  }

  // Handle other HTTP methods
  return {
    statusCode: 405,
    body: JSON.stringify({ message: `Method ${httpMethod} Not Allowed` }),
    headers: { ...COMMON_HEADERS, 'Allow': 'GET, POST' },
  };
};

export { handler };