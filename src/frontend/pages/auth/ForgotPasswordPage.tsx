// src/frontend/pages/ForgotPasswordPage.tsx
import React, { useState, FormEvent, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Link, useLocation } from 'react-router-dom';
import '../../styles/pages/_login.scss'; // Reusing styles for consistency
import { showSuccess, showError, showInfo, showWarning } from '../../utils/toastManager';
import { reserveForFutureUse } from '../../utils/SearchMatchType';

// Reserve unused imports for future use
reserveForFutureUse({
  toastManager: 'toastManager'
});
// Toast options handled by manager

const ForgotPasswordPage: React.FC = () => {
  React.useEffect(() => {
    document.body.classList.add('login-page-active');
    return () => {
      document.body.classList.remove('login-page-active');
    };
  }, []);

  const { sendPasswordResetEmail } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');

  // Check if email was passed from signup page
  useEffect(() => {
    console.log("ForgotPasswordPage: Location state received:", location.state);

    // Type-safe access of location state
    const locationState = location.state as { email?: string; fromSignup?: boolean } | null;
    if (locationState?.email) {
      console.log("ForgotPasswordPage: Setting email from location state:", locationState.email);
      setEmail(locationState.email);

      // If redirected from signup page due to existing account, don't show additional toast
      // The SignupPage already showed a toast guiding them here
      if (locationState.fromSignup) {
        console.log("ForgotPasswordPage: Detected redirect from signup - not showing additional toast");
        // No toast needed as the SignupPage already displayed one and handles the redirect
      }
    } else {
      console.log("ForgotPasswordPage: No email in location state");
    }
  }, [location]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Clear previous messages from page state
    setMessage('');
    setError('');
    // isLoading state will be managed by AuthContext via isOperationLoading('isSendingPasswordReset')
    // or by a local isLoading if preferred, but AuthContext already tracks this.

    // Show loading toast
    showInfo("Sending reset link...");

    try {
      // Call the AuthContext function, which now returns AuthResult
      const result = await sendPasswordResetEmail(email);

      // Loading toast auto-clears

      if (result.success) {
        // Use message from AuthResult if available, otherwise a generic one
        const successMsg = result.message || "If an account exists for this email, a password reset link has been sent.";
        setMessage(successMsg); // Update page state for display
        
        // Display toast from AuthResult if present, otherwise use the successMsg
        if (result.toast) {
          switch(result.toast.type) {
            case 'success': showSuccess(result.toast.message); break;
            case 'error': showError(result.toast.message); break;
            case 'warning': showWarning(result.toast.message); break;
            default: showInfo(result.toast.message);
          }
        } else {
          showSuccess(successMsg);
        }
      } else {
        // Error case
        const errorMsg = result.message || "Failed to send password reset email.";
        setError(errorMsg); // Update page state for display
        
        // Display toast from AuthResult if present, otherwise use the errorMsg
        if (result.toast) {
          switch(result.toast.type) {
          case 'success': showSuccess(result.toast.message); break;
          case 'error': showError(result.toast.message); break;
          case 'warning': showWarning(result.toast.message); break;
          default: showInfo(result.toast.message);
        }
        } else {
          showError(errorMsg);
        }
      }
    } catch (err: unknown) {
      // This catch block might be redundant if sendPasswordResetEmail in AuthContext handles all errors
      // and returns a result object. However, keeping it for safety for now.
      // Loading toast auto-clears
      console.error('Error in forgot password handleSubmit:', err);
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(errorMessage);
      showError(errorMessage);
    }
    // AuthContext will set its own isLoading to false. If page uses its own, set it here.
    // setIsLoading(false); // If ForgotPasswordPage uses its own isLoading state
  };

  // Optionally, use isLoading from AuthContext to disable the button
  const isContextLoading = useAuth().isOperationLoading('isSendingPasswordReset');

  return (
    <>
      
      <div className="login-page-container">
        <div className="login-form-card">
          <h2>Forgot Password?</h2>
          <p className="subtitle">Enter your email to receive a reset link.</p>
          
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="john.doe@example.com"
              />
            </div>

            {message && <p className="success-message">{message}</p>}
            {error && <p className="error-message">{error}</p>}

            <button type="submit" className="btn btn-primary" disabled={isContextLoading}>
              {isContextLoading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>

          <p className="toggle-auth">
            Remembered your password? <Link to="/login" className="toggle-button">Sign In</Link>
          </p>
           <p className="toggle-auth">
            Don&apos;t have an account? <Link to="/signup" className="toggle-button">Create Account</Link>
          </p>
        </div>
      </div>
    </>
  );
};

export default ForgotPasswordPage;
