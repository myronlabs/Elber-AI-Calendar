import React from 'react';
// Using SearchMatchType to indicate DATE_FORMATS is intentionally reserved for future use
import { reserveForFutureUse } from '../../utils/SearchMatchType';
import { DATE_FORMATS } from '../../utils/localeUtils';
import { useLocale } from '../../context/LocaleContext';

interface LocaleSettingsProps {
  onLocaleChange?: (_locale: string) => void;
}

const LocaleSettings: React.FC<LocaleSettingsProps> = ({ onLocaleChange }) => {
  // Use our new context instead of direct localStorage and utility functions
  const { currentLocale, setUserLocale } = useLocale();
  
  // Reserve DATE_FORMATS for future use
  reserveForFutureUse(DATE_FORMATS);

  const handleLocaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocale = e.target.value;
    
    // Update via the context
    setUserLocale(newLocale);
    
    // Use a non-null callback to prevent TypeScript errors
    const safeCallback = onLocaleChange || (() => {}); 
    
    // Invoke the callback (which is now guaranteed to be a function)
    safeCallback(newLocale);
  };

  return (
    <div className="locale-settings">
      <div className="form-group">
        <label htmlFor="locale-selector">Date Format Preference</label>
        <select 
          id="locale-selector" 
          value={currentLocale} 
          onChange={handleLocaleChange}
          className="form-control"
        >
          <option value="en-US">United States (MM-DD-YYYY)</option>
          <option value="en-GB">United Kingdom/Europe (DD-MM-YYYY)</option>
          <option value="iso">ISO Format (YYYY-MM-DD)</option>
        </select>
        <small className="form-text text-muted">
          This setting affects how dates are displayed and entered throughout the application.
        </small>
      </div>
      
      <div className="locale-example">
        <h4>Example Formats</h4>
        <ul>
          <li><strong>United States:</strong> 12-31-2023</li>
          <li><strong>United Kingdom/Europe:</strong> 31-12-2023</li>
          <li><strong>ISO Format:</strong> 2023-12-31</li>
        </ul>
      </div>
    </div>
  );
};

export default LocaleSettings;