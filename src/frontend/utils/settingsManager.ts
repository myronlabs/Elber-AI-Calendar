/**
 * Settings Manager
 * 
 * A manager utility to initialize and coordinate user settings across the application.
 * This provides a simple interface for components and contexts to use settings
 * while handling cross-tab synchronization, error recovery, and more.
 */

import { User } from '@supabase/supabase-js';
import { 
  initializeUserSettings, 
  setupStorageEventListener,
  forceRefreshFromServer,
  getPrivacySettings,
  getNotificationSettings,
  getDisplaySettings,
  savePrivacySettings,
  clearAllSettings,
  type PrivacySettings,
  type NotificationSettings,
  type DisplaySettings,
} from '../services/userSettingsService';

// Type definitions for setting change event handlers
export type SettingsChangeHandler<T> = (_settings: T) => void;

// Registry for event handlers
const eventHandlers: {
  privacy: Array<SettingsChangeHandler<PrivacySettings>>;
  notifications: Array<SettingsChangeHandler<NotificationSettings>>;
  display: Array<SettingsChangeHandler<DisplaySettings>>;
  refresh: Array<() => void>;
  error: Array<(_error: Error) => void>;
} = {
  privacy: [],
  notifications: [],
  display: [],
  refresh: [],
  error: []
};

/**
 * Initialize the settings manager
 * This should be called at application startup, typically in index.tsx or App.tsx
 */
export function initializeSettings(initialUser: User | null): void {
  // Initial setup
  initializeUserSettings(initialUser);
  setupEventListeners();
  
  // Log initialization
  console.log('[SettingsManager] Settings manager initialized');
}

/**
 * Handle user session changes
 * Call this when the user logs in or out
 */
export function handleUserSessionChange(user: User | null): void {
  // This will sync settings from server or clear them on logout
  initializeUserSettings(user);
  
  // Notify listeners about the refresh
  if (user) {
    notifyRefreshListeners();
  }
}

/**
 * Set up event listeners for cross-tab communication and custom events
 */
function setupEventListeners(): void {
  // Ensure storage event listener is set up
  setupStorageEventListener();
  
  // Listen for our custom events
  window.addEventListener('privacy-settings-changed', ((event: CustomEvent) => {
    const settings = event.detail?.settings as PrivacySettings;
    if (settings) {
      notifyPrivacyListeners(settings);
    }
  }) as EventListener);
  
  window.addEventListener('settings-refreshed', (() => {
    notifyRefreshListeners();
  }) as EventListener);
  
  window.addEventListener('settings-refresh-error', ((event: CustomEvent) => {
    const errorMessage = event.detail?.error || 'Unknown error during settings refresh';
    notifyErrorListeners(new Error(errorMessage));
  }) as EventListener);
}

/**
 * Register a handler for privacy settings changes
 */
export function onPrivacySettingsChange(handler: SettingsChangeHandler<PrivacySettings>): () => void {
  eventHandlers.privacy.push(handler);
  
  // Return unsubscribe function
  return () => {
    const index = eventHandlers.privacy.indexOf(handler);
    if (index !== -1) {
      eventHandlers.privacy.splice(index, 1);
    }
  };
}

/**
 * Register a handler for notification settings changes
 */
export function onNotificationSettingsChange(handler: SettingsChangeHandler<NotificationSettings>): () => void {
  eventHandlers.notifications.push(handler);
  
  // Return unsubscribe function
  return () => {
    const index = eventHandlers.notifications.indexOf(handler);
    if (index !== -1) {
      eventHandlers.notifications.splice(index, 1);
    }
  };
}

/**
 * Register a handler for display settings changes
 */
export function onDisplaySettingsChange(handler: SettingsChangeHandler<DisplaySettings>): () => void {
  eventHandlers.display.push(handler);
  
  // Return unsubscribe function
  return () => {
    const index = eventHandlers.display.indexOf(handler);
    if (index !== -1) {
      eventHandlers.display.splice(index, 1);
    }
  };
}

/**
 * Register a handler for settings refresh events
 */
export function onSettingsRefresh(handler: () => void): () => void {
  eventHandlers.refresh.push(handler);
  
  // Return unsubscribe function
  return () => {
    const index = eventHandlers.refresh.indexOf(handler);
    if (index !== -1) {
      eventHandlers.refresh.splice(index, 1);
    }
  };
}

/**
 * Register a handler for settings error events
 */
export function onSettingsError(handler: (_error: Error) => void): () => void {
  eventHandlers.error.push(handler);
  
  // Return unsubscribe function
  return () => {
    const index = eventHandlers.error.indexOf(handler);
    if (index !== -1) {
      eventHandlers.error.splice(index, 1);
    }
  };
}

/**
 * Notify all privacy settings listeners about a change
 */
function notifyPrivacyListeners(settings: PrivacySettings): void {
  eventHandlers.privacy.forEach(handler => {
    try {
      handler(settings);
    } catch (error) {
      console.error('[SettingsManager] Error in privacy settings change handler:', error);
    }
  });
}

/**
 * Notify all notification settings listeners about a change
 */
function notifyNotificationListeners(settings: NotificationSettings): void {
  eventHandlers.notifications.forEach(handler => {
    try {
      handler(settings);
    } catch (error) {
      console.error('[SettingsManager] Error in notification settings change handler:', error);
    }
  });
}

/**
 * Notify all display settings listeners about a change
 */
function notifyDisplayListeners(settings: DisplaySettings): void {
  eventHandlers.display.forEach(handler => {
    try {
      handler(settings);
    } catch (error) {
      console.error('[SettingsManager] Error in display settings change handler:', error);
    }
  });
}

/**
 * Notify all refresh listeners about a settings refresh
 */
function notifyRefreshListeners(): void {
  // Get current settings to provide to listeners
  const privacySettings = getPrivacySettings();
  const notificationSettings = getNotificationSettings();
  const displaySettings = getDisplaySettings();
  
  // Notify each type of listener
  notifyPrivacyListeners(privacySettings);
  notifyNotificationListeners(notificationSettings);
  notifyDisplayListeners(displaySettings);
  
  // Notify general refresh listeners
  eventHandlers.refresh.forEach(handler => {
    try {
      handler();
    } catch (error) {
      console.error('[SettingsManager] Error in settings refresh handler:', error);
    }
  });
}

/**
 * Notify all error listeners about a settings error
 */
function notifyErrorListeners(error: Error): void {
  eventHandlers.error.forEach(handler => {
    try {
      handler(error);
    } catch (handlerError) {
      console.error('[SettingsManager] Error in error handler:', handlerError);
    }
  });
}

/**
 * Manually trigger a refresh of settings from the server
 * This can be used when the user explicitly requests a refresh
 */
export async function refreshSettings(): Promise<boolean> {
  try {
    const success = await forceRefreshFromServer();
    if (success) {
      notifyRefreshListeners();
    }
    return success;
  } catch (error) {
    const typedError = error instanceof Error ? error : new Error(String(error));
    notifyErrorListeners(typedError);
    return false;
  }
}

/**
 * Update privacy settings and notify all listeners
 */
export async function updatePrivacySettings(settings: PrivacySettings): Promise<boolean> {
  try {
    const success = await savePrivacySettings(settings);
    if (success) {
      notifyPrivacyListeners(settings);
    }
    return success;
  } catch (error) {
    const typedError = error instanceof Error ? error : new Error(String(error));
    notifyErrorListeners(typedError);
    return false;
  }
}

/**
 * Trigger a data export for the user
 */
export function triggerDataExport(): void {
  console.log('[SettingsManager] Triggering data export');
  // Implementation would typically involve an API call to request data export
  // For now, we'll just log the action
  
  // Example implementation:
  // api.post('/user/data-export').then(() => {
  //   console.log('[SettingsManager] Data export request successful');
  // }).catch(error => {
  //   console.error('[SettingsManager] Data export request failed:', error);
  //   notifyErrorListeners(error instanceof Error ? error : new Error(String(error)));
  // });
}

/**
 * Initiate account deletion process
 */
export function initiateAccountDeletion(): void {
  console.log('[SettingsManager] Initiating account deletion');
  // Implementation would typically involve an API call to request account deletion
  // For now, we'll just log the action
  
  // Example implementation:
  // api.post('/user/delete-account').then(() => {
  //   console.log('[SettingsManager] Account deletion request successful');
  //   // Possibly log the user out after this
  // }).catch(error => {
  //   console.error('[SettingsManager] Account deletion request failed:', error);
  //   notifyErrorListeners(error instanceof Error ? error : new Error(String(error)));
  // });
}

/**
 * Create a React hook-friendly wrapper around settings manager
 * This is a simple example - you would typically create more detailed React hooks
 * in a separate file
 */
export const SettingsManager = {
  initialize: initializeSettings,
  handleUserChange: handleUserSessionChange,
  refresh: refreshSettings,
  updatePrivacy: updatePrivacySettings,
  getPrivacy: getPrivacySettings,
  getNotifications: getNotificationSettings,
  getDisplay: getDisplaySettings,
  onPrivacyChange: onPrivacySettingsChange,
  onNotificationChange: onNotificationSettingsChange,
  onDisplayChange: onDisplaySettingsChange,
  onRefresh: onSettingsRefresh,
  onError: onSettingsError,
  clearAll: clearAllSettings,
  triggerDataExport,
  initiateAccountDeletion,
};

export default SettingsManager;