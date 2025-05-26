// src/frontend/types/googleOAuthErrors.ts

/**
 * Interface for enhanced Google OAuth error responses from the backend
 */
export interface GoogleOAuthErrorResponse {
  message: string;
  details?: string;
  reauth_required: boolean;
  required_scopes?: string[];
  suggested_scopes?: string[];
  error?: string;
}

/**
 * Interface for enhanced Google OAuth errors thrown in the frontend
 */
export interface EnhancedGoogleError extends Error {
  requiredScopes?: string[];
  suggestedScopes?: string[];
  reauthRequired?: boolean;
  details?: string;
}

/**
 * Type guard to check if an error is an enhanced Google OAuth error
 */
export function isEnhancedGoogleError(error: unknown): error is EnhancedGoogleError {
  return error instanceof Error && 
         'reauthRequired' in error && 
         typeof (error as { reauthRequired?: boolean }).reauthRequired === 'boolean';
}

/**
 * Required scopes for Google People API access
 */
export const GOOGLE_REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/contacts.other.readonly'
] as const;