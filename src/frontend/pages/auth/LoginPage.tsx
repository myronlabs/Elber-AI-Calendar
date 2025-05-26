// src/frontend/pages/LoginPage.tsx
import React, { useState, FormEvent, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import '../../styles/pages/_login.scss';
import { showSuccess, showError, showInfo, showWarning } from '../../utils/toastManager';
// supabase client import removed as direct login is no longer used
import { useAuth } from '../../context/AuthContext';
// Removed unused imports from toastUtils

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, isLoading, error, user } = useAuth();

  // Cleanup body class when component unmounts
  useEffect(() => {
    document.body.classList.add('login-page-active');
    return () => {
      document.body.classList.remove('login-page-active');
    };
  }, []);
  
  // If we already have a user, redirect to assistant
  useEffect(() => {
    if (user) {
      navigate('/assistant');
    }
  }, [user, navigate]);

  // Show messages from navigation state (e.g., after signup or email verification)
  useEffect(() => {
    let message = null;
    let prefillEmail = null;

    if (location.state?.signupSuccess) {
      message = "Account created successfully! A verification email has been sent. Please verify your email before logging in.";
      prefillEmail = location.state.email;
    } else if (location.state?.emailVerified) {
      message = "Email verified successfully! Please log in.";
      prefillEmail = location.state.email;
    }

    if (message) {
      showSuccess(message);
    }

    if (prefillEmail) {
      setEmail(prefillEmail);
    }

    // Clear the state to prevent message from showing again on refresh or navigation
    if (location.state?.signupSuccess || location.state?.emailVerified) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  // Handle errors from auth context
  useEffect(() => {
    if (error) {
      setErrorMessage(error.message);
    }
  }, [error]);

  // Use AuthContext to sign in
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    // console.log('Login form submitted');
    
    if (!email || !password) {
      setErrorMessage('Email and password are required');
      return;
    }
    
    setErrorMessage(null);
    setIsLoggingIn(true);

    try {
      // console.log('Using AuthContext signIn method');
      const result = await signIn(email, password);

      // console.log('Login result:', result);

      if (result?.toast) {
        const toastType = result.toast.type as 'success' | 'error' | 'info' | 'warning';
        (toastType === "success" ? showSuccess : toastType === "error" ? showError : toastType === "warning" ? showWarning : showInfo)(result.toast.message);
      }

      if (result?.success) {
        // console.log('Login successful!');
        navigate('/assistant');
      } else if (result?.message) {
        setErrorMessage(result.message);
      }
    } catch (err: unknown) {
      // console.error('Exception during login:', err);
      let message = 'An error occurred during login';
      if (err instanceof Error) {
        message = err.message;
      }
      setErrorMessage(message);
      showError(message);
    } finally {
      setIsLoggingIn(false);
    }
  };
  
  // Direct Supabase login functionality has been removed

  return (
    <div className="login-page-container"> 
      
      <div className="login-form-card">
        <h2>Sign In to Elber</h2> 
        <p className="subtitle">Welcome back!</p> 
        
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your.email@example.com"
              disabled={isLoading || isLoggingIn}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••••"
              disabled={isLoading || isLoggingIn}
            />
          </div>
          
          <div className="form-group form-group-sub-actions">
            <Link to="/forgot-password" className="forgot-password-link">Forgot Password?</Link>
          </div>

          {errorMessage && (
            <div style={{ color: 'red', margin: '0.625rem 0', padding: '0.625rem', backgroundColor: '#ffebee', borderRadius: '0.25rem' }}>
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading || isLoggingIn}
          >
            {isLoading || isLoggingIn ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <p className="toggle-auth">
                      Don&apos;t have an account?
          <Link to="/signup" className="toggle-button">Create Account</Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
