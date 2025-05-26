// src/frontend/components/ProtectedRoute.tsx
import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext'; 

const ProtectedRoute: React.FC = () => {
  console.log('[ProtectedRoute] Component rendering/re-rendering.'); 
  const { user, isLoading, session, isRefreshing } = useAuth(); 
  const location = useLocation();

  // Log the state received from useAuth for debugging
  console.log('[ProtectedRoute] Auth state: isLoading:', isLoading, 'isRefreshing:', isRefreshing, 'User ID:', user?.id, 'Session present:', !!session);

  // Only show loading when we're initially loading, not when just refreshing user data
  if (isLoading && !isRefreshing) {
    // Show a loading indicator while checking auth state
    // This prevents a flash of the login page if the user is actually authenticated
    // but the session check is still in progress on initial load.
    console.log('[ProtectedRoute] isLoading is true and not refreshing, rendering loading indicator.');
    return <div>Loading...</div>; 
  }

  if (!user && !session) { 
    // User not authenticated, redirect to login page
    // Pass the current location so we can redirect back after login
    console.log('[ProtectedRoute] User not authenticated (no user/session), redirecting to /login.');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // User is authenticated (user object exists), render the child route
  console.log('[ProtectedRoute] User authenticated, rendering Outlet. User ID:', user?.id);
  return <Outlet />;
};

export default ProtectedRoute;
