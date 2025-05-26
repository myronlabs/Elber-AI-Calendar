/**
 * Required scopes for Google People API access
 */
export const GOOGLE_REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/contacts.other.readonly'
];

/**
 * Common error types for Google API errors
 */
export enum GoogleErrorType {
  INSUFFICIENT_SCOPE = 'insufficient_scope',
  TOKEN_EXPIRED = 'token_expired',
  API_NOT_ENABLED = 'api_not_enabled',
  UNAUTHORIZED = 'unauthorized',
  RATE_LIMIT = 'rate_limit',
  SERVER_ERROR = 'server_error'
}

/**
 * Helper function to check if an error is related to insufficient scopes
 */
export function isInsufficientScopeError(errorMessage: string): boolean {
  return !!(
    errorMessage.includes("Insufficient Permission") || 
    errorMessage.includes("insufficient_scope") ||
    errorMessage.includes("insufficientPermissions")
  );
}

/**
 * Helper function to check if an error indicates the API is not enabled
 */
export function isApiNotEnabledError(errorMessage: string): boolean {
  return !!(
    errorMessage.includes("People API has not been used") ||
    errorMessage.includes("API not enabled") ||
    errorMessage.includes("accessNotConfigured")
  );
}