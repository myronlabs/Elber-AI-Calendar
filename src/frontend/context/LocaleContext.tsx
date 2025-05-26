import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  initializeLocale,
  setLocale as setLocaleUtil,
  getCurrentDateFormat,
  DATE_FORMATS,
  detectUserLocale
} from '../utils/localeUtils';
import { COUNTRY_LOCALE_MAP, CountryLocaleInfo, getCountryLocaleInfo } from '../utils/countryLocaleMapping';

// Define the shape of our context
interface LocaleContextType {
  currentLocale: string;
  currentCountry: string;
  countryInfo: CountryLocaleInfo;
  dateFormat: string;
  datePlaceholder: string;
  timeFormat: '12h' | '24h';
  availableCountries: Array<{ code: string; name: string; localeCode: string }>;
  setUserCountry: (_countryCode: string) => void;
  setUserLocale: (_locale: string) => void;
}

// Get sorted list of available countries
const getAvailableCountries = () => {
  return Object.entries(COUNTRY_LOCALE_MAP)
    .map(([code, info]) => ({
      code,
      name: info.countryCode === code ? code : info.countryCode, // Use code as name for now
      localeCode: info.localeCode
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
};

// Create the context with default values
const LocaleContext = createContext<LocaleContextType>({
  currentLocale: 'en-US',
  currentCountry: 'US',
  countryInfo: getCountryLocaleInfo('US'),
  dateFormat: 'MM/DD/YYYY',
  datePlaceholder: 'MM/DD/YYYY',
  timeFormat: '12h',
  availableCountries: getAvailableCountries(),
  setUserCountry: () => { /* default empty function */ },
  setUserLocale: () => { /* default empty function */ }
});

// Custom event name for locale changes
export const LOCALE_CHANGE_EVENT = 'elber-locale-changed';

// Create a custom event with locale info
const createLocaleChangeEvent = (locale: string) => {
  return new CustomEvent(LOCALE_CHANGE_EVENT, { 
    detail: { locale }
  });
};

// Provider component
export const LocaleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialize state from localStorage or browser detection
  const [localeState, setLocaleState] = useState(() => {
    // Initialize the locale system
    initializeLocale();
    
    // Detect the user's locale
    const detectedLocale = detectUserLocale();
    
    // Find the country code from the locale
    const countryFromLocale = Object.entries(COUNTRY_LOCALE_MAP)
      .find(([, info]) => info.localeCode === detectedLocale)?.[0] || 'US';
    
    const countryInfo = getCountryLocaleInfo(countryFromLocale);
    const format = getCurrentDateFormat();
    
    // Initial state with comprehensive locale information
    return {
      currentLocale: detectedLocale,
      currentCountry: countryFromLocale,
      countryInfo,
      dateFormat: format.displayFormat,
      datePlaceholder: format.placeholder,
      timeFormat: countryInfo.timeFormat
    };
  });

  // Handle local storage changes (for multi-tab support)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'userLocale' && e.newValue) {
        if (DATE_FORMATS[e.newValue]) {
          updateLocaleState(e.newValue);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Function to update state and dispatch event
  const updateLocaleState = (locale: string, countryCode?: string) => {
    if (DATE_FORMATS[locale]) {
      // Find the country code if not provided
      const country = countryCode || Object.entries(COUNTRY_LOCALE_MAP)
        .find(([, info]) => info.localeCode === locale)?.[0] || 'US';
      
      const countryInfo = getCountryLocaleInfo(country);
      
      // Update internal state
      setLocaleState({
        currentLocale: locale,
        currentCountry: country,
        countryInfo,
        dateFormat: DATE_FORMATS[locale].displayFormat,
        datePlaceholder: DATE_FORMATS[locale].placeholder,
        timeFormat: countryInfo.timeFormat
      });

      // Update the utility
      setLocaleUtil(locale);

      // Save to localStorage
      try {
        localStorage.setItem('userLocale', locale);
        localStorage.setItem('userCountry', country);
      } catch (error) {
        console.error('Failed to save locale to localStorage:', error);
      }

      // Dispatch custom event for non-React components
      window.dispatchEvent(createLocaleChangeEvent(locale));
    }
  };

  // Function to change locale
  const setUserLocale = (locale: string) => {
    updateLocaleState(locale);
  };
  
  // Function to change country (which updates locale)
  const setUserCountry = (countryCode: string) => {
    const countryInfo = getCountryLocaleInfo(countryCode);
    updateLocaleState(countryInfo.localeCode, countryCode);
  };

  return (
    <LocaleContext.Provider 
      value={{
        currentLocale: localeState.currentLocale,
        currentCountry: localeState.currentCountry,
        countryInfo: localeState.countryInfo,
        dateFormat: localeState.dateFormat,
        datePlaceholder: localeState.datePlaceholder,
        timeFormat: localeState.timeFormat,
        availableCountries: getAvailableCountries(),
        setUserCountry,
        setUserLocale
      }}
    >
      {children}
    </LocaleContext.Provider>
  );
};

// Custom hook for using the locale context
export const useLocale = () => useContext(LocaleContext);

// Standalone function to add locale change listeners (for non-React code)
export const addLocaleChangeListener = (
  callback: (_locale: string) => void
): (() => void) => {
  const handler = (e: Event) => {
    const event = e as CustomEvent;
    callback(event.detail.locale);
  };

  window.addEventListener(LOCALE_CHANGE_EVENT, handler);
  return () => window.removeEventListener(LOCALE_CHANGE_EVENT, handler);
};