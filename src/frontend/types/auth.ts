// src/frontend/types/auth.ts
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { reserveForFutureUse } from '../utils/SearchMatchType';

// Verification status is completely separate from authentication
// Note: All enum values are kept for type completeness even if not all are currently used
export enum VerificationStatus {
  UNVERIFIED = 'unverified',
  VERIFIED = 'verified',
  PENDING = 'pending',
  // Special cases
  EXEMPT = 'exempt', // Users exempt from verification (e.g., during password reset)
  UNKNOWN = 'unknown' // Default state when verification status cannot be determined
}

// Authentication state is its own concept
// Note: All enum values are kept for type completeness even if not all are currently used
export enum AuthenticationState {
  AUTHENTICATED = 'authenticated',
  UNAUTHENTICATED = 'unauthenticated',
  INITIALIZING = 'initializing',
  TOKEN_EXPIRED = 'token_expired',
  ERROR = 'error'
}

// Flow types represent different user journey paths
// Note: All enum values are kept for type completeness even if not all are currently used
export enum AuthFlow {
  NORMAL_SIGNIN = 'normal_signin',
  SIGNUP = 'signup',
  PASSWORD_RECOVERY = 'password_recovery',
  EMAIL_VERIFICATION = 'email_verification',
  SIGNOUT = 'signout',
  NONE = 'none'
}

// Define a values object for each enum to use in actual code
export const VerificationStatusValues = {
  UNVERIFIED: VerificationStatus.UNVERIFIED,
  VERIFIED: VerificationStatus.VERIFIED,
  PENDING: VerificationStatus.PENDING,
  EXEMPT: VerificationStatus.EXEMPT,
  UNKNOWN: VerificationStatus.UNKNOWN
};

export const AuthenticationStateValues = {
  AUTHENTICATED: AuthenticationState.AUTHENTICATED,
  UNAUTHENTICATED: AuthenticationState.UNAUTHENTICATED,
  INITIALIZING: AuthenticationState.INITIALIZING,
  TOKEN_EXPIRED: AuthenticationState.TOKEN_EXPIRED,
  ERROR: AuthenticationState.ERROR
};

export const AuthFlowValues = {
  NORMAL_SIGNIN: AuthFlow.NORMAL_SIGNIN,
  SIGNUP: AuthFlow.SIGNUP,
  PASSWORD_RECOVERY: AuthFlow.PASSWORD_RECOVERY,
  EMAIL_VERIFICATION: AuthFlow.EMAIL_VERIFICATION,
  SIGNOUT: AuthFlow.SIGNOUT,
  NONE: AuthFlow.NONE
};

export interface ProfileData {
  id: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string | null;
  is_custom_verified: boolean;
  // For any additional profile fields
  [key: string]: unknown;
}

/**
 * Operation-specific loading states for better granularity
 * This allows individual features to show loading states without affecting others
 */
export interface AuthOperationState {
  // Session and initialization operations
  isInitializing: boolean;  // Initial auth state loading
  isRefreshingSession: boolean;  // Refreshing session token
  isProfileLoading: boolean; // Loading user profile

  // User operation states
  isSigningIn: boolean;
  isSigningUp: boolean;
  isSigningOut: boolean;
  isVerifying: boolean;
  isSendingPasswordReset: boolean;
  isResettingPassword: boolean;
  isUpdatingProfile: boolean;
}

// Reserve all enum values for future use to prevent linting errors
reserveForFutureUse({
  ...VerificationStatusValues,
  ...AuthenticationStateValues,
  ...AuthFlowValues
});

export interface AuthContextState {
  // Supabase-specific data
  user: SupabaseUser | null;
  session: Session | null;
  profile: ProfileData | null;

  // Our application's additional state
  authState: AuthenticationState;
  verificationStatus: VerificationStatus;
  currentFlow: AuthFlow | null;

  // Operation-specific loading states
  operations: AuthOperationState;

  // Error and success messages
  error: Error | null;
  successMessage?: string;
  isLoading: boolean;
  isRefreshing: boolean;
}

export interface ToastInfo {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

export interface AuthResult {
  success: boolean;
  message?: string;
  toast?: ToastInfo;
  authState?: AuthenticationState;
  verificationStatus?: VerificationStatus;
}