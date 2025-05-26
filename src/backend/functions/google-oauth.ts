import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { 
  supabaseAdmin, 
  oauthTokenManager, 
  oauthConfigService, 
  OAuthDatabaseError 
} from '../services';
import { google } from 'googleapis';

// Use centralized configuration
const googleConfig = oauthConfigService.getGoogleConfig();

console.log(`[google-oauth] Using redirect URI: ${googleConfig.redirectUri}`);

// Frontend URL for postMessage - MUST match the actual origin of the app
const FRONTEND_URL = 'https://elber-ai.netlify.app';
console.log(`[google-oauth] Using frontend URL for postMessage: ${FRONTEND_URL}`);

// Log configuration on function initialization for debugging (not in requests)
console.log('[google-oauth] Function loaded with config:', {
  clientIdPresent: !!googleConfig.clientId,
  clientSecretPresent: !!googleConfig.clientSecret,
  redirectUri: googleConfig.redirectUri,
  frontendUrl: FRONTEND_URL,
  nodeEnv: process.env.NODE_ENV
});

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  googleConfig.clientId,
  googleConfig.clientSecret,
  googleConfig.redirectUri
);

// Common headers moved to inline usage to avoid unused variable warning

// Define base CORS headers for all responses
const baseCorsHeaders = {
  "Access-Control-Allow-Origin": "*", // Allow all origins
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info, baggage, sentry-trace",
};

// Define interface for the OAuth state parameter
interface OAuthState {
  userId: string;
  origin: string;
  timestamp: number;
}

// Define enum for OAuth error types to improve type safety
enum OAuthErrorType {
  STATE_MISSING = 'state_missing',
  CODE_MISSING = 'code_missing',
  CODE_USED = 'code_used',
  TOKEN_EXCHANGE_FAILED = 'token_exchange_failed',
  INVALID_STATE_USERID = 'invalid_state_userid',
  MISSING_PROVIDER_USERID = 'missing_provider_userid',
  DATABASE_ERROR = 'database_error',
  CALLBACK_FAILED = 'callback_failed',
  GOOGLE_ERROR = 'google_error'
}

// Define interface for OAuth error responses
interface OAuthErrorResponse {
  type: 'google-oauth-error';
  provider: 'google';
  error: OAuthErrorType;
  errorMessage: string;
}

// Define interface for OAuth success response
interface OAuthSuccessResponse {
  type: 'google-oauth-success';
  provider: 'google';
}

// Define union type for all OAuth responses
type OAuthResponse = OAuthErrorResponse | OAuthSuccessResponse;

// Define interface for Google's token set (aligns with google-auth-library Credentials)
interface GoogleTokenSet {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null; 
  scope?: string;
  id_token?: string | null;
  token_type?: string | null;
}

// Define interface for the decoded ID token payload
interface GoogleDecodedIdToken {
  sub: string; // Subject - The Google User ID
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
  hd?: string; // Example for G Suite hosted domain
  [key: string]: unknown; // Allow other non-standard claims, with unknown type for safety
}

// OAuth connection interface removed - now using centralized service types

// Helper function to handle OAuth errors consistently
const createOAuthError = (
  errorType: OAuthErrorType,
  errorMessage: string,
  origin: string,
  statusCode = 400
): { statusCode: number; headers: Record<string, string>; body: string } => {
  console.error(`[google-oauth /callback] Error: ${errorType} - ${errorMessage}`);
  const errorResponse: OAuthErrorResponse = {
    type: 'google-oauth-error',
    provider: 'google',
    error: errorType,
    errorMessage: errorMessage
  };
  const errorHtml = generatePostMessageHtml(
    errorResponse,
    origin,
    'Authorization Error',
    `Authorization failed: ${errorMessage}. You can close this window.`
  );
  return { 
    statusCode: statusCode, 
    headers: { ...baseCorsHeaders, 'Content-Type': 'text/html', 'Cache-Control': 'no-store, max-age=0' }, 
    body: errorHtml 
  };
};

// Helper function to generate HTML response for postMessage with improved type safety
const generatePostMessageHtml = (
  message: OAuthResponse, 
  targetOrigin: string, 
  title: string, 
  bodyText: string
): string => {
  const messageString = JSON.stringify(message);
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <script>
        (function() {
          try {
            console.log('Callback: Attempting to postMessage to ${targetOrigin} with message: ${messageString.replace(/'/g, "\\'")}.');
            if (window.opener && window.opener.postMessage) {
              window.opener.postMessage(${messageString}, '${targetOrigin}');
              console.log('postMessage sent.');
            } else {
              console.warn('window.opener or window.opener.postMessage not available. Cannot send postMessage.');
            }
          } catch (e) {
            console.error('Error in callback postMessage script:', e);
          } finally {
            setTimeout(function() { window.close(); }, 500);
          }
        })();
      </script>
    </head>
    <body>
      <p>${bodyText}</p>
    </body>
    </html>`;
};

// Keep a small cache of recently used codes to prevent duplicate exchange attempts
// OAuth codes can only be used once, so we need to track which ones were already used
const usedAuthCodes = new Set<string>();

// Helper function to check if a code was already used
const isCodeAlreadyUsed = (code: string): boolean => {
  if (usedAuthCodes.has(code)) {
    console.log(`[google-oauth] Auth code ${code.substring(0, 10)}... was already used`);
    return true;
  }

  // Add to the used codes set
  usedAuthCodes.add(code);

  // Keep the set limited to last 100 codes to prevent memory leaks
  if (usedAuthCodes.size > 100) {
    const iterator = usedAuthCodes.values();
    const nextValue = iterator.next().value;
    if (nextValue) {
      usedAuthCodes.delete(nextValue);
    }
  }

  return false;
};

// Token storage is now handled by the oauthTokenManager service

/**
 * Decodes a JWT token to extract the payload
 * @param token - The JWT token to decode
 * @returns The decoded payload or null if invalid
 */
function decodeJwtPayload<T>(token: string): T | null {
  try {
    // JWT structure is header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.warn('Invalid JWT token format');
      return null;
    }
    
    // Decode the payload (second part)
    const payload = Buffer.from(parts[1], 'base64').toString();
    return JSON.parse(payload) as T;
  } catch (e) {
    console.error('Error decoding JWT payload:', e);
    return null;
  }
}

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  console.log(`[google-oauth] Handler called with path: ${event.path}, method: ${event.httpMethod}`);

  // Normalize path by removing any duplicate Netlify function prefixes
  let path = event.path;
  if (path.includes('/.netlify/functions/.netlify/functions/')) {
    path = path.replace('/.netlify/functions/.netlify/functions/', '/.netlify/functions/');
    console.log(`[google-oauth] Normalized path: ${path}`);
  }

  const jsonResponseHeaders = { ...baseCorsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' };
  const htmlResponseHeaders = { ...baseCorsHeaders, 'Content-Type': 'text/html', 'Cache-Control': 'no-store, max-age=0' };


  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        ...baseCorsHeaders,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
      body: "",
    };
  }

  const { httpMethod } = event;
  const authHeader = event.headers.authorization;

  console.log(`[google-oauth] Processing request: ${path} (${httpMethod})`);
  console.log(`[google-oauth] Auth header present: ${!!authHeader}`);
  console.log(`[google-oauth] Query parameters:`, event.queryStringParameters);

  // Handle potential paths consistently
  const isAuthorize = path.endsWith('/authorize') || path.endsWith('/google-oauth/authorize');
  const isCallback = path.endsWith('/callback') || path.endsWith('/google-oauth/callback');

  // Extract token from authorization header
  if (!authHeader && !isAuthorize && !isCallback) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Authentication required" }),
      headers: jsonResponseHeaders,
    };
  }

  let userId: string | null = null;
  let userEmail: string | null = null; // For logging or other purposes if needed
  
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    const { data: { user: supabaseUser }, error: supabaseError } = await supabaseAdmin.auth.getUser(token);
    
    if (supabaseError || !supabaseUser) {
      // This error is for an invalid Supabase session token, not for Google OAuth itself
      console.warn('[google-oauth] Invalid Supabase session token in authHeader:', supabaseError?.message);
      // For /authorize, if there's no valid session, we can't proceed to link to a user.
      // For /callback, state should contain the user_id, so this might be less critical here but good for other routes.
      // For now, if it's /authorize and this fails, we will hit the userId check below.
    } else {
      userId = supabaseUser.id;
      userEmail = supabaseUser.email || null; // Capture email if available
      console.log(`[google-oauth] Supabase user identified: ${userId}, email: ${userEmail}`);
    }
  }

  // Determine the specific action based on the path
  // Example: /google-oauth/initiate-auth, /google-oauth/callback
  const pathParts = event.path.split('/').filter(p => p);
  const action = pathParts[pathParts.length -1]; // e.g., 'initiate-auth', 'callback'

  console.log(`[google-oauth] Action determined: '${action}' from path: ${event.path}`);

  // Handle request to initiate OAuth flow
  if (action === 'initiate-auth' && event.httpMethod === 'POST') { // Changed to POST
    if (!userId) {
      console.error('[google-oauth /initiate-auth] Failed: Valid authenticated user ID is required. No Supabase session token in Authorization header or token invalid.');
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Authentication required: Valid Supabase session needed." }),
        headers: jsonResponseHeaders,
      };
    }
    
    const requestBody = event.body ? JSON.parse(event.body) : {};
    const originParam = requestBody.origin || event.headers.origin || FRONTEND_URL;
    console.log(`[google-oauth /initiate-auth] Origin: ${originParam}, User ID: ${userId}`);

    const stateParam: OAuthState = {
      userId: userId,
      origin: originParam,
      timestamp: Date.now()
    };
    const stateString = Buffer.from(JSON.stringify(stateParam)).toString('base64');

    // Determine feature from request body, default to 'contacts'
    let feature: 'contacts' | 'calendar' | 'calendar_readonly' = 'contacts'; 
    if (requestBody.feature && ['contacts', 'calendar', 'calendar_readonly'].includes(requestBody.feature)) {
      feature = requestBody.feature as 'contacts' | 'calendar' | 'calendar_readonly';
    }
    console.log(`[google-oauth /initiate-auth] Requesting scopes for feature: ${feature}`);
    const scopes = oauthConfigService.getRequiredScopesForFeature(feature);

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Important for getting a refresh token
      scope: scopes,
      prompt: 'consent', // Prompt for consent, good for dev, might remove 'consent' for smoother UX later if user already granted
      state: stateString,
    });

    console.log(`[google-oauth /initiate-auth] Generated Google auth URL for user ${userId}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ authUrl }),
      headers: jsonResponseHeaders,
    };
  }

  // Handle OAuth callback from Google
  if (action === 'callback' && event.httpMethod === 'GET') {
    let originUrlForPostMessage = FRONTEND_URL; // Default, will be updated from state

    try {
      const { code, state: stateFromGoogle, error: googleErrorParam } = event.queryStringParameters || {};

      if (stateFromGoogle) {
        try {
          const decodedStateEarly = Buffer.from(stateFromGoogle, 'base64').toString('utf-8');
          const stateObjEarly: OAuthState = JSON.parse(decodedStateEarly);
          originUrlForPostMessage = stateObjEarly.origin || FRONTEND_URL;
          console.log(`[google-oauth /callback] Determined origin for postMessage: ${originUrlForPostMessage}`);
        } catch (e) {
          console.warn('[google-oauth /callback] Could not parse state early for origin. Using default.', e);
        }
      } else {
        console.error('[google-oauth /callback] State parameter is missing from Google callback.');
        return createOAuthError(
          OAuthErrorType.STATE_MISSING,
          'State parameter missing from callback.',
          originUrlForPostMessage
        );
      }

      if (googleErrorParam) {
        console.error(`[google-oauth /callback] Error from Google: ${googleErrorParam}`);
        return createOAuthError(
          OAuthErrorType.GOOGLE_ERROR,
          `Google authentication failed: ${googleErrorParam}`,
          originUrlForPostMessage
        );
      }

      if (!code) {
        console.error('[google-oauth /callback] Code parameter is missing from Google callback.');
        return createOAuthError(
          OAuthErrorType.CODE_MISSING,
          'Authorization code missing from callback.',
          originUrlForPostMessage
        );
      }

      if (isCodeAlreadyUsed(code)) {
        console.warn(`[google-oauth /callback] Auth code ${code.substring(0,10)}... has already been used.`);
        return createOAuthError(
          OAuthErrorType.CODE_USED,
          'Authorization code already used.',
          originUrlForPostMessage
        );
      }
      
      console.log(`[google-oauth /callback] Exchanging code for tokens. Code: ${code.substring(0,10)}...`);
        const tokenResponse = await oauth2Client.getToken(code);
      const tokens: GoogleTokenSet = tokenResponse.tokens;

      if (!tokens || !tokens.access_token) {
        console.error('[google-oauth /callback] Failed to retrieve tokens or access_token from Google.');
        return createOAuthError(
          OAuthErrorType.TOKEN_EXCHANGE_FAILED,
          'Failed to exchange code for tokens.',
          originUrlForPostMessage,
          500
        );
      }
      console.log('[google-oauth /callback] Tokens received from Google.');

      const { access_token, refresh_token, expiry_date, scope: scopeString, id_token } = tokens;
      console.log(`[google-oauth /callback] Scope string from Google: ${scopeString}`);

      const decodedStateString = Buffer.from(stateFromGoogle, 'base64').toString('utf-8');
      const parsedState: OAuthState = JSON.parse(decodedStateString);
      const userIdFromState = parsedState.userId;
      const finalPostMessageOrigin = parsedState.origin || FRONTEND_URL; // Use origin from state for postMessage

      // Basic UUID validation (you might want a more robust one)
      const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      if (!userIdFromState || !uuidRegex.test(userIdFromState)) {
          console.error(`[google-oauth /callback] Invalid or missing user ID in state: ${userIdFromState}`);
          return createOAuthError(
            OAuthErrorType.INVALID_STATE_USERID,
            'User ID in state is invalid.',
            finalPostMessageOrigin
          );
      }
      console.log(`[google-oauth /callback] User ID from state: ${userIdFromState}`);

      let provider_user_id: string | null = null;
      if (id_token) {
        try {
          const idTokenPayload = decodeJwtPayload<GoogleDecodedIdToken>(id_token);
          if (idTokenPayload && idTokenPayload.sub) {
            provider_user_id = idTokenPayload.sub;
            console.log(`[google-oauth /callback] Provider User ID (sub) from id_token: ${provider_user_id}`);
          } else {
            console.error('[google-oauth /callback] Could not extract sub claim from id_token payload');
          }
        } catch (e) {
          console.warn('[google-oauth /callback] Failed to parse id_token to get provider_user_id', e);
        }
      }

      if (!provider_user_id) {
        console.error('[google-oauth /callback] Provider user ID (sub) could not be extracted from id_token.');
        return createOAuthError(
          OAuthErrorType.MISSING_PROVIDER_USERID,
          'Could not determine provider user ID.',
          finalPostMessageOrigin,
          500
        );
      }
      
      const expires_at_timestamp = expiry_date ? new Date(expiry_date).toISOString() : null;

      console.log(`[google-oauth /callback] Saving tokens for user ${userIdFromState}`);
      try {
        await oauthTokenManager.saveToken(
          userIdFromState,
          'google', 
          { 
            access_token, 
            refresh_token, 
            expires_at: expires_at_timestamp,
            scope: scopeString,
            id_token
          }, 
          provider_user_id
        );
      } catch (error) {
        // Handle known OAuth errors
        if (error instanceof OAuthDatabaseError) {
          console.error('[google-oauth /callback] Error saving tokens:', error.message);
          return createOAuthError(
            OAuthErrorType.DATABASE_ERROR,
            `Failed to store tokens: ${error.message}`,
            finalPostMessageOrigin,
            500
          );
        }
        
        // Handle other errors
        console.error('[google-oauth /callback] Unexpected error saving tokens:', error);
        return createOAuthError(
          OAuthErrorType.DATABASE_ERROR,
          `Failed to store tokens: ${error instanceof Error ? error.message : String(error)}`,
          finalPostMessageOrigin,
          500
        );
      }

      console.log(`[google-oauth /callback] Successfully stored tokens for user ${userIdFromState}.`);
      const successHtml = generatePostMessageHtml(
        { type: 'google-oauth-success', provider: 'google' },
        finalPostMessageOrigin,
        'Authorization Success',
        'Authorization successful. You can close this window.'
      );
      return { statusCode: 200, headers: htmlResponseHeaders, body: successHtml };

    } catch (err) {
      const error = err as Error;
      console.error('[google-oauth /callback] General error in callback handler:', error.message, error.stack);
      return createOAuthError(
        OAuthErrorType.CALLBACK_FAILED,
        error.message || 'Unknown error during callback processing.',
        originUrlForPostMessage,
        500
      );
    }
  }

  console.warn(`[google-oauth] Unhandled action or method. Action: ${action}, Method: ${event.httpMethod}, Path: ${event.path}`);
  return {
    statusCode: 404,
    body: JSON.stringify({ message: 'Not Found or Method Not Allowed for action' }),
    headers: jsonResponseHeaders,
  };
};

export { handler };