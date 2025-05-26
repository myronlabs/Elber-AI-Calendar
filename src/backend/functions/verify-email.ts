import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { supabaseAdmin } from '../services';

interface VerifyEmailRequestBody {
  userId?: string;
  token?: string;
}

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const requestId = `verify-email-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  console.log(`[verify-email] Request ${requestId}: FUNCTION INVOKED - Method: ${event.httpMethod}`);

  if (event.httpMethod !== "POST") {
    console.log(`[verify-email] Request ${requestId}: Method not allowed: ${event.httpMethod}`);
    return {
      statusCode: 405,
      body: JSON.stringify({
        message: "Method Not Allowed",
        toast: { type: "error", message: "Invalid request method" }
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  let requestBody: VerifyEmailRequestBody;
  try {
    if (!event.body) {
      console.error(`[verify-email] Request ${requestId}: Error - Request body is missing.`);
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Request body is missing.",
          toast: { type: "error", message: "Missing request data" }
        }),
        headers: { 'Content-Type': 'application/json' },
      };
    }
    requestBody = JSON.parse(event.body) as VerifyEmailRequestBody;
    console.log(`[verify-email] Request ${requestId}: Request body parsed with userId: ${!!requestBody.userId}`); // Log safely
  } catch (error) {
    console.error(`[verify-email] Request ${requestId}: Error - Failed to parse request body.`, error);
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Invalid request body. Failed to parse JSON.",
        toast: { type: "error", message: "Invalid request format" }
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  const { userId, token } = requestBody;

  if (!userId) {
    console.error(`[verify-email] Request ${requestId}: Error - Missing userId.`);
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Missing required field: userId is required.",
        toast: { type: "error", message: "User ID is required" }
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    console.error(`[verify-email] Request ${requestId}: Error - Invalid UUID format: "${userId}"`);
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Invalid user ID format. Must be a valid UUID.",
        toast: { type: "error", message: "Invalid user ID format" }
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  try {
    // Handle special case: automatic verification during password reset
    const isAutoVerification = token === 'AUTO_VERIFY_ON_PASSWORD_RESET';
    let verificationData = null;
    let verificationError = null;

    if (isAutoVerification) {
      console.log(`[verify-email] Request ${requestId}: AUTO_VERIFY_ON_PASSWORD_RESET token detected for user: ${userId}`);

      // Check if user exists in the profiles table
      const { data: userExists, error: userError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();

      if (userError || !userExists) {
        console.error(`[verify-email] Request ${requestId}: Error - User does not exist or error checking user:`, userError);
        verificationError = new Error('User does not exist');
      } else {
        // User exists, proceed with verification
        verificationData = { user_id: userId };
      }
    } else if (!token) {
      console.error(`[verify-email] Request ${requestId}: Error - Missing token for standard verification.`);
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Missing required field: token is required for standard verification.",
          toast: { type: "error", message: "Verification code is required" }
        }),
        headers: { 'Content-Type': 'application/json' },
      };
    } else {
      // Standard verification with a code from the database
      const result = await supabaseAdmin
        .from('verification_codes')
        .select('user_id') // Select any column to confirm existence
        .eq('user_id', userId)
        .eq('code', token)
        .single();

      verificationData = result.data;
      verificationError = result.error;
    }

    if (verificationError || !verificationData) {
      console.error(`[verify-email] Request ${requestId}: Error - Invalid or expired verification code.`, verificationError);

      // Check if user is already verified as a fallback
      const { data: profileData } = await supabaseAdmin
        .from('profiles')
        .select('is_custom_verified')
        .eq('id', userId)
        .single();

      // If user is already verified, we can proceed and update the email confirmation
      if (profileData?.is_custom_verified) {
        console.log(`[verify-email] Request ${requestId}: User ${userId} is already custom verified. Proceeding with email confirmation...`);
      } else {
        // If not verified, return an error response
        return {
          statusCode: 400,
          body: JSON.stringify({
            message: "Verification failed. Invalid or expired verification code.",
            toast: { type: "error", message: "Invalid or expired verification code" }
          }),
          headers: { 'Content-Type': 'application/json' },
        };
      }
    }

    // Verification code is valid, update the user's profile
    console.log(`[verify-email] Request ${requestId}: Valid verification code found for user: ${userId}. Updating profile.`);
    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ is_custom_verified: true, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (profileUpdateError) {
      console.error(`[verify-email] Request ${requestId}: Error updating profile for user ${userId}:`, profileUpdateError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: "Server error while updating verification status.",
          toast: { type: "error", message: "Server error during verification" }
        }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    // Now, also confirm the email in Supabase's auth.users table
    console.log(`[verify-email] Request ${requestId}: Attempting to set email_confirmed_at for user: ${userId} in Supabase auth.users.`);
    const { error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { email_confirm: true } // This tells Supabase to set email_confirmed_at
    );

    if (updateUserError) {
      console.error(`[verify-email] Request ${requestId}: Supabase email_confirm: true error for user ${userId}:`, updateUserError);
      // This is a critical error, as the user won't be fully confirmed in Supabase's eyes.
      return { 
        statusCode: 500,
        body: JSON.stringify({
          message: "Verification succeeded locally, but failed to update master email confirmation status.",
          toast: { type: "error", message: "Error finalizing email verification with provider." }
        }),
        headers: { 'Content-Type': 'application/json' },
      };
    }
    console.log(`[verify-email] Request ${requestId}: Supabase email_confirmed_at successfully set for user: ${userId}`);

    // Delete the verification code from our database as it's now used
    // But only if we found it initially
    if (verificationData) {
      const { error: deleteCodeError } = await supabaseAdmin
        .from('verification_codes')
        .delete()
        .eq('user_id', userId)
        .eq('code', token);

      if (deleteCodeError) {
        // Log the error but don't fail the verification if the profile was updated
        console.warn(`[verify-email] Request ${requestId}: Failed to delete verification code for user ${userId}:`, deleteCodeError);
      }
    } else {
      console.log(`[verify-email] Request ${requestId}: No verification code found to delete for user ${userId} with code ${token}`);
    }

    console.log(`[verify-email] Request ${requestId}: Custom email verification successful for user: ${userId}`);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Email verified successfully! You can now log in.",
        toast: { type: "success", message: "Email verified! You can now log in." }
      }),
      headers: { 'Content-Type': 'application/json' },
    };

  } catch (error: unknown) {
    const typedError = error instanceof Error ? error : new Error(String(error));
    console.error(`[verify-email] Request ${requestId}: Unexpected error in handler:`, typedError.message, typedError.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "An unexpected server error occurred.",
        toast: { type: "error", message: "Server error during verification" }
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }
};

export { handler }; 