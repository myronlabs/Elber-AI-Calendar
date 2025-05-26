import React, { useEffect, useState, useRef } from 'react';
import { useLoading } from '../../context/LoadingContext';
import Spinner from './Spinner';

/**
 * GlobalSpinner renders a fullscreen spinner that is controlled by the 
 * global loading state.
 * 
 * It includes safety mechanisms to prevent infinite re-render loops and to
 * ensure loading animations are properly cleaned up.
 */
const GlobalSpinner: React.FC = () => {
  const { isLoading, resetLoading } = useLoading();
  const [isVisible, setIsVisible] = useState(false);
  const instanceId = useRef(`global-spinner-${Date.now()}`).current;
  const changeCountRef = useRef(0);
  
  // Handle loading state changes
  useEffect(() => {
    const changeId = ++changeCountRef.current;
    
    // Log state changes for debugging
    console.log(`[GlobalSpinner-${instanceId}] #${changeId} Loading state: ${isLoading}`);
    
    if (isLoading) {
      // Set visible immediately when loading starts
      setIsVisible(true);
      
      // Set a safety timeout to force reset if loading gets stuck
      const safetyTimeout = setTimeout(() => {
        console.log(`[GlobalSpinner-${instanceId}] #${changeId} Safety timeout triggered - forcing reset`);
        resetLoading();
      }, 10000); // 10 seconds max loading time
      
      return () => clearTimeout(safetyTimeout);
    } else {
      // When loading ends, add a small delay before hiding
      // This ensures smooth transitions between states
      const hideTimeout = setTimeout(() => {
        console.log(`[GlobalSpinner-${instanceId}] #${changeId} Hiding spinner`);
        setIsVisible(false);
      }, 100);
      
      return () => clearTimeout(hideTimeout);
    }
  }, [isLoading, resetLoading, instanceId]);
  
  // Only render when visible
  if (!isVisible) return null;

  // Render the spinner with fadeOut prop set when not loading
  return (
    <Spinner 
      fullScreen 
      fadeOut={!isLoading} 
    />
  );
};

export default React.memo(GlobalSpinner);