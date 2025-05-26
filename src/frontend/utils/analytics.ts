/**
 * Analytics utility
 *
 * Simple implementation that can be expanded later with actual analytics provider integration
 */

// Define strongly-typed event parameters for analytics
export interface AnalyticsEventParams {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Track events for analytics
 *
 * @param eventName - The name of the event to track
 * @param eventData - Optional parameters to include with the event
 */
export const trackEvent = (eventName: string, eventData?: Record<string, unknown>): void => {
  try {
    // For now, just log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Analytics] ${eventName}`, eventData);
    }

    // Add actual analytics provider implementation here later
    // Example: mixpanel.track(eventName, eventData);
  } catch (error) {
    // Silently catch errors to avoid breaking the app
    console.error(`[Analytics] Error tracking event "${eventName}":`, error);
  }
};

/**
 * Enhanced analytics utility object with additional functionality
 */
export const Analytics = {
  trackEvent,

  // Track user conversion/goal
  trackGoal: (goalName: string, value?: number, properties?: Record<string, unknown>) => {
    trackEvent(`goal_${goalName}`, { value, ...properties });
  },

  // Track feature usage
  trackFeatureUsage: (featureName: string, properties?: Record<string, unknown>) => {
    trackEvent(`feature_used_${featureName}`, properties);
  },

  // Track errors
  trackError: (errorType: string, errorMessage: string, properties?: Record<string, unknown>) => {
    trackEvent('error_occurred', {
      error_type: errorType,
      error_message: errorMessage,
      ...properties
    });
  }
};

export default Analytics;