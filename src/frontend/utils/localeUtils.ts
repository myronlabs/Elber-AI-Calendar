// src/frontend/utils/localeUtils.ts

/**
 * Single source of truth for locale-specific date formats
 * and other internationalization settings.
 */

import { COUNTRY_LOCALE_MAP, CountryLocaleInfo } from './countryLocaleMapping';

// Date format patterns for different locales
export interface DateFormatPattern {
  displayFormat: string;     // Human-readable format (e.g., "MM/DD/YYYY")
  displayPattern: RegExp;    // Regex to validate display format
  formatFunction: (_date: string | null | undefined) => string; // Convert from ISO to display
  parseFunction: (_date: string | null | undefined) => string; // Convert from display to ISO
  dateSeparator: string;     // Character used to separate date parts
  placeholder: string;       // Input placeholder example
}

// Address format patterns for different locales
export interface AddressFormatPattern {
  streetFirst: boolean;       // Whether street comes before city in display
  requiresStateProvince: boolean; // Whether state/province is required
  requiresPostalCode: boolean;    // Whether postal code is required
  postalCodePattern?: RegExp;    // Regex to validate postal code format
  postalCodeLabel: string;       // Label for postal code field (ZIP, Postal Code, etc.)
  stateProvinceLabel: string;    // Label for state/province field
  stateProvinceOptions?: string[]; // List of state/province options if applicable
  streetAddressLabel: string;    // Label for street address field
  streetAddress2Label: string;   // Label for street address line 2 field
  cityLabel: string;             // Label for city field
  countryLabel: string;          // Label for country field
  defaultAddressFormat: string;  // Template for formatting full address
}

// Storage format is always ISO (YYYY-MM-DD)
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Dynamically generate date format pattern from country locale info
 */
function createDateFormatPattern(localeInfo: CountryLocaleInfo): DateFormatPattern {
  const sep = localeInfo.dateSeparator;
  const escSep = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex special chars
  
  // Create display format string
  let displayFormat: string;
  let regexPattern: string;
  
  switch (localeInfo.dateFormat) {
    case 'MDY':
      displayFormat = `MM${sep}DD${sep}YYYY`;
      regexPattern = `^(\\d{1,2})\\s*[${escSep}]\\s*(\\d{1,2})\\s*[${escSep}]\\s*(\\d{4})$`;
      break;
    case 'YMD':
      displayFormat = `YYYY${sep}MM${sep}DD`;
      regexPattern = `^(\\d{4})\\s*[${escSep}]\\s*(\\d{1,2})\\s*[${escSep}]\\s*(\\d{1,2})$`;
      break;
    case 'YDM':
      displayFormat = `YYYY${sep}DD${sep}MM`;
      regexPattern = `^(\\d{4})\\s*[${escSep}]\\s*(\\d{1,2})\\s*[${escSep}]\\s*(\\d{1,2})$`;
      break;
    case 'DMY':
    default:
      displayFormat = `DD${sep}MM${sep}YYYY`;
      regexPattern = `^(\\d{1,2})\\s*[${escSep}]\\s*(\\d{1,2})\\s*[${escSep}]\\s*(\\d{4})$`;
      break;
  }
  
  return {
    displayFormat,
    displayPattern: new RegExp(regexPattern),
    dateSeparator: sep,
    placeholder: displayFormat,
    formatFunction: (isoDate: string | null | undefined): string => {
      if (!isoDate) return '';
      
      // Convert from ISO format (YYYY-MM-DD)
      const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const [, year, month, day] = match;
        
        switch (localeInfo.dateFormat) {
          case 'MDY':
            return `${month}${sep}${day}${sep}${year}`;
          case 'YMD':
            return `${year}${sep}${month}${sep}${day}`;
          case 'YDM':
            return `${year}${sep}${day}${sep}${month}`;
          case 'DMY':
          default:
            return `${day}${sep}${month}${sep}${year}`;
        }
      }
      
      // Fallback to date object parsing
      try {
        const date = new Date(isoDate);
        if (isNaN(date.getTime())) return '';
        
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        
        switch (localeInfo.dateFormat) {
          case 'MDY':
            return `${month}${sep}${day}${sep}${year}`;
          case 'YMD':
            return `${year}${sep}${month}${sep}${day}`;
          case 'YDM':
            return `${year}${sep}${day}${sep}${month}`;
          case 'DMY':
          default:
            return `${day}${sep}${month}${sep}${year}`;
        }
      } catch (error) {
        console.error('Error converting ISO date:', error);
        return '';
      }
    },
    parseFunction: (displayDate: string | null | undefined): string => {
      if (!displayDate) return '';
      
      // Check if already in ISO format
      if (ISO_DATE_PATTERN.test(displayDate)) return displayDate;
      
      // Remove extra spaces and normalize separators
      const normalized = displayDate.replace(/\s+/g, '');
      
      let match: RegExpMatchArray | null = null;
      
      switch (localeInfo.dateFormat) {
        case 'MDY':
          match = normalized.match(/^(\d{1,2})[-/.]?(\d{1,2})[-/.]?(\d{4})$/);
          if (match) {
            const [, month, day, year] = match;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
          break;
        case 'YMD':
          match = normalized.match(/^(\d{4})[-/.]?(\d{1,2})[-/.]?(\d{1,2})$/);
          if (match) {
            const [, year, month, day] = match;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
          break;
        case 'YDM':
          match = normalized.match(/^(\d{4})[-/.]?(\d{1,2})[-/.]?(\d{1,2})$/);
          if (match) {
            const [, year, day, month] = match;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
          break;
        case 'DMY':
        default:
          match = normalized.match(/^(\d{1,2})[-/.]?(\d{1,2})[-/.]?(\d{4})$/);
          if (match) {
            const [, day, month, year] = match;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
          break;
      }
      
      // Fallback to date object parsing
      try {
        const date = new Date(displayDate);
        if (isNaN(date.getTime())) return '';
        
        return date.toISOString().split('T')[0]; // YYYY-MM-DD
      } catch (error) {
        console.error('Error parsing date:', error);
        return '';
      }
    }
  };
}

/**
 * Build comprehensive DATE_FORMATS from country locale mapping
 */
function buildDateFormats(): Record<string, DateFormatPattern> {
  const formats: Record<string, DateFormatPattern> = {};
  
  // Add all country locale formats
  Object.entries(COUNTRY_LOCALE_MAP).forEach(([countryCode, localeInfo]) => {
    formats[localeInfo.localeCode] = createDateFormatPattern(localeInfo);
    
    // Also add by country code for easier lookup
    formats[countryCode] = formats[localeInfo.localeCode];
  });
  
  // Add special ISO format
  formats['iso'] = {
    displayFormat: 'YYYY-MM-DD',
    displayPattern: /^\d{4}-\d{2}-\d{2}$/,
    dateSeparator: '-',
    placeholder: 'YYYY-MM-DD',
    formatFunction: (isoDate: string | null | undefined): string => {
      if (!isoDate) return '';
      if (ISO_DATE_PATTERN.test(isoDate)) return isoDate;
      
      try {
        const date = new Date(isoDate);
        if (isNaN(date.getTime())) return '';
        return date.toISOString().split('T')[0];
      } catch (error) {
        console.error('Error parsing ISO date:', error);
        return '';
      }
    },
    parseFunction: (displayDate: string | null | undefined): string => {
      if (!displayDate) return '';
      if (ISO_DATE_PATTERN.test(displayDate)) return displayDate;
      
      try {
        const date = new Date(displayDate);
        if (isNaN(date.getTime())) return '';
        return date.toISOString().split('T')[0];
      } catch {
        // Timezone detection failed, continue with default
        return '';
      }
    }
  };
  
  return formats;
}

// Generate comprehensive date formats
export const DATE_FORMATS: Record<string, DateFormatPattern> = buildDateFormats();

/**
 * Build comprehensive ADDRESS_FORMATS from country locale mapping
 */
function buildAddressFormats(): Record<string, AddressFormatPattern> {
  const formats: Record<string, AddressFormatPattern> = {};
  
  // US States
  const US_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    'DC', 'AS', 'GU', 'MP', 'PR', 'VI'
  ];
  
  // Canadian Provinces
  const CA_PROVINCES = [
    'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'
  ];
  
  // Australian States/Territories
  const AU_STATES = [
    'ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'
  ];
  
  // Add all country locale address formats
  Object.entries(COUNTRY_LOCALE_MAP).forEach(([countryCode, localeInfo]) => {
    const format: AddressFormatPattern = {
      streetFirst: true,
      requiresStateProvince: false, // Always optional as per requirements
      requiresPostalCode: false,    // Always optional as per requirements
      postalCodePattern: localeInfo.postalCodePattern,
      postalCodeLabel: localeInfo.postalCodeLabel,
      stateProvinceLabel: localeInfo.stateProvinceLabel || 'State/Province',
      streetAddressLabel: 'Street Address',
      streetAddress2Label: 'Address Line 2',
      cityLabel: 'City',
      countryLabel: 'Country',
      defaultAddressFormat: localeInfo.addressFormat
    };
    
    // Add state/province options for specific countries
    if (countryCode === 'US') {
      format.stateProvinceOptions = US_STATES;
    } else if (countryCode === 'CA') {
      format.stateProvinceOptions = CA_PROVINCES;
    } else if (countryCode === 'AU') {
      format.stateProvinceOptions = AU_STATES;
    }
    
    // Customize labels based on country/language
    switch (countryCode) {
      case 'GB':
      case 'IE':
        format.streetAddressLabel = 'Address Line 1';
        format.cityLabel = 'Town/City';
        break;
      case 'FR':
      case 'BE':
      case 'CH':
        format.streetAddressLabel = 'Adresse';
        format.cityLabel = 'Ville';
        format.countryLabel = 'Pays';
        break;
      case 'DE':
      case 'AT':
        format.streetAddressLabel = 'Straße und Hausnummer';
        format.cityLabel = 'Stadt';
        format.countryLabel = 'Land';
        break;
      case 'ES':
      case 'MX':
      case 'AR':
        format.streetAddressLabel = 'Dirección';
        format.cityLabel = 'Ciudad';
        format.countryLabel = 'País';
        break;
      case 'IT':
        format.streetAddressLabel = 'Indirizzo';
        format.cityLabel = 'Città';
        format.countryLabel = 'Paese';
        break;
      case 'BR':
      case 'PT':
        format.streetAddressLabel = 'Endereço';
        format.cityLabel = 'Cidade';
        format.countryLabel = 'País';
        break;
      case 'JP':
        format.streetAddressLabel = '住所';
        format.cityLabel = '市区町村';
        format.countryLabel = '国';
        break;
      case 'CN':
        format.streetAddressLabel = '街道地址';
        format.cityLabel = '城市';
        format.countryLabel = '国家';
        break;
      case 'KR':
        format.streetAddressLabel = '도로명 주소';
        format.cityLabel = '시/군/구';
        format.countryLabel = '국가';
        break;
    }
    
    formats[localeInfo.localeCode] = format;
    // Also add by country code for easier lookup
    formats[countryCode] = format;
  });
  
  // Add generic format
  formats['generic'] = {
    streetFirst: true,
    requiresStateProvince: false,
    requiresPostalCode: false,
    postalCodeLabel: 'Postal/ZIP Code',
    stateProvinceLabel: 'State/Province/Region',
    streetAddressLabel: 'Street Address',
    streetAddress2Label: 'Address Line 2',
    cityLabel: 'City',
    countryLabel: 'Country',
    defaultAddressFormat: '{streetAddress}\n{streetAddress2}\n{city} {stateProvince} {postalCode}\n{country}'
  };
  
  return formats;
}

// Generate comprehensive address formats
export const ADDRESS_FORMATS: Record<string, AddressFormatPattern> = buildAddressFormats();

/**
 * Detects user's locale based on browser settings and available formats
 * Falls back to en-US if the locale is not supported
 */
export function detectUserLocale(): string {
  try {
    // Check saved preferences first
    const savedLocale = localStorage.getItem('userLocale');
    if (savedLocale && DATE_FORMATS[savedLocale]) {
      return savedLocale;
    }
    
    // Try to get from browser's language setting
    const browserLocale = navigator.language;
    
    if (browserLocale) {
      // Exact locale match (e.g., 'en-US', 'fr-FR')
      if (DATE_FORMATS[browserLocale]) return browserLocale;
      
      // Try country code from locale (e.g., 'US' from 'en-US')
      const localeParts = browserLocale.split('-');
      if (localeParts.length > 1) {
        const countryCode = localeParts[1].toUpperCase();
        if (COUNTRY_LOCALE_MAP[countryCode]) {
          return COUNTRY_LOCALE_MAP[countryCode].localeCode;
        }
      }
      
      // Match by language code
      const languageCode = localeParts[0].toLowerCase();
      
      // Find all locales that match the language
      const matchingLocales = Object.values(COUNTRY_LOCALE_MAP)
        .filter(info => info.localeCode.toLowerCase().startsWith(languageCode))
        .map(info => info.localeCode);
      
      if (matchingLocales.length > 0) {
        // Prefer the locale that matches the browser's full locale if possible
        const exactMatch = matchingLocales.find(locale => 
          locale.toLowerCase() === browserLocale.toLowerCase()
        );
        if (exactMatch) return exactMatch;
        
        // Otherwise return the first matching locale for that language
        return matchingLocales[0];
      }
    }
    
    // Try to detect based on timezone
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      // Map common timezones to countries
      const timezoneToCountry: Record<string, string> = {
        'America/New_York': 'US',
        'America/Chicago': 'US',
        'America/Los_Angeles': 'US',
        'America/Toronto': 'CA',
        'America/Mexico_City': 'MX',
        'America/Sao_Paulo': 'BR',
        'America/Buenos_Aires': 'AR',
        'Europe/London': 'GB',
        'Europe/Paris': 'FR',
        'Europe/Berlin': 'DE',
        'Europe/Madrid': 'ES',
        'Europe/Rome': 'IT',
        'Europe/Amsterdam': 'NL',
        'Europe/Stockholm': 'SE',
        'Europe/Moscow': 'RU',
        'Asia/Tokyo': 'JP',
        'Asia/Shanghai': 'CN',
        'Asia/Seoul': 'KR',
        'Asia/Singapore': 'SG',
        'Asia/Dubai': 'AE',
        'Asia/Jerusalem': 'IL',
        'Asia/Kolkata': 'IN',
        'Australia/Sydney': 'AU',
        'Pacific/Auckland': 'NZ',
        'Africa/Johannesburg': 'ZA'
      };
      
      if (timezone && timezoneToCountry[timezone]) {
        const countryCode = timezoneToCountry[timezone];
        if (COUNTRY_LOCALE_MAP[countryCode]) {
          return COUNTRY_LOCALE_MAP[countryCode].localeCode;
        }
      }
    } catch {
      // Timezone detection failed, continue with default
    }
    
    // Default to US format if no match found
    return 'en-US';
  } catch (error) {
    console.error('Error detecting user locale:', error);
    return 'en-US'; // Fallback to US format
  }
}

// The application's currently active locale
let currentLocale = 'en-US';

/**
 * Get the current locale's date format configuration
 */
export function getCurrentDateFormat(): DateFormatPattern {
  return DATE_FORMATS[currentLocale] || DATE_FORMATS['en-US'];
}

/**
 * Initialize locale settings, should be called early in application startup
 */
export function initializeLocale(): void {
  // Try to get from localStorage first
  try {
    const savedLocale = localStorage.getItem('userLocale');
    if (savedLocale && DATE_FORMATS[savedLocale]) {
      currentLocale = savedLocale;
      console.log(`Initialized locale from localStorage: ${currentLocale}`);
      return;
    }
  } catch (error) {
    console.error('Error reading locale from localStorage:', error);
  }

  // Fall back to browser detection
  currentLocale = detectUserLocale();
  console.log(`Initialized locale from browser detection: ${currentLocale} with date format: ${getCurrentDateFormat().displayFormat}`);
}

/**
 * Manually set the locale for date formatting
 * This will also dispatch a "locale-changed" event so components can react
 */
export function setLocale(locale: string): boolean {
  if (DATE_FORMATS[locale]) {
    currentLocale = locale;
    // Dispatch a custom event that components can listen to
    const event = new CustomEvent('locale-changed', { 
      detail: { locale, format: DATE_FORMATS[locale] } 
    });
    window.dispatchEvent(event);
    return true;
  }
  return false;
}

/**
 * Format a date from ISO format (YYYY-MM-DD) to the user's locale format
 */
export function formatDateToLocale(isoDate: string | null | undefined): string {
  return getCurrentDateFormat().formatFunction(isoDate);
}

/**
 * Parse a date from user's locale format to ISO format (YYYY-MM-DD)
 */
export function parseLocaleDateToISO(localDate: string | null | undefined): string {
  return getCurrentDateFormat().parseFunction(localDate);
}

/**
 * Get validation regex for the current locale's date format
 */
export function getLocaleDatePattern(): RegExp {
  return getCurrentDateFormat().displayPattern;
}

/**
 * Get placeholder text for date input in current locale format
 */
export function getLocaleDatePlaceholder(): string {
  return getCurrentDateFormat().placeholder;
}

/**
 * Validates if a date string matches the current locale's format
 */
export function isValidLocaleDate(dateString: string | null | undefined): boolean {
  if (!dateString) return false;
  return getCurrentDateFormat().displayPattern.test(dateString);
}

/**
 * Get the address format for a specific locale/country
 * @param locale The locale code to get address format for
 * @returns Address format pattern for the locale
 */
export function getAddressFormat(locale: string): AddressFormatPattern {
  const baseFormat = ADDRESS_FORMATS[locale] || ADDRESS_FORMATS['generic'];

  // Always override requiresStateProvince and requiresPostalCode to false
  // regardless of the locale to ensure these fields are not required
  return {
    ...baseFormat,
    requiresStateProvince: false, // Make State/Province optional for all locales
    requiresPostalCode: false,    // Make ZIP/Postal Code optional for all locales
  };
}

/**
 * Get the address format for the current locale
 * @returns Address format pattern for the current locale
 */
export function getCurrentAddressFormat(): AddressFormatPattern {
  // Get the current locale from the global locale state or from localStorage
  const locale = localStorage.getItem('userLocale') || detectUserLocale();
  
  // Get the base format from the existing patterns
  const baseFormat = getAddressFormat(locale);
  
  // Override required fields to make them optional
  return {
    ...baseFormat,
    requiresStateProvince: false, // Make State/Province optional for all locales
    requiresPostalCode: false,    // Make ZIP/Postal Code optional for all locales
  };
}

/**
 * Format a complete address according to the locale's format
 * @param address Address components object
 * @param locale Optional locale override
 * @returns Formatted address string
 */
export function formatAddress(address: {
  streetAddress?: string | null;
  streetAddress2?: string | null;
  city?: string | null;
  stateProvince?: string | null;
  postalCode?: string | null;
  country?: string | null;
}, locale?: string): string {
  const format = locale ? getAddressFormat(locale) : getCurrentAddressFormat();
  const template = format.defaultAddressFormat;
  
  // Replace template variables with actual values
  return template
    .replace('{streetAddress}', address.streetAddress || '')
    .replace('{streetAddress2}', address.streetAddress2 || '')
    .replace('{city}', address.city || '')
    .replace('{stateProvince}', address.stateProvince || '')
    .replace('{postalCode}', address.postalCode || '')
    .replace('{country}', address.country || '')
    // Clean up empty lines and extra whitespace
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
}

/**
 * Validate postal/zip code based on country format
 * @param postalCode The postal code to validate
 * @param locale Locale to determine validation rules
 * @returns Boolean indicating if the postal code is valid
 */
export function isValidPostalCode(postalCode: string | null | undefined, locale?: string): boolean {
  if (!postalCode) return false;
  
  const format = locale ? getAddressFormat(locale) : getCurrentAddressFormat();
  if (!format.postalCodePattern) return true; // No specific validation pattern
  
  return format.postalCodePattern.test(postalCode);
}

/**
 * Convert the detailed address fields to a single formatted address string
 */
export function formatAddressFromFields(fields: {
  streetAddress?: string | null;
  streetAddress2?: string | null;
  city?: string | null;
  stateProvince?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): string {
  // Remove null/undefined values and create a clean object
  const cleanFields = {
    streetAddress: fields.streetAddress || '',
    streetAddress2: fields.streetAddress2 || '',
    city: fields.city || '',
    stateProvince: fields.stateProvince || '',
    postalCode: fields.postalCode || '',
    country: fields.country || ''
  };
  
  return formatAddress(cleanFields);
}

/**
 * Parse a single address string into address components
 * This is an approximate extraction and may not be accurate for all formats
 */
export function parseAddressToFields(fullAddress: string | null | undefined): {
  streetAddress: string;
  streetAddress2: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
} {
  if (!fullAddress) {
    return {
      streetAddress: '',
      streetAddress2: '',
      city: '',
      stateProvince: '',
      postalCode: '',
      country: ''
    };
  }
  
  // Split the address into lines
  const lines = fullAddress.split(/\r?\n/).map(line => line.trim()).filter(line => line);
  
  // Default result
  const result = {
    streetAddress: '',
    streetAddress2: '',
    city: '',
    stateProvince: '',
    postalCode: '',
    country: ''
  };
  
  // Very simple parsing logic - could be improved
  if (lines.length >= 1) result.streetAddress = lines[0];
  if (lines.length >= 2) {
    // Check if second line looks like a continuation of street address
    if (lines[1].match(/^(apt|suite|unit|#)/i)) {
      result.streetAddress2 = lines[1];
      
      // City, state, postal on line 3 if it exists
      if (lines.length >= 3) {
        const cityStatePostal = lines[2].split(',');
        if (cityStatePostal.length >= 1) result.city = cityStatePostal[0].trim();
        
        if (cityStatePostal.length >= 2) {
          // Try to extract state and postal code
          const statePostal = cityStatePostal[1].trim().split(/\s+/);
          if (statePostal.length >= 1) result.stateProvince = statePostal[0].trim();
          if (statePostal.length >= 2) result.postalCode = statePostal[1].trim();
        }
      }
      
      // Country on line 4 if it exists
      if (lines.length >= 4) result.country = lines[3];
    } else {
      // Assume second line has city, state, postal
      const cityStatePostal = lines[1].split(',');
      if (cityStatePostal.length >= 1) result.city = cityStatePostal[0].trim();
      
      if (cityStatePostal.length >= 2) {
        // Try to extract state and postal code
        const statePostal = cityStatePostal[1].trim().split(/\s+/);
        if (statePostal.length >= 1) result.stateProvince = statePostal[0].trim();
        if (statePostal.length >= 2) result.postalCode = statePostal[1].trim();
      }
      
      // Country on line 3 if it exists
      if (lines.length >= 3) result.country = lines[2];
    }
  }
  
  return result;
}

/**
 * Gets the Intl.DateTimeFormatOptions for the current locale for date and time display.
 */
export function getLocaleDateTimeFormatOptions(): Intl.DateTimeFormatOptions {
  const locale = currentLocale;
  // Define desired options for date and time display
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long', // e.g., "December"
    day: 'numeric',
    hour: 'numeric', // e.g., "2 PM" or "14:00"
    minute: '2-digit',
    hour12: !locale.startsWith('iso'), // Use 12-hour for en-US, en-GB, 24-hour for ISO and others by default
  };

  // Adjust for specific locales if needed, e.g., some locales might prefer 'short' month
  // For simplicity, we'll use a fairly standard set of options here.
  return options;
}

/**
 * Format an ISO date-time string (YYYY-MM-DDTHH:mm:ss.sssZ) to the user's locale format for date and time.
 * Enhanced with timezone utilities for better timezone handling.
 */
export function formatISODateTimeToLocale(isoDateTimeString: string | null | undefined): string {
  if (!isoDateTimeString) return '';
  try {
    // Import the enhanced timezone utilities
    // Note: Dynamic import would normally be used in real scenario
    // For this implementation, we'll use the basic Intl approach with user timezone awareness
    const date = new Date(isoDateTimeString);
    if (isNaN(date.getTime())) return 'Invalid Date';

    // Get user's timezone
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    const options = getLocaleDateTimeFormatOptions();
    
    // Add timezone to options for proper display
    const enhancedOptions: Intl.DateTimeFormatOptions = {
      ...options,
      timeZone: userTimezone
    };

    return date.toLocaleString(currentLocale, enhancedOptions);
  } catch (error) {
    console.error('Error formatting ISO date-time to locale string:', error);
    return 'Invalid Date';
  }
}

