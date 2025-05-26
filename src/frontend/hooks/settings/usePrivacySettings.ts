/**
 * Privacy Settings Hook
 * 
 * A specialized hook for the existing PrivacySection component to ensure
 * consistent settings persistence with the improved user settings architecture.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PrivacySettings, savePrivacySettings, getPrivacySettings } from '../../services/userSettingsService';

// Simple interface for the existing PrivacySection component's data format
export interface PrivacyFormData {
  profileVisibility: 'Everyone' | 'MyContactsOnly' | 'Private';
  shareActivityWithContacts: boolean;
  allowContactRequests: boolean;
}

// Helper to map service settings to form data
const mapSettingsToFormData = (settings: PrivacySettings): PrivacyFormData => ({
  profileVisibility: settings.privacy_profile_visibility || 'Everyone',
  shareActivityWithContacts: settings.privacy_share_activity !== undefined ? settings.privacy_share_activity : true,
  allowContactRequests: settings.privacy_allow_contact_requests !== undefined ? settings.privacy_allow_contact_requests : true,
});

/**
 * Hook for the existing PrivacySection component
 * 
 * This hook bridges the existing component with our new settings architecture
 * to ensure settings persist correctly after page refresh.
 */
export function useExistingPrivacySection() {
  const { user, refreshUserData } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Initialize formState directly from getPrivacySettings
  const [formState, setFormState] = useState<PrivacyFormData>(() => {
    console.log('[useExistingPrivacySection] Initializing formState with getPrivacySettings()');
    const initialSettings = getPrivacySettings();
    const mappedInitialState = mapSettingsToFormData(initialSettings);
    console.log('[useExistingPrivacySection] Initial settings from service:', initialSettings);
    console.log('[useExistingPrivacySection] Mapped initial form state:', mappedInitialState);
    return mappedInitialState;
  });

  // Effect to re-initialize state if user.id changes (login/logout) or on first mount with a user
  useEffect(() => {
    console.log('[useExistingPrivacySection] User/auth state change detected. Current user ID:', user?.id);
    // Always fetch from getPrivacySettings on user change or initial load with user
    // This ensures that if localStorage was updated by another tab, or if it's a fresh login, we get the right base.
    const currentSettings = getPrivacySettings();
    const newFormState = mapSettingsToFormData(currentSettings);
    
    console.log('[useExistingPrivacySection] useEffect[user?.id] - Recalculated form state:', newFormState);
    setFormState(newFormState);
    
    // The old logic that tried to compare and call syncServerToLocalSettings is removed.
    // The userSettingsService is responsible for synchronization. This hook consumes the result.

  }, [user?.id]); // Depend only on user.id to detect actual user changes

  // Add an additional effect to specifically handle AuthContext refresh events
  // This catches instances where the user object isn't completely replaced but its metadata is updated
  useEffect(() => {
    // Set up listener for the native 'settings-refreshed' event from userSettingsService
    const handleSettingsRefreshed = (event: Event) => { // Explicitly type event
      const customEvent = event as CustomEvent<{ privacySettings?: PrivacySettings, source?: string }>;
      console.log('[useExistingPrivacySection] \'settings-refreshed\' event detected. Source:', customEvent.detail?.source);
      
      // When settings are refreshed (e.g., after a save, or sync from another tab),
      // re-fetch from getPrivacySettings() which holds the latest synchronized state.
      const freshSettings = getPrivacySettings();
      console.log('[useExistingPrivacySection] Updating form with fresh settings from getPrivacySettings():', freshSettings);
      setFormState(mapSettingsToFormData(freshSettings));
    };

    window.addEventListener('settings-refreshed', handleSettingsRefreshed);

    return () => {
      window.removeEventListener('settings-refreshed', handleSettingsRefreshed);
    };
  }, []); // No dependencies, so it sets up once.

  // REMOVED the useEffect for 'user-data-refreshed' as it's redundant with the 'settings-refreshed' listener
  // and the user.id dependency in the main useEffect.

  const saveSettings = useCallback(async (newSettings: PrivacyFormData): Promise<boolean> => {
    if (!user) {
      setError('You must be logged in to update privacy settings');
      return false;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      console.log('[useExistingPrivacySection.saveSettings] Saving with new architecture. FormData:', newSettings);

      // Map component format to service format
      const serviceSettings: PrivacySettings = {
        privacy_profile_visibility: newSettings.profileVisibility,
        privacy_share_activity: newSettings.shareActivityWithContacts,
        privacy_allow_contact_requests: newSettings.allowContactRequests,
      };
      
      console.log('[useExistingPrivacySection.saveSettings] Mapped to serviceSettings:', serviceSettings);

      // Save using our robust service
      const success = await savePrivacySettings(serviceSettings);

      if (success) {
        console.log('[useExistingPrivacySection.saveSettings] Successfully saved. Updating local formState optimistically.');
        setSuccessMessage('Privacy settings updated successfully!');
        // Optimistically update formState to what was successfully saved.
        // The 'settings-refreshed' event will provide the final server-confirmed state.
        setFormState(newSettings); 

        // refreshUserData is important to ensure AuthContext has the latest user_metadata,
        // as other parts of the app might depend on it. 
        // userSettingsService.savePrivacySettings already syncs and should trigger 'settings-refreshed'.
        try {
          await refreshUserData();
          console.log('[useExistingPrivacySection.saveSettings] User data refreshed after save.');
        } catch (refreshError) {
          console.error('[useExistingPrivacySection.saveSettings] Error refreshing user data post-save:', refreshError);
        }
        return true;
      } else {
        // If savePrivacySettings returns false, it means the server explicitly reported an error or a robust check failed.
        console.error('[useExistingPrivacySection.saveSettings] savePrivacySettings service reported failure.');
        setError('Failed to save privacy settings. The server indicated an issue.');
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[useExistingPrivacySection.saveSettings] Error saving privacy settings:', errorMessage);
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, refreshUserData]);

  return {
    formState,
    setFormState,
    saveSettings,
    isLoading,
    error,
    successMessage,
    setSuccessMessage,
    setError
  };
}

export default useExistingPrivacySection;