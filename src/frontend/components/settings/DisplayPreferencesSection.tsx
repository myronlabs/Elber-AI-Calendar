import React, { useState } from 'react';
import { useLoading } from '../../context/LoadingContext';
import LocaleSettings from './LocaleSettings';

// This component currently doesn't require any props
type DisplayPreferencesSectionProps = Record<string, never>

const DisplayPreferencesSection: React.FC<DisplayPreferencesSectionProps> = () => {
  const { setLoading } = useLoading();
  const [localeChangeSuccess, setLocaleChangeSuccess] = useState<boolean | null>(null);

  const handleLocaleChange = (_: string) => {
    // Show temporary loading indicator
    setLoading(true);

    // Simulate a delay for UI feedback
    setTimeout(() => {
      setLoading(false);
      setLocaleChangeSuccess(true);

      // Clear success message after 3 seconds
      setTimeout(() => {
        setLocaleChangeSuccess(null);
      }, 3000);
    }, 500);
  };

  return (
    <div className="display-preferences-section">
      <h2>Display Preferences</h2>
      <p>Customize how information is displayed in the application.</p>
      
      <div className="settings-card">
        <h3>Date Format</h3>
        <LocaleSettings onLocaleChange={handleLocaleChange} />
        
        {localeChangeSuccess && (
          <div className="success-message">
            Date format preferences updated successfully! Changes will apply to all date fields throughout the application.
          </div>
        )}
      </div>
      
      {/* Additional display preferences can be added here in the future */}
      <div className="settings-card future-settings">
        <h3>Additional Display Settings</h3>
        <p className="muted-text">
          More display customization options will be available in future updates.
        </p>
      </div>
    </div>
  );
};

export default DisplayPreferencesSection;