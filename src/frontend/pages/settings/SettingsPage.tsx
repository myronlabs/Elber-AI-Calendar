// src/frontend/pages/SettingsPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../styles/pages/_settings.scss';
import { useAuth } from '../../context/AuthContext';
import { routeAssistantRequest } from '../../utils/assistantRouter';
import { ApiMessage } from '../../types/assistantShared';
import Button from '../../components/common/Button';
import { showSuccess, showError } from '../../utils/toastManager';

// Define simplified settings sections
type SettingsSection = 'Profile' | 'Security' | 'Notifications' | 'Privacy' | 'Integrations';

// Conversation-aware settings helpers
interface ConversationAwareSettingsOperations {
  updateProfileWithConversation: (message: string, conversationHistory?: ApiMessage[]) => Promise<boolean>;
  updateSettingsWithConversation: (message: string, conversationHistory?: ApiMessage[]) => Promise<boolean>;
  getProfileWithConversation: (message: string, conversationHistory?: ApiMessage[]) => Promise<string | null>;
}

const getInitialSection = (): SettingsSection => {
  if (typeof window !== 'undefined') {
    const currentHash = window.location.hash.replace('#', '').toLowerCase();
    const sections: SettingsSection[] = ['Profile', 'Security', 'Notifications', 'Privacy', 'Integrations'];
    const matchedKey = sections.find(key => key.toLowerCase() === currentHash);
    if (matchedKey) return matchedKey;
  }
  return 'Profile';
};

interface BasicProfileData {
  firstName: string;
  lastName: string;
  email: string;
  timezone: string;
}

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, updateUserAttributes } = useAuth();
  const [activeSection, setActiveSection] = useState<SettingsSection>(getInitialSection());
  const [profileData, setProfileData] = useState<BasicProfileData>({
    firstName: '',
    lastName: '',
    email: '',
    timezone: ''
  });
  const [isUpdating, setIsUpdating] = useState(false);

  // Simplified profile data loading
  useEffect(() => {
    if (user) {
      setProfileData({
        firstName: user.user_metadata?.first_name || '',
        lastName: user.user_metadata?.last_name || '',
        email: user.email || '',
        timezone: user.user_metadata?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
      });
    }
  }, [user]);

  // Update URL hash when section changes
  useEffect(() => {
    window.location.hash = activeSection.toLowerCase();
  }, [activeSection]);

  // PERFORMANCE: Memoize navigation function
  const navigateToAssistant = useCallback((query: string) => {
    navigate(`/assistant?query=${encodeURIComponent(query)}`);
  }, [navigate]);

  // Conversation-aware settings operations
  const conversationAwareSettingsOps: ConversationAwareSettingsOperations = useMemo(() => ({
    updateProfileWithConversation: async (message: string, conversationHistory?: ApiMessage[]): Promise<boolean> => {
      console.log(`[SettingsPage] Using conversation-aware assistant for profile update: ${message}`);
      
      try {
        const messageHistory: ApiMessage[] = [
          ...(conversationHistory || []),
          { role: 'user', content: message }
        ];

        console.log(`[SettingsPage] Sending ${messageHistory.length} messages to assistant (conversation-aware)`);
        
        const response = await routeAssistantRequest(messageHistory);

        if (response?.role === 'assistant' && response.content) {
          // Check metadata for successful settings operations
          const metadata = response._metadata;
          
          if (metadata?.should_refresh_contacts) { // Profile updates may affect contacts
            console.log(`[SettingsPage] Profile update successful, response: ${response.content}`);
            
            // Check if response indicates success
            const responseText = response.content.toLowerCase();
            if (responseText.includes('updated') || responseText.includes('success')) {
              showSuccess('Profile updated successfully via assistant!');
              return true;
            }
          }
          
          console.log(`[SettingsPage] Assistant processed profile update: ${response.content}`);
          return false;
        }

        throw new Error('Assistant did not provide a valid response for profile update');
      } catch (error) {
        console.error(`[SettingsPage] Error in conversation-aware profile update:`, error);
        showError('Failed to update profile via assistant');
        return false;
      }
    },

    updateSettingsWithConversation: async (message: string, conversationHistory?: ApiMessage[]): Promise<boolean> => {
      console.log(`[SettingsPage] Using conversation-aware assistant for settings update: ${message}`);
      
      try {
        const messageHistory: ApiMessage[] = [
          ...(conversationHistory || []),
          { role: 'user', content: message }
        ];

        const response = await routeAssistantRequest(messageHistory);

        if (response?.role === 'assistant' && response.content) {
          console.log(`[SettingsPage] Assistant processed settings update: ${response.content}`);
          
          // Check if response indicates success
          const responseText = response.content.toLowerCase();
          if (responseText.includes('updated') || responseText.includes('configured') || responseText.includes('success')) {
            showSuccess('Settings updated successfully via assistant!');
            return true;
          }
          
          return false;
        }

        throw new Error('Assistant did not provide a valid response for settings update');
      } catch (error) {
        console.error(`[SettingsPage] Error in conversation-aware settings update:`, error);
        showError('Failed to update settings via assistant');
        return false;
      }
    },

    getProfileWithConversation: async (message: string, conversationHistory?: ApiMessage[]): Promise<string | null> => {
      console.log(`[SettingsPage] Using conversation-aware assistant to get profile info: ${message}`);
      
      try {
        const messageHistory: ApiMessage[] = [
          ...(conversationHistory || []),
          { role: 'user', content: message }
        ];

        const response = await routeAssistantRequest(messageHistory);

        if (response?.role === 'assistant' && response.content) {
          console.log(`[SettingsPage] Assistant retrieved profile info: ${response.content}`);
          return response.content;
        }

        throw new Error('Assistant did not provide a valid response for profile retrieval');
      } catch (error) {
        console.error(`[SettingsPage] Error in conversation-aware profile retrieval:`, error);
        return null;
      }
    }
  }), []);

  // Expose conversation-aware operations for external use
  React.useEffect(() => {
    (window as { settingsPageConversationOps?: ConversationAwareSettingsOperations }).settingsPageConversationOps = conversationAwareSettingsOps;
    
    return () => {
      delete (window as { settingsPageConversationOps?: ConversationAwareSettingsOperations }).settingsPageConversationOps;
    };
  }, [conversationAwareSettingsOps]);

  // PERFORMANCE: Memoize profile update handler
  const handleProfileUpdate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showError('User not authenticated');
      return;
    }

    setIsUpdating(true);
    try {
      await updateUserAttributes({
      data: {
          first_name: profileData.firstName,
          last_name: profileData.lastName,
          full_name: `${profileData.firstName} ${profileData.lastName}`.trim(),
          timezone: profileData.timezone
        },
        ...(profileData.email !== user.email && { email: profileData.email })
      });
      showSuccess('Profile updated successfully!');
    } catch (error) {
      console.error('Profile update error:', error);
      showError('Failed to update profile. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  }, [user, updateUserAttributes, profileData]);

  // PERFORMANCE: Memoize change handler
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProfileData(prev => ({ ...prev, [name]: value }));
  }, []);

  const renderProfileSection = useCallback(() => (
    <div className="settings-section">
      <h2>Profile Settings</h2>
      <p>Basic profile information. Use the assistant for advanced profile management.</p>
      
      <form onSubmit={handleProfileUpdate} className="profile-form">
          <div className="form-group">
            <label htmlFor="firstName">First Name</label>
          <input
            type="text"
            id="firstName"
            name="firstName"
            value={profileData.firstName}
            onChange={handleChange}
            disabled={isUpdating}
          />
          </div>

          <div className="form-group">
            <label htmlFor="lastName">Last Name</label>
          <input
            type="text"
            id="lastName"
            name="lastName"
            value={profileData.lastName}
            onChange={handleChange}
            disabled={isUpdating}
          />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            value={profileData.email}
            onChange={handleChange}
            disabled={isUpdating}
          />
          </div>

          <div className="form-group">
            <label htmlFor="timezone">Timezone</label>
          <select
            id="timezone"
            name="timezone"
            value={profileData.timezone}
            onChange={handleChange}
            disabled={isUpdating}
          >
            <option value="America/New_York">Eastern Time (US & Canada)</option>
            <option value="America/Chicago">Central Time (US & Canada)</option>
            <option value="America/Denver">Mountain Time (US & Canada)</option>
            <option value="America/Los_Angeles">Pacific Time (US & Canada)</option>
            <option value="America/Anchorage">Alaska</option>
            <option value="Pacific/Honolulu">Hawaii</option>
            <option value="Europe/London">London</option>
            <option value="Europe/Paris">Paris</option>
            <option value="Asia/Tokyo">Tokyo</option>
            <option value="Australia/Sydney">Sydney</option>
          </select>
        </div>
        
        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={isUpdating}>
            {isUpdating ? 'Updating...' : 'Update Profile'}
          </Button>
        <Button 
            type="button"
            variant="secondary"
            onClick={() => navigateToAssistant('Help me manage my profile settings')}
          >
            Ask Assistant
        </Button>
        </div>
      </form>
    </div>
  ), [handleProfileUpdate, profileData, isUpdating, handleChange, navigateToAssistant]);

  const renderSecuritySection = () => (
    <div className="settings-section">
      <h2>Security Settings</h2>
      <p>Manage your account security and authentication settings.</p>
      
      <div className="security-options">
        <div className="security-item">
          <h3>Password</h3>
          <p>Change your account password</p>
        <Button 
            variant="secondary"
            onClick={() => navigateToAssistant('Help me change my password')}
        >
            Change Password
        </Button>
    </div>

        <div className="security-item">
          <h3>Two-Factor Authentication</h3>
          <p>Add an extra layer of security to your account</p>
          <Button
            variant="secondary"
            onClick={() => navigateToAssistant('Help me set up two-factor authentication')}
          >
            Configure 2FA
          </Button>
      </div>

        <div className="security-item">
          <h3>Login Sessions</h3>
          <p>View and manage your active login sessions</p>
          <Button
            variant="secondary"
            onClick={() => navigateToAssistant('Show me my active login sessions')}
          >
            Manage Sessions
          </Button>
          </div>
        </div>
          </div>
  );

  const renderNotificationsSection = () => (
    <div className="settings-section">
      <h2>Notification Settings</h2>
      <p>Control how and when you receive notifications.</p>
      
      <div className="notification-options">
        <div className="notification-item">
          <h3>Email Notifications</h3>
          <p>Manage email notification preferences</p>
        <Button 
            variant="secondary"
            onClick={() => navigateToAssistant('Help me configure email notifications')}
          >
            Configure Email
        </Button>
    </div>

        <div className="notification-item">
          <h3>Push Notifications</h3>
          <p>Manage browser and mobile push notifications</p>
          <Button
            variant="secondary"
            onClick={() => navigateToAssistant('Help me set up push notifications')}
          >
            Configure Push
          </Button>
        </div>

        <div className="notification-item">
          <h3>Reminder Settings</h3>
          <p>Configure calendar and task reminders</p>
          <Button
            variant="secondary"
            onClick={() => navigateToAssistant('Help me configure reminder settings')}
          >
            Configure Reminders
          </Button>
          </div>
        </div>
          </div>
  );

  const renderPrivacySection = () => (
    <div className="settings-section">
      <h2>Privacy Settings</h2>
      <p>Manage your privacy and data sharing preferences.</p>

      <div className="privacy-options">
        <div className="privacy-item">
          <h3>Profile Visibility</h3>
          <p>Control who can see your profile information</p>
        <Button
            variant="secondary"
            onClick={() => navigateToAssistant('Help me configure profile visibility settings')}
          >
            Configure Visibility
        </Button>
        </div>

        <div className="privacy-item">
          <h3>Data Export</h3>
          <p>Download a copy of your data</p>
          <Button
            variant="secondary"
            onClick={() => navigateToAssistant('Help me export my data')}
          >
            Export Data
          </Button>
        </div>

        <div className="privacy-item">
          <h3>Account Deletion</h3>
          <p>Permanently delete your account and all data</p>
          <Button
            variant="danger"
            onClick={() => navigateToAssistant('Help me delete my account')}
          >
            Delete Account
          </Button>
        </div>
      </div>
    </div>
  );

  const renderIntegrationsSection = () => (
    <div className="settings-section">
      <h2>Integration Settings</h2>
      <p>Connect and manage third-party service integrations.</p>
      
      <div className="integration-options">
        <div className="integration-item">
          <h3>Google Services</h3>
          <p>Connect Google Calendar, Contacts, and other services</p>
          <Button
            variant="secondary"
            onClick={() => navigateToAssistant('Help me connect Google services')}
          >
            Manage Google
          </Button>
      </div>

        <div className="integration-item">
          <h3>Microsoft Services</h3>
          <p>Connect Outlook, Teams, and other Microsoft services</p>
          <Button
            variant="secondary"
            onClick={() => navigateToAssistant('Help me connect Microsoft services')}
          >
            Manage Microsoft
          </Button>
        </div>

        <div className="integration-item">
          <h3>Calendar Sync</h3>
          <p>Sync with external calendar applications</p>
          <Button
            variant="secondary"
            onClick={() => navigateToAssistant('Help me sync my calendars')}
          >
            Sync Calendars
          </Button>
      </div>

        <div className="integration-item">
          <h3>Import/Export</h3>
          <p>Import contacts or export data to other services</p>
          <Button
            variant="secondary"
            onClick={() => navigateToAssistant('Help me import or export my data')}
          >
            Import/Export
          </Button>
            </div>
      </div>
    </div>
  );

  const renderSection = () => {
    switch (activeSection) {
      case 'Profile':
        return renderProfileSection();
      case 'Security':
        return renderSecuritySection();
      case 'Notifications':
        return renderNotificationsSection();
      case 'Privacy':
        return renderPrivacySection();
      case 'Integrations':
        return renderIntegrationsSection();
      default:
        return renderProfileSection();
      }
    };

    return (
    <div className="settings-page-container">
      <div className="settings-main-header">
          <h1>Settings</h1>
        </div>

      <div className="settings-layout">
        <div className="settings-sidebar">
          <nav>
            <ul>
            {(['Profile', 'Security', 'Notifications', 'Privacy', 'Integrations'] as SettingsSection[]).map((section) => (
              <li
                key={section}
                className={activeSection === section ? 'active' : ''}
                onClick={() => setActiveSection(section)}
                >
                {section}
              </li>
            ))}
            </ul>
          </nav>
        </div>

        <div className="settings-content-area">
          <div className="card">
            {renderSection()}
          </div>
          </div>
      </div>
    </div>
  );
};

export default SettingsPage;