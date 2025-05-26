import React, { createContext, useState, useContext, ReactNode, useRef, useCallback, useMemo } from 'react';

// Well-defined constants for loading behavior
const MAX_LOADING_TIME = 15000; // 15 seconds maximum loading time
const MIN_LOADING_TIME = 300; // 300ms minimum loading time for visual consistency

// Interface for the LoadingContext
interface LoadingContextType {
  isLoading: boolean;
  setLoading: (_loading: boolean) => void;
  resetLoading: () => void;
}

// Create context with meaningful undefined check
const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

interface LoadingProviderProps {
  children: ReactNode;
}

/**
 * LoadingProvider manages global loading state with safeguards against infinite loops.
 * 
 * Key features:
 * - Reference counting for nested loading operations
 * - Minimum display time to prevent flickering
 * - Maximum display time as safety measure
 * - Forced reset capability to recover from stuck states
 */
export const LoadingProvider: React.FC<LoadingProviderProps> = ({ children }) => {
  // Core loading state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // Reference counting approach to handle nested loading requests
  const loadingCountRef = useRef<number>(0);
  
  // Track request timing for min/max duration enforcement
  const loadingStartTimeRef = useRef<number | null>(null);
  
  // Timer references for proper cleanup
  const maxLoadingTimerRef = useRef<number | null>(null);
  const minLoadingTimerRef = useRef<number | null>(null);
  
  // Debug counter to track loading state changes
  const operationCountRef = useRef<number>(0);
  
  // Clear all timers to prevent memory leaks and dangling operations
  const clearAllTimers = useCallback(() => {
    if (maxLoadingTimerRef.current !== null) {
      window.clearTimeout(maxLoadingTimerRef.current);
      maxLoadingTimerRef.current = null;
    }
    
    if (minLoadingTimerRef.current !== null) {
      window.clearTimeout(minLoadingTimerRef.current);
      minLoadingTimerRef.current = null;
    }
  }, []);
  
  // resetLoading provides a way to force the loading state to a known good state
  // This is crucial for recovering from potential stuck states
  const resetLoading = useCallback(() => {
    const opId = ++operationCountRef.current;
    console.log(`[LoadingContext] (${opId}) Force resetting loading state`);
    
    // Clear all timers
    clearAllTimers();
    
    // Reset count and timestamps to known good values
    loadingCountRef.current = 0;
    loadingStartTimeRef.current = null;
    
    // Update actual state
    setIsLoading(false);
  }, [clearAllTimers]);
  
  // setLoading handles the reference counting and timing logic
  const setLoading = useCallback((loading: boolean) => {
    const opId = ++operationCountRef.current;
    
    if (loading) {
      // LOADING START LOGIC
      loadingCountRef.current += 1;
      console.log(`[LoadingContext] (${opId}) START loading, count: ${loadingCountRef.current}`);
      
      // Only set loading true on first request (0->1 transition)
      if (loadingCountRef.current === 1) {
        // Record start time for minimum display time calculation
        loadingStartTimeRef.current = Date.now();
        
        // Update actual state
        setIsLoading(true);
        
        // Set maximum loading time safety timer
        clearAllTimers(); // Clear any existing timers first
        
        maxLoadingTimerRef.current = window.setTimeout(() => {
          console.log(`[LoadingContext] (${opId}) Maximum loading time reached (${MAX_LOADING_TIME}ms)`);
          resetLoading(); // Force reset after max time
        }, MAX_LOADING_TIME);
      }
    } else {
      // LOADING END LOGIC
      
      // Decrement counter, but never go below 0
      loadingCountRef.current = Math.max(0, loadingCountRef.current - 1);
      console.log(`[LoadingContext] (${opId}) END loading, count: ${loadingCountRef.current}`);
      
      // If counter still positive, keep loading active
      if (loadingCountRef.current > 0) {
        console.log(`[LoadingContext] (${opId}) Still have ${loadingCountRef.current} active loading requests`);
        return; // Exit early, don't turn off loading yet
      }
      
      // Counter reached 0, prepare to hide loading
      clearAllTimers(); // Clear maximum loading timer
      
      // If we have a start time, enforce minimum display time
      if (loadingStartTimeRef.current !== null) {
        const elapsedTime = Date.now() - loadingStartTimeRef.current;
        
        if (elapsedTime < MIN_LOADING_TIME) {
          // Not shown long enough yet, wait remaining time
          const remainingTime = MIN_LOADING_TIME - elapsedTime;
          console.log(`[LoadingContext] (${opId}) Enforcing minimum time, waiting ${remainingTime}ms more`);
          
          minLoadingTimerRef.current = window.setTimeout(() => {
            console.log(`[LoadingContext] (${opId}) Minimum time reached, hiding loader`);
            
            if (loadingCountRef.current === 0) { // Double-check count is still 0
              setIsLoading(false);
              loadingStartTimeRef.current = null;
            }
            
            minLoadingTimerRef.current = null;
          }, remainingTime);
          
          return; // Exit early, timer will handle the state change
        }
      }
      
      // Either no start time or already shown long enough
      console.log(`[LoadingContext] (${opId}) Hiding loader immediately`);
      setIsLoading(false);
      loadingStartTimeRef.current = null;
    }
  }, [resetLoading, clearAllTimers]);
  
  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    isLoading,
    setLoading,
    resetLoading
  }), [isLoading, setLoading, resetLoading]);
  
  return (
    <LoadingContext.Provider value={contextValue}>
      {children}
    </LoadingContext.Provider>
  );
};

// Custom hook for consuming the loading context
export const useLoading = (): LoadingContextType => {
  const context = useContext(LoadingContext);
  
  if (context === undefined) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  
  return context;
};