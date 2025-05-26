import { HandlerContext, HandlerEvent, HandlerResponse } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

// Simple helper function to create consistent error responses
function createErrorResponse(message: string, statusCode: number, errorType?: string): HandlerResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // Adjust CORS as needed
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-store, max-age=0'
    },
    body: JSON.stringify({
      success: false,
      message,
      error: errorType || 'unknown_error'
    })
  };
}

// Simple helper function to create consistent success responses
function createSuccessResponse(data?: Record<string, unknown>, meta?: Record<string, unknown>): HandlerResponse {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // Adjust CORS as needed
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-store, max-age=0'
    },
    body: JSON.stringify({
      success: true,
      ...(data && { data }),
      ...(meta && { meta })
    })
  };
}

/**
 * Extract the token from the Authorization header
 */
function extractTokenFromHeader(event: HandlerEvent): string | null {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  
  if (!authHeader) {
    return null;
  }
  
  // Extract from Bearer token format
  const match = authHeader.match(/^Bearer\s+([^\s]+)$/i);
  return match ? match[1] : null;
}

/**
 * Validate user access token
 * This is a lightweight function that just checks if the token is valid
 * without performing any complex database operations
 */
export async function handler(event: HandlerEvent, _context: HandlerContext): Promise<HandlerResponse> {
  // Generate unique request ID for tracing
  const requestId = `validate-token-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  console.log(`\n\n=====================================================`);
  console.log(`[validate-token] Request ${requestId}: NEW TOKEN VALIDATION REQUEST`);
  console.log(`[validate-token] Request ${requestId}: Method: ${event.httpMethod}`);
  console.log(`[validate-token] Request ${requestId}: Path: ${event.path}`);
  console.log(`[validate-token] Request ${requestId}: Headers: ${JSON.stringify({
    authorization: event.headers.authorization ? 'Bearer token present (redacted)' : 'MISSING',
    origin: event.headers.origin,
    host: event.headers.host,
    referer: event.headers.referer,
  })}`);

  // Set a global timeout
  const timeoutId = setTimeout(() => {
    console.error(`[validate-token] Request ${requestId}: Request timed out after 5 seconds`);
  }, 5000);
  
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    clearTimeout(timeoutId);
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: ''
    };
  }
  
  if (event.httpMethod !== 'GET') {
    clearTimeout(timeoutId);
    return createErrorResponse(`HTTP method ${event.httpMethod} not supported`, 405, 'method_not_allowed');
  }
  
  // Extract token from header
  const token = extractTokenFromHeader(event);
  if (!token) {
    clearTimeout(timeoutId);
    return createErrorResponse('No authorization token provided', 401, 'missing_token');
  }
  
  try {
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log(`[validate-token] Request ${requestId}: Environment variables check: ${JSON.stringify({
      supabaseUrl: supabaseUrl ? 'Present' : 'MISSING',
      supabaseServiceRoleKey: supabaseServiceRoleKey ? 'Present' : 'MISSING'
    })}`);

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error(`[validate-token] Request ${requestId}: CONFIGURATION ERROR - Missing Supabase env variables`);
      clearTimeout(timeoutId);
      return createErrorResponse('Server configuration error', 500, 'server_config_error');
    }

    console.log(`[validate-token] Request ${requestId}: Creating Supabase client with service role key`);

    // Create a Supabase client for this request
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
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
    
    // Use the getUser method to validate the token
    console.log(`[validate-token] Request ${requestId}: Validating token via Supabase auth.getUser()`);
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error(`[validate-token] Request ${requestId}: Token validation error:`, error);
      clearTimeout(timeoutId);
      return createErrorResponse('Invalid token', 401, 'invalid_token');
    }

    if (!data.user) {
      console.error(`[validate-token] Request ${requestId}: No user found for token`);
      clearTimeout(timeoutId);
      return createErrorResponse('Invalid token - no user found', 401, 'token_user_not_found');
    }

    // CRITICAL SECURITY CHECK: Verify that the user's email is confirmed and they have custom verification
    // This prevents authentication if the user hasn't completed the email verification process
    console.log(`[validate-token] Request ${requestId}: Starting CRITICAL SECURITY CHECK for user verification`);
    console.log(`[validate-token] Request ${requestId}: Querying profiles table for is_custom_verified status`);

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('is_custom_verified')
      .eq('id', data.user.id)
      .single();

    console.log(`[validate-token] Request ${requestId}: Profile check results: ${JSON.stringify({
      userID: data.user.id,
      profileFound: !!profileData,
      isCustomVerified: profileData?.is_custom_verified,
      hasError: !!profileError
    })}`);

    if (profileError || !profileData) {
      console.error(`[validate-token] Request ${requestId}: Failed to fetch verification status for user ${data.user.id}:`,
        profileError || 'No profile found');
      clearTimeout(timeoutId);
      return createErrorResponse('Account verification status could not be confirmed', 401, 'verification_check_failed');
    }

    if (!profileData.is_custom_verified) {
      console.error(`[validate-token] Request ${requestId}: SECURITY BLOCK - User ${data.user.id} attempted to use token but is not verified`);
      console.error(`[validate-token] Request ${requestId}: Access denied - is_custom_verified = false`);

      // Add detailed logging for verification status debug
      console.log(`[validate-token] Request ${requestId}: Querying verification_codes table for pending codes`);
      const { data: pendingCodes, error: codesError } = await supabase
        .from('verification_codes')
        .select('created_at, expires_at')
        .eq('user_id', data.user.id);

      console.log(`[validate-token] Request ${requestId}: Verification codes status: ${JSON.stringify({
        hasPendingCodes: pendingCodes && pendingCodes.length > 0,
        pendingCodesCount: pendingCodes?.length || 0,
        checkError: !!codesError
      })}`);

      clearTimeout(timeoutId);
      return createErrorResponse('Email verification required', 403, 'email_verification_required');
    }

    // Check standard Supabase email confirmation too (double check)
    console.log(`[validate-token] Request ${requestId}: Checking standard Supabase email_confirmed_at status`);

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(data.user.id);

    console.log(`[validate-token] Request ${requestId}: Auth user status: ${JSON.stringify({
      userID: data.user.id,
      emailConfirmedAt: userData?.user?.email_confirmed_at ? 'Confirmed' : 'Not confirmed',
      hasError: !!userError
    })}`);

    if (userError) {
      console.error(`[validate-token] Request ${requestId}: Failed to verify standard email confirmation: ${userError.message}`);
      clearTimeout(timeoutId);
      return createErrorResponse('Account verification status could not be confirmed', 401, 'verification_check_failed');
    }

    if (!userData.user.email_confirmed_at) {
      console.error(`[validate-token] Request ${requestId}: SECURITY BLOCK - User ${data.user.id} has no email_confirmed_at timestamp`);
      clearTimeout(timeoutId);
      return createErrorResponse('Email verification required', 403, 'email_verification_required');
    }

    // If we reach here, token is valid AND user is verified by BOTH methods
    console.log(`[validate-token] Request ${requestId}: VALIDATION SUCCESSFUL - Token validated for verified user ${data.user.id}`);
    console.log(`=====================================================\n\n`);
    clearTimeout(timeoutId);
    return createSuccessResponse({ valid: true });
    
  } catch (error) {
    console.error(`[validate-token] Request ${requestId}: Unexpected error:`, error);
    clearTimeout(timeoutId);
    return createErrorResponse(
      'Error validating token', 
      500, 
      'internal_error'
    );
  }
} 