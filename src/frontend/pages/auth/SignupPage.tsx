// src/frontend/pages/SignupPage.tsx
import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { showSuccess, showError, showWarning, showInfo, showLoading, dismissToast } from '../../utils/toastManager';
import { useAuth } from '../../context/AuthContext';
import FormField from '../../components/forms/FormField';
import { PasswordStrengthIndicator } from '../../components/forms/PasswordStrengthIndicator';
import { getToastOptions } from '../../utils/toastUtils';
import { reserveForFutureUse } from '../../utils/SearchMatchType';

import { useFormValidation } from '../../hooks/forms/useFormValidation';
import { SignupFormData, signupValidationSchema } from '../../utils/validationSchemas';
import '../../styles/pages/_login.scss';

// Reserve unused imports for future use
reserveForFutureUse({
  toastManager: 'toastManager',
  getLongToastOptions: 'getLongToastOptions'
});

const SignupPage: React.FC = () => {
  // Handle body class for full-page styling
  useEffect(() => {
    document.body.classList.add('login-page-active');
    return () => {
      document.body.classList.remove('login-page-active');
    };
  }, []);

  const auth = useAuth();
  const { error, successMessage, clearMessages } = auth;
  const navigate = useNavigate();

  // Initialize form with useFormValidation hook
  const {
    formState,
    handleChange,
    handleSubmit,
    setSubmitting
  } = useFormValidation<SignupFormData>(
    {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: ''
    },
    signupValidationSchema
  );

  // Clear any existing messages when component mounts
  useEffect(() => {
    clearMessages();
  }, [clearMessages]);

  // Show toast notifications for errors and success messages
  useEffect(() => {
    if (error?.message) {
      showError(error.message);
    }

    if (successMessage) {
      showSuccess(successMessage);

      // Redirect to login page after successful signup
      setTimeout(() => {
        navigate('/login');
      }, 5000);
    }
  }, [error, successMessage, navigate]);

  // Form submission handler
  const submitForm = async (data: SignupFormData) => {
    // Clear any local errors and global messages
    clearMessages();

    // Show loading toast
    const loadingToastId = showLoading("Creating your account...");

    try {
      const response = await fetch('/.netlify/functions/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          firstName: data.firstName,
          lastName: data.lastName
        }),
      });

      const responseData = await response.json();
      // console.log("Signup API response:", responseData);

      // First check for "user already registered"
      if (responseData.message && responseData.message.toLowerCase().includes("user already registered")) {
        // console.log("User already registered detected, handling special case");
        dismissToast(loadingToastId);

        try {
          const toastMessageContent = responseData.toast?.message || "If you already have an account, you can reset your password or try logging in.";
          const toastType = responseData.toast?.type || 'info';
          const toastOptions = getToastOptions('IMPORTANT_INFO');

          if (toastType === 'error') {
            showError(toastMessageContent, toastOptions);
          } else if (toastType === 'warning') {
            showWarning(toastMessageContent, toastOptions);
          } else {
            showInfo(toastMessageContent, toastOptions); // Default to info
          }

          // Navigate immediately after showing the toast
          // console.log("Redirecting to forgot-password page with email:", data.email);
          navigate('/forgot-password', {
            state: { email: data.email, fromSignup: true },
            replace: true
          });

        } catch {
          // console.error("Error during 'user already registered' toast/redirect logic:", error);
          showError("There was an issue processing your request. Please try again.");
          // Fallback navigation in case of error during toast display, though unlikely
          // console.log("Fallback redirecting to forgot-password page with email due to error:", data.email);
          navigate('/forgot-password', {
            state: { email: data.email, fromSignup: true },
            replace: true
          });
        }
      }
      // For other response scenarios, process toast from backend
      else if (responseData.toast) {
        // Dismiss the initial loading toast before showing a new one
        dismissToast(loadingToastId);

        const { type, message } = responseData.toast;
        if (type === 'success') {
          showSuccess(message);

          // Redirect to verification page on successful account initiation
          if (response.ok && responseData.userId) {
            // Redirect after a short delay to allow toast to be seen
            setTimeout(() => {
              navigate(`/verify-email?id=${responseData.userId}&email=${encodeURIComponent(data.email)}`);
            }, 2000); // 2-second delay before redirect
          } else if (response.ok) {
            // Fallback if userId somehow not in response but still ok
            setTimeout(() => {
              navigate(`/verify-email?email=${encodeURIComponent(data.email)}`);
            }, 2000);
          }
        } else if (type === 'error') {
          showError(message);
        } else if (type === 'warning') {
          showWarning(message);
        } else if (type === 'info') {
          showInfo(message);
        }
      }
      // Handle other error cases if response is not ok
      else if (!response.ok) {
        // Make sure to dismiss the loading toast first
        dismissToast(loadingToastId);

        // If no specific toast from backend, show a generic error
        if (!responseData.toast) {
          showError(responseData.message || "Signup failed. Please try again.");
        }
      }
      // Make sure we dismiss the loading toast if nothing else caught it
      else {
        dismissToast(loadingToastId);
      }
    } catch {
      // console.error("Error during signup form submission:", error);
      dismissToast(loadingToastId);
      showError("An error occurred during signup. Please try again.");
    } finally {
      // Reset submission state
      setSubmitting(false);
    }
  };

  // Extract form data and errors for easier access
  const { formData, errors, isSubmitting } = formState;

  return (
    <>

      <div className="login-page-container">
        <div className="login-form-card">
          <h2>Join Elber</h2>
          <p className="subtitle">Your AI-powered networking assistant</p>

          <form onSubmit={handleSubmit(submitForm)}>
            <FormField
              id="firstName"
              label="First Name"
              value={formData.firstName}
              onChange={(e) => handleChange('firstName', e.target.value)}
              error={errors.firstName}
              placeholder="John"
              required
              autoComplete="given-name"
            />

            <FormField
              id="lastName"
              label="Last Name"
              value={formData.lastName}
              onChange={(e) => handleChange('lastName', e.target.value)}
              error={errors.lastName}
              placeholder="Doe"
              required
              autoComplete="family-name"
            />

            <FormField
              id="email"
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              error={errors.email}
              placeholder="john.doe@example.com"
              required
              autoComplete="email"
            />

            <FormField
              id="password"
              label="Password"
              type="password"
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              error={errors.password}
              placeholder="••••••••"
              required
              autoComplete="new-password"
            />

            {formData.password && (
              <PasswordStrengthIndicator
                password={formData.password}
                showFeedback={true}
              />
            )}

            <FormField
              id="confirmPassword"
              label="Confirm Password"
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => handleChange('confirmPassword', e.target.value)}
              error={errors.confirmPassword}
              placeholder="••••••••"
              required
              autoComplete="new-password"
            />

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Processing...' : 'Create Account'}
            </button>

            <p className="terms-policy">
              By signing up, you agree to our <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>.
            </p>
          </form>

          <p className="toggle-auth">
            Already have an account?
            <Link to="/login" className="toggle-button">Sign In</Link>
          </p>
        </div>
      </div>
    </>
  );
};

export default SignupPage;
