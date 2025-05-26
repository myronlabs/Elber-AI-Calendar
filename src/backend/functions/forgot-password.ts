// src/backend/functions/forgot-password.ts
import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { supabaseAdmin, sendPasswordResetEmail } from '../services';
import { authRateLimiter, RATE_LIMITS } from '../services/rateLimiter';

interface ForgotPasswordRequestBody {
  email?: string;
}

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  console.log("Forgot-password function invoked. Method:", event.httpMethod);

  if (event.httpMethod !== "POST") {
    console.log("Method not allowed for forgot-password:", event.httpMethod);
    return {
      statusCode: 405,
      body: JSON.stringify({
        message: "Method Not Allowed",
        toast: { type: "error", message: "Invalid request method" }
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  let requestBody: ForgotPasswordRequestBody;
  try {
    if (!event.body) {
      console.error("Forgot-password error: Request body is missing.");
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Request body is missing.",
          toast: { type: "error", message: "Missing request data" }
        }),
        headers: { 'Content-Type': 'application/json' },
      };
    }
    requestBody = JSON.parse(event.body) as ForgotPasswordRequestBody;
    console.log("Forgot-password request body parsed:", { email: requestBody.email }); // Log PII carefully
  } catch (error) {
    console.error("Forgot-password error: Failed to parse request body.", error);
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Invalid request body. Failed to parse JSON.",
        toast: { type: "error", message: "Invalid request format" }
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  // Get client identifier for rate limiting
  const clientIP = event.headers['x-forwarded-for'] ||
                  event.headers['client-ip'] ||
                  event.headers['x-real-ip'] ||
                  'unknown';
                  
  // Apply IP-based rate limiting
  const ipRateLimit = await authRateLimiter.isAllowed(
    clientIP, 
    'passwordReset', 
    RATE_LIMITS.passwordReset
  );
  
  if (!ipRateLimit.allowed) {
    console.warn(`Rate limit exceeded for IP: ${clientIP} on password reset endpoint`);
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (ipRateLimit.retryAfter !== undefined) {
      headers['Retry-After'] = String(ipRateLimit.retryAfter);
    }
    
    return {
      statusCode: 429,
      body: JSON.stringify({
        message: "Too many password reset attempts. Please try again later.",
        toast: { type: "error", message: "Too many attempts. Please wait before trying again." },
        retryAfter: ipRateLimit.retryAfter
      }),
      headers,
    };
  }
  
  const { email } = requestBody;

  if (!email) {
    console.error("Forgot-password error: Missing email.");
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Missing required field: email is required.",
        toast: { type: "error", message: "Email address is required" }
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }
  
  // Add email-based rate limiting to prevent account enumeration
  const emailIdentifier = email.toLowerCase().trim();
  const emailRateLimit = await authRateLimiter.isAllowed(
    `email:${emailIdentifier}`, 
    'passwordReset', 
    RATE_LIMITS.passwordReset
  );
  
  if (!emailRateLimit.allowed) {
    console.warn(`Rate limit exceeded for email pattern on password reset endpoint`);
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (emailRateLimit.retryAfter !== undefined) {
      headers['Retry-After'] = String(emailRateLimit.retryAfter);
    }
    
    return {
      statusCode: 429,
      body: JSON.stringify({
        message: "Too many password reset attempts. Please try again later.",
        toast: { type: "error", message: "Too many attempts. Please wait before trying again." },
        retryAfter: emailRateLimit.retryAfter
      }),
      headers,
    };
  }

  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl) {
    console.error('CRITICAL: FRONTEND_URL environment variable is not set. Cannot generate password reset link.');
    return {
        statusCode: 500,
        body: JSON.stringify({
          message: 'Server configuration error: FRONTEND_URL not set.',
          toast: { type: "error", message: "Server configuration error" }
        }),
        headers: { 'Content-Type': 'application/json' },
    };
  }

  try {
    console.log(`Attempting to send password reset email to: ${email}`); // Log PII carefully
    
    // Check if email exists by attempting to get user by email
    // We'll use the getUserByEmail admin method if available, otherwise use a generic approach
    // Check user existence without revealing it
    
    try {
      // Try to get user details from the email to verify existence
      await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      // User existence check - not used in response for security
      // Security: Avoid logging whether user exists to prevent information leakage
      console.log(`Processing password reset request for email (existence status redacted for security)`);
    } catch (lookupError) {
      console.error("Error during user lookup:", lookupError);
      // Continue with password reset anyway for security reasons
    }
    
    // Generate a password reset link using Supabase
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: `${frontendUrl}/reset-password`
      }
    });
    
    if (resetError) {
      console.error("Error generating password reset link:", resetError);
      
      // For security reasons, don't reveal if the email exists or not
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "If an account with that email exists, a password reset link has been sent.",
          toast: { type: "info", message: "If your account exists, check your email for reset instructions" }
        }),
        headers: { 'Content-Type': 'application/json' },
      };
    }
    
    // Only proceed with sending an email if we managed to generate a link
    if (resetData && resetData.properties && resetData.properties.action_link) {
      // Get the recovery link from the response
      const resetLink = resetData.properties.action_link;
      console.log("Generated password reset link for user");
      
      // Send the password reset email using Resend
      const resendResult = await sendPasswordResetEmail(email, resetLink);
      
      if (!resendResult.success) {
        console.error("Resend password reset email failed:", resendResult.error);
        // Don't expose failure for security
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: "If an account with that email exists, a password reset link has been sent.",
            toast: { type: "info", message: "If your account exists, check your email for reset instructions" }
          }),
          headers: { 'Content-Type': 'application/json' },
        };
      }
      
      console.log("Password reset email sent successfully via Resend");
      
      // Reset rate limiters on successful password reset request for valid email
      await authRateLimiter.reset(clientIP, 'passwordReset');
      await authRateLimiter.reset(`email:${emailIdentifier}`, 'passwordReset');
    } else {
      console.log("No reset link was generated, likely because the email doesn't exist");
      
      // For security, don't record failed attempts when email doesn't exist 
      // to prevent account enumeration attacks
    }
    
    // Always return a generic success message for security
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "If an account with that email exists, a password reset link has been sent.",
        toast: { type: "success", message: "If your account exists, check your email for reset instructions" }
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("Unexpected error in forgot-password handler:", errorMessage, errorStack);
    // Generic message to client for unexpected errors too.
    return {
      statusCode: 200, // Maintain generic success response for client
      body: JSON.stringify({
        message: "If an account with that email exists, a password reset link has been sent.",
        toast: { type: "info", message: "If your account exists, check your email for reset instructions" }
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }
};

export { handler };
