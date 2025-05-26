import React, { useEffect, useState, useRef, useCallback } from 'react';
import '../../styles/components/_spinner.scss';

interface SpinnerProps {
  /** Display spinner as fullscreen overlay */
  fullScreen?: boolean;
  /** Trigger fade out animation */
  fadeOut?: boolean;
  /** Optional classname for custom styling */
  className?: string;
}

/**
 * A robust spinner component that handles its own animation states.
 * 
 * Features:
 * - Controlled mounting/unmounting behavior
 * - Clean enter/exit animations
 * - Automatic DOM cleanup
 * - No race conditions or animation artifacts
 */
const Spinner: React.FC<SpinnerProps> = ({ 
  fullScreen = false, 
  fadeOut = false,
  className = ''
}) => {
  // Component instance ID for debugging
  const instanceId = useRef(`spinner-${Math.floor(Math.random() * 10000)}`);
  
  // Track visible state (controls CSS classes)
  const [isVisible, setIsVisible] = useState(false);
  
  // Track exit animation state
  const [isExiting, setIsExiting] = useState(false);
  
  // Tracks if component is still mounted
  const isMountedRef = useRef(true);
  
  // Safely update state only if component is still mounted
  const safeSetState = useCallback((setter: React.Dispatch<React.SetStateAction<boolean>>, value: boolean) => {
    if (isMountedRef.current) {
      setter(value);
    }
  }, []);
  
  // Handle component lifecycle and animations
  useEffect(() => {
    console.log(`[Spinner-${instanceId.current}] Mounted, fadeOut=${fadeOut}`);
    
    // Mark as mounted
    isMountedRef.current = true;
    
    // Start entrance animation after a tiny delay to allow initial render
    const showTimer = setTimeout(() => {
      safeSetState(setIsVisible, true);
    }, 10);
    
    // Handle fadeOut prop changes
    if (fadeOut) {
      console.log(`[Spinner-${instanceId.current}] Starting exit animation`);
      safeSetState(setIsExiting, true);
    } else {
      safeSetState(setIsExiting, false);
    }
    
    // Clean up on unmount
    const currentInstanceId = instanceId.current;
    return () => {
      console.log(`[Spinner-${currentInstanceId}] Unmounting`);
      isMountedRef.current = false;
      clearTimeout(showTimer);
    };
  }, [fadeOut, safeSetState]);
  
  // Build CSS classes
  const containerClasses = [
    'spinner-container',
    fullScreen ? 'fullscreen' : '',
    isVisible ? 'visible' : '',
    isExiting ? 'spinner-fade-out' : '',
    className
  ].filter(Boolean).join(' ');
  
  return (
    <div className={containerClasses} data-testid="spinner">
      <div className="spinner"></div>
    </div>
  );
};

export default React.memo(Spinner);