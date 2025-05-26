/**
 * User Settings Service
 * 
 * A centralized service to handle user settings persistence, synchronization,
 * and management across the application. This service provides a consistent
 * interface for reading, writing, and synchronizing user settings between
 * the local storage and server.
 */

import { User } from '@supabase/supabase-js';
import { apiClient } from '../utils/api';
// import { jwtDecode } from 'jwt-decode'; // Unused

// Type guard for PrivacySettings
function isPrivacySettings(data: unknown): data is Partial<PrivacySettings> {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  // Check for optional properties, ensure their types if they exist
  if (obj.privacy_profile_visibility !== undefined && 
      !['Everyone', 'MyContactsOnly', 'Private'].includes(obj.privacy_profile_visibility as string)) return false;
  if (obj.privacy_share_activity !== undefined && typeof obj.privacy_share_activity !== 'boolean') return false;
  if (obj.privacy_allow_contact_requests !== undefined && typeof obj.privacy_allow_contact_requests !== 'boolean') return false;
  return true;
}

// Type guard for NotificationSettings
function isNotificationSettings(data: unknown): data is Partial<NotificationSettings> {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (obj.notifications_general !== undefined && typeof obj.notifications_general !== 'boolean') return false;
  if (obj.notifications_marketing_emails !== undefined && typeof obj.notifications_marketing_emails !== 'boolean') return false;
  if (obj.notifications_in_app !== undefined && typeof obj.notifications_in_app !== 'boolean') return false;
  if (obj.notifications_reminders !== undefined && typeof obj.notifications_reminders !== 'boolean') return false;
  return true;
}

// Type guard for DisplaySettings
function isDisplaySettings(data: unknown): data is Partial<DisplaySettings> {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (obj.display_theme !== undefined && !['light', 'dark', 'system'].includes(obj.display_theme as string)) return false;
  if (obj.display_density !== undefined && !['compact', 'comfortable', 'spacious'].includes(obj.display_density as string)) return false;
  if (obj.display_animations !== undefined && typeof obj.display_animations !== 'boolean') return false;
  return true;
}

// Storage keys for different setting categories
export const STORAGE_KEYS = {
  PRIVACY: 'elber_user_privacy_settings',
  DISPLAY: 'elber_user_display_settings',
  NOTIFICATIONS: 'elber_user_notification_settings',
  SETTINGS_TIMESTAMP: 'elber_user_settings_timestamp',
  SETTINGS_REFRESH_FLAG: 'elber_settings_needs_refresh',
};

// Type definitions for different setting categories
export interface PrivacySettings {
  privacy_profile_visibility?: 'Everyone' | 'MyContactsOnly' | 'Private';
  privacy_share_activity?: boolean;
  privacy_allow_contact_requests?: boolean;
}

// Server-side representation for privacy settings (unprefixed fields)
export interface ServerPrivacySettings {
  profile_visibility: PrivacySettings['privacy_profile_visibility'];
  share_activity_with_contacts: PrivacySettings['privacy_share_activity'];
  allow_contact_requests: PrivacySettings['privacy_allow_contact_requests'];
}

// Payload for updating privacy settings
interface UpdatePrivacySettingsPayload {
  action: 'update_privacy_settings';
  settings: ServerPrivacySettings;
}

// Response from settings API
interface SettingsApiResponse {
  success?: boolean;
  message?: string;
  updatedSettings?: PrivacySettings;
  user_metadata?: Record<string, unknown>;
}

export interface DisplaySettings {
  display_theme?: 'light' | 'dark' | 'system';
  display_density?: 'compact' | 'comfortable' | 'spacious';
  display_animations?: boolean;
}

export interface NotificationSettings {
  notifications_general?: boolean;
  notifications_marketing_emails?: boolean;
  notifications_in_app?: boolean;
  notifications_reminders?: boolean;
}

// Combined settings interface
export interface UserSettings {
  privacy: PrivacySettings;
  display: DisplaySettings;
  notifications: NotificationSettings;
  lastSyncTimestamp: number;
}

// Track pending updates to avoid race conditions
let pendingSettingsUpdates: Record<string, boolean> = {};

// Add this at the top of the file
let isForceRefreshing = false;

// const REFRESH_THRESHOLD_SECONDS = 300; // Commented out as unused

// interface DecodedTokenForRefresh { // Commented out as jwtDecode and its usage are commented
//   exp: number;
// }

// Store the promise for an ongoing token refresh
// let refreshTokenPromise: Promise<string | null> | null = null; // Commented out as unused
// let tokenRefreshIntervalId: NodeJS.Timeout | null = null; // Commented out as unused

/**
 * Initialize user settings service with user data
 * This should be called whenever user data changes
 */
export function initializeUserSettings(user: User | null): void {
  if (!user) {
    // User logged out, clear all settings
    clearAllSettings();
    return;
  }

  // If a force refresh is already in progress, don't start another one.
  // Also, don't run syncServerToLocalSettings if a refresh is happening,
  // as it will run after the refresh completes.
  if (isForceRefreshing) {
    console.log('[UserSettingsService] Force refresh already in progress. Skipping initialization cycle.');
    return;
  }

  // Update local cache from user metadata
  syncServerToLocalSettings(user);
  
  // Setup storage event listener for cross-tab synchronization
  setupStorageEventListener();
  
  // Clear any refresh flag that might be set
  localStorage.removeItem(STORAGE_KEYS.SETTINGS_REFRESH_FLAG);

  // Only force a refresh if it's been a while since the last sync or if we don't have a timestamp
  const timestamp = localStorage.getItem(STORAGE_KEYS.SETTINGS_TIMESTAMP);
  const lastSyncTime = timestamp ? parseInt(timestamp, 10) : 0;
  const refreshIntervalMs = 30 * 60 * 1000; // 30 minutes

  if (!timestamp || (Date.now() - lastSyncTime > refreshIntervalMs)) {
    console.log('[UserSettingsService] Settings sync needed - scheduling refresh');

    // Set the flag BEFORE starting the async operation
    isForceRefreshing = true; 
    
    setTimeout(() => {
      forceRefreshFromServer()
        .then(success => {
          console.log(`[UserSettingsService] Forced refresh from server after page load: ${success ? 'successful' : 'failed'}`);
        })
        .catch(err => {
          console.error('[UserSettingsService] Error during scheduled forced refresh:', err);
        })
        .finally(() => {
          // Clear the flag AFTER the operation completes (success or failure)
          isForceRefreshing = false; 
        });
    }, 1000); // Short delay to allow for other initialization tasks
  } else {
    console.log('[UserSettingsService] Recent settings sync found, skipping automatic refresh');
  }
}

/**
 * Synchronize settings from server (user metadata) to local storage
 * This ensures local storage reflects the latest server state
 */
export function syncServerToLocalSettings(user: User): void {
  if (!user?.user_metadata) {
    console.warn('[UserSettingsService.syncServerToLocalSettings] No user_metadata found in user object:', user);
    return;
  }

  try {
    // Extract settings from user metadata
    const metadata = user.user_metadata;
    console.log('[UserSettingsService.syncServerToLocalSettings] ======= SYNC START =======');
    console.log('[UserSettingsService.syncServerToLocalSettings] Raw user metadata:', metadata);
    
    let existingSettings: PrivacySettings | null = null;
    try {
      const existingJson = localStorage.getItem(STORAGE_KEYS.PRIVACY);
      if (existingJson) {
        const parsedJson: unknown = JSON.parse(existingJson);
        if (isPrivacySettings(parsedJson)) {
          // We need to ensure it's not just Partial but a full PrivacySettings object for `existingSettings` type.
          // For this specific use, we are comparing against it, so Partial is fine, 
          // but if `existingSettings` was used to fully reconstruct state, it would need to be combined with defaults.
          // Here, we will assign it and let the subsequent logic handle merging with metadata or defaults.
          existingSettings = { ...parsedJson } as PrivacySettings; // Cast to full after guard, spread to ensure new object
          console.log('[UserSettingsService.syncServerToLocalSettings] Existing localStorage settings (validated):', existingSettings);
        } else {
          console.warn('[UserSettingsService.syncServerToLocalSettings] Malformed existing privacy settings in localStorage.');
        }
      }
    } catch (parseError) {
      console.error('[UserSettingsService.syncServerToLocalSettings] Error parsing existing settings:', parseError);
      // Continue with null existingSettings
    }
    
    // Handle recently saved settings that might not be reflected in the metadata yet
    // Look for a recent save timestamp in localStorage
    const lastSaveTimestamp = parseInt(localStorage.getItem(STORAGE_KEYS.SETTINGS_TIMESTAMP) || '0', 10);
    const currentTime = Date.now();
    const isRecentSave = (currentTime - lastSaveTimestamp) < 5000; // Within 5 seconds
    
    if (isRecentSave && existingSettings) {
      console.log(
        '[UserSettingsService.syncServerToLocalSettings] Recent save detected!', 
        'Current time:', new Date(currentTime).toISOString(),
        'Last save:', new Date(lastSaveTimestamp).toISOString(),
        'Diff (ms):', currentTime - lastSaveTimestamp
      );
      console.log('[UserSettingsService.syncServerToLocalSettings] Preserving recently saved settings to prevent overwrite.');
      
      // In this case, don't proceed with syncing server settings, as they might overwrite recent changes
      console.log('[UserSettingsService.syncServerToLocalSettings] ======= SYNC SKIPPED (RECENT SAVE) =======');
      return;
    }
    
    // Privacy settings with fallback to unprefixed fields
    // Always prioritize prefixed fields (new format) over legacy unprefixed fields
    const privacySettings: PrivacySettings = {
      privacy_profile_visibility: 
        metadata.privacy_profile_visibility ?? 
        metadata.profile_visibility ?? 
        (existingSettings?.privacy_profile_visibility ?? 'Everyone'),
      
      privacy_share_activity: 
        metadata.privacy_share_activity ?? 
        metadata.share_activity_with_contacts ?? 
        (existingSettings?.privacy_share_activity ?? true),
      
      privacy_allow_contact_requests: 
        metadata.privacy_allow_contact_requests ?? 
        metadata.allow_contact_requests ?? 
        (existingSettings?.privacy_allow_contact_requests ?? true),
    };
    
    console.log('[UserSettingsService.syncServerToLocalSettings] Extracted privacy settings:', privacySettings);
    
    // Check if anything actually changed before updating localStorage
    let privacyChanged = false;
    if (existingSettings) {
      privacyChanged = (
        privacySettings.privacy_profile_visibility !== existingSettings.privacy_profile_visibility ||
        privacySettings.privacy_share_activity !== existingSettings.privacy_share_activity ||
        privacySettings.privacy_allow_contact_requests !== existingSettings.privacy_allow_contact_requests
      );
      console.log('[UserSettingsService.syncServerToLocalSettings] Privacy settings changed?', privacyChanged);
    } else {
      // If no existing settings, we're definitely changing something
      privacyChanged = true;
    }
    
    // Only update localStorage if something actually changed
    if (privacyChanged) {
      console.log('[UserSettingsService.syncServerToLocalSettings] Updating localStorage with new privacy settings');
      
      // Save to local storage with proper error handling
      try {
        const privacyJson = JSON.stringify(privacySettings);
        console.log('[UserSettingsService.syncServerToLocalSettings] Stringified privacy settings:', privacyJson);
        localStorage.setItem(STORAGE_KEYS.PRIVACY, privacyJson);
      } catch (storageError) {
        console.error('[UserSettingsService.syncServerToLocalSettings] Failed to save privacy settings to localStorage:', storageError);
      }
    } else {
      console.log('[UserSettingsService.syncServerToLocalSettings] No privacy setting changes detected, skipping localStorage update');
    }
    
    // Notification settings
    const notificationSettings: NotificationSettings = {
      notifications_general: metadata.notifications_general ?? true,
      notifications_marketing_emails: metadata.notifications_marketing_emails ?? false,
      notifications_in_app: metadata.notifications_in_app ?? true,
      notifications_reminders: metadata.notifications_reminders ?? false,
    };
    
    // Display settings with fallbacks
    const displaySettings: DisplaySettings = {
      display_theme: metadata.display_theme ?? 'dark',
      display_density: metadata.display_density ?? 'comfortable',
      display_animations: metadata.display_animations ?? true,
    };
    
    // Save notification and display settings
    try {
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notificationSettings));
      localStorage.setItem(STORAGE_KEYS.DISPLAY, JSON.stringify(displaySettings));
      localStorage.setItem(STORAGE_KEYS.SETTINGS_TIMESTAMP, Date.now().toString());
      
      // Clear any refresh flag as we've just synchronized
      localStorage.removeItem(STORAGE_KEYS.SETTINGS_REFRESH_FLAG);

      console.log('[UserSettingsService] Successfully synchronized settings from server to local storage');

      // Dispatch a native DOM event to notify components that settings have been refreshed
      // This helps components to update their state with the latest settings from localStorage
      if (privacyChanged) {
        window.dispatchEvent(new CustomEvent('settings-refreshed', {
          detail: { 
            timestamp: Date.now(),
            source: 'syncServerToLocalSettings',
            privacySettings: privacySettings
          }
        }));
      }
    } catch (storageError) {
      console.error('[UserSettingsService] Failed to save settings to localStorage:', storageError);
    }
    
    console.log('[UserSettingsService.syncServerToLocalSettings] ======= SYNC COMPLETE =======');
  } catch (error) {
    console.error('[UserSettingsService] Error synchronizing settings from server:', error);
    
    // Mark that we need a refresh on next load
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS_REFRESH_FLAG, 'true');
    } catch {
      // If even this fails, we can't do much more
    }
    
    console.log('[UserSettingsService.syncServerToLocalSettings] ======= SYNC ERROR =======');
  }
}

/**
 * Save privacy settings to both local storage and trigger server update
 * @returns Promise that resolves to true if successful, false otherwise
 */
export async function savePrivacySettings(settings: PrivacySettings): Promise<boolean> {
  // Prevent concurrent updates to the same settings
  if (pendingSettingsUpdates[STORAGE_KEYS.PRIVACY]) {
    console.warn('[UserSettingsService] Concurrent privacy settings update detected. Skipping this update to prevent race conditions.');
    return false;
  }
  
  // Mark that we have a pending update to this category
  pendingSettingsUpdates[STORAGE_KEYS.PRIVACY] = true;
  
  // Get current settings from localStorage to revert on failure
  const originalSettingsJson = localStorage.getItem(STORAGE_KEYS.PRIVACY);
  console.log('[UserSettingsService.savePrivacySettings] ======= SETTINGS SAVE START =======');
  console.log('[UserSettingsService.savePrivacySettings] Saving privacy settings:', settings);
  console.log('[UserSettingsService.savePrivacySettings] Current localStorage settings:', originalSettingsJson);

  try {
    // Format settings for server in the expected format
    const serverSettings: ServerPrivacySettings = {
      profile_visibility: settings.privacy_profile_visibility,
      share_activity_with_contacts: settings.privacy_share_activity,
      allow_contact_requests: settings.privacy_allow_contact_requests,
    };

    // Save to local storage first for immediate feedback (Optimistic Update)
    const settingsToSave = JSON.stringify(settings);
    console.log('[UserSettingsService.savePrivacySettings] Stringified settings to save:', settingsToSave);
    localStorage.setItem(STORAGE_KEYS.PRIVACY, settingsToSave);
    localStorage.setItem(STORAGE_KEYS.SETTINGS_TIMESTAMP, Date.now().toString());

    console.log('[UserSettingsService] Privacy settings optimistically saved to localStorage:', settings);
    console.log('[UserSettingsService] Sending to server:', serverSettings);

    // Create request payload
    const requestPayload: UpdatePrivacySettingsPayload = {
      action: 'update_privacy_settings',
      settings: serverSettings
    };

    // Then update server
    const response = await apiClient.post<UpdatePrivacySettingsPayload, SettingsApiResponse>(
      '/settings',
      requestPayload
    );

    console.log('[UserSettingsService] Server response for privacy settings update:', response);

    // Check for error response more robustly
    let isError = false;
    if (!response) { // No response at all
      isError = true;
      console.error('[UserSettingsService] No response received from server');
    } else if (response.success === false) { // Explicit failure from backend
      isError = true;
      console.error('[UserSettingsService] Server explicitly returned success: false');
    } else if (response.success !== true && 
               (typeof response.message !== 'string' || !response.message.toLowerCase().includes("successfully"))) {
      // success is not true, and no clear success message either. Treat as error.
      // This also covers cases where response.success is undefined but there's an error structure.
      isError = true;
      console.error('[UserSettingsService] Ambiguous server response without clear success indication');
    }

    if (isError) {
      console.error('[UserSettingsService] Server failed to save privacy settings. Reverting optimistic localStorage update. Response:', response);
      if (originalSettingsJson) {
        localStorage.setItem(STORAGE_KEYS.PRIVACY, originalSettingsJson);
      } else {
        localStorage.removeItem(STORAGE_KEYS.PRIVACY);
      }
      
      pendingSettingsUpdates[STORAGE_KEYS.PRIVACY] = false;
      console.log('[UserSettingsService.savePrivacySettings] ======= SETTINGS SAVE FAILED =======');
      return false;
    }

    console.log('[UserSettingsService] Privacy settings saved successfully to server. Response:', response);
    
    // If server responded with updated settings, use those to update localStorage
    // This ensures localStorage has the exact same data that the server has
    if (response.updatedSettings) {
      // Use a type that includes both prefixed and legacy unprefixed fields
      interface FullUserMetadata extends Partial<PrivacySettings> {
        profile_visibility?: 'Everyone' | 'MyContactsOnly' | 'Private';
        share_activity_with_contacts?: boolean;
        allow_contact_requests?: boolean;
      }
      
      const userMeta = response.user_metadata as FullUserMetadata | undefined;
      
      console.log('[UserSettingsService] Server returned updatedSettings:', response.updatedSettings);
      console.log('[UserSettingsService] Server returned user_metadata:', userMeta);
      
      // Prioritize server's updatedSettings over user_metadata
      // This ensures we get the most authoritative values
      const updatedSettings: PrivacySettings = {
        privacy_profile_visibility: 
          response.updatedSettings.privacy_profile_visibility ?? 
          userMeta?.privacy_profile_visibility ?? 
          userMeta?.profile_visibility ?? 
          settings.privacy_profile_visibility,
          
        privacy_share_activity: 
          response.updatedSettings.privacy_share_activity ?? 
          userMeta?.privacy_share_activity ?? 
          userMeta?.share_activity_with_contacts ?? 
          settings.privacy_share_activity,
          
        privacy_allow_contact_requests: 
          response.updatedSettings.privacy_allow_contact_requests ?? 
          userMeta?.privacy_allow_contact_requests ?? 
          userMeta?.allow_contact_requests ?? 
          settings.privacy_allow_contact_requests,
      };
      
      console.log('[UserSettingsService] Final updated settings to save to localStorage:', updatedSettings);
      const updatedSettingsJson = JSON.stringify(updatedSettings);
      console.log('[UserSettingsService] Stringified updated settings:', updatedSettingsJson);
      localStorage.setItem(STORAGE_KEYS.PRIVACY, updatedSettingsJson);
      console.log('[UserSettingsService] Updated localStorage with updatedSettings from server response.');
    } else if (response.user_metadata) {
      // If no updatedSettings but we have user_metadata, sync from that
      console.log('[UserSettingsService] No updatedSettings in response, but user_metadata found. Syncing from that.');
      // Use a type-safe cast by ensuring the user_metadata object has the expected shape
      syncServerToLocalSettings({ user_metadata: response.user_metadata } as User);
    }
    
    pendingSettingsUpdates[STORAGE_KEYS.PRIVACY] = false;
    
    // Notify all components of the updated settings
    window.dispatchEvent(new CustomEvent('settings-refreshed', {
      detail: { 
        timestamp: Date.now(),
        source: 'savePrivacySettings',
        settings: settings
      }
    }));
    
    console.log('[UserSettingsService.savePrivacySettings] ======= SETTINGS SAVE SUCCESS =======');
    return true;
  } catch (error) {
    console.error('[UserSettingsService] Error saving privacy settings:', error instanceof Error ? error.message : String(error));
    console.error('[UserSettingsService] Full error object:', error);
    
    // Revert optimistic update on error
    if (originalSettingsJson) {
      localStorage.setItem(STORAGE_KEYS.PRIVACY, originalSettingsJson);
    } else {
      localStorage.removeItem(STORAGE_KEYS.PRIVACY);
    }
    
    // Mark that we need a refresh on next load in case the server was updated but we couldn't get the response
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS_REFRESH_FLAG, 'true');
    } catch {
      // If even this fails, we can't do much more
    }
    
    pendingSettingsUpdates[STORAGE_KEYS.PRIVACY] = false;
    console.log('[UserSettingsService.savePrivacySettings] ======= SETTINGS SAVE ERROR =======');
    return false;
  }
}

/**
 * Load privacy settings from local storage with fallbacks
 */
export function getPrivacySettings(): PrivacySettings {
  const defaultSettings: PrivacySettings = {
    privacy_profile_visibility: 'Everyone',
    privacy_share_activity: true,
    privacy_allow_contact_requests: true
  };

  try {
    const storedSettings = localStorage.getItem(STORAGE_KEYS.PRIVACY);
    if (storedSettings) {
      const parsedSettings: unknown = JSON.parse(storedSettings);
      if (isPrivacySettings(parsedSettings)) {
        console.log('[UserSettingsService.getPrivacySettings] Loaded settings from localStorage:', parsedSettings);
        // Ensure we have complete settings with defaults applied
        const completeSettings: PrivacySettings = {
          ...defaultSettings,
          ...parsedSettings // Spread validated partial settings over defaults
        };
        return completeSettings;
      } else {
        console.warn('[UserSettingsService.getPrivacySettings] Malformed privacy settings in localStorage. Using defaults.');
      }
    } else {
      console.log('[UserSettingsService.getPrivacySettings] No privacy settings found in localStorage. Using defaults.');
    }
  } catch (error) {
    console.error('[UserSettingsService] Error loading/parsing privacy settings from localStorage:', error);
    // Mark that we need a refresh on next load cannot be done here reliably without access to setLoading or similar
    // Consider a different error handling strategy if critical, for now, defaults will be returned.
  }
  
  return defaultSettings;
}

/**
 * Load notification settings from local storage with fallbacks
 */
export function getNotificationSettings(): NotificationSettings {
  const defaultSettings: NotificationSettings = {
    notifications_general: true,
    notifications_marketing_emails: false,
    notifications_in_app: true,
    notifications_reminders: false,
  };
  
  try {
    const storedSettings = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    if (storedSettings) {
      const parsedSettings: unknown = JSON.parse(storedSettings);
      if (isNotificationSettings(parsedSettings)) {
        return {
          ...defaultSettings,
          ...parsedSettings
        };
      } else {
        console.warn('[UserSettingsService.getNotificationSettings] Malformed notification settings in localStorage. Using defaults.');
      }
    }
  } catch (error) {
    console.error('[UserSettingsService] Error loading/parsing notification settings from localStorage:', error);
  }
  
  return defaultSettings;
}

/**
 * Load display settings from local storage with fallbacks
 */
export function getDisplaySettings(): DisplaySettings {
  const defaultSettings: DisplaySettings = {
    display_theme: 'dark',
    display_density: 'comfortable',
    display_animations: true,
  };
  
  try {
    const storedSettings = localStorage.getItem(STORAGE_KEYS.DISPLAY);
    if (storedSettings) {
      const parsedSettings: unknown = JSON.parse(storedSettings);
      if (isDisplaySettings(parsedSettings)) {
        return {
          ...defaultSettings,
          ...parsedSettings
        };
      } else {
        console.warn('[UserSettingsService.getDisplaySettings] Malformed display settings in localStorage. Using defaults.');
      }
    }
  } catch (error) {
    console.error('[UserSettingsService] Error loading/parsing display settings from localStorage:', error);
  }
  
  return defaultSettings;
}

/**
 * Check if settings need refresh from server
 * Used to determine if we need to prompt the user to reload or fetch fresh data
 */
export function shouldRefreshSettings(): boolean {
  try {
    // If we have a flag explicitly saying we need a refresh, respect that
    if (localStorage.getItem(STORAGE_KEYS.SETTINGS_REFRESH_FLAG) === 'true') {
      return true;
    }
    
    const timestamp = localStorage.getItem(STORAGE_KEYS.SETTINGS_TIMESTAMP);
    if (!timestamp) return true;
    
    const lastSync = parseInt(timestamp, 10);
    const now = Date.now();
    const oneHourInMs = 60 * 60 * 1000;
    
    // If it's been more than an hour since last sync, suggest a refresh
    return (now - lastSync) > oneHourInMs;
  } catch (error) {
    console.error('[UserSettingsService] Error checking settings refresh status:', error);
    return true; // When in doubt, refresh
  }
}

/**
 * Clear all locally stored settings
 * Used during logout or account deletion
 */
export function clearAllSettings(): void {
  try {
    // Reset pending updates tracking
    pendingSettingsUpdates = {};
    
    // Clear all settings from localStorage
    localStorage.removeItem(STORAGE_KEYS.PRIVACY);
    localStorage.removeItem(STORAGE_KEYS.NOTIFICATIONS);
    localStorage.removeItem(STORAGE_KEYS.DISPLAY);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS_TIMESTAMP);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS_REFRESH_FLAG);
    localStorage.removeItem('calendarSourcesConfig');
  } catch (error) {
    console.error('[UserSettingsService] Error clearing settings from localStorage:', error);
  }
}

/**
 * Listen for storage events in other browser tabs/windows
 * This allows settings to stay in sync across tabs
 */
export function setupStorageEventListener(): void {
  // Only set up the listener once
  const handlerSet = (window as unknown as { __settingsStorageHandlerSet?: boolean }).__settingsStorageHandlerSet;
  if (handlerSet) return;
  
  window.addEventListener('storage', (event) => {
    // Handle only our own storage keys
    if (!event.key || !Object.values(STORAGE_KEYS).includes(event.key)) {
      return;
    }
    
    console.log(`[UserSettingsService] Storage change detected for key: ${event.key}`);
    
    if (event.key === STORAGE_KEYS.PRIVACY) {
      // Re-sync with localStorage when another tab updates privacy settings
      try {
        let newSettings: PrivacySettings | null = null;
        if (event.newValue) {
          const parsedNewValue: unknown = JSON.parse(event.newValue);
          if (isPrivacySettings(parsedNewValue)) {
            // Assuming isPrivacySettings checks for Partial<PrivacySettings>.
            // For a full PrivacySettings, you might need to merge with defaults if appropriate here.
            // For dispatching, sending the partial or validated object is okay.
            newSettings = { ...parsedNewValue } as PrivacySettings; 
          } else {
            console.warn('[UserSettingsService] Malformed privacy settings from storage event.');
          }
        }
        // You could trigger a UI update or context refresh here
        console.log('[UserSettingsService] New privacy settings from another tab:', newSettings);
        
        // Dispatch a custom event that components can listen for
        window.dispatchEvent(new CustomEvent('privacy-settings-changed', { 
          detail: { settings: newSettings } 
        }));
      } catch (error) {
        console.error('[UserSettingsService] Error processing privacy settings from storage event:', error);
      }
    } else if (event.key === STORAGE_KEYS.SETTINGS_REFRESH_FLAG && event.newValue === 'true') {
      // Another tab has indicated we need a refresh
      forceRefreshFromServer()
        .then(success => {
          console.log(`[UserSettingsService] Cross-tab forced refresh: ${success ? 'successful' : 'failed'}`);
        })
        .catch(err => {
          console.error('[UserSettingsService] Error during cross-tab forced refresh:', err);
        });
    }
  });
  
  // Mark that we've set up the handler
  (window as unknown as { __settingsStorageHandlerSet: boolean }).__settingsStorageHandlerSet = true;
}

/**
 * Force a fresh reload of settings from the server
 * Can be called when the user requests a refresh or after a certain time period
 */
export async function forceRefreshFromServer(): Promise<boolean> {
  // If called directly, ensure the flag is managed if it's not already part of an initializeUserSettings cycle
  // or initializeSettingsService cycle
  const wasAlreadyRefreshing = isForceRefreshing;
  if (!wasAlreadyRefreshing) {
    isForceRefreshing = true;
  }

  try {
    // Call the settings API to get fresh data
    const response = await apiClient.post<{action: 'get_settings'}, SettingsApiResponse>(
      '/settings',
      { action: 'get_settings' }
    );
    
    if (response && response.user_metadata) {
      // Sync the fresh metadata to localStorage
      syncServerToLocalSettings({ user_metadata: response.user_metadata } as User);
      
      // Dispatch custom event to notify components
      window.dispatchEvent(new CustomEvent('settings-refreshed', { 
        detail: { success: true, timestamp: Date.now() } 
      }));
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('[UserSettingsService] Error forcing refresh from server:', 
      error instanceof Error ? error.message : String(error));
    
    // Mark that we need a refresh on next load
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS_REFRESH_FLAG, 'true');
    } catch {
      // If even this fails, we can't do much more
    }
    
    // Dispatch custom event to notify components about the error
    window.dispatchEvent(new CustomEvent('settings-refresh-error', { 
      detail: { 
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now() 
      } 
    }));
    
    return false;
  } finally {
    // Clear the flag only if this function (or its caller within this module) set it
    // and it wasn't already set by a higher-level process.
    if (!wasAlreadyRefreshing) {
      isForceRefreshing = false;
    }
  }
}

/**
 * Detect if a hard browser refresh just happened
 * This can help determine when to force a settings refresh
 */
export function detectHardRefresh(): boolean {
  // Always assume a hard refresh to ensure settings are always refreshed
  // This simplifies our approach and ensures consistent behavior
  console.log('[UserSettingsService] Hard refresh detection enabled, assuming refresh needed');
  return true;

  /* Original method - kept for reference but always returning true now
  // We can use performance timing to detect if this was a hard refresh
  if (window.performance) {
    try {
      const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navEntry && navEntry.type === 'reload') {
        console.log('[UserSettingsService] Hard refresh detected, should consider refreshing settings');
        return true;
      }
    } catch (error) {
      console.error('[UserSettingsService] Error detecting navigation type:', error);
      // Default to false if we can't determine
      return false;
    }
  }
  return false;
  */
}

/**
 * Initialize the service
 * This should be called at application startup
 */
export function initializeSettingsService(): void {
  setupStorageEventListener();
  
  // Check if we previously had an error that required a refresh
  if (localStorage.getItem(STORAGE_KEYS.SETTINGS_REFRESH_FLAG) === 'true') {
    if (isForceRefreshing) {
      console.log('[UserSettingsService] Refresh flag detected, but a refresh is already in progress. Skipping this refresh.');
      return;
    }
    console.log('[UserSettingsService] Refresh flag detected, scheduling refresh');
    isForceRefreshing = true;
    setTimeout(() => {
      forceRefreshFromServer()
        .then(() => {
          // Clear the flag on successful refresh
          localStorage.removeItem(STORAGE_KEYS.SETTINGS_REFRESH_FLAG);
        })
        .catch(() => {
          // Keep the flag if refresh failed
        })
        .finally(() => {
          isForceRefreshing = false;
        });
    }, 1000); // Short delay
  }
}