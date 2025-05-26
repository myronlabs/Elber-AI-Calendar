import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { showSuccess, showError } from '../../utils/toastManager';
import { reserveForFutureUse } from '../../utils/SearchMatchType';

import { useAuth } from '../../context/AuthContext';
import '../../styles/pages/_login.scss';

// Reserve unused imports for future use
reserveForFutureUse({
  showInfo: 'showInfo'
});

interface VerificationResponse {
  message: string;
  toast?: {
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
  };
}

const VerifyEmailPage: React.FC = () => {
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isResending, setIsResending] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [autoVerifying, setAutoVerifying] = useState<boolean>(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    document.body.classList.add('login-page-active');
    return () => {
      document.body.classList.remove('login-page-active');
    };
  }, []);

  const verifyEmail = useCallback(async (id: string, token: string): Promise<void> => {
    setIsLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/.netlify/functions/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: id, token }),
      });

      const data = await response.json() as VerificationResponse;

      if (!response.ok) {
        setError(data.message || 'Verification failed');
        showError(data.toast?.message || data.message || 'Verification failed');

        // Show detailed error information for debugging
        console.error('Verification error response:', {
          status: response.status,
          statusText: response.statusText,
          body: data
        });
      } else {
        setMessage(data.message || 'Email verified successfully!');
        showSuccess(data.toast?.message || data.message || 'Email verified successfully!');
        
        // Redirect to login page after successful verification
        setTimeout(() => {
          navigate('/login', { state: { emailVerified: true, email: userEmail } });
        }, 3000);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred during verification';
      setError(errorMessage);
      showError(errorMessage);
    }

    setIsLoading(false);
    setAutoVerifying(false);
  }, [navigate, userEmail]);

  // Check if URL contains verification params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const idFromUrl = params.get('id') || params.get('userId');
    const tokenFromUrl = params.get('token');
    const emailFromUrl = params.get('email');

    if (idFromUrl) {
      setUserId(idFromUrl);
    }

    if (emailFromUrl) {
      setUserEmail(emailFromUrl);
    }

    if (idFromUrl && tokenFromUrl) {
      // Validate UUID format before auto-verification
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(idFromUrl)) {
        setAutoVerifying(true);
        verifyEmail(idFromUrl, tokenFromUrl);
      } else {
        setError('Invalid user ID format in URL parameters');
        showError('Invalid user ID format');
      }
    }
  }, [location, verifyEmail]);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate('/assistant');
    }
  }, [user, navigate]);

  const resendVerificationCode = useCallback(async (): Promise<void> => {
    if (!userEmail) {
      showError('Email address is required to resend verification code');
      return;
    }

    setIsResending(true);
    try {
      const response = await fetch('/.netlify/functions/auth-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: userEmail,
          action: 'resend'
        }),
      });

      const data = await response.json();

      if (response.ok && data.verificationEmailSent) {
        setUserId(data.userId || userId);
        showSuccess('Verification code has been resent to your email');
      } else {
        showError(data.toast?.message || data.message || 'Failed to resend verification code');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      showError(`Failed to resend verification code: ${errorMessage}`);
    } finally {
      setIsResending(false);
    }
  }, [userEmail, userId]);

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!userId || !verificationCode) {
      setError('User ID and verification code are required');
      showError('User ID and verification code are required');
      return;
    }

    // Validate UUID format before submitting
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      setError('Invalid user ID format. Must be a valid UUID.');
      showError('Invalid user ID format');
      return;
    }

    verifyEmail(userId, verificationCode);
  };

  return (
    <>

      <div className="login-page-container">
        <div className="login-form-card">
          <h2>Verify Your Email</h2>
          <p className="subtitle">Enter the verification code sent to your email</p>

          {autoVerifying ? (
            <div className="auto-verifying">
              <p>Verifying your email automatically...</p>
              <div className="loader"></div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="userId">User ID</label>
                <input
                  type="text"
                  id="userId"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  required
                  placeholder="Enter your user ID"
                />
              </div>
              {!userId && userEmail && (
                <div className="form-group">
                  <label htmlFor="userEmail">Email</label>
                  <input
                    type="email"
                    id="userEmail"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    required
                    placeholder="Enter your email"
                  />
                </div>
              )}
              <div className="form-group">
                <label htmlFor="verificationCode">Verification Code</label>
                <input
                  type="text"
                  id="verificationCode"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  required
                  placeholder="Enter 6-digit code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                />
              </div>

              {message && <p className="success-message">{message}</p>}
              {error && <p className="error-message">{error}</p>}

              <button type="submit" className="btn btn-success" disabled={isLoading}>
                {isLoading ? 'Verifying...' : 'Verify Email'}
              </button>
              
              <button
                type="button"
                className="btn btn-outline-subtle"
                onClick={resendVerificationCode}
                disabled={isResending}
                style={{
                  marginTop: '0.625rem',
                }}
              >
                {isResending ? 'Sending...' : 'Resend Verification Code'}
              </button>
            </form>
          )}

          <p className="toggle-auth">
            Already verified? <a href="/login" className="toggle-button">Sign In</a>
          </p>
        </div>
      </div>
    </>
  );
};

export default VerifyEmailPage;