// src/frontend/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { Session, AuthChangeEvent, UserAttributes } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { setApiClientRefreshingState } from '../utils/api';
import { initializeUserSettings, syncServerToLocalSettings, clearAllSettings } from '../services/userSettingsService';
import { VerificationService } from '../services/verificationService';
import {
  AuthContextState,
  AuthenticationState,
  VerificationStatus,
  AuthFlow,
  ProfileData,
  AuthResult
} from '../types/auth';
import { apiClient } from '../utils/api';

// Define AuthOperationState here
interface AuthOperationState {
  isInitializing: boolean;
  isRefreshingSession: boolean;
  isProfileLoading: boolean;
  isSigningIn: boolean;
  isSigningUp: boolean;
  isSigningOut: boolean;
  isVerifying: boolean;
  isSendingPasswordReset: boolean;
  isResettingPassword: boolean;
  isUpdatingProfile: boolean;
}

interface AuthContextType extends AuthContextState {
  // Authentication operations
  signIn: (_email?: string, _password?: string) => Promise<AuthResult | undefined>;
  signUp: (_email?: string, _password?: string, _firstName?: string, _lastName?: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  sendPasswordResetEmail: (_email: string) => Promise<AuthResult>;
  updateUserAttributes: (_attributes: UserAttributes) => Promise<void>;

  // Session and profile operations
  refreshUserData: () => Promise<void>;
  refreshSession: () => Promise<void>;
  fetchUserProfile: (tokenOverride?: string) => Promise<ProfileData | null>;

  // State management
  clearMessages: () => void;
  setAuthFlow: (_flow: AuthFlow) => void; // New method to explicitly set the auth flow

  // Helper methods for state access
  getVerificationStatus: () => VerificationStatus;
  getCurrentAuthFlow: () => AuthFlow | null;

  // UI helpers for component rendering
  isOperationLoading: (_operation: keyof AuthOperationState) => boolean;

  // Check specific states for components
  isAuthReady: () => boolean; // Auth system initialized and ready
  isAuthenticated: () => boolean; // User is authenticated with valid session
  isVerified: () => boolean; // User is verified (either fully or exempt)
  isLoading: boolean; // General loading state for auth initialization/session refresh
  isRefreshing: boolean; // State for refreshUserData operation
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }: AuthProviderProps) => {
  // Helper function to update specific operation states
  const updateOperationState = (
    operationName: keyof AuthOperationState,
    isActive: boolean
  ) => {
    setAuthState((prevState: AuthContextState) => ({
      ...prevState,
      operations: {
        ...prevState.operations,
        [operationName]: isActive
      }
    }));
  };
  const [authState, setAuthState] = useState<AuthContextState>(() => {
    // Determine initial isLoading state based on whether there's a persisted session that needs validation
    // This is a simplified initial check. More complex logic might be needed based on app requirements.

    return {
      user: null,
      session: null,
      profile: null,
      authState: AuthenticationState.INITIALIZING,
      verificationStatus: VerificationStatus.UNKNOWN,
      currentFlow: null,
      operations: {
        isInitializing: true, // Will be set to false after initial load
        isRefreshingSession: false,
        isProfileLoading: false,
        isSigningIn: false,
        isSigningUp: false,
        isSigningOut: false,
        isVerifying: false,
        isSendingPasswordReset: false,
        isResettingPassword: false,
        isUpdatingProfile: false,
      },
      error: null,
      isLoading: true, // Initially true until first session check completes
      isRefreshing: false, // Specific to refreshUserData
    };
  });

  // Function to fetch the user's profile data - extracted as reusable
  const fetchUserProfile = useCallback(async (tokenOverride?: string): Promise<ProfileData | null> => {
    console.log('[AuthContext] fetchUserProfile: Attempting to fetch profile. Token source:', tokenOverride ? 'override' : 'authState', 'Token available:', !!(tokenOverride || authState.session?.access_token), 'Token (first 10 chars):', (tokenOverride || authState.session?.access_token)?.substring(0, 10));

    if (!tokenOverride && !authState.session?.access_token) {
      console.warn('[AuthContext] fetchUserProfile: No active session or access token (and no override). Aborting profile fetch.');
      return null;
    }

    try {
      updateOperationState('isProfileLoading', true);

      let profileData: ProfileData | null = null;

      if (tokenOverride) {
        // Use direct fetch if a token override is provided
        console.log('[AuthContext] fetchUserProfile: Using direct fetch with token override for /.netlify/functions/get-profile');
        const profileResponse = await fetch(`/.netlify/functions/get-profile`, {
          headers: {
            'Authorization': `Bearer ${tokenOverride}`,
            'Content-Type': 'application/json'
          }
        });
        console.log('[AuthContext] fetchUserProfile (direct): Fetch call completed. Response status:', profileResponse.status);
        if (profileResponse.ok) {
          profileData = await profileResponse.json() as ProfileData;
        } else {
          const errorText = await profileResponse.text();
          console.error('[AuthContext] fetchUserProfile (direct): Error fetching profile:', profileResponse.status, errorText);
          // Throw an error to be caught by the catch block
          throw new Error(`Direct profile fetch failed with status ${profileResponse.status}: ${errorText}`);
        }
      } else {
        // Use apiClient.get if no token override (standard case, benefits from retries)
        console.log('[AuthContext] fetchUserProfile: Using apiClient.get for /.netlify/functions/get-profile');
        // apiClient.get will internally handle getting the session token and retries
        profileData = await apiClient.get<ProfileData>('/get-profile');
        // apiClient.get throws an error on failure, so if we reach here, it was successful or retries succeeded.
        // Error logging is primarily handled within apiClient.get for its attempts.
      }

      if (profileData) {
        console.log('[AuthContext] Profile data received:', profileData);
        // updateOperationState('isProfileLoading', false); // Moved to finally block
        return profileData;
      } else {
        // This case might be hit if apiClient.get could theoretically return null without error (it shouldn't based on its current design)
        // or if the direct fetch path somehow resulted in null without error (also unlikely with the new throw).
        console.warn('[AuthContext] fetchUserProfile: Profile data is null after fetch attempt without a thrown error. This is unexpected.');
        // updateOperationState('isProfileLoading', false); // Moved to finally block
        return null;
      }

    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error('[AuthContext] Exception during profile fetch:', err); // This is the crucial log
      setAuthState(prev => ({ ...prev, error: err })); // Set error in context state
      return null;
    } finally {
      updateOperationState('isProfileLoading', false); // Ensure loading state is always reset
    }
  }, [authState.session?.access_token]); // apiClient is stable, not needed in deps

  // Create refs to access current values in callbacks
  const authStateRef = useRef(authState);
  authStateRef.current = authState;
  
  // Create a ref for fetchUserProfile to avoid stale closures
  const fetchUserProfileRef = useRef(fetchUserProfile);
  fetchUserProfileRef.current = fetchUserProfile;

  // Function to refresh the user session from Supabase
  const refreshSession = useCallback(async (): Promise<void> => {
    console.log('[AuthContext] Refreshing session...');
    updateOperationState('isRefreshingSession', true);
    setApiClientRefreshingState(true); // Set the API client state to refreshing

    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        console.error('[AuthContext] Error refreshing session:', error);
        setAuthState((prev: AuthContextState) => ({
          ...prev,
          operations: {
            ...prev.operations,
            isRefreshingSession: false
          },
          error: new Error(`Failed to refresh session: ${error.message}`)
        }));
        setApiClientRefreshingState(false); // Reset the API client state
        return;
      }

      if (!session) {
        console.log('[AuthContext] No session found during refresh');
        setAuthState((prev: AuthContextState) => ({
          ...prev,
          user: null,
          session: null,
          profile: null,
          operations: {
            ...prev.operations,
            isRefreshingSession: false
          }
        }));
        setApiClientRefreshingState(false); // Reset the API client state
        return;
      }

      console.log('[AuthContext] Session refreshed successfully for user:', session.user.id);

      // Now that we have a fresh session, get user profile
      const profileData = await fetchUserProfile();

      setAuthState((prev: AuthContextState) => ({
        ...prev,
        user: session.user,
        session: session,
        profile: profileData,
        operations: {
          ...prev.operations,
          isRefreshingSession: false
        },
        error: null
      }));
      setApiClientRefreshingState(false); // Reset the API client state

    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error('[AuthContext] Exception during session refresh:', err);
      setAuthState((prev: AuthContextState) => ({
        ...prev,
        operations: {
          ...prev.operations,
          isRefreshingSession: false
        },
        error: err
      }));
      setApiClientRefreshingState(false); // Reset the API client state
    }
  }, [fetchUserProfile]);

  // Function to manually refresh all user data
  const refreshUserData = useCallback(async (): Promise<void> => {
    console.log('[AuthContext] Refreshing user data...');
    setAuthState((prev: AuthContextState) => ({ ...prev, isRefreshing: true }));
    setApiClientRefreshingState(true); // Set the API client state to refreshing

    try {
      // First refresh the session to ensure we have latest token
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        console.error('[AuthContext] Session error during user data refresh:', sessionError);
        setAuthState((prev: AuthContextState) => ({
          ...prev,
          operations: {
            ...prev.operations,
            isRefreshingSession: false
          },
          error: sessionError || new Error('No active session found'),
          isRefreshing: false
        }));
        setApiClientRefreshingState(false); // Reset the API client state
        return;
      }

      // Then use the fresh session to get the latest user data
      // Force refresh to get the most recent user metadata from Supabase
      // This is critically important for ensuring updated preferences are fetched
      const { data: userData, error: userError } = await supabase.auth.getUser(sessionData.session.access_token);

      if (userError || !userData.user) {
        console.error('[AuthContext] User data error during refresh:', userError);
        setAuthState((prev: AuthContextState) => ({
          ...prev,
          operations: {
            ...prev.operations,
            isRefreshingSession: false
          },
          error: userError || new Error('Failed to get user data'),
          isRefreshing: false
        }));
        setApiClientRefreshingState(false); // Reset the API client state
        return;
      }

      // Log detailed information about user metadata to help debug issues
      console.log('[AuthContext] User data fetched during refresh. User ID:', userData.user.id);
      console.log('[AuthContext] User metadata during refresh:', JSON.stringify(userData.user.user_metadata, null, 2));
      
      // Get the latest profile data using the updated session
      const profileData = await fetchUserProfile();

      // Sync the latest user settings to local storage
      try {
        console.log('[AuthContext] Syncing user settings from metadata to localStorage...');
        syncServerToLocalSettings(userData.user);
        console.log('[AuthContext] Successfully synced user settings to localStorage');
      } catch (syncError) {
        console.error('[AuthContext] Error syncing user settings to localStorage:', syncError);
        // Continue with the refresh process even if sync fails
      }

      // Update the state with all refreshed data
      setAuthState((prev: AuthContextState) => ({
        ...prev,
        user: userData.user,
        session: sessionData.session,
        profile: profileData,
        operations: {
          ...prev.operations,
          isRefreshingSession: false
        },
        error: null,
        isRefreshing: false
      }));
      setApiClientRefreshingState(false); // Reset the API client state

      // Dispatch a DOM event to notify components that user data has been refreshed
      // This helps components to update their state with the latest user data
      document.dispatchEvent(new CustomEvent('user-data-refreshed', {
        detail: {
          timestamp: Date.now(),
          userId: userData.user.id,
          metadata: userData.user.user_metadata
        }
      }));

      console.log('[AuthContext] User data refreshed successfully:', userData.user.id);

    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error('[AuthContext] Exception during user data refresh:', err);
      setAuthState((prev: AuthContextState) => ({
        ...prev,
        operations: {
          ...prev.operations,
          isRefreshingSession: false
        },
        error: err,
        isRefreshing: false
      }));
      setApiClientRefreshingState(false); // Reset the API client state
    }
  }, [fetchUserProfile]);

  // Set up auth listeners and initial session
  useEffect(() => {
    console.log('[AuthContext] useEffect for onAuthStateChange listener setup running.'); // Log when effect runs

    // Function to initially get the session and profile
    const getInitialSession = async () => {
      console.log('[AuthContext] Attempting initial supabase.auth.getSession()');
      // Update operation state for initialization
      updateOperationState('isInitializing', true);

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        setAuthState((prevState: AuthContextState) => {
          console.error('[AuthContext] Error in initial getSession:', sessionError, 'Prev user ID:', prevState.user?.id);
          return {
            ...prevState,
            user: null,
            session: null,
            profile: null,
            authState: AuthenticationState.ERROR,
            operations: {
              ...prevState.operations,
              isInitializing: false
            },
            error: sessionError
          };
        });
        return;
      }

      if (!session) {
        setAuthState((prevState: AuthContextState) => {
          console.log('[AuthContext] No session found in initial getSession. User likely not logged in.');
          return {
            ...prevState,
            user: null,
            session: null,
            profile: null,
            authState: AuthenticationState.UNAUTHENTICATED,
            operations: {
              ...prevState.operations,
              isInitializing: false
            },
            error: null
          };
        });
        return;
      }

      // We have a session. Set user and session. Profile will be fetched by onAuthStateChange.
      // Keep isInitializing true, but update profile loading state
      setAuthState((prevState: AuthContextState) => ({
        ...prevState,
        user: session.user,
        session: session,
        profile: null, // Profile will be fetched by the auth state change listener
        authState: AuthenticationState.AUTHENTICATED, // We know we're authenticated
        operations: {
          ...prevState.operations,
          isInitializing: true, // Keep initializing true until profile is loaded
          isProfileLoading: true // Indicate profile is now loading
        },
        error: null
      }));
      console.log('[AuthContext] Initial session retrieved. User:', session.user?.id, 'Profile will be loaded by auth state listener.');

      // Initialize user settings from server data
      initializeUserSettings(session.user);
    };

    getInitialSession();

    // This is the main effect for handling Supabase auth state changes
    // It runs once on mount and then whenever the auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        console.log('[AuthContext] onAuthStateChange triggered! Event:', event, 'New user ID:', session?.user?.id ?? 'none', 'Session present:', !!session);

        let newFlow: AuthFlow | null = null;
        const currentAuthState = authStateRef.current;
        const previousAuthStateValue = currentAuthState.authState; // Renamed to avoid conflict
        const previousFlow = currentAuthState.currentFlow;
        const previousUser = currentAuthState.user; // Capture previous user
        const previousSession = currentAuthState.session; // Capture previous session

        // Determine the new authentication flow based on the event
        switch (event) {
          case 'INITIAL_SESSION':
            newFlow = currentAuthState.currentFlow; // Keep the existing flow or set if null
            break;
          case 'SIGNED_IN':
            newFlow = AuthFlow.NORMAL_SIGNIN;
            break;
          case 'SIGNED_OUT':
            newFlow = AuthFlow.SIGNOUT;
            break;
          case 'PASSWORD_RECOVERY':
            newFlow = AuthFlow.PASSWORD_RECOVERY;
            break;
          case 'TOKEN_REFRESHED':
            newFlow = currentAuthState.currentFlow; // Keep the existing flow
            break;
          case 'USER_UPDATED':
            newFlow = currentAuthState.currentFlow; // Keep the existing flow
            break;
          case 'MFA_CHALLENGE' as AuthChangeEvent:
            newFlow = currentAuthState.currentFlow; // Keep the existing flow
            break;
          default:
            console.warn('[AuthContext] Unhandled auth event type:', event);
            newFlow = currentAuthState.currentFlow;
        }
        
        console.log(`[AuthContext] Auth flow updated based on event: ${event} → ${newFlow || 'null'}, Path: ${window.location.pathname}, PreviousState: ${previousAuthStateValue}, User: ${session?.user?.id ?? 'none'}`);
        
        const transitionDetails = {
          event,
          previousState: {
            authState: previousAuthStateValue,
            verificationStatus: currentAuthState.verificationStatus,
            flow: previousFlow
          },
          newFlow: newFlow,
          path: window.location.pathname,
          userId: session?.user?.id,
          timestamp: new Date().toISOString(),
        };
        console.log('[AuthContext] State transition:', transitionDetails);

        // Update central auth state (user, session, authState, currentFlow, isLoading)
        setAuthState((prev: AuthContextState) => ({
          ...prev,
          user: session?.user ?? null,
          session: session ?? null,
          authState: session ? AuthenticationState.AUTHENTICATED : AuthenticationState.UNAUTHENTICATED,
          currentFlow: newFlow,
          isLoading: false, 
          operations: {
            ...prev.operations,
            isInitializing: false, // Initialization is complete after the first event
          },
        }));
        
        if (event === 'SIGNED_OUT') {
          console.log('[AuthContext] User signed out. Clearing profile and settings.');
          setAuthState((prev: AuthContextState) => ({
            ...prev,
            profile: null,
            verificationStatus: VerificationStatus.UNKNOWN,
          }));
          clearAllSettings(); 
          return; 
        }

        // Determine if profile should be fetched based on the event type
        // AND if the user/session has actually changed meaningfully from what signIn might have set
        let shouldFetchProfileAndSettings = event === 'INITIAL_SESSION' || event === 'SIGNED_IN';

        if (event === 'SIGNED_IN' && session && previousUser && previousSession && currentAuthState.profile) {
          // If SIGNED_IN event is for the same user and session that was likely just set by the signIn flow,
          // and profile data already exists from that signIn flow, avoid redundant fetches.
          if (session.user.id === previousUser.id &&
              session.access_token === previousSession.access_token) {
            console.log(`[AuthContext] SIGNED_IN event for user ${session.user.id} matches current state and profile exists. Optimizing to skip redundant profile/settings fetch.`);
            shouldFetchProfileAndSettings = false;
            // If USER_UPDATED, still re-init settings (handled further down)
          }
        }

        if (session && session.user) {
          if (shouldFetchProfileAndSettings) { // Use the new flag here
            console.log(`[AuthContext] Session detected for ${session.user.id} on event ${event}. Fetching profile and checking verification.`);
            const currentAccessToken = session.access_token;
            const profileData = await fetchUserProfileRef.current(currentAccessToken);

            setAuthState((prev: AuthContextState) => ({
              ...prev,
              profile: profileData,
            }));

            const shouldBypass = VerificationService.shouldBypassVerification(
              window.location.pathname,
              newFlow 
            );

            if (shouldBypass) {
              console.log(`[AuthContext] Verification bypassed for user ${session.user.id} on path ${window.location.pathname} with flow ${newFlow}. Setting status to EXEMPT.`);
              setAuthState((prev: AuthContextState) => ({
                ...prev,
                verificationStatus: VerificationStatus.EXEMPT,
              }));
            } else {
              console.log(`[AuthContext] Verification not bypassed for ${session.user.id}. Checking actual status.`);
              const status = await VerificationService.checkVerificationStatus(
                session.user.id,
                currentAccessToken
              );
              setAuthState((prev: AuthContextState) => ({ ...prev, verificationStatus: status }));

              if (status === VerificationStatus.UNVERIFIED) {
                const isPasswordRecoveryFlow =
                  newFlow === AuthFlow.PASSWORD_RECOVERY ||
                  window.location.pathname.includes('reset-password') ||
                  (window.location.hash && window.location.hash.includes('type=recovery'));

                if (isPasswordRecoveryFlow) {
                  console.log(`[AuthContext] User ${session.user.id} is unverified but in PASSWORD_RECOVERY flow. Setting to EXEMPT and allowing reset.`);
                  setAuthState((prev: AuthContextState) => ({
                    ...prev,
                    verificationStatus: VerificationStatus.EXEMPT,
                    currentFlow: AuthFlow.PASSWORD_RECOVERY
                  }));
                } else {
                  console.log(`[AuthContext] User ${session.user.id} is not verified and not in bypass flow. Signing out.`);
                  await supabase.auth.signOut();
                }
              } else {
                console.log(`[AuthContext] User ${session.user.id} is ${status}.`);
              }
            }
            if (profileData && session.user) {
              await initializeUserSettings(session.user);
            }
          } else {
            console.log(`[AuthContext] Session updated for ${session.user.id} on event ${event}. Profile fetch skipped for this event type.`);
            // If it's a TOKEN_REFRESHED or USER_UPDATED event, and we want to ensure settings are up-to-date
            // without a full profile fetch, we could potentially re-sync settings if user_metadata changed.
            // For now, we only update session and user state which was done above.
            // If user metadata changed (USER_UPDATED), re-initialize settings
            if (event === 'USER_UPDATED' && session.user) {
                console.log('[AuthContext] USER_UPDATED event: Re-initializing user settings.');
                await initializeUserSettings(session.user);
            }
          }
        } else if (!session) {
          // No session, ensure user is marked as not authenticated and clear relevant states
          console.log('[AuthContext] No session. Ensuring user is marked as not authenticated.');
          setAuthState((prev: AuthContextState) => ({
            ...prev,
            user: null,
            session: null,
            profile: null,
            authState: AuthenticationState.UNAUTHENTICATED, // Assuming UNAUTHENTICATED
            verificationStatus: VerificationStatus.UNKNOWN,
            currentFlow: newFlow, // Store the flow e.g. SIGNOUT (already updated)
            isLoading: false,
            operations: {
              ...prev.operations,
              isInitializing: false,
            },
          }));
          clearAllSettings(); 
        }
      }
    );

    // REMOVED: Periodic session refresh interval to prevent memory leaks
    // Sessions are refreshed on-demand when needed instead of every 5 minutes

    // Clean up listeners and intervals
    return () => {
      // No intervals to clear since we removed the periodic refresh

      if (authListener && typeof authListener.subscription?.unsubscribe === 'function') {
        console.log('[AuthContext] Unsubscribing from onAuthStateChange.');
        authListener.subscription.unsubscribe();
      } else {
        console.log('[AuthContext] Auth listener or unsubscribe function not available for cleanup.');
      }
    };
  }, []); // Empty dependency array - listener should only be set up once

  const signIn = async (email?: string, password?: string) => {
    if (!email || !password) {
      const errorMsg = 'Email and password are required for login.';
      console.log('[AuthContext] signIn error:', errorMsg);
      setAuthState((prevState: AuthContextState) => ({
        ...prevState,
        operations: {
          ...prevState.operations,
          isSigningIn: false,
          isRefreshingSession: false
        },
        error: new Error(errorMsg),
        successMessage: undefined
      }));
      return { success: false, message: errorMsg, toast: { type: "error" as const, message: errorMsg } };
    }

    console.log('[AuthContext] Starting signIn process.');
    updateOperationState('isSigningIn', true);
    setAuthState((prevState: AuthContextState) => ({
      ...prevState,
      error: null,
      successMessage: undefined
    }));

    try {
      console.log('[AuthContext] Making API call to /.netlify/functions/login');

      // Set up a timeout promise to ensure we don't wait forever
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Login request timed out after 10 seconds')), 10000);
      });

      // Set up the actual fetch promise
      const fetchPromise = fetch('/.netlify/functions/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      // Race the fetch against the timeout
      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;

      console.log('[AuthContext] Login API response status:', response.status);

      const data = await response.json();
      console.log('[AuthContext] Login API response data received. Success:', response.ok);

      if (!response.ok) {
        console.error('[AuthContext] Login API error:', data.message);
        setAuthState((prevState: AuthContextState) => ({
          ...prevState,
          operations: {
            ...prevState.operations,
            isSigningIn: false
          },
          error: new Error(data.message)
        }));

        // Handle verification_pending flag specifically
        if (data.verification_pending) {
          return {
            success: false,
            message: "Email verification required",
            toast: { type: "error" as const, message: "Please verify your email before logging in." }
          };
        }

        return {
          success: false,
          message: data.message || 'Login failed',
          toast: data.toast || { type: "error" as const, message: data.message || 'Login failed' }
        };
      }

      if (data.user && data.session) {
        console.log('[AuthContext] Login successful via API');

        // We need to set the session in Supabase client too
        // This will trigger onAuthStateChange which should handle profile fetching etc.
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token
        });

        if (setSessionError) {
          console.error('[AuthContext] Error setting session:', setSessionError);
          setAuthState((prevState: AuthContextState) => ({
            ...prevState,
            operations: {
              ...prevState.operations,
              isSigningIn: false
            },
            error: setSessionError
          }));
          return {
            success: false,
            message: setSessionError.message,
            toast: { type: "error" as const, message: setSessionError.message }
          };
        }

        // NOTE: Profile fetching and full state update is now deferred to onAuthStateChange listener
        // to centralize logic and prevent redundancy.
        // We still update isSigningIn here.
        setAuthState((prevState: AuthContextState) => ({
          ...prevState,
          operations: {
            ...prevState.operations,
            isSigningIn: false
          }
          // user, session, profile will be updated by onAuthStateChange
        }));

        return {
          success: true,
          message: data.message || 'Login successful',
          toast: data.toast || { type: "success" as const, message: "Logged in successfully" }
        };
      } else {
        console.error('[AuthContext] Login API returned success but no user/session data');
        setAuthState((prevState: AuthContextState) => ({
          ...prevState,
          operations: {
            ...prevState.operations,
            isSigningIn: false
          },
          error: new Error('Invalid response from server')
        }));
        return {
          success: false,
          message: 'Invalid response from server',
          toast: { type: "error" as const, message: "Server returned invalid response" }
        };
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error('[AuthContext] signIn catch error:', err.message, err.stack);

      let errorMessage = err.message;
      let toastMessage = `Login failed: ${err.message}`;

      // If it's a timeout, try direct Supabase authentication as fallback
      if (err.message.includes('timed out')) {
        console.log('[AuthContext] Request timed out, attempting direct Supabase auth as fallback');

        try {
          const { data: directData, error: directError } = await supabase.auth.signInWithPassword({
            email,
            password
          });

          if (directError) {
            console.error('[AuthContext] Direct Supabase auth failed:', directError);
            errorMessage = `API request timed out, then direct auth failed: ${directError.message}`;
            toastMessage = directError.message;
          } else if (directData.user) {
            console.log('[AuthContext] Direct Supabase auth successful as fallback');

            // Check if user is verified (would normally be done by the function)
            try {
              const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('is_custom_verified')
                .eq('id', directData.user.id)
                .single();

              if (profileError) {
                console.error('[AuthContext] Error fetching profile:', profileError);
                await supabase.auth.signOut();
                setAuthState((prevState: AuthContextState) => ({
                  ...prevState,
                  operations: {
                    ...prevState.operations,
                    isSigningIn: false
                  },
                  error: new Error('Could not verify account status')
                }));
                return {
                  success: false,
                  message: 'Could not verify account status',
                  toast: { type: "error" as const, message: "Login error: Could not verify account status." }
                };
              }

              if (!profileData || !profileData.is_custom_verified) {
                console.log('[AuthContext] User not verified');
                await supabase.auth.signOut();
                setAuthState((prevState: AuthContextState) => ({
                  ...prevState,
                  operations: {
                    ...prevState.operations,
                    isSigningIn: false
                  },
                  error: new Error('Email not verified. Please check your email.')
                }));
                return {
                  success: false,
                  message: 'Email not verified',
                  toast: { type: "error" as const, message: "Please verify your email before logging in." }
                };
              }

              // Fetch the full profile data
              const fullProfile = await fetchUserProfile();

              // User is verified and authenticated
              setAuthState((prevState: AuthContextState) => ({
                ...prevState,
                user: directData.user,
                session: directData.session,
                profile: fullProfile,
                operations: {
                  ...prevState.operations,
                  isSigningIn: false
                },
                error: null
              }));
              return {
                success: true,
                message: 'Login successful (via fallback)',
                toast: { type: "success" as const, message: "Logged in successfully" }
              };
            } catch (profileCheckError) {
              console.error('[AuthContext] Profile check error:', profileCheckError);
              await supabase.auth.signOut();
              errorMessage = 'Error verifying account status';
              toastMessage = 'Error verifying account status';
            }
          }
        } catch (directAuthError) {
          console.error('[AuthContext] Error during fallback auth:', directAuthError);
          errorMessage = `API request timed out, then fallback auth failed: ${directAuthError}`;
          toastMessage = 'Login failed. Please try again.';
        }
      }

      setAuthState((prevState: AuthContextState) => ({
        ...prevState,
        operations: {
          ...prevState.operations,
          isSigningIn: false
        },
        error: new Error(errorMessage)
      }));
      return {
        success: false,
        message: errorMessage,
        toast: { type: "error" as const, message: toastMessage }
      };
    }
  };

  const signUp = async (email?: string, password?: string, firstName?: string, lastName?: string) => {
    // This function is now primarily a wrapper for the API call made by SignupPage.tsx.
    // SignupPage.tsx handles the actual fetch to /.netlify/functions/signup.
    // This AuthContext signUp was previously more involved but now is simplified
    // as the backend signup doesn't auto-login or return a session.
    // The main purpose here is to update AuthContext's loading/error/success states
    // if this function were to be called directly, though SignupPage.tsx bypasses it for the fetch.

    if (!email || !password || !firstName || !lastName) {
      const errorMsg = 'Email, password, first name, and last name are required for sign up.';
      console.log('[AuthContext] signUp (validation) error:', errorMsg);
      setAuthState((prevState: AuthContextState) => ({
        ...prevState,
        error: new Error(errorMsg),
        operations: {
          ...prevState.operations,
          isSigningUp: false,
          isRefreshingSession: false
        },
        successMessage: undefined
      }));
      // For consistency, if this were called, return a similar structure as signIn
      return { success: false, message: errorMsg, toast: { type: "error" as const, message: errorMsg } };
    }

    console.log('[AuthContext] signUp called for:', email, '. Note: Actual API call is usually from SignupPage.tsx');
    // This function might not be strictly needed if SignupPage directly calls the backend
    // and handles its own state/toasts based on that, which it does now.
    // We are keeping it to reflect a potential (though currently unused) path and to update context state.

    updateOperationState('isSigningUp', true);
    setAuthState((prevState: AuthContextState) => ({
      ...prevState,
      error: null,
      successMessage: undefined
    }));

    // Simulate an action completion as the real work is in SignupPage.tsx and its fetch call.
    // In a scenario where this function *was* making the API call:
    // const { success, message, toast } = await actualApiCallHookOrFunction(...);
    // setAuthState appropriately.
    // For now, we assume SignupPage.tsx handled the API call and its toasts.
    // This function call from SignupPage.tsx was removed, so this logic path is less likely to be hit with API interaction.

    // If this signUp in AuthContext is to be kept for other potential uses, it would need its own API call here.
    // Since SignupPage.tsx now handles the direct API call, this function's role is diminished.
    // We'll set a generic message if it were called.

    // Set a generic success message assuming the page component (SignupPage) handles the actual API interaction
    const successMsg = "Signup process initiated by page component. Check email for verification.";
    setAuthState((prevState: AuthContextState) => ({
      ...prevState,
      operations: {
        ...prevState.operations,
        isSigningUp: false
      },
      successMessage: successMsg,
      error: null
    }));
    return { success: true, message: successMsg, toast: { type: "info" as const, message: successMsg } };
  };

  /**
   * Performs a comprehensive sign out operation with proper error handling.
   * This follows a strict order of operations to ensure a clean logout:
   * 1. Update UI state first to prevent race conditions
   * 2. Clear all local storage and session storage data
   * 3. Finally perform the Supabase signOut API call
   *
   * @returns Promise<void> that resolves when the sign out process is complete
   */
  const signOut = async (): Promise<void> => {
    console.log('[AuthContext] Starting signOut process');

    // Track the signout operation state
    updateOperationState('isSigningOut', true);

    try {
      // STEP 1: Update state immediately to prevent UI race conditions
      // This ensures the UI updates right away even if the Supabase call is slow
      setAuthState((prevState: AuthContextState) => ({
        ...prevState,
        user: null,
        session: null,
        profile: null,
        authState: AuthenticationState.UNAUTHENTICATED,
        verificationStatus: VerificationStatus.UNKNOWN,
        currentFlow: AuthFlow.SIGNOUT,
        operations: {
          isInitializing: false,
          isRefreshingSession: false,
          isProfileLoading: false,
          isSigningIn: false,
          isSigningUp: false,
          isSigningOut: true, // Keep this true until we're done
          isVerifying: false,
          isSendingPasswordReset: false,
          isResettingPassword: false,
          isUpdatingProfile: false
        },
        error: null
      }));

      // STEP 2: Clear all cache and local data
      // Make a defensive copy of keys to avoid iteration issues when removing items
      const clearLocalStorageItems = () => {
        const localStorageKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('elber_')) {
            localStorageKeys.push(key);
          }
        }

        // Now remove each item from our safe list
        localStorageKeys.forEach(key => {
          try {
            localStorage.removeItem(key);
          } catch (error) {
            console.warn(`[AuthContext] Failed to remove localStorage item: ${key}`, error);
          }
        });
      };

      const clearSessionStorageItems = () => {
        const sessionStorageKeys: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith('elber_')) {
            sessionStorageKeys.push(key);
          }
        }

        // Now remove each item from our safe list
        sessionStorageKeys.forEach(key => {
          try {
            sessionStorage.removeItem(key);
          } catch (error) {
            console.warn(`[AuthContext] Failed to remove sessionStorage item: ${key}`, error);
          }
        });

        // Clear specific critical keys explicitly
        const criticalSessionKeys = [
          'elber_welcome_handled_in_session',
          'elber_session_start_time',
          'elber_last_route',
          'elber_password_recovery_flow',
          'elber_recovery_user_id'
        ];

        criticalSessionKeys.forEach(key => {
          try {
            sessionStorage.removeItem(key);
          } catch (error) {
            console.warn(`[AuthContext] Failed to remove critical sessionStorage item: ${key}`, error);
          }
        });
      };

      // Execute storage cleanup
      clearLocalStorageItems();
      clearSessionStorageItems();

      // Clear all user settings (preferences, etc.)
      await clearAllSettings();

      console.log('[AuthContext] Cleared all storage items');

      // Dispatch an event for any components that need to react to logout
      // This helps with coordination across the application
      document.dispatchEvent(new CustomEvent('user-logout', {
        detail: {
          timestamp: Date.now()
        }
      }));

      // STEP 3: Finally call Supabase API to complete server-side logout
      console.log('[AuthContext] Calling supabase.auth.signOut()');
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error('[AuthContext] Error during Supabase signOut API call:', error);
        // We don't throw here because we've already cleared the UI state
        // and the user should still experience a successful logout
      } else {
        console.log('[AuthContext] Supabase signOut completed successfully');
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error('[AuthContext] Exception during sign out process:', err);

      // Even on error, ensure the UI reflects logged out state
      setAuthState((prevState: AuthContextState) => ({
        ...prevState,
        user: null,
        session: null,
        profile: null,
        authState: AuthenticationState.UNAUTHENTICATED,
        error: new Error('Logout completed with errors. You have been logged out, but some cleanup operations failed.')
      }));
    } finally {
      // Always update the operation state to false
      updateOperationState('isSigningOut', false);
      console.log('[AuthContext] SignOut process completed');
    }
  };

  const sendPasswordResetEmail = async (email: string) => {
    if (!email) {
      const errorMsg = 'Email is required to send a password reset link.';
      setAuthState((prevState: AuthContextState) => ({
        ...prevState,
        error: new Error(errorMsg),
        operations: {
          ...prevState.operations,
          isSendingPasswordReset: false
        }
      }));
      // Return a structure similar to other auth operations for consistency
      return { success: false, message: errorMsg, toast: { type: "error" as const, message: errorMsg } };
    }
    updateOperationState('isSendingPasswordReset', true);
    setAuthState((prevState: AuthContextState) => ({ ...prevState, error: null, successMessage: undefined }));
    try {
      const response = await fetch('/.netlify/functions/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json(); // This can be { success, message, toast }
      
      updateOperationState('isSendingPasswordReset', false);

      if (!response.ok) {
        // Set error state in context
        setAuthState((prevState: AuthContextState) => ({
          ...prevState,
          error: new Error(data.message || 'Failed to send password reset email.')
        }));
        // Return the actual data from backend, including toast info
        return { success: false, ...data }; 
      }
      
      console.log('Forgot password call to backend successful', data);
      // Set success message in context if applicable from data
      if (data.message) {
        setAuthState((prevState: AuthContextState) => ({ ...prevState, successMessage: data.message }));
      }
      return { success: true, ...data }; // Return the actual data from backend
    } catch (error: unknown) {
      const typedError = error instanceof Error ? error : new Error(String(error));
      setAuthState((prevState: AuthContextState) => ({
        ...prevState,
        operations: {
          ...prevState.operations,
          isSendingPasswordReset: false
        },
        error: typedError
      }));
      // Return a structure indicating failure
      return { success: false, message: typedError.message, toast: { type: "error" as const, message: typedError.message } };
    }
  };

  const updateUserAttributes = async (attributes: UserAttributes) => {
    updateOperationState('isUpdatingProfile', true);
    setAuthState((prevState: AuthContextState) => ({ ...prevState, error: null }));
    try {
      const { data, error } = await supabase.auth.updateUser(attributes);

      if (error) {
        console.error('[AuthContext] Error updating user attributes:', error);
        setAuthState((prevState: AuthContextState) => ({
          ...prevState,
          operations: {
            ...prevState.operations,
            isUpdatingProfile: false
          },
          error
        }));
        return;
      }

      console.log('[AuthContext] User attributes updated. User:', data.user);

      // Explicitly fetch the updated profile to ensure we have the latest data
      const updatedProfile = await fetchUserProfile();

      // Sync the updated user data to local storage
      syncServerToLocalSettings(data.user);

      setAuthState((prevState: AuthContextState) => ({
        ...prevState,
        user: data.user,
        profile: updatedProfile, // Update the profile with the latest data
        operations: {
          ...prevState.operations,
          isUpdatingProfile: false
        },
        error: null
      }));
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error('[AuthContext] Exception during updateUserAttributes:', err);
      setAuthState((prevState: AuthContextState) => ({
        ...prevState,
        operations: {
          ...prevState.operations,
          isUpdatingProfile: false
        },
        error: err
      }));
    }
  };

  const clearMessages = () => {
    setAuthState((prevState: AuthContextState) => ({
      ...prevState,
      error: null,
      successMessage: undefined
    }));
  };

  // Set the auth flow explicitly - helpful for password reset and other special flows
  const setAuthFlow = useCallback((flow: AuthFlow): void => {
    console.log(`[AuthContext] Explicitly setting auth flow to: ${flow}`);

    // If we're setting to PASSWORD_RECOVERY, also set the verification status to EXEMPT
    if (flow === AuthFlow.PASSWORD_RECOVERY) {
      console.log(`[AuthContext] Setting verification status to EXEMPT for PASSWORD_RECOVERY flow`);

      // Store in session storage for persistence across page loads
      sessionStorage.setItem('elber_password_recovery_flow', 'true');

      setAuthState((prevState: AuthContextState) => ({
        ...prevState,
        currentFlow: flow,
        verificationStatus: VerificationStatus.EXEMPT
      }));
    } else {
      setAuthState((prevState: AuthContextState) => ({
        ...prevState,
        currentFlow: flow
      }));
    }
  }, []);

  // Helper methods for the AuthContext
  const getVerificationStatus = useCallback((): VerificationStatus => {
    return authState.verificationStatus;
  }, [authState.verificationStatus]);

  const getCurrentAuthFlow = useCallback((): AuthFlow | null => {
    return authState.currentFlow;
  }, [authState.currentFlow]);


  // Helper methods for component rendering
  const isOperationLoading = useCallback((operation: keyof AuthOperationState): boolean => {
    return authState.operations[operation];
  }, [authState.operations]);

  // Check specific states for components
  const isAuthReady = useCallback((): boolean => {
    return !authState.operations.isInitializing;
  }, [authState.operations.isInitializing]);

  const isAuthenticated = useCallback((): boolean => {
    return authState.authState === AuthenticationState.AUTHENTICATED &&
           authState.user !== null &&
           authState.session !== null;
  }, [authState.authState, authState.user, authState.session]);

  const isVerified = useCallback((): boolean => {
    return authState.verificationStatus === VerificationStatus.VERIFIED ||
           authState.verificationStatus === VerificationStatus.EXEMPT;
  }, [authState.verificationStatus]);

  // Add isLoading and isRefreshing to the context value
  const contextValue = {
    ...authState,
    // Authentication operations
    signIn,
    signUp,
    signOut,
    sendPasswordResetEmail,
    updateUserAttributes,

    // Session and profile operations
    refreshUserData,
    refreshSession,
    fetchUserProfile,

    // State management
    clearMessages,
    setAuthFlow,

    // Helper methods for state access
    getVerificationStatus,
    getCurrentAuthFlow,

    // UI helpers for component rendering
    isOperationLoading,

    // Check specific states for components
    isAuthReady,
    isAuthenticated,
    isVerified,

    // New loading flags
    isLoading: authState.isLoading,
    isRefreshing: authState.isRefreshing,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use the AuthContext
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
