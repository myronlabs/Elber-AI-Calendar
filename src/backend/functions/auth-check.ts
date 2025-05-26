// src/backend/functions/auth-check.ts
import type { Handler, HandlerEvent, HandlerContext, HandlerResponse } from "@netlify/functions";
import { supabaseAdmin, sendVerificationEmail, generateVerificationToken } from '../services';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * AuthStatus - Represents all possible authentication states for a user
 * - UNREGISTERED: No account exists with the provided email
 * - REGISTERED_UNVERIFIED: Account exists but email not verified in Supabase
 * - REGISTERED_VERIFIED_INCOMPLETE: Email verified in Supabase but custom verification not complete
 * - REGISTERED_FULLY_VERIFIED: User is fully verified and can log in
 */
type AuthStatus = 'UNREGISTERED' | 'REGISTERED_UNVERIFIED' | 'REGISTERED_VERIFIED_INCOMPLETE' | 'REGISTERED_FULLY_VERIFIED';

interface AuthCheckRequestBody {
  email: string;
  action?: 'check' | 'resend' | 'status'; // Default is 'check'
}

interface AuthCheckResponse {
  message: string;
  status: AuthStatus;
  userId?: string;
  requiresVerification?: boolean;
  verificationEmailSent?: boolean;
  toast?: {
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
  };
  nextAction?: 'login' | 'verify' | 'signup';
}

// Create a dedicated client with explicitly disabled RLS for verification operations
const createRlsDisabledClient = (): SupabaseClient => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Missing Supabase configuration');
    throw new Error('Missing Supabase configuration');
  }
  
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        Authorization: `Bearer ${supabaseServiceRoleKey}`
      }
    }
  });
};

/**
 * Centralized function to get a user's authentication status
 * This is the single source of truth for user verification status
 */
async function getUserAuthStatus(email: string): Promise<{ status: AuthStatus; userId?: string }> {
  // Look up the user by email
  // Using the admin API to search for user with this email
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin
    .listUsers();

  // Filter users manually to find the one with matching email
  const matchingUsers = userData?.users?.filter(u =>
    u.email?.toLowerCase() === email.toLowerCase()
  ) || [];

  // No user found
  if (userError || !userData || matchingUsers.length === 0) {
    return { status: 'UNREGISTERED' };
  }

  // Get the first user with this email
  const user = matchingUsers[0];
  
  // Check if email is verified in Supabase
  const isSupabaseVerified = !!user.email_confirmed_at;

  // If email not verified in Supabase
  if (!isSupabaseVerified) {
    return { status: 'REGISTERED_UNVERIFIED', userId: user.id };
  }

  // Check custom verification status
  const { data: profileData } = await supabaseAdmin
    .from('profiles')
    .select('is_custom_verified')
    .eq('id', user.id)
    .single();

  const isCustomVerified = profileData?.is_custom_verified === true;

  // If custom verification not complete
  if (!isCustomVerified) {
    return { status: 'REGISTERED_VERIFIED_INCOMPLETE', userId: user.id };
  }

  // User is fully verified
  return { status: 'REGISTERED_FULLY_VERIFIED', userId: user.id };
}

/**
 * Send verification email to a user
 */
async function resendVerificationEmail(userId: string, email: string): Promise<{ success: boolean; error?: unknown }> {
  try {
    // Get user profile data for personalization
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
    const firstName = userData?.user?.user_metadata?.first_name || 'User';

    // Generate verification token
    const verificationToken = generateVerificationToken();
    const noRlsClient = createRlsDisabledClient();
    
    // Delete existing verification codes for this user
    await noRlsClient
      .from('verification_codes')
      .delete()
      .eq('user_id', userId);
    
    // Create new verification code
    const { error: codeError } = await noRlsClient
      .from('verification_codes')
      .insert({
        user_id: userId,
        email: email,
        code: verificationToken,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      });
    
    if (codeError) {
      console.error(`Error creating verification code for user ${userId}:`, codeError);
      return { success: false, error: codeError };
    }
    
    // Send verification email
    const emailResult = await sendVerificationEmail(
      email,
      firstName,
      userId,
      verificationToken
    );
    
    return emailResult;
  } catch (error) {
    console.error(`Error sending verification email for user ${userId}:`, error);
    return { success: false, error };
  }
}

/**
 * Main handler function for the auth-check endpoint
 */
const handler: Handler = async (event: HandlerEvent, _context: HandlerContext): Promise<HandlerResponse> => {
  const requestId = `auth-check-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  console.log(`[auth-check] Request ${requestId}: NEW REQUEST`);

  // Only allow POST method
  if (event.httpMethod !== "POST") {
    console.log(`[auth-check] Request ${requestId}: Method not allowed: ${event.httpMethod}`);
    return {
      statusCode: 405,
      body: JSON.stringify({
        message: "Method Not Allowed",
        toast: { type: "error", message: "Invalid request method" }
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  // Parse request body
  let requestBody: AuthCheckRequestBody;
  try {
    if (!event.body) {
      console.error(`[auth-check] Request ${requestId}: Request body is missing.`);
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Request body is missing.",
          toast: { type: "error", message: "Missing request data" }
        }),
        headers: { 'Content-Type': 'application/json' },
      };
    }
    requestBody = JSON.parse(event.body) as AuthCheckRequestBody;
    console.log(`[auth-check] Request ${requestId}: Request parsed:`, { 
      email: requestBody.email ? 'Provided' : 'Missing',
      action: requestBody.action || 'check'
    });
  } catch (error) {
    console.error(`[auth-check] Request ${requestId}: Failed to parse request body:`, error);
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Invalid request body. Failed to parse JSON.",
        toast: { type: "error", message: "Invalid request format" }
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  const { email, action = 'check' } = requestBody;

  if (!email) {
    console.error(`[auth-check] Request ${requestId}: Missing email.`);
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Missing required field: email is required.",
        toast: { type: "error", message: "Email address is required" }
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  try {
    // Get user authentication status
    console.log(`[auth-check] Request ${requestId}: Getting auth status for email: (redacted for security)`);
    const { status: authStatus, userId } = await getUserAuthStatus(email);
    
    console.log(`[auth-check] Request ${requestId}: User auth status:`, {
      // Redact email and specific status for security (prevent user enumeration)
      emailProvided: true,
      hasUserId: !!userId,
      // Still include status for debugging but with sensitive info redacted
      statusCategory: authStatus === 'UNREGISTERED' ? 'requires_signup' : 'account_exists'
    });

    const response: AuthCheckResponse = {
      message: '',
      status: authStatus
    };

    // If email not registered
    if (authStatus === 'UNREGISTERED') {
      response.message = "No account exists with this email address.";
      response.toast = { type: "info", message: "Create an account to get started" };
      response.nextAction = 'signup';
      return {
        statusCode: 200,
        body: JSON.stringify(response),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    // If email registered but not verified or verification incomplete
    if (authStatus === 'REGISTERED_UNVERIFIED' || authStatus === 'REGISTERED_VERIFIED_INCOMPLETE') {
      response.userId = userId;
      response.requiresVerification = true;
      
      // If just checking status
      if (action === 'status' || action === 'check') {
        response.message = "Your account requires verification.";
        response.toast = { type: "info", message: "Verification required to access your account" };
        response.nextAction = 'verify';
      }
      
      // If requesting resend of verification email
      if (action === 'resend' || action === 'check') {
        if (!userId) {
          console.error(`Cannot resend verification email - no userId available`);
          return {
            statusCode: 400,
            body: JSON.stringify({
              authenticated: false,
              verified: false,
              message: "Cannot resend verification email - user ID not found"
            }),
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
            }
          };
        }
        const emailResult = await resendVerificationEmail(userId, email);
        response.verificationEmailSent = emailResult.success;
        
        if (emailResult.success) {
          response.message = "A new verification email has been sent. Please check your inbox.";
          response.toast = { type: "success", message: "Verification email sent!" };
          response.nextAction = 'verify';
        } else {
          response.message = "Failed to send verification email. Please try again later.";
          response.toast = { type: "error", message: "Error sending verification email" };
          response.nextAction = 'verify';
        }
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify(response),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    // If fully verified
    if (authStatus === 'REGISTERED_FULLY_VERIFIED') {
      response.userId = userId;
      response.requiresVerification = false;
      response.message = "Your account is fully verified. You can log in.";
      response.toast = { type: "success", message: "Account verified. Please log in." };
      response.nextAction = 'login';
      
      return {
        statusCode: 200,
        body: JSON.stringify(response),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    // Shouldn't get here
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Unknown authentication status.",
        toast: { type: "error", message: "System error. Please contact support." }
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (error: unknown) {
    const typedError = error instanceof Error ? error : new Error(String(error));
    console.error(`[auth-check] Request ${requestId}: Unexpected error:`, typedError.message, typedError.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "An unexpected server error occurred.",
        toast: { type: "error", message: "Server error during authentication check" }
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }
};

export { handler, getUserAuthStatus };