import React, { ReactNode, Suspense, useEffect, useRef, useState } from 'react';
import { useLoading } from '../../context/LoadingContext';
import Spinner from './Spinner';

interface SuspenseWithLoadingProps {
  children: ReactNode;
  fallback?: ReactNode;
}

// Custom fallback component with local spinner
const DefaultFallback: React.FC = () => (
  <div className="page-loader">
    <Spinner />
    <p>Loading page...</p>
  </div>
);

/**
 * Custom error boundary that handles errors in suspense components
 */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode, fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode, fallback: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Error in suspense component:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/**
 * A wrapper around React.Suspense that integrates with the global loading system.
 *
 * This component is designed to:
 * 1. Trigger loading state when suspense is active
 * 2. Clean up loading state when suspense resolves
 * 3. Prevent re-render loops by using stable references and minimal dependencies
 * 4. Handle errors from lazy-loaded components
 */
const SuspenseWithLoading: React.FC<SuspenseWithLoadingProps> = ({
  children,
  fallback = <DefaultFallback />
}) => {
  const { setLoading, resetLoading } = useLoading();
  const instanceId = useRef(`suspense-${Date.now()}`).current;
  const mountedRef = useRef(false);
  const [retryCount, setRetryCount] = useState(0);

  // Set up loading state tracking on mount
  useEffect(() => {
    console.log(`[SuspenseWithLoading-${instanceId}] Component mounted`);

    if (!mountedRef.current) {
      mountedRef.current = true;

      // Signal that loading has started
      setLoading(true);

      // Turn off loading state after component is fully mounted
      setTimeout(() => {
        console.log(`[SuspenseWithLoading-${instanceId}] Setting loading to false after mount`);
        setLoading(false);
      }, 100);
    }

    // Clean up on unmount - this is essential to prevent stuck loading states
    return () => {
      console.log(`[SuspenseWithLoading-${instanceId}] Component unmounting`);

      // Force reset to ensure no lingering loading states
      resetLoading();
    };
  }, [retryCount, instanceId, resetLoading, setLoading]); // Include all dependencies

  // Error fallback component with retry functionality
  const errorFallback = (
    <div className="error-boundary-fallback">
      <h3>Failed to load page component</h3>
      <p>There was an error loading this page.</p>
      <button
        onClick={() => setRetryCount(count => count + 1)}
        className="retry-button"
      >
        Retry Loading
      </button>
    </div>
  );

  return (
    <ErrorBoundary fallback={errorFallback}>
      <Suspense fallback={fallback}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
};

export default SuspenseWithLoading;