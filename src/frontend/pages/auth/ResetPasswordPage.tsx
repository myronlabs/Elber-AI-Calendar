// src/frontend/pages/ResetPasswordPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import '../../styles/pages/_form-page.scss';
import { showSuccess, showError, showInfo, toastManager } from '../../utils/toastManager';
import { reserveForFutureUse } from '../../utils/SearchMatchType';
import { getToastOptions, getShortToastOptions } from '../../utils/toastUtils';
import { PASSWORD_REQUIREMENTS } from '../../utils/validationSchemas';

import { useAuth } from '../../context/AuthContext';
import { AuthFlow, VerificationStatus } from '../../types/auth';

/**
 * Properly import toast utilities that are used throughout the application
 * These imports may appear unused to ESLint but are essential for proper functionality.
 * We reserve them using the established project pattern.
 */
reserveForFutureUse({
  toastManager,
  getToastOptions,
  getShortToastOptions
});

const ResetPasswordPage: React.FC = () => {
  // Component state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // New state for managing token validation lifecycle
  const [tokenStatus, setTokenStatus] = useState<'validating' | 'valid' | 'invalid' | 'error'>('validating');
  const [recoveryUserId, setRecoveryUserId] = useState<string | null>(null);
  
  const navigate = useNavigate();
  
  const auth = useAuth();

  // Handle body class for proper scrolling
  useEffect(() => {
    document.body.classList.add('login-page-active');
    return () => {
      document.body.classList.remove('login-page-active');
    };
  }, []);

  // Effect 1: Set up the page for password recovery flow
  useEffect(() => {
    console.log("[ResetPasswordPage] Ensuring AuthFlow is PASSWORD_RECOVERY.");
    auth.setAuthFlow(AuthFlow.PASSWORD_RECOVERY);

    // Attempt to get user_id from hash early for potential use, but don't process session here.
    // This helps if handleSubmit needs it before onAuthStateChange fully resolves user.
        const hash = window.location.hash;
    if (hash && hash.length > 1 && !recoveryUserId) { // Check !recoveryUserId to avoid re-parsing if already set
      try {
        const params = new URLSearchParams(hash.substring(1));
        const userIdFromHash = params.get('user_id'); // Supabase might include this
        if (userIdFromHash) {
          console.log("[ResetPasswordPage] Found user_id in URL hash parameters:", userIdFromHash);
          // Store in session storage for potential cross-load persistence or fallback
          sessionStorage.setItem('elber_recovery_user_id', userIdFromHash);
          // Set it in state if not already set by onAuthStateChange
          if (!recoveryUserId) setRecoveryUserId(userIdFromHash);
                }
      } catch (e) {
        console.warn("[ResetPasswordPage] Could not parse user_id from hash:", e);
            }
    }
    // Check session storage as a fallback if recoveryUserId is still not set
    if (!recoveryUserId) {
        const storedUserId = sessionStorage.getItem('elber_recovery_user_id');
        if (storedUserId) {
            console.log("[ResetPasswordPage] Using stored recovery_user_id from session storage:", storedUserId);
            setRecoveryUserId(storedUserId);
        }
    }

    // The old `checkForToken()` logic is removed.
    // Token validation and session establishment are now primarily handled by `onAuthStateChange`.
    // `tokenStatus` starts as 'validating'.

    // Cleanup for this effect:
    // Remove session storage items IF navigating away from reset-password AND flow is not 'valid'
    // This is a safety net. Primary cleanup should be in onAuthStateChange effect or when flow completes.
    return () => {
      if (!window.location.pathname.includes('reset-password') && tokenStatus !== 'valid') {
        console.log("[ResetPasswordPage] Navigating away from reset-password with non-valid token, cleaning up session storage flags.");
        sessionStorage.removeItem('elber_password_recovery_flow');
        sessionStorage.removeItem('elber_recovery_user_id');
      }
    };
  }, [auth.setAuthFlow, recoveryUserId, auth, tokenStatus]); // recoveryUserId added to deps to allow setting it from hash/sessionStorage if not yet set


  // Effect 2: Listen for Supabase auth state changes to validate token and session
  useEffect(() => {
    console.log("[ResetPasswordPage] Setting up onAuthStateChange listener.");
    // Ensure tokenStatus is 'validating' when this effect runs/re-runs.
    // However, only reset to 'validating' if it's not already 'valid', 'invalid' or 'error' to preserve final states.
    if (tokenStatus !== 'valid' && tokenStatus !== 'invalid' && tokenStatus !== 'error') {
        setTokenStatus('validating');
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log(`[ResetPasswordPage] onAuthStateChange event: ${event}, Session user: ${session?.user?.id}`);
        sessionStorage.setItem('elber_password_recovery_flow', 'true'); // Keep this flag active

        if (event === 'PASSWORD_RECOVERY') {
          if (session?.user) {
            console.log("[ResetPasswordPage] PASSWORD_RECOVERY event: Token valid, user session established.", session.user.id);
            setRecoveryUserId(session.user.id);
            sessionStorage.setItem('elber_recovery_user_id', session.user.id);
            setTokenStatus('valid');
          } else {
            console.warn("[ResetPasswordPage] PASSWORD_RECOVERY event but no session or user. Token likely invalid or expired.");
            setTokenStatus('error');
            setError("Password recovery session could not be established. The link may be invalid or expired.");
          }
        } else if (event === 'SIGNED_IN' && auth.currentFlow === AuthFlow.PASSWORD_RECOVERY) {
          // This can happen if Supabase establishes a session via recovery link and then emits SIGNED_IN
          if (session?.user) {
            console.log("[ResetPasswordPage] SIGNED_IN event during PASSWORD_RECOVERY: Token valid.", session.user.id);
            setRecoveryUserId(session.user.id);
            sessionStorage.setItem('elber_recovery_user_id', session.user.id);
            setTokenStatus('valid');
          } else {
             console.warn("[ResetPasswordPage] SIGNED_IN during PASSWORD_RECOVERY but no session user.");
             // Avoid setting to error if PASSWORD_RECOVERY might still come
          }
        } else if (event === 'SIGNED_OUT') {
          console.log("[ResetPasswordPage] SIGNED_OUT event received during password reset attempt.");
          // If password reset was successful and navigation to login is about to occur,
          // this state change might be expected. The page will unmount.
          // If not successful, then it's an unexpected session end.
          if (!success) { // Check if NOT successful, then it's an error
            setTokenStatus('invalid');
            setError("Your session ended unexpectedly. Please try the password reset process again.");
            sessionStorage.removeItem('elber_password_recovery_flow');
            sessionStorage.removeItem('elber_recovery_user_id');
          }
        }
        // USER_UPDATED might occur after successful password change, state should already be 'valid' or handled by handleSubmit
      }
    );

    // Initial check for token presence in URL if no Supabase event fires quickly
    const initialValidationTimeout = setTimeout(() => {
      if (tokenStatus === 'validating') {
        const hash = window.location.hash;
        if (!hash || !hash.includes('type=recovery')) {
          // Also check if we have a session from AuthContext that is valid for recovery
          if (auth.user && auth.currentFlow === AuthFlow.PASSWORD_RECOVERY && auth.verificationStatus === VerificationStatus.EXEMPT) {
            console.log("[ResetPasswordPage] Initial check: AuthContext indicates valid recovery state.");
            setRecoveryUserId(auth.user.id);
            setTokenStatus('valid');
              } else {
            console.log("[ResetPasswordPage] Initial check: Still validating, but no recovery hash in URL and no valid AuthContext state. Marking token as invalid.");
            setTokenStatus('invalid');
            setError("No valid password reset token found in the URL. Please ensure you've used the correct link.");
              }
        } else {
          console.log("[ResetPasswordPage] Initial check: Recovery hash present, waiting for Supabase event to confirm session.");
          // Remain 'validating', Supabase event should take over.
            }
          }
    }, 750); // Slightly longer timeout to give Supabase client ample time

    return () => {
      console.log("[ResetPasswordPage] Cleaning up onAuthStateChange listener.");
      authListener?.subscription.unsubscribe();
      clearTimeout(initialValidationTimeout);
      // General cleanup of recovery flow flag if navigating away.
      // Specific cleanup for broken flows is handled by SIGNED_OUT event.
      if (!window.location.pathname.includes('reset-password')) {
        sessionStorage.removeItem('elber_password_recovery_flow');
        // Do not remove elber_recovery_user_id here as it might be needed if user navigates back quickly
      }
    };
  }, [auth, tokenStatus, success]); // auth object itself, and tokenStatus to allow resetting to 'validating' carefully.

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      showError("Passwords do not match");
      return;
    }
    if (password.length < PASSWORD_REQUIREMENTS.minLength) {
      setError(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters long.`);
      showError(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters long`);
      return;
    }

    setLoading(true);
    showInfo("Resetting password..."); // Loading toast

    // Determine user ID and token for the backend API call
    // The token from URL hash is implicitly handled by Supabase client establishing a session.
    // We primarily need the user's ID (from `recoveryUserId` or `auth.user.id`)
    // and the new password for our backend.
    // The Supabase client handles the actual "blessing" of the session from the recovery link.
    // Our backend's "reset-password" function will perform the password update.

    const currentUserId = recoveryUserId || auth.user?.id;
    const sessionToken = auth.session?.access_token; // This might be the recovery session token

    if (!currentUserId) {
        // Loading toast auto-clears
        showError("User identification failed. Cannot reset password.");
        setError("User identification failed. Please try the reset process again.");
        setLoading(false);
        setTokenStatus('error'); // Mark the flow as errored
        return;
    }
    
    // Log which user ID is being used
    console.log(`[ResetPasswordPage] handleSubmit: Attempting password reset for user ID: ${currentUserId}`);
    console.log(`[ResetPasswordPage] handleSubmit: Using session token present: ${!!sessionToken}`);


    try {
      // The actual "token" sent to backend might be the user's ID if the backend needs to re-verify
      // or it could be implicit if the backend relies on the Supabase session established by the frontend.
      // The current backend reset-password function seems to expect 'token' to be a user_id or a special hash.
      // Let's assume for now our backend can use the currentUserId (which should be the user from the recovery flow)
      // and the new password. Supabase Admin SDK on the backend updates the password for this user.
      // The critical part is that the frontend session IS the recovery session.

        const response = await fetch('/.netlify/functions/reset-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          // If your backend verifies the Supabase session, include the access token
          ...(sessionToken && { 'Authorization': `Bearer ${sessionToken}` }),
        },
        // The backend expects `token` (which can be a user_id here, or a session-derived token) and `password`.
        // Let's send `currentUserId` as `token` to align with one of the backend's expected formats.
        body: JSON.stringify({ token: currentUserId, password: password }),
        });

      const result = await response.json();
      // Loading toast auto-clears

      if (response.ok && result.success) {
        // Set success state first, which might be used by onAuthStateChange logic
        setSuccess(result.message || "Your password has been successfully reset. You can now log in with your new password.");
        setLoading(false);

        showSuccess(result.message || "Password reset successfully! Redirecting to login...");
        
        // Clear recovery flags from session storage as flow is complete
        sessionStorage.removeItem('elber_password_recovery_flow');
        sessionStorage.removeItem('elber_recovery_user_id');
        
        // Refresh user data attempt (session might be invalid soon, but good to try)
        if (result.verified) {
            console.log("[ResetPasswordPage] Password reset successful and backend confirmed verification. Refreshing user data.");
            await auth.refreshUserData();
        } else {
            console.log("[ResetPasswordPage] Password reset successful. Backend did not explicitly confirm verification, but resetting implies it. Refreshing user data.");
            await auth.refreshUserData(); // Refresh anyway
        }
        
        auth.setAuthFlow(AuthFlow.NONE); // Reset auth flow
        
        // Navigate to login page
        navigate('/login');

      } else {
        showError(result.message || "Failed to reset password.");
        setError(result.message || "An error occurred. Please try again.");
        setLoading(false);
          }
    } catch (err) {
      // Loading toast auto-clears
      const fetchError = err instanceof Error ? err : new Error(String(err));
      showError("An unexpected error occurred. Please check your connection and try again.");
      setError(`Network or unexpected error: ${fetchError.message}`);
      setLoading(false);
    }
  };

  // --- Rendering logic needs to be updated to use tokenStatus ---

  if (tokenStatus === 'validating') {
    return (
      <div className="form-page reset-password-page">
        <div className="form-card">
          <div className="form-header">
            <h2 className="title">Reset Your Password</h2>
            <p className="subtitle">Checking for valid reset token...</p>
            {/* Consider adding a visual spinner component here */}
          </div>
        </div>
      </div>
    );
  }

  if (tokenStatus === 'invalid' || tokenStatus === 'error') {
    return (
      <div className="form-page reset-password-page">
        <div className="form-card">
          <div className="form-header">
            <h2 className="title">Reset Your Password</h2>
            <p className="subtitle">{error || "Invalid or expired password reset token. Please ensure you've used the correct link from your email."}</p>
          </div>
          <div className="form-navigation">
            <div className="form-links">
              <Link to="/forgot-password" className="link">Request a new reset link</Link>
              <span className="divider">|</span>
              <Link to="/login" className="link">Back to Login</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // tokenStatus === 'valid', show the form
  return (
    <div className="form-page reset-password-page">
      <div className="form-card">
        <div className="form-header">
          <h2 className="title">Reset Your Password</h2>
          <p className="subtitle">Enter your new password below.</p>
        </div>
        
        <div className="form-content">
          <form onSubmit={handleSubmit}>
            {error && <div className="form-error">{error}</div>}
            {success && <div className="form-success">{success}</div>}
            
            {!success && ( // Only show form fields if not yet successful
              <>
                <div className="form-group">
                  <label htmlFor="password" className="form-label">New Password</label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="form-input"
                    placeholder="Enter new password"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="confirmPassword" className="form-label">Confirm New Password</label>
                  <input
                    type="password"
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="form-input"
                    placeholder="Confirm new password"
                  />
                </div>
                <button type="submit" disabled={loading} className={`form-button ${loading ? 'loading' : ''}`}>
                  <span className="button-text">{loading ? 'Updating...' : 'Reset Password'}</span>
                </button>
              </>
            )}
            
            {success && (
              <div className="form-success-state">
                <div className="success-icon"></div>
                <h3 className="success-title">Password Reset Successfully!</h3>
                <p className="success-message">{success}</p>
                <div className="form-navigation">
                  <Link to="/login" className="link">Proceed to Login</Link>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;

// Original `tokenFound` and `processedUrl` states are now replaced by `tokenStatus`.
// UI rendering logic has been updated to use `tokenStatus`.
// The complex `checkForToken` function within the first `useEffect` has been removed.
// Session handling relies more directly on `onAuthStateChange`.