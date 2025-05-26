/**
 * useSettings Hook
 *
 * A React hook for easily accessing and updating user settings within components.
 * This provides reactive access to settings data with proper error handling and
 * loading states for improved UX.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import SettingsManager from '../../utils/settingsManager';
import { 
  PrivacySettings, 
  NotificationSettings,
  DisplaySettings 
} from '../../services/userSettingsService';

// Type definitions for the hook return values
interface UsePrivacySettingsReturn {
  settings: PrivacySettings;
  isLoading: boolean;
  error: Error | null;
  updateSettings: (_newSettings: Partial<PrivacySettings>) => Promise<boolean>;
  refreshSettings: () => Promise<boolean>;
}

interface UseNotificationSettingsReturn {
  settings: NotificationSettings;
  isLoading: boolean;
  error: Error | null;
  refreshSettings: () => Promise<boolean>;
}

interface UseDisplaySettingsReturn {
  settings: DisplaySettings;
  isLoading: boolean;
  error: Error | null;
  refreshSettings: () => Promise<boolean>;
}

/**
 * Hook for accessing and updating privacy settings
 */
export function usePrivacySettings(): UsePrivacySettingsReturn {
  // State for component
  const [settings, setSettings] = useState<PrivacySettings>(SettingsManager.getPrivacy());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  // Track whether there's an active update in progress to prevent race conditions
  const [isActive, setIsActive] = useState<boolean>(false);
  
  // Keep track of the last update timestamp to detect stale data
  const lastUpdateRef = useRef<number>(Date.now());

  // Setup event listeners when the component mounts
  useEffect(() => {
    console.log('[usePrivacySettings] Setting up event listeners');
    
    // Subscribe to privacy settings changes
    const unsubscribe = SettingsManager.onPrivacyChange((newSettings) => {
      console.log('[usePrivacySettings] Settings change detected:', newSettings);
      
      // Only update settings if there's no active update in progress
      // This prevents overriding user changes that haven't been saved yet
      if (!isActive) {
        console.log('[usePrivacySettings] Updating settings from event');
        setSettings(newSettings);
        lastUpdateRef.current = Date.now();
      } else {
        console.log('[usePrivacySettings] Ignoring settings change event - update in progress');
      }
    });

    // Subscribe to errors
    const unsubscribeError = SettingsManager.onError((error) => {
      console.error('[usePrivacySettings] Received error from SettingsManager:', error);
      setError(error);
      setIsLoading(false);
      setIsActive(false);
    });

    // Cleanup on unmount
    return () => {
      console.log('[usePrivacySettings] Cleaning up event listeners');
      unsubscribe();
      unsubscribeError();
    };
  }, [isActive]); // Add isActive as dependency so the effect re-runs when activation state changes

  // Method to update privacy settings
  const updateSettings = useCallback(async (newSettings: Partial<PrivacySettings>): Promise<boolean> => {
    try {
      console.log('[usePrivacySettings] Starting settings update');
      setIsLoading(true);
      setIsActive(true); // Mark that we have an update in progress
      setError(null);
      
      console.log('[usePrivacySettings] Updating privacy settings with:', newSettings);

      // Merge new settings with existing ones
      const updatedSettings: PrivacySettings = {
        ...settings,
        ...newSettings
      };
      
      console.log('[usePrivacySettings] Merged settings to save:', updatedSettings);

      // Send update to the server
      const success = await SettingsManager.updatePrivacy(updatedSettings);
      
      if (success) {
        console.log('[usePrivacySettings] Settings updated successfully');
        
        // Immediately update local state for better UX
        // This helps prevent flashing of old values
        setSettings(updatedSettings);
        lastUpdateRef.current = Date.now();
      } else {
        console.error('[usePrivacySettings] Failed to update settings');
      }
      
      // Update loading state
      setIsLoading(false);
      setIsActive(false); // Mark that our update is complete
      
      return success;
    } catch (err) {
      console.error('[usePrivacySettings] Error updating settings:', err);
      setIsLoading(false);
      setIsActive(false); // Important to reset this even on error
      const typedError = err instanceof Error ? err : new Error(String(err));
      setError(typedError);
      return false;
    }
  }, [settings]);

  // Method to refresh settings from server
  const refreshSettings = useCallback(async (): Promise<boolean> => {
    try {
      console.log('[usePrivacySettings] Refreshing settings from server');
      setIsLoading(true);
      setError(null);

      const success = await SettingsManager.refresh();
      
      if (success) {
        console.log('[usePrivacySettings] Settings refreshed successfully');
        lastUpdateRef.current = Date.now();
      } else {
        console.log('[usePrivacySettings] Settings refresh failed');
      }
      
      setIsLoading(false);
      return success;
    } catch (err) {
      console.error('[usePrivacySettings] Error refreshing settings:', err);
      setIsLoading(false);
      const typedError = err instanceof Error ? err : new Error(String(err));
      setError(typedError);
      return false;
    }
  }, []);

  // Return values and methods
  return useMemo(() => ({
    settings,
    isLoading,
    error,
    updateSettings,
    refreshSettings
  }), [settings, isLoading, error, updateSettings, refreshSettings]);
}

/**
 * Hook for accessing notification settings
 */
export function useNotificationSettings(): UseNotificationSettingsReturn {
  // State for component
  const [settings, setSettings] = useState<NotificationSettings>(SettingsManager.getNotifications());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // Setup event listeners when the component mounts
  useEffect(() => {
    // Subscribe to notification settings changes
    const unsubscribe = SettingsManager.onNotificationChange((newSettings) => {
      setSettings(newSettings);
    });

    // Subscribe to errors
    const unsubscribeError = SettingsManager.onError((error) => {
      setError(error);
      setIsLoading(false);
    });

    // Cleanup on unmount
    return () => {
      unsubscribe();
      unsubscribeError();
    };
  }, []);

  // Method to refresh settings from server
  const refreshSettings = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      const success = await SettingsManager.refresh();
      
      setIsLoading(false);
      return success;
    } catch (err) {
      setIsLoading(false);
      const typedError = err instanceof Error ? err : new Error(String(err));
      setError(typedError);
      return false;
    }
  }, []);

  // Return values and methods
  return useMemo(() => ({
    settings,
    isLoading,
    error,
    refreshSettings
  }), [settings, isLoading, error, refreshSettings]);
}

/**
 * Hook for accessing display settings
 */
export function useDisplaySettings(): UseDisplaySettingsReturn {
  // State for component
  const [settings, setSettings] = useState<DisplaySettings>(SettingsManager.getDisplay());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // Setup event listeners when the component mounts
  useEffect(() => {
    // Subscribe to display settings changes
    const unsubscribe = SettingsManager.onDisplayChange((newSettings) => {
      setSettings(newSettings);
    });

    // Subscribe to errors
    const unsubscribeError = SettingsManager.onError((error) => {
      setError(error);
      setIsLoading(false);
    });

    // Cleanup on unmount
    return () => {
      unsubscribe();
      unsubscribeError();
    };
  }, []);

  // Method to refresh settings from server
  const refreshSettings = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      const success = await SettingsManager.refresh();
      
      setIsLoading(false);
      return success;
    } catch (err) {
      setIsLoading(false);
      const typedError = err instanceof Error ? err : new Error(String(err));
      setError(typedError);
      return false;
    }
  }, []);

  // Return values and methods
  return useMemo(() => ({
    settings,
    isLoading,
    error,
    refreshSettings
  }), [settings, isLoading, error, refreshSettings]);
}

/**
 * Example usage:
 * 
 * function PrivacySettingsComponent() {
 *   const { settings, isLoading, error, updateSettings } = usePrivacySettings();
 * 
 *   const handleProfileVisibilityChange = (visibility) => {
 *     updateSettings({ privacy_profile_visibility: visibility });
 *   };
 * 
 *   if (isLoading) return <Spinner />;
 *   if (error) return <ErrorBanner message={error.message} />;
 * 
 *   return (
 *     <div>
 *       <h2>Privacy Settings</h2>
 *       <select 
 *         value={settings.privacy_profile_visibility} 
 *         onChange={(e) => handleProfileVisibilityChange(e.target.value)}
 *       >
 *         <option value="Everyone">Everyone</option>
 *         <option value="MyContactsOnly">Contacts Only</option>
 *         <option value="Private">Private</option>
 *       </select>
 *     </div>
 *   );
 * }
 */