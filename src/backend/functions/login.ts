import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { supabaseAdmin } from '../services'; // Assuming supabaseAdmin is correctly configured
import { authRateLimiter, RATE_LIMITS } from '../services/rateLimiter'; // Import rate limiter
import type { User, Session } from '@supabase/supabase-js'; // Import Supabase types

// Define a more specific type for the expected request body
interface LoginRequestBody {
  email?: string;
  password?: string;
}

// Define a more specific type for the expected successful response body
interface LoginSuccessResponseBody {
  success: true;
  message: string;
  user: User;
  session: Session;
  toast?: {
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
  };
}

// Define a type for error responses
interface LoginErrorResponseBody {
  success: false;
  message: string;
  toast?: {
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
  };
}

const loginHandler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  console.log("LOGIN FUNCTION - INVOKED AT:", new Date().toISOString());

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" } as LoginErrorResponseBody),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  let body: LoginRequestBody;
  try {
    if (!event.body) {
      throw new Error("Request body is missing");
    }
    body = JSON.parse(event.body);
  } catch (error) {
    console.error("Error parsing request body:", error);
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: "Invalid request body" } as LoginErrorResponseBody),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  const { email, password } = body;

  if (!email || !password) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, message: "Email and password are required" } as LoginErrorResponseBody),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  try {
    // Apply rate limiting based on IP address
    const clientIp = event.headers['client-ip'] || 
                     event.headers['x-forwarded-for'] || 
                     'unknown-ip';
                     
    // Use email as secondary identifier to prevent email enumeration attacks
    // Hash/normalize to prevent exposing actual email in logs
    const emailIdentifier = email.toLowerCase().trim();
    
    // Check rate limits - first by IP, then by email if IP check passes
    const ipRateLimit = await authRateLimiter.isAllowed(
      clientIp, 
      'login', 
      RATE_LIMITS.login
    );
    
    if (!ipRateLimit.allowed) {
      console.warn(`Rate limit exceeded for IP: ${clientIp} on login endpoint`);
      
      // Return 429 Too Many Requests with Retry-After header
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Only add Retry-After header if retryAfter has a value
      if (ipRateLimit.retryAfter !== undefined) {
        headers['Retry-After'] = String(ipRateLimit.retryAfter);
      } else {
        headers['Retry-After'] = '60'; // Default to 60 seconds
      }
      
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({
          success: false,
          message: "Too many login attempts. Please try again later.",
          toast: { 
            type: "error", 
            message: "Too many login attempts. Please try again later." 
          }
        } as LoginErrorResponseBody)
      };
    }
    
    // If IP check passes, check email rate limit as well for better security
    const emailRateLimit = await authRateLimiter.isAllowed(
      `email:${emailIdentifier}`, 
      'login', 
      RATE_LIMITS.login
    );
    
    if (!emailRateLimit.allowed) {
      console.warn(`Rate limit exceeded for email: ${email} on login endpoint`);
      
      // Return 429 Too Many Requests with Retry-After header
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Only add Retry-After header if retryAfter has a value
      if (emailRateLimit.retryAfter !== undefined) {
        headers['Retry-After'] = String(emailRateLimit.retryAfter);
      } else {
        headers['Retry-After'] = '60'; // Default to 60 seconds
      }
      
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({
          success: false,
          message: "Too many login attempts. Please try again later.",
          toast: { 
            type: "error", 
            message: "Too many login attempts. Please try again later." 
          }
        } as LoginErrorResponseBody)
      };
    }
    
    // Delay response if progressive delay is enabled
    if (emailRateLimit.delay && emailRateLimit.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, emailRateLimit.delay));
    }
    
    // Proceed with authentication
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      console.error("Supabase login error:", error.message);
      // Provide more specific error messages based on Supabase error types if needed
      let userMessage = "Login failed. Please check your credentials.";
      if (error.message.includes("Invalid login credentials")) {
        userMessage = "Invalid email or password.";
        
        // Track failed login attempt to trigger progressive delays/blocks
        await authRateLimiter.isAllowed(clientIp, 'login', RATE_LIMITS.login, true);
        await authRateLimiter.isAllowed(`email:${emailIdentifier}`, 'login', RATE_LIMITS.login, true);
      } else if (error.message.includes("Email not confirmed")) {
        userMessage = "Please confirm your email address before logging in.";
      }
      
      return {
        statusCode: 401, // Unauthorized
        body: JSON.stringify({ 
          success: false, 
          message: userMessage,
          toast: { type: "error", message: userMessage }
        } as LoginErrorResponseBody),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    if (data && data.user && data.session) {
      console.log("Login successful for user:", data.user.id);
      
      // Reset rate limiter on successful login
      await authRateLimiter.reset(clientIp, 'login');
      await authRateLimiter.reset(`email:${emailIdentifier}`, 'login');
      // Check if the user is verified (if your app requires it)
      // Example: if (!data.user.email_confirmed_at) { ... return error ... }

      const responseBody: LoginSuccessResponseBody = {
        success: true,
        message: "Login successful!",
        user: data.user,
        session: data.session,
        toast: { type: "success", message: "Logged in successfully" }
      };
      return {
        statusCode: 200,
        body: JSON.stringify(responseBody),
        headers: { 'Content-Type': 'application/json' },
      };
    } else {
      // This case should ideally not be reached if Supabase returns error for failed logins
      console.error("Supabase login response missing user or session data");
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          success: false, 
          message: "Login failed due to a server issue. Please try again.",
          toast: { type: "error", message: "Server error during login" }
        } as LoginErrorResponseBody),
        headers: { 'Content-Type': 'application/json' },
      };
    }

  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("Unexpected error during login:", err.message, err.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        success: false, 
        message: "An unexpected error occurred. Please try again.",
        toast: { type: "error", message: "Unexpected server error" }
      } as LoginErrorResponseBody),
      headers: { 'Content-Type': 'application/json' },
    };
  }
};

export { loginHandler as handler };
