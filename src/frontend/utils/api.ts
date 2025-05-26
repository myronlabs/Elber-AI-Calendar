// src/frontend/utils/api.ts

// Placeholder for the Supabase client instance
import { supabase } from '../services/supabaseClient'; // Import the supabase client
import type { EnhancedGoogleError, GoogleOAuthErrorResponse } from '../types/googleOAuthErrors';

/**
 * Base URL for our Netlify Functions
 */
const API_BASE_URL = '/.netlify/functions';

// Variable to track if we're currently refreshing user data
let isRefreshingUserData = false;

// Configuration for retry behavior
const RETRY_CONFIG = {
  MAX_RETRIES: 2, // Reduced from 3
  INITIAL_BACKOFF_MS: 500, // Reduced from 1000
  MAX_BACKOFF_MS: 2000, // Reduced from 10000
  BACKOFF_MULTIPLIER: 1.5, // Reduced from 2
  // Status codes that warrant a retry (temporary failures)
  RETRYABLE_STATUS_CODES: [408, 429, 500, 502, 503, 504],
};

// Session caching to avoid repeated Supabase calls
interface SessionData {
  access_token?: string;
}

let cachedSession: { session: SessionData | null; timestamp: number } | null = null;
const SESSION_CACHE_TTL = 30000; // 30 seconds cache

/**
 * Get cached session or fetch new one
 */
async function getCachedSession() {
  const now = Date.now();
  
  // Return cached session if still valid
  if (cachedSession && (now - cachedSession.timestamp) < SESSION_CACHE_TTL) {
    return cachedSession.session;
  }
  
  // Fetch new session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(`Failed to get Supabase session: ${sessionError.message}`);
  }
  
  // Cache the session
  cachedSession = { session, timestamp: now };
  return session;
}

/**
 * Clear session cache (call when user logs out)
 */
export function clearSessionCache() {
  cachedSession = null;
}

// Timeout configuration for different request types
const REQUEST_TIMEOUT = 10000; // 10 seconds for most requests
const SEARCH_TIMEOUT = 15000; // 15 seconds for search operations

// Function to check if we're in a refresh operation
export function setApiClientRefreshingState(refreshing: boolean): void {
  isRefreshingUserData = refreshing;
  console.log(`[apiClient] Refresh state set to: ${refreshing}`);
}

/**
 * Helper to implement exponential backoff with jitter for retries
 * @param attempt - The current retry attempt (1-based)
 * @returns Time to wait in milliseconds
 */
function calculateBackoff(attempt: number): number {
  const exponentialBackoff = Math.min(
    RETRY_CONFIG.MAX_BACKOFF_MS,
    RETRY_CONFIG.INITIAL_BACKOFF_MS * Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, attempt - 1)
  );
  // Add jitter to prevent retry storms (0-20% randomization)
  const jitter = Math.random() * 0.2;
  return exponentialBackoff * (1 + jitter);
}

/**
 * Determines if a request should be retried based on error or status code
 * @param error - The error that occurred, if any
 * @param statusCode - The HTTP status code, if any
 * @returns Whether the request should be retried
 */
function isRetryable(error: Error | null, statusCode: number | null): boolean {
  // Network errors are always retryable
  if (error instanceof TypeError && 
      (error.message.includes('NetworkError') || 
       error.message.includes('Failed to fetch') ||
       error.message.includes('Network request failed'))) {
    return true;
  }
  
  // AbortError usually means timeout, which is retryable
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  
  // Check if status code is in our retryable list
  if (statusCode && RETRY_CONFIG.RETRYABLE_STATUS_CODES.includes(statusCode)) {
    return true;
  }
  
  return false;
}

/**
 * Helper function to correctly append a query parameter to a URL.
 * @param url - The base URL string.
 * @param paramName - The name of the parameter to append.
 * @param paramValue - The value of the parameter.
 * @returns The URL with the appended query parameter.
 */
function appendQueryParam(url: string, paramName: string, paramValue: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${paramName}=${paramValue}`;
}

/**
 * Checks if the current session is still valid
 * This function helps prevent message disappearance by verifying token validity
 * @returns Promise<boolean> - true if session is valid, false otherwise
 */
export async function checkSessionValidity(): Promise<boolean> {
  console.log('[apiClient] Checking session validity');
  try {
    // Get current session from Supabase
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.error('[apiClient] Session validation error:', error);
      return false;
    }
    
    if (!session) {
      console.warn('[apiClient] No active session found during validation check');
      return false;
    }
    
    // If we have a session, make a simple API call to verify token is accepted
    try {
      const response = await fetch(`${API_BASE_URL}/validate-token`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      
      // If response is successful, token is valid
      if (response.ok) {
        console.log('[apiClient] Session token validated successfully');
        return true;
      }
      
      console.warn(`[apiClient] Session token validation failed with status: ${response.status}`);
      return false;
    } catch (_error) {
      console.error('[apiClient] Error during token validation request:', _error);
      // If the validate-token endpoint doesn't exist, we can't check - assume valid
      return true;
    }
  } catch (_error) {
    console.error('[apiClient] Unexpected error checking session validity:', _error);
    return false;
  }
}

// Centralized 401 error handler
async function handleUnauthorizedError(endpoint: string): Promise<void> {
  console.warn(`[apiClient] Received 401 Unauthorized for ${endpoint}.`);

  // Don't redirect for certain endpoints that handle their own auth flows
  if (endpoint.includes('google-contacts') || endpoint.includes('google-oauth')) {
    console.log(`[apiClient] Not redirecting after 401 for ${endpoint} since it handles its own auth flow.`);
    return;
  }

  // If we're in the middle of a refresh operation, don't auto-redirect
  if (isRefreshingUserData) {
    console.log(`[apiClient] Not redirecting after 401 because we're in refreshing state. This may be expected during user data refresh operations.`);
    return;
  }

  console.warn(`[apiClient] Signing out and redirecting to login after 401.`);
  try {
    await supabase.auth.signOut();
  } catch (_error) {
    console.error('[apiClient] Error during sign out after 401:', _error);
  }
  // Ensure redirection happens after attempting sign out
  window.location.href = '/login';
}

// GET request helper for our API with automated retry logic
async function get<T>(endpoint: string, params?: Record<string, string | number | boolean>): Promise<T> {
  console.log(`[apiClient] GET: ${endpoint}`, params);

  let attempt = 1;
  let lastError: Error | null = null;
  let lastStatusCode: number | null = null;

  while (attempt <= RETRY_CONFIG.MAX_RETRIES) {
    const isRetry = attempt > 1;
    if (isRetry) {
      const backoffTime = calculateBackoff(attempt);
      console.log(`[apiClient] GET - Retry attempt ${attempt}/${RETRY_CONFIG.MAX_RETRIES} for ${endpoint} after ${backoffTime}ms backoff`);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
    }

    try {
      const session = await getCachedSession();

      const headers: Record<string, string> = {
        'Cache-Control': 'max-age=60'
      };
      
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Convert params to string values for URLSearchParams
      const stringParams: Record<string, string> = {};
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          stringParams[key] = String(value);
        });
      }
      
      // Remove cache busting - let browser cache work

      let fullUrl = `${API_BASE_URL}${endpoint}`;
      Object.entries(stringParams).forEach(([key, value]) => {
        fullUrl = appendQueryParam(fullUrl, key, value);
      });
      
      // Set a reasonable timeout for fetch operations to avoid hanging
      const controller = new AbortController();
      const timeoutDuration = endpoint.includes('search') ? SEARCH_TIMEOUT : REQUEST_TIMEOUT;
      const timeoutId = setTimeout(() => {
        controller.abort();
        console.warn(`[apiClient] GET - Request to ${fullUrl} aborted after ${timeoutDuration}ms timeout`);
      }, timeoutDuration);

      const response = await fetch(fullUrl, {
        headers,
        signal: controller.signal,
      });

      // Clear the timeout since the request completed
      clearTimeout(timeoutId);

      console.log(`[apiClient] GET - Response status for ${fullUrl}: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        lastStatusCode = response.status;
        
        if (response.status === 401) {
          // Special handling for google-related endpoints
          if (endpoint.includes('google-contacts') || endpoint.includes('google-oauth')) {
            console.warn(`[apiClient] 401 for Google endpoint ${endpoint} - requires authentication`);
            
            try {
              // Try to parse the error response to check if it's a reauth_required error
              const errorData = await response.json() as GoogleOAuthErrorResponse;
              if (errorData.reauth_required) {
                console.warn(`[apiClient] Google token requires re-authentication with correct scopes`);
                
                // Log detailed scope information for debugging
                if (errorData.required_scopes) {
                  console.log(`[apiClient] Required scopes: ${errorData.required_scopes.join(', ')}`);
                }
                if (errorData.suggested_scopes) {
                  console.log(`[apiClient] Suggested scopes: ${errorData.suggested_scopes.join(', ')}`);
                }
                
                // Create enhanced error with scope information
                const enhancedError = new Error(`reauth_required: ${errorData.message || 'Google authentication requires new permissions. Please reconnect your account.'}`);
                const typedError = enhancedError as EnhancedGoogleError;
                typedError.requiredScopes = errorData.required_scopes || [];
                typedError.suggestedScopes = errorData.suggested_scopes || [];
                typedError.reauthRequired = true;
                typedError.details = errorData.details;
                
                throw typedError;
              } 
            } catch (parseError) {
              // If parsing fails but it's still a 401 to Google endpoint, assume it's an auth issue
              console.log(`[apiClient] Failed to parse 401 error response: ${parseError}`);
              if (parseError instanceof Error && parseError.message.includes('reauth_required')) {
                throw parseError; // Re-throw the enhanced error
              }
            }
            
            throw new Error(`Google authentication required. Please connect your Google account.`);
          } else {
            await handleUnauthorizedError(endpoint);
            // Throw an error to stop further processing in the calling code,
            // as redirection will occur.
            throw new Error(`Authentication required for ${endpoint}. Redirecting to login.`);
          }
        }

        // Check if we should retry based on status code
        if (isRetryable(null, response.status)) {
          console.log(`[apiClient] GET - Retryable status code ${response.status} for ${endpoint}`);
          attempt++;
          continue;
        }

        console.error(`[apiClient] GET error: ${response.status} ${response.statusText}`);

        // Check content type before attempting to parse as JSON
        const contentType = response.headers.get("content-type");

        // Special handling for OAuth redirects
        if (response.status === 302 && endpoint.includes('google-oauth/authorize')) {
          console.log(`[apiClient] Received 302 redirect for OAuth flow: ${response.headers.get('Location')}`);
          // For redirects from OAuth authorization, follow the redirect
          const redirectUrl = response.headers.get('Location');
          if (redirectUrl) {
            // Check if there's a duplicated Netlify path and fix it if needed
            const normalizedUrl = redirectUrl.replace(/\/\.netlify\/functions\/\.netlify\/functions\//, '/.netlify/functions/');
            console.log(`[apiClient] Opening OAuth window with URL: ${normalizedUrl}`);
            window.open(normalizedUrl, '_blank', 'width=600,height=700');
            return {} as T; // Return empty object to prevent further processing
          }
        }

        if (contentType && contentType.indexOf("application/json") !== -1) {
          try {
            const errorData = await response.json();
            throw new Error(errorData.message || `API request failed with status ${response.status}`);
          } catch (_error) {
            // If errorData.json() fails or no specific message, rethrow with status
            if (_error instanceof Error && _error.message.startsWith('API request failed with status')) throw _error;
            throw new Error(`API request failed with status ${response.status}`);
          }
        } else {
          // For non-JSON responses, log and return appropriate error
          try {
            const errorText = await response.text();
            console.error(`[apiClient] Non-JSON error response (first 200 chars): ${errorText.substring(0, 200)}`);

            // Check if HTML response
            if (errorText.includes('<!DOCTYPE html>') || errorText.includes('<html>')) {
              console.warn(`[apiClient] Response appears to be HTML, not JSON. This is likely a content type mismatch.`);

              // For authenticated endpoints, this might indicate a 401 that returned HTML instead of JSON
              // Try a session validity check
              if (endpoint.includes('google-oauth') || endpoint.includes('oauth')) {
                console.log(`[apiClient] OAuth-related endpoint detected. This might be expected for ${endpoint}.`);

                // For OAuth endpoints, HTML might be valid - especially for redirects
                if (endpoint.includes('google-oauth/authorize')) {
                  return {} as T; // Return empty result to prevent further processing
                }
              }
            }

            throw new Error(`API request failed with status ${response.status}: ${errorText.substring(0, 100)}...`);
          } catch (_error) {
            void _error; // Explicitly mark as unused
            // If we can't even read the error response, throw generic error
            throw new Error(`API request failed with status ${response.status}`);
          }
        }
      }

      // Try to parse successful response based on content type
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        try {
          const jsonData = await response.json();

          // For assistant endpoints, ensure content is never null
          if (endpoint.includes('assistant') && jsonData) {
            if (jsonData.content === null) {
              jsonData.content = '';
            }
          }
          
          return jsonData as T;
        } catch (_error) {
          console.error(`[apiClient] JSON parse error for successful response:`, _error);
          throw new Error(`Failed to parse JSON response: ${_error instanceof Error ? _error.message : String(_error)}`);
        }
      } else {
        console.warn(`[apiClient] GET - Successful response from ${endpoint} was not JSON. Content-Type: ${contentType}.`);

        try {
          // Try to parse as JSON anyway in case Content-Type is wrong
          const textResponse = await response.text();
          try {
            const parsed = JSON.parse(textResponse);
            console.log(`[apiClient] Successfully parsed response as JSON despite Content-Type: ${contentType}`);
            return parsed as T;
          } catch (_error) {
            void _error; // Explicitly mark as unused
            // Special handling for oauth-related endpoints
            if (endpoint.includes('google-oauth') || endpoint.includes('oauth')) {
              console.log(`[apiClient] OAuth endpoint detected with non-JSON response. This might be expected.`);
              // For OAuth endpoints, non-JSON might be valid
              return { success: true, message: "Auth flow in progress" } as T;
            }

            // If parsing fails, throw
            throw new Error(`Response from ${endpoint} is not in JSON format`);
          }
        } catch (_error) {
          throw new Error(`Failed to process response from ${endpoint}: ${_error instanceof Error ? _error.message : String(_error)}`);
        }
      }
    } catch (_error) {
      if (!(_error instanceof Error)) {
        lastError = new Error(String(_error));
      } else {
        lastError = _error;
      }
      
      if (_error instanceof DOMException && _error.name === 'AbortError') {
        const timeoutDuration = endpoint.includes('search') ? SEARCH_TIMEOUT : REQUEST_TIMEOUT;
        console.error(`[apiClient] GET - Request to ${endpoint} timed out after ${timeoutDuration}ms`);
        // Timeouts are retryable
        if (attempt < RETRY_CONFIG.MAX_RETRIES) {
          console.log(`[apiClient] GET - Will retry after timeout for ${endpoint}`);
          attempt++;
          continue;
        }
        throw new Error(`Request to ${endpoint} timed out after ${timeoutDuration / 1000} seconds. Please check your network connection and try again. If this issue persists, try refreshing the page or restarting your browser.`);
      }
      
      // If it's the auth error we threw, re-throw it so it propagates
      if (_error instanceof Error && (_error.message.startsWith('Authentication required') || 
                                      _error.message.startsWith('Google authentication required'))) {
        throw _error;
      }

      // Enhanced error handling for network errors
      if (_error instanceof TypeError && 
          (_error.message.includes('NetworkError') || _error.message.includes('Failed to fetch'))) {
        
        if (!isRetry) { // isRetry is true if attempt > 1
            console.error(`[apiClient] GET - Initial NetworkError for ${endpoint}. Details:`, _error);
        }
        console.error(`[apiClient] GET - Network error detected for ${endpoint} (attempt ${attempt}/${RETRY_CONFIG.MAX_RETRIES}). Message: ${_error.message}. This could be due to connectivity issues.`);
        
        lastError = _error; // Update lastError with the current network error

        if (attempt < RETRY_CONFIG.MAX_RETRIES) {
          console.log(`[apiClient] GET - Will retry after network error for ${endpoint}`);
          attempt++;
          continue; 
        }
        
        // If we've exhausted retries, throw a comprehensive error
        throw new Error(`Network error: Unable to connect to the server for ${endpoint.split('/').pop() || 'the requested operation'} after ${RETRY_CONFIG.MAX_RETRIES} attempts. Please check your internet connection and try again. Original error: ${_error.message}`);
      }
      
      if (_error instanceof Error) throw _error; // Re-throw other errors
      throw new Error(`Network error during GET to ${endpoint}: ${String(_error)}`);
    }
  }
  
  // If we've exhausted all retries, throw the last error
  if (lastError) {
    if (isRetryable(lastError, lastStatusCode)) {
      console.error(`[apiClient] GET - Exhausted all ${RETRY_CONFIG.MAX_RETRIES} retry attempts for ${endpoint}`);
      throw new Error(`Failed to complete request after ${RETRY_CONFIG.MAX_RETRIES} attempts: ${lastError.message}`);
    }
    throw lastError;
  }
  
  // This should never be reached because the while loop exits only when we return or throw
  throw new Error(`Unexpected error in GET request to ${endpoint}`);
}

// POST request helper for our API with automated retry logic
async function post<T, R>(endpoint: string, data: T, params?: Record<string, string | number | boolean>): Promise<R> {
  console.log(`[apiClient] POST: ${endpoint}`, endpoint.includes('assistant') ? { messageCount: (data as { messages?: unknown[] })?.messages?.length || 0 } : data);

  let attempt = 1;
  let lastError: Error | null = null;
  let lastStatusCode: number | null = null;

  while (attempt <= RETRY_CONFIG.MAX_RETRIES) {
    const isRetry = attempt > 1;
    if (isRetry) {
      const backoffTime = calculateBackoff(attempt);
      console.log(`[apiClient] POST - Retry attempt ${attempt}/${RETRY_CONFIG.MAX_RETRIES} for ${endpoint} after ${backoffTime}ms backoff`);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
    }

    try {
      const session = await getCachedSession();

      const headers: Record<string, string> = { 
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=60'
      };
      
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Add a cache-busting query parameter
      let fullUrl = `${API_BASE_URL}${endpoint}`;
      fullUrl = appendQueryParam(fullUrl, '_t', Date.now().toString());
      
      // Add any additional params
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          fullUrl = appendQueryParam(fullUrl, key, String(value));
        });
      }
      
      console.log(`[apiClient] POST - Requesting URL: ${fullUrl}`);

      // Set a reasonable timeout for fetch operations to avoid hanging
      const controller = new AbortController();
      const timeoutDuration = endpoint.includes('search') ? SEARCH_TIMEOUT : REQUEST_TIMEOUT;
      const timeoutId = setTimeout(() => {
        controller.abort();
        console.warn(`[apiClient] POST - Request to ${fullUrl} aborted after ${timeoutDuration}ms timeout`);
      }, timeoutDuration);

      const response = await fetch(fullUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      // Clear the timeout since the request completed
      clearTimeout(timeoutId);

      console.log(`[apiClient] POST - Response status for ${fullUrl}: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        lastStatusCode = response.status;
        
        if (response.status === 401) {
          // Special handling for google-related endpoints
          if (endpoint.includes('google-contacts') || endpoint.includes('google-oauth')) {
            console.warn(`[apiClient] 401 for Google endpoint ${endpoint} - requires authentication`);
            
            try {
              // Try to parse the error response to check if it's a reauth_required error
              const errorData = await response.json() as GoogleOAuthErrorResponse;
              if (errorData.reauth_required) {
                console.warn(`[apiClient] Google token requires re-authentication with correct scopes`);
                
                // Log detailed scope information for debugging
                if (errorData.required_scopes) {
                  console.log(`[apiClient] Required scopes: ${errorData.required_scopes.join(', ')}`);
                }
                if (errorData.suggested_scopes) {
                  console.log(`[apiClient] Suggested scopes: ${errorData.suggested_scopes.join(', ')}`);
                }
                
                // Create enhanced error with scope information
                const enhancedError = new Error(`reauth_required: ${errorData.message || 'Google authentication requires new permissions. Please reconnect your account.'}`);
                const typedError = enhancedError as EnhancedGoogleError;
                typedError.requiredScopes = errorData.required_scopes || [];
                typedError.suggestedScopes = errorData.suggested_scopes || [];
                typedError.reauthRequired = true;
                typedError.details = errorData.details;
                
                throw typedError;
              } 
            } catch (parseError) {
              // If parsing fails but it's still a 401 to Google endpoint, assume it's an auth issue
              console.log(`[apiClient] Failed to parse 401 error response: ${parseError}`);
              if (parseError instanceof Error && parseError.message.includes('reauth_required')) {
                throw parseError; // Re-throw the enhanced error
              }
            }
            
            throw new Error(`Google authentication required. Please connect your Google account.`);
          } else {
            await handleUnauthorizedError(fullUrl);
            throw new Error(`Authentication required for ${fullUrl}. Redirecting to login.`);
          }
        }
        
        // Check if we should retry based on status code
        if (isRetryable(null, response.status)) {
          console.log(`[apiClient] POST - Retryable status code ${response.status} for ${endpoint}`);
          attempt++;
          continue;
        }
        
        let errorText = '';
        try {
          errorText = await response.text();
        } catch (_error) {
          void _error; // Explicitly mark as unused
          errorText = 'Failed to extract error text from response';
        }

        console.error(`[apiClient] POST - Error status ${response.status} for ${fullUrl}. Raw response:`, errorText);
        let detailedMessage = `API POST to ${endpoint} failed: ${response.status} ${response.statusText}`;
        if (errorText) {
          detailedMessage += ` - Response: ${errorText.substring(0, 200)}${errorText.length > 200 ? '...' : ''}`;
        }
        throw new Error(detailedMessage);
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        try {
          const jsonData = await response.json();

          // For assistant endpoints, ensure content is never null
          if (endpoint.includes('assistant') && jsonData) {
            if (jsonData.content === null) {
              jsonData.content = '';
            }
          }
          
          return jsonData as R;
        } catch (_error) {
          console.error(`[apiClient] POST - JSON parse error for ${fullUrl}:`, _error);

          // Get the raw text for better debugging
          try {
            const rawText = await response.clone().text();
            console.error(`[apiClient] Raw response body (first 500 chars):`, rawText.substring(0, 500));

            // Check if it looks like HTML (common error case)
            if (rawText.trim().startsWith('<!DOCTYPE html>') || rawText.trim().startsWith('<html>')) {
              console.warn(`[apiClient] Response appears to be HTML, not JSON. This is likely a content type mismatch.`);

              // For authenticated endpoints, this might indicate a 401 that returned HTML instead of JSON
              // Try a session validity check
              if (endpoint.includes('google-oauth') || endpoint.includes('oauth')) {
                console.log(`[apiClient] OAuth-related endpoint detected. This might be expected for ${endpoint}.`);
                // For OAuth endpoints, HTML might be valid - return success
                return { success: true, message: "Auth flow in progress" } as R;
              }
            }
          } catch (_error) {
            console.error(`[apiClient] Failed to get raw text after JSON parse error:`, _error);
          }

          throw new Error(`Failed to parse JSON from ${endpoint}: ${_error instanceof Error ? _error.message : String(_error)}`);
        }
      } else {
        console.warn(`[apiClient] POST - Response from ${fullUrl} was not JSON. Content-Type: ${contentType}.`);
        const textResponse = await response.text();

        // Log the first part of the response for debugging
        console.log(`[apiClient] Non-JSON response (first 100 chars): ${textResponse.substring(0, 100)}`);

        try {
          // Try to parse it as JSON anyway in case the Content-Type header is wrong
          const parsed = JSON.parse(textResponse);
          console.log(`[apiClient] Successfully parsed response as JSON despite Content-Type: ${contentType}`);
          return parsed as R;
        } catch (_error) {
          void _error; // Explicitly mark as unused
          // Handle specific endpoints differently
          if (endpoint.includes('google-oauth') || endpoint.includes('oauth')) {
            console.log(`[apiClient] OAuth endpoint detected. HTML response might be expected for ${endpoint}.`);
            // For OAuth endpoints, non-JSON might be valid - if it's HTML, that could be intended
            if (textResponse.includes('<!DOCTYPE html>') || textResponse.includes('<html>')) {
              return { success: true, message: "Auth flow in progress" } as R;
            }
          }

          console.warn(`[apiClient] Could not parse non-JSON response as JSON. Returning as text.`);
          // If it's not valid JSON, return as text
          return textResponse as R;
        }
      }
    } catch (_error) {
      if (!(_error instanceof Error)) {
        lastError = new Error(String(_error));
      } else {
        lastError = _error;
      }
      
      if (_error instanceof DOMException && _error.name === 'AbortError') {
        const timeoutDuration = endpoint.includes('search') ? SEARCH_TIMEOUT : REQUEST_TIMEOUT;
        console.error(`[apiClient] POST - Request to ${endpoint} timed out after ${timeoutDuration}ms`);
        // Timeouts are retryable
        if (attempt < RETRY_CONFIG.MAX_RETRIES) {
          console.log(`[apiClient] POST - Will retry after timeout for ${endpoint}`);
          attempt++;
          continue;
        }
        throw new Error(`Request to ${endpoint} timed out after ${timeoutDuration / 1000} seconds. Please check your network connection and try again. If this issue persists, try refreshing the page or restarting your browser.`);
      }
      
      // If it's the auth error we threw, re-throw it so it propagates
      if (_error instanceof Error && _error.message.startsWith('Authentication required')) {
        throw _error;
      }

      console.error(`[apiClient] POST - Network or other fetch error for ${endpoint}:`, _error);
      
      // Enhanced error handling for network errors
      if (_error instanceof TypeError && 
          (_error.message.includes('NetworkError') || _error.message.includes('Failed to fetch'))) {
        
        if (!isRetry) { // isRetry is true if attempt > 1
            console.error(`[apiClient] POST - Initial NetworkError for ${endpoint}. Details:`, _error);
        }
        console.error(`[apiClient] POST - Network error detected for ${endpoint} (attempt ${attempt}/${RETRY_CONFIG.MAX_RETRIES}). Message: ${_error.message}. This could be due to connectivity issues.`);
        
        lastError = _error; // Update lastError with the current network error
        
        if (attempt < RETRY_CONFIG.MAX_RETRIES) {
          console.log(`[apiClient] POST - Will retry after network error for ${endpoint}`);
          attempt++;
          continue;
        }
        
        throw new Error(`Network error: Unable to connect to the server for ${endpoint.split('/').pop() || 'the requested operation'} after ${RETRY_CONFIG.MAX_RETRIES} attempts. Please check your internet connection and try again. Original error: ${_error.message}`);
      }
      
      if (_error instanceof Error) throw _error; // Re-throw other errors
      throw new Error(`Network error during POST to ${endpoint}: ${String(_error)}`);
    }
  }
  
  // If we've exhausted all retries, throw the last error
  if (lastError) {
    if (isRetryable(lastError, lastStatusCode)) {
      console.error(`[apiClient] POST - Exhausted all ${RETRY_CONFIG.MAX_RETRIES} retry attempts for ${endpoint}`);
      throw new Error(`Failed to complete request after ${RETRY_CONFIG.MAX_RETRIES} attempts: ${lastError.message}`);
    }
    throw lastError;
  }
  
  // This should never be reached because the while loop exits only when we return or throw
  throw new Error(`Unexpected error in POST request to ${endpoint}`);
}

// PUT request helper for our API with automated retry logic
async function put<T, R>(endpoint: string, data: T): Promise<R> {
  console.log(`[apiClient] PUT: ${endpoint}`, data);

  // Add specific handling for contact updates
  const isContactUpdate = endpoint.includes('/contacts/') && !endpoint.includes('?');
  let cacheBustedEndpoint = endpoint;
  if (isContactUpdate) {
    // Ensure nocache is appended correctly if endpoint itself has params
    cacheBustedEndpoint = appendQueryParam(endpoint, 'nocache', Date.now().toString());
  }
    
  console.log(`[apiClient] Using endpoint: ${cacheBustedEndpoint}`);

  let attempt = 1;
  let lastStatusCode = 0;
  let lastError = null;

  while (attempt <= RETRY_CONFIG.MAX_RETRIES) {
    const isRetry = attempt > 1;
    if (isRetry) {
      const backoffTime = calculateBackoff(attempt);
      console.log(`[apiClient] PUT - Retry attempt ${attempt}/${RETRY_CONFIG.MAX_RETRIES} for ${endpoint} after ${backoffTime}ms backoff`);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
    }

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error(`[apiClient] PUT - Supabase session error for ${endpoint}:`, sessionError);
        throw new Error(`Failed to get Supabase session for PUT ${endpoint}: ${sessionError.message}`);
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      } else {
        console.warn(`[apiClient] PUT - No auth token for ${endpoint}. Request will be unauthenticated.`);
      }
      
      // Add a cache-busting query parameter
      let fullUrl = `${API_BASE_URL}${cacheBustedEndpoint}`;
      fullUrl = appendQueryParam(fullUrl, '_t', Date.now().toString());
      
      // Set a reasonable timeout for fetch operations to avoid hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        console.warn(`[apiClient] PUT - Request to ${fullUrl} aborted after timeout`);
      }, 30000); // 30 second timeout
      
      const response = await fetch(fullUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data),
        signal: controller.signal,
      });
      
      // Clear the timeout since the request completed
      clearTimeout(timeoutId);
      
      console.log(`[apiClient] PUT - Response status for ${fullUrl}: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        lastStatusCode = response.status;
        
        if (response.status === 401) {
          await handleUnauthorizedError(endpoint);
          throw new Error(`Authentication required for ${endpoint}. Redirecting to login.`);
        }
        
        console.error(`[apiClient] PUT error: ${response.status} ${response.statusText}`);
        
        // Check if we should retry based on status code
        if (isRetryable(null, response.status)) {
          console.log(`[apiClient] PUT - Retryable status code ${response.status} for ${endpoint}`);
          attempt++;
          continue;
        }
        
        try {
          const errorData = await response.json();
          throw new Error(errorData.message || `API request failed with status ${response.status}`);
        } catch (_error) {
          if (_error instanceof Error && _error.message.startsWith('API request failed with status')) throw _error;
          throw new Error(`API request failed with status ${response.status}`);
        }
      }
      
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        try {
          return await response.json() as R;
        } catch (_error) {
          console.error(`[apiClient] PUT - JSON parse error for ${fullUrl}:`, _error);
          throw new Error(`Failed to parse JSON from ${endpoint}: ${_error instanceof Error ? _error.message : String(_error)}`);
        }
      } else {
        console.warn(`[apiClient] PUT - Response from ${fullUrl} was not JSON. Content-Type: ${contentType}.`);
        const textResponse = await response.text();

        try {
          // Try to parse it as JSON anyway in case the Content-Type header is wrong
          const parsed = JSON.parse(textResponse);
          console.log(`[apiClient] Successfully parsed response as JSON despite Content-Type: ${contentType}`);
          return parsed as R;
        } catch (_error) {
          void _error; // Explicitly mark as unused
          console.warn(`[apiClient] Could not parse non-JSON response as JSON. Returning as text.`);
          // If it's not valid JSON, return as text
          return textResponse as R;
        }
      }
    } catch (_error) {
      if (!(_error instanceof Error)) {
        lastError = new Error(String(_error));
      } else {
        lastError = _error;
      }
      
      if (_error instanceof DOMException && _error.name === 'AbortError') {
        console.error(`[apiClient] PUT - Request to ${endpoint} timed out after 30 seconds`);
        // Timeouts are retryable
        if (attempt < RETRY_CONFIG.MAX_RETRIES) {
          console.log(`[apiClient] PUT - Will retry after timeout for ${endpoint}`);
          attempt++;
          continue;
        }
      }
      
      // If it's the auth error we threw, re-throw it so it propagates
      if (_error instanceof Error && _error.message.startsWith('Authentication required')) {
        throw _error;
      }
      
      console.error(`[apiClient] PUT - Network or other fetch error for ${endpoint}:`, _error);
      
      // Enhanced error handling for network errors
      if (_error instanceof TypeError && 
          (_error.message.includes('NetworkError') || _error.message.includes('Failed to fetch'))) {
        
        if (!isRetry) { // isRetry is true if attempt > 1
            console.error(`[apiClient] PUT - Initial NetworkError for ${endpoint}. Details:`, _error);
        }
        console.error(`[apiClient] PUT - Network error detected for ${endpoint} (attempt ${attempt}/${RETRY_CONFIG.MAX_RETRIES}). Message: ${_error.message}. This could be due to connectivity issues.`);
        
        lastError = _error; // Update lastError with the current network error
        
        if (attempt < RETRY_CONFIG.MAX_RETRIES) {
          console.log(`[apiClient] PUT - Will retry after network error for ${endpoint}`);
          attempt++;
          continue;
        }
        
        throw new Error(`Network error: Unable to connect to the server for ${endpoint.split('/').pop() || 'the requested operation'} after ${RETRY_CONFIG.MAX_RETRIES} attempts. Please check your internet connection and try again. Original error: ${_error.message}`);
      }
      
      if (_error instanceof Error) throw _error; // Re-throw other errors
      throw new Error(`Network error during PUT to ${endpoint}: ${String(_error)}`);
    }
  }
  
  // If we've exhausted all retries, throw the last error
  if (lastError) {
    if (isRetryable(lastError, lastStatusCode)) {
      console.error(`[apiClient] PUT - Exhausted all ${RETRY_CONFIG.MAX_RETRIES} retry attempts for ${endpoint}`);
      throw new Error(`Failed to complete request after ${RETRY_CONFIG.MAX_RETRIES} attempts: ${lastError.message}`);
    }
    throw lastError;
  }
  
  // This should never be reached because the while loop exits only when we return or throw
  throw new Error(`Unexpected error in PUT request to ${endpoint}`);
}

// DELETE request helper for our API with automated retry logic
async function del<T = Record<string, unknown>, R = unknown>(endpoint: string, data?: T): Promise<R> {
  console.log(`[apiClient] DELETE: ${endpoint}`);

  let attempt = 1;
  let lastError: Error | null = null;
  let lastStatusCode: number | null = null;

  while (attempt <= RETRY_CONFIG.MAX_RETRIES) {
    const isRetry = attempt > 1;
    if (isRetry) {
      const backoffTime = calculateBackoff(attempt);
      console.log(`[apiClient] DELETE - Retry attempt ${attempt}/${RETRY_CONFIG.MAX_RETRIES} for ${endpoint} after ${backoffTime}ms backoff`);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
    }

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error(`[apiClient] DELETE - Supabase session error for ${endpoint}:`, sessionError);
        throw new Error(`Failed to get Supabase session for DELETE ${endpoint}: ${sessionError.message}`);
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json', // Keep Content-Type even for DELETE if backend expects it or for consistency
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      };
      
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
        console.log(`[apiClient] DELETE - Auth token retrieved for ${endpoint}.`);
      } else {
        console.warn(`[apiClient] DELETE - No auth token for ${endpoint}. Request will be unauthenticated.`);
        // Even if no token, proceed with request; backend will decide if it's allowed.
        // If it results in a 401, the handler below will catch it.
      }

      // Add a cache-busting query parameter
      let fullUrl = `${API_BASE_URL}${endpoint}`;
      fullUrl = appendQueryParam(fullUrl, '_t', Date.now().toString());
      
      // Set a reasonable timeout for fetch operations to avoid hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        console.warn(`[apiClient] DELETE - Request to ${fullUrl} aborted after timeout`);
      }, 30000); // 30 second timeout

      const response = await fetch(fullUrl, {
        method: 'DELETE',
        headers,
        body: data ? JSON.stringify(data) : undefined, // Add body if data is provided
        signal: controller.signal,
      });

      // Clear the timeout since the request completed
      clearTimeout(timeoutId);

      console.log(`[apiClient] DELETE - Response status for ${fullUrl}: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        lastStatusCode = response.status;
        
        if (response.status === 401) {
          await handleUnauthorizedError(endpoint);
          throw new Error(`Authentication required for ${endpoint}. Redirecting to login.`);
        }
        
        // Check if we should retry based on status code
        if (isRetryable(null, response.status)) {
          console.log(`[apiClient] DELETE - Retryable status code ${response.status} for ${endpoint}`);
          attempt++;
          continue;
        }
        
        console.error(`[apiClient] DELETE error: ${response.status} ${response.statusText}`);
        try {
          const errorData = await response.json();
          throw new Error(errorData.message || `API request failed with status ${response.status}`);
        } catch (_error) {
          if (_error instanceof Error && _error.message.startsWith('API request failed with status')) throw _error;
          throw new Error(`API request failed with status ${response.status}`);
        }
      }

      // For DELETE requests, often there's no JSON body in the response (e.g., 204 No Content)
      // Or it might be a success message. Handle this gracefully.
      if (response.status === 204) {
        return Promise.resolve(null as R); 
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        try {
          return await response.json() as Promise<R>;
        } catch (_error) {
          console.error(`[apiClient] DELETE - JSON parse error for ${endpoint}:`, _error);
          // If JSON parsing fails but status was ok (e.g. 200 with malformed JSON), it's an issue.
          throw new Error(`Failed to parse JSON from ${endpoint} after DELETE: ${_error instanceof Error ? _error.message : String(_error)}`);
        }
      } else {
        console.warn(`[apiClient] DELETE - Response from ${fullUrl} was not JSON. Content-Type: ${contentType}.`);
        const textResponse = await response.text();

        try {
          // Try to parse it as JSON anyway in case the Content-Type header is wrong
          const parsed = JSON.parse(textResponse);
          console.log(`[apiClient] Successfully parsed response as JSON despite Content-Type: ${contentType}`);
          return parsed as R;
        } catch (_error) {
          void _error; // Explicitly mark as unused
          // If not JSON and not 204, try to return text or an empty success object
          if (textResponse) {
            return textResponse as R; // Or try to parse if expected
          }
          return Promise.resolve({} as R);
        }
      }
    } catch (_error) {
      if (!(_error instanceof Error)) {
        lastError = new Error(String(_error));
      } else {
        lastError = _error;
      }
      
      if (_error instanceof DOMException && _error.name === 'AbortError') {
        console.error(`[apiClient] DELETE - Request to ${endpoint} timed out after 30 seconds`);
        // Timeouts are retryable
        if (attempt < RETRY_CONFIG.MAX_RETRIES) {
          console.log(`[apiClient] DELETE - Will retry after timeout for ${endpoint}`);
          attempt++;
          continue;
        }
        throw new Error(`Request to ${endpoint} timed out after 30 seconds. Please check your network connection and try again. If this issue persists, try refreshing the page or restarting your browser.`);
      }
      
      // If it's the auth error we threw, re-throw it so it propagates
      if (_error instanceof Error && _error.message.startsWith('Authentication required')) {
        throw _error;
      }

      console.error(`[apiClient] DELETE - Network or other fetch error for ${endpoint}:`, _error);
      
      // Enhanced error handling for network errors
      if (_error instanceof TypeError && 
          (_error.message.includes('NetworkError') || _error.message.includes('Failed to fetch'))) {
        
        if (!isRetry) { // isRetry is true if attempt > 1
            console.error(`[apiClient] DELETE - Initial NetworkError for ${endpoint}. Details:`, _error);
        }
        console.error(`[apiClient] DELETE - Network error detected for ${endpoint} (attempt ${attempt}/${RETRY_CONFIG.MAX_RETRIES}). Message: ${_error.message}. This could be due to connectivity issues.`);
        
        lastError = _error; // Update lastError with the current network error

        if (attempt < RETRY_CONFIG.MAX_RETRIES) {
          console.log(`[apiClient] DELETE - Will retry after network error for ${endpoint}`);
          attempt++;
          continue;
        }
        
        throw new Error(`Network error: Unable to connect to the server for ${endpoint.split('/').pop() || 'the requested operation'} after ${RETRY_CONFIG.MAX_RETRIES} attempts. Please check your internet connection and try again. Original error: ${_error.message}`);
      }
      
      if (_error instanceof Error) throw _error; // Re-throw other errors
      throw new Error(`Network error during DELETE to ${endpoint}: ${String(_error)}`);
    }
  }
  
  // If we've exhausted all retries, throw the last error
  if (lastError) {
    if (isRetryable(lastError, lastStatusCode)) {
      console.error(`[apiClient] DELETE - Exhausted all ${RETRY_CONFIG.MAX_RETRIES} retry attempts for ${endpoint}`);
      throw new Error(`Failed to complete request after ${RETRY_CONFIG.MAX_RETRIES} attempts: ${lastError.message}`);
    }
    throw lastError;
  }
  
  // This should never be reached because the while loop exits only when we return or throw
  throw new Error(`Unexpected error in DELETE request to ${endpoint}`);
}

export const apiClient = {
  get,
  post,
  put,
  delete: del, // 'delete' is a reserved keyword
};
