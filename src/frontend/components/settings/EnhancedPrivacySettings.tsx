/**
 * Enhanced Privacy Settings Component
 * 
 * A professional, production-ready implementation of privacy settings management,
 * utilizing our robust settings architecture with comprehensive error handling,
 * performance optimization, and cross-tab synchronization.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Button from '../common/Button';
import { usePrivacySettings } from '../../hooks/settings/useSettings';
import { PrivacySettings } from '../../services/userSettingsService';
import SettingsManager from '../../utils/settingsManager';
import { useAuth } from '../../context/AuthContext';
import { trackEvent } from '../../utils/analytics'; // Assuming an analytics utility

// Strongly-typed privacy settings interface that matches the form structure
interface PrivacyFormData {
  profileVisibility: PrivacySettings['privacy_profile_visibility'];
  shareActivityWithContacts: boolean;
  allowContactRequests: boolean;
}

// Props for the component with strong typing
interface EnhancedPrivacySettingsProps {
  onSettingsSaved?: (_success: boolean) => void;
  onSettingsError?: (_error: Error) => void;
  className?: string;
}

// Create a custom analytics hook for privacy settings
const usePrivacyAnalytics = () => {
  return useCallback((action: string, details?: Record<string, unknown>) => {
    trackEvent(`privacy_settings_${action}`, {
      timestamp: new Date().toISOString(),
      ...details
    });
  }, []);
};

/**
 * Enhanced Privacy Settings Component
 * 
 * Features:
 * - React hooks integration with TypeScript for type safety
 * - Optimized rendering with useMemo and useCallback
 * - Comprehensive error handling with graceful degradation
 * - Cross-tab synchronization for multi-window consistency
 * - Optimistic updates with proper rollback mechanisms
 * - Analytics integration for tracking user behavior
 * - Accessibility support with proper ARIA attributes
 * - Performance optimizations to prevent unnecessary renders
 */
const EnhancedPrivacySettings: React.FC<EnhancedPrivacySettingsProps> = ({
  onSettingsSaved: _onSettingsSaved,
  onSettingsError,
  className = '',
}) => {
  // Use our custom hook for privacy settings
  const {
    settings,
    isLoading: isServiceLoading,
    error: serviceError,
    updateSettings,
    refreshSettings
  } = usePrivacySettings();

  // Auth context for user verification
  const { user } = useAuth();
  
  // Track component mount status to prevent state updates after unmount
  const isMounted = useRef(true);
  
  // Analytics tracking
  const trackPrivacyEvent = usePrivacyAnalytics();

  // Local form state for controlled components
  const [formState, setFormState] = useState<PrivacyFormData>({
    profileVisibility: 'Everyone',
    shareActivityWithContacts: true,
    allowContactRequests: true,
  });
  
  // UI states with proper typing
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [localError, setLocalError] = useState<Error | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showUnsavedChangesWarning, setShowUnsavedChangesWarning] = useState<boolean>(false);
  
  // Track initial load to avoid unnecessary analytics events
  const initialLoadRef = useRef<boolean>(true);

  // Derive isDirty state by comparing formState with settings from the hook
  const isDirty = useMemo(() => {
    if (!settings) return false; // Not dirty if no settings to compare against
    return (
      formState.profileVisibility !== (settings.privacy_profile_visibility || 'Everyone') ||
      formState.shareActivityWithContacts !== (settings.privacy_share_activity !== undefined ? settings.privacy_share_activity : true) ||
      formState.allowContactRequests !== (settings.privacy_allow_contact_requests !== undefined ? settings.privacy_allow_contact_requests : true)
    );
  }, [formState, settings]);

  // Setup event listener for "beforeunload" if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        const message = 'You have unsaved privacy settings changes. Are you sure you want to leave?';
        e.returnValue = message;
        return message;
      }
    };

    if (isDirty) {
      window.addEventListener('beforeunload', handleBeforeUnload);
      setShowUnsavedChangesWarning(true);
    } else {
      setShowUnsavedChangesWarning(false);
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  // Effect for initial form state initialization and analytics
  useEffect(() => {
    // Only initialize form and track 'viewed' event on initial successful load of settings.
    // This effect should ONLY run once on initial load, never in response to user interactions
    if (!isServiceLoading && settings && initialLoadRef.current) {
      console.log('[EnhancedPrivacySettings] Initial form state initialization with settings:', settings);
      
      const initialState = {
        profileVisibility: settings.privacy_profile_visibility || 'Everyone',
        shareActivityWithContacts: settings.privacy_share_activity !== undefined 
          ? settings.privacy_share_activity 
          : true,
        allowContactRequests: settings.privacy_allow_contact_requests !== undefined 
          ? settings.privacy_allow_contact_requests 
          : true,
      };
      
      console.log('[EnhancedPrivacySettings] Setting initial form state:', initialState);
      setFormState(initialState);
      
      trackPrivacyEvent('viewed', {
        initial_profile_visibility: settings.privacy_profile_visibility,
        has_share_activity_enabled: settings.privacy_share_activity,
        has_contact_requests_enabled: settings.privacy_allow_contact_requests,
      });
      
      initialLoadRef.current = false; // Mark that initial load has occurred and should not happen again
      console.log('[EnhancedPrivacySettings] Initial load complete, initialLoadRef set to false');
    }
  }, [settings, isServiceLoading, trackPrivacyEvent]); // Dependencies are for initial load only

  // Handle service errors
  useEffect(() => {
    if (serviceError) {
      setLocalError(serviceError);
      if (onSettingsError) {
        onSettingsError(serviceError);
      }
      
      trackPrivacyEvent('error', {
        error_type: 'service_error',
        error_message: serviceError.message,
      });
    }
  }, [serviceError, onSettingsError, trackPrivacyEvent]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      
      // If there are unsaved changes when component unmounts, track this
      if (isDirty) {
        trackPrivacyEvent('abandoned_changes');
      }
    };
  }, [isDirty, trackPrivacyEvent]);

  // Handle visibility option change
  const handleVisibilityChange = (value: PrivacySettings['privacy_profile_visibility']) => {
    console.log('[EnhancedPrivacySettings] Visibility change requested:', value);
    console.log('[EnhancedPrivacySettings] Previous form state:', formState);
    
    // Update the form state immediately with user selection
    setFormState((prev) => {
      const updated = {
        ...prev,
        profileVisibility: value,
      };
      
      // Log the state update for debugging
      console.log('[EnhancedPrivacySettings] Updated form state (in setState callback):', updated);
      
      // Make this a stable reference to prevent React from discarding it
      Object.freeze(updated);
      return updated;
    });
    
    // Intentionally delay to allow React to process the state update
    setTimeout(() => {
      console.log('[EnhancedPrivacySettings] State after visibility change:', formState);
    }, 0);
  };

  // Handle toggling of boolean settings
  const handleBooleanToggle = (settingName: keyof Omit<PrivacyFormData, 'profileVisibility'>) => {
    console.log(`[EnhancedPrivacySettings] Toggle ${settingName} from`, formState[settingName]);
    
    setFormState((prev) => {
      const newState = {
        ...prev,
        [settingName]: !prev[settingName],
      };
      console.log('[EnhancedPrivacySettings] New formState after toggle:', newState);
      return newState;
    });
  };

  // Reset form to last saved state
  const handleReset = useCallback(() => {
    if (settings) {
      setFormState({
        profileVisibility: settings.privacy_profile_visibility || 'Everyone',
        shareActivityWithContacts: settings.privacy_share_activity !== undefined 
          ? settings.privacy_share_activity 
          : true,
        allowContactRequests: settings.privacy_allow_contact_requests !== undefined 
          ? settings.privacy_allow_contact_requests 
          : true,
      });
      
      setLocalError(null);
      setSuccessMessage(null);
      
      trackPrivacyEvent('reset_form');
    }
  }, [settings, trackPrivacyEvent]);

  // Force refresh from server
  const handleForceRefresh = useCallback(async () => {
    setLocalError(null);
    try {
      await refreshSettings();
      setSuccessMessage('Settings refreshed from server');
      
      trackPrivacyEvent('manual_refresh');
    } catch (error) {
      setLocalError(error instanceof Error ? error : new Error('Failed to refresh settings'));
      
      trackPrivacyEvent('refresh_error', {
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [refreshSettings, trackPrivacyEvent]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[EnhancedPrivacySettings] Form submitted with state:', formState);
    
    setIsSubmitting(true);
    setLocalError(null);
    setSuccessMessage(null);

    try {
      // Detect if anything actually changed to avoid unnecessary saves
      const hasChanges = isDirty;
      
      if (!hasChanges) {
        console.log('[EnhancedPrivacySettings] No changes detected, skipping save');
        setIsSubmitting(false);
        setSuccessMessage('No changes to save');
        return;
      }
      
      // Save the settings
      const success = await updateSettings({
        privacy_profile_visibility: formState.profileVisibility,
        privacy_share_activity: formState.shareActivityWithContacts,
        privacy_allow_contact_requests: formState.allowContactRequests,
      });

      if (success) {
        console.log('[EnhancedPrivacySettings] Settings saved successfully');
        setSuccessMessage('Privacy settings updated successfully');
        
        // Don't automatically reset isDirty here as the form state now matches the server state
        // The derived isDirty state will update based on the new settings from the server
        
        // Track event
        trackPrivacyEvent('saved_privacy_settings', {
          profile_visibility: formState.profileVisibility,
          share_activity: formState.shareActivityWithContacts,
          allow_requests: formState.allowContactRequests,
        });
      } else {
        console.error('[EnhancedPrivacySettings] Failed to save settings');
        setLocalError(new Error('Failed to save privacy settings. Please try again.'));
      }
    } catch (error) {
      console.error('[EnhancedPrivacySettings] Error saving settings:', error);
      setLocalError(error instanceof Error ? error : new Error('An error occurred while saving your privacy settings.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Memoize the help text to prevent unnecessary rerenders
  const visibilityHelpText = useMemo(() => {
    switch (formState.profileVisibility) {
      case 'Everyone':
        return 'Your profile is visible to everyone using the platform.';
      case 'MyContactsOnly':
        return 'Only people in your contacts list can see your profile.';
      case 'Private':
        return 'Your profile is hidden from other users. Only you can see it.';
      default:
        return 'Select who can see your profile information.';
    }
  }, [formState.profileVisibility]);

  // Detect if we're in a stale or error state that requires refresh
  const needsRefresh = useMemo(() => {
    return (serviceError && serviceError.message.includes('stale')) || 
           (localError && localError.message.includes('sync'));
  }, [serviceError, localError]);

  // Generate IDs for form elements to maintain accessibility
  const formIds = useMemo(() => ({
    profileVisibility: 'privacy-profile-visibility',
    shareActivity: 'privacy-share-activity',
    contactRequests: 'privacy-contact-requests',
  }), []);

  if (!user) {
    return (
      <div className={`enhanced-privacy-settings ${className} not-authenticated`}>
        <div className="auth-required-message">
          <h3>Authentication Required</h3>
          <p>You must be logged in to manage privacy settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`enhanced-privacy-settings ${className}`} data-testid="privacy-settings-component">
      <h2>Privacy Settings</h2>
      
      {isServiceLoading && (
        <div className="loading-overlay" aria-live="polite" aria-busy={true}>
          <div className="spinner" role="status"></div>
          <span>Loading your privacy settings...</span>
        </div>
      )}
      
      {showUnsavedChangesWarning && (
        <div className="unsaved-changes-warning" role="alert">
          <p>You have unsaved changes that will be lost if you navigate away.</p>
        </div>
      )}
      
      <form onSubmit={handleSubmit} aria-busy={isSubmitting} className={isServiceLoading ? 'form-loading' : ''}>
        <p className="settings-description">
          Control who can see your information and how your data is used across the platform.
        </p>
        
        <div className="form-group">
          <label htmlFor={formIds.profileVisibility}>Profile Visibility</label>
          <select 
            id={formIds.profileVisibility}
            name="profileVisibility"
            value={formState.profileVisibility}
            onChange={(e) => handleVisibilityChange(e.target.value as PrivacySettings['privacy_profile_visibility'])}
            disabled={isSubmitting || isServiceLoading}
            aria-describedby="visibility-help-text"
          >
            <option value="Everyone">Everyone</option>
            <option value="MyContactsOnly">My Contacts Only</option>
            <option value="Private">Private</option>
          </select>
          <p id="visibility-help-text" className="help-text">{visibilityHelpText}</p>
        </div>
        
        <div className="form-group toggle-group">
          <label htmlFor={formIds.shareActivity}>Share Activity With Contacts</label>
          <div
            className="toggle-switch"
            onClick={() => !isSubmitting && !isServiceLoading && handleBooleanToggle('shareActivityWithContacts')}
            tabIndex={0}
            role="switch"
            aria-checked={formState.shareActivityWithContacts}
            aria-disabled={isSubmitting || isServiceLoading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                if (!isSubmitting && !isServiceLoading) {
                  handleBooleanToggle('shareActivityWithContacts');
                }
                e.preventDefault();
              }
            }}
          >
            <input
              type="checkbox"
              id={formIds.shareActivity}
              name="shareActivityWithContacts"
              checked={formState.shareActivityWithContacts}
              onChange={() => {}} // Controlled via the onClick handler on parent div
              disabled={isSubmitting || isServiceLoading}
              aria-hidden="true" // The parent div is the actual interactive element for a11y
            />
            <span className="slider"></span>
          </div>
          <p className="help-text">
            Allow your contacts to see your recent activities and updates.
            {formState.shareActivityWithContacts 
              ? ' Your contacts will be notified of your activities.'
              : ' Your activities will remain private.'
            }
          </p>
        </div>
        
        <div className="form-group toggle-group">
          <label htmlFor={formIds.contactRequests}>Allow Contact Requests</label>
          <div
            className="toggle-switch"
            onClick={() => !isSubmitting && !isServiceLoading && handleBooleanToggle('allowContactRequests')}
            tabIndex={0}
            role="switch"
            aria-checked={formState.allowContactRequests}
            aria-disabled={isSubmitting || isServiceLoading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                if (!isSubmitting && !isServiceLoading) {
                  handleBooleanToggle('allowContactRequests');
                }
                e.preventDefault();
              }
            }}
          >
            <input
              type="checkbox"
              id={formIds.contactRequests}
              name="allowContactRequests"
              checked={formState.allowContactRequests}
              onChange={() => {}} // Controlled via the onClick handler on parent div
              disabled={isSubmitting || isServiceLoading}
              aria-hidden="true" // The parent div is the actual interactive element for a11y
            />
            <span className="slider"></span>
          </div>
          <p className="help-text">
            {formState.allowContactRequests 
              ? 'Other users can send you contact requests. You\'ll receive notifications for new requests.'
              : 'Other users cannot send you contact requests. Your profile will be more private.'
            }
          </p>
        </div>
        
        {/* Error and success messages with appropriate ARIA attributes */}
        {localError && (
          <div className="error-message" role="alert" aria-live="assertive">
            <span className="error-icon" aria-hidden="true">⚠️</span>
            <span>{localError.message}</span>
            {needsRefresh && (
              <button 
                type="button" 
                className="refresh-button"
                onClick={handleForceRefresh}
                disabled={isSubmitting}
              >
                Refresh from server
              </button>
            )}
          </div>
        )}
        
        {successMessage && (
          <div className="success-message" role="status" aria-live="polite">
            <span className="success-icon" aria-hidden="true">✓</span>
            <span>{successMessage}</span>
          </div>
        )}
        
        <div className="form-actions">
          <Button 
            type="submit" 
            variant="primary" 
            disabled={isSubmitting || isServiceLoading || !isDirty}
            isLoading={isSubmitting}
            data-testid="save-privacy-settings-button"
            aria-busy={isSubmitting}
          >
            Save Privacy Settings
          </Button>
          
          {isDirty && (
            <Button 
              type="button" 
              variant="secondary" 
              onClick={handleReset}
              disabled={isSubmitting || isServiceLoading}
              data-testid="reset-privacy-settings-button"
            >
              Reset Changes
            </Button>
          )}
          
          <Button 
            type="button" 
            variant="link" 
            onClick={handleForceRefresh}
            disabled={isSubmitting || isServiceLoading}
            className="refresh-link"
            data-testid="refresh-privacy-settings-button"
          >
            <span className="refresh-icon" aria-hidden="true">⟳</span> Refresh from server
          </Button>
        </div>
      </form>
      
      {/* Advanced privacy options section */}
      <div className="advanced-privacy-section">
        <h3>Data Management</h3>
        <p className="section-description">Manage your personal data stored on Elber.</p>
        
        <div className="data-management-actions-container">
          {/* Export Data Action */}
          <div className="data-action-card">
            <div className="action-info">
              <h4>Export Your Data</h4>
              <p className="help-text">
                Request a copy of all your personal data. It will be delivered to your registered email address.
              </p>
            </div>
            <Button 
              onClick={() => {
                trackPrivacyEvent('request_data_export');
                SettingsManager.triggerDataExport(); 
              }}
              variant="secondary"
              disabled={isSubmitting || isServiceLoading}
              className="data-action-button"
            >
              Request Data Export
            </Button>
          </div>
          
          {/* Delete Account Action */}
          <div className="data-action-card">
            <div className="action-info">
              <h4>Delete Your Account</h4>
              <p className="help-text">
                Permanently remove your account and all associated data. This action is irreversible after a 30-day grace period.
              </p>
            </div>
            <Button 
              onClick={() => {
                trackPrivacyEvent('account_deletion_requested');
                if (window.confirm('Are you sure you want to permanently delete your account? This action cannot be undone and will remove all your data after a 30-day grace period.')) {
                  trackPrivacyEvent('account_deletion_confirmed');
                  SettingsManager.initiateAccountDeletion();
                } else {
                  trackPrivacyEvent('account_deletion_cancelled');
                }
              }}
              variant="danger" 
              disabled={isSubmitting || isServiceLoading}
              className="data-action-button"
            >
              Delete Account
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedPrivacySettings;