import React, { useEffect, useRef } from 'react';
import { useLoading } from '../../context/LoadingContext';
import { useLocation } from 'react-router-dom';

interface RouterChangeListenerProps {
  children: React.ReactNode;
}

/**
 * Enhanced RouterChangeListener that now actually listens to route changes
 * to properly manage loading states during navigation.
 */
const RouterChangeListener: React.FC<RouterChangeListenerProps> = ({ children }) => {
  const { resetLoading } = useLoading();
  const initializedRef = useRef(false);
  const location = useLocation();

  // One-time setup - this runs exactly once per app session
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      console.log('[RouterChangeListener] Initial mount - cleaning up any lingering loading states');

      // Initial cleanup
      resetLoading();

      // Add a delayed safety cleanup
      setTimeout(() => {
        console.log('[RouterChangeListener] Performing safety cleanup');
        resetLoading();
      }, 5000);
    }
  }, [resetLoading]); // Include resetLoading dependency

  // Listen for route changes and reset loading state
  useEffect(() => {
    console.log(`[RouterChangeListener] Route changed to: ${location.pathname}`);

    // Small delay to allow any pending loading operations to start
    setTimeout(() => {
      console.log('[RouterChangeListener] Cleaning up loading states after route change');
      resetLoading();
    }, 500);
  }, [location.pathname, resetLoading]);

  // Render children without any wrapping elements
  return <>{children}</>;
};

export default RouterChangeListener;