import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { 
  supabaseAdmin, 
  oauthTokenManager
} from '../services';

// Log initialization
console.log('[check-google-auth] Initialized with OAuth configuration');

const COMMON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, max-age=0'
};

interface CheckAuthResponse {
  authorized: boolean;
  error?: string;
  // Optionally, you could return scopes or other relevant info if authorized
}

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
      headers: { ...COMMON_HEADERS, 'Allow': 'GET' },
    };
  }

  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return {
      statusCode: 401,
      body: JSON.stringify({ authorized: false, error: "Authentication required" } as CheckAuthResponse),
      headers: COMMON_HEADERS,
    };
  }

  let userId: string;
  try {
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: supabaseError } = await supabaseAdmin.auth.getUser(token);
    if (supabaseError || !user) {
      console.warn('[check-google-auth] Invalid Supabase session token:', supabaseError?.message);
      throw new Error('Invalid session');
    }
    userId = user.id;
  } catch (e) {
    return {
      statusCode: 401,
      body: JSON.stringify({ authorized: false, error: (e as Error).message } as CheckAuthResponse),
      headers: COMMON_HEADERS,
    };
  }

  try {
    // Check if user has a valid token with contacts scopes
    const isAuthorized = await oauthTokenManager.hasValidToken(userId, 'google');
    
    if (isAuthorized) {
      console.log(`[check-google-auth] Valid access token found for user ${userId}`);
      return {
        statusCode: 200,
        body: JSON.stringify({ authorized: true } as CheckAuthResponse),
        headers: COMMON_HEADERS,
      };
    } else {
      console.log(`[check-google-auth] No valid token found for user ${userId}`);
      return {
        statusCode: 200,
        body: JSON.stringify({ authorized: false, error: 'No valid token available.' } as CheckAuthResponse),
        headers: COMMON_HEADERS,
      };
    }

  } catch (e: unknown) {
    console.error('[check-google-auth] General error:', e instanceof Error ? e.message : String(e));
    return {
      statusCode: 500,
      body: JSON.stringify({ authorized: false, error: e instanceof Error ? e.message : 'Internal server error' } as CheckAuthResponse),
      headers: COMMON_HEADERS,
    };
  }
};

export { handler }; 