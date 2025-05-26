/**
 * Comprehensive timezone utilities for proper local time display
 * Addresses the top priority timezone handling issue
 */

import { COUNTRY_CODES } from './countryData';

// Enhanced timezone interface with country information
interface TimezoneEntry {
  value: string;
  label: string;
  offset: number;
  countries: string[]; // Array of country codes
  region: string;
  dst?: boolean; // Daylight saving time support
}

// Comprehensive timezone definitions utilizing country data
export const COMMON_TIMEZONES: TimezoneEntry[] = [
  // North America
  { 
    value: 'America/New_York', 
    label: 'Eastern Time (US & Canada)', 
    offset: -5, 
    countries: ['US', 'CA'], 
    region: 'Americas',
    dst: true
  },
  { 
    value: 'America/Chicago', 
    label: 'Central Time (US & Canada)', 
    offset: -6, 
    countries: ['US', 'CA'], 
    region: 'Americas',
    dst: true
  },
  { 
    value: 'America/Denver', 
    label: 'Mountain Time (US & Canada)', 
    offset: -7, 
    countries: ['US', 'CA'], 
    region: 'Americas',
    dst: true
  },
  { 
    value: 'America/Los_Angeles', 
    label: 'Pacific Time (US & Canada)', 
    offset: -8, 
    countries: ['US', 'CA'], 
    region: 'Americas',
    dst: true
  },
  { 
    value: 'America/Anchorage', 
    label: 'Alaska Time', 
    offset: -9, 
    countries: ['US'], 
    region: 'Americas',
    dst: true
  },
  { 
    value: 'Pacific/Honolulu', 
    label: 'Hawaii-Aleutian Time', 
    offset: -10, 
    countries: ['US'], 
    region: 'Oceania',
    dst: false
  },
  
  // Europe
  { 
    value: 'UTC', 
    label: 'Coordinated Universal Time', 
    offset: 0, 
    countries: [], 
    region: 'UTC',
    dst: false
  },
  { 
    value: 'Europe/London', 
    label: 'Greenwich Mean Time / British Summer Time', 
    offset: 0, 
    countries: ['GB', 'IE'], 
    region: 'Europe',
    dst: true
  },
  { 
    value: 'Europe/Paris', 
    label: 'Central European Time', 
    offset: 1, 
    countries: ['FR', 'DE', 'IT', 'ES', 'NL', 'BE', 'CH', 'AT'], 
    region: 'Europe',
    dst: true
  },
  { 
    value: 'Europe/Berlin', 
    label: 'Central European Time (Berlin)', 
    offset: 1, 
    countries: ['DE'], 
    region: 'Europe',
    dst: true
  },
  { 
    value: 'Europe/Rome', 
    label: 'Central European Time (Rome)', 
    offset: 1, 
    countries: ['IT'], 
    region: 'Europe',
    dst: true
  },
  { 
    value: 'Europe/Madrid', 
    label: 'Central European Time (Madrid)', 
    offset: 1, 
    countries: ['ES'], 
    region: 'Europe',
    dst: true
  },
  { 
    value: 'Europe/Amsterdam', 
    label: 'Central European Time (Amsterdam)', 
    offset: 1, 
    countries: ['NL'], 
    region: 'Europe',
    dst: true
  },
  { 
    value: 'Europe/Stockholm', 
    label: 'Central European Time (Stockholm)', 
    offset: 1, 
    countries: ['SE'], 
    region: 'Europe',
    dst: true
  },
  { 
    value: 'Europe/Helsinki', 
    label: 'Eastern European Time', 
    offset: 2, 
    countries: ['FI'], 
    region: 'Europe',
    dst: true
  },
  { 
    value: 'Europe/Athens', 
    label: 'Eastern European Time (Athens)', 
    offset: 2, 
    countries: ['GR'], 
    region: 'Europe',
    dst: true
  },
  { 
    value: 'Europe/Moscow', 
    label: 'Moscow Standard Time', 
    offset: 3, 
    countries: ['RU'], 
    region: 'Europe',
    dst: false
  },
  
  // Asia
  { 
    value: 'Asia/Dubai', 
    label: 'Gulf Standard Time', 
    offset: 4, 
    countries: ['AE', 'OM'], 
    region: 'Asia',
    dst: false
  },
  { 
    value: 'Asia/Kolkata', 
    label: 'India Standard Time', 
    offset: 5.5, 
    countries: ['IN'], 
    region: 'Asia',
    dst: false
  },
  { 
    value: 'Asia/Dhaka', 
    label: 'Bangladesh Standard Time', 
    offset: 6, 
    countries: ['BD'], 
    region: 'Asia',
    dst: false
  },
  { 
    value: 'Asia/Bangkok', 
    label: 'Indochina Time', 
    offset: 7, 
    countries: ['TH', 'VN', 'KH', 'LA'], 
    region: 'Asia',
    dst: false
  },
  { 
    value: 'Asia/Shanghai', 
    label: 'China Standard Time', 
    offset: 8, 
    countries: ['CN'], 
    region: 'Asia',
    dst: false
  },
  { 
    value: 'Asia/Hong_Kong', 
    label: 'Hong Kong Time', 
    offset: 8, 
    countries: ['HK'], 
    region: 'Asia',
    dst: false
  },
  { 
    value: 'Asia/Singapore', 
    label: 'Singapore Standard Time', 
    offset: 8, 
    countries: ['SG', 'MY'], 
    region: 'Asia',
    dst: false
  },
  { 
    value: 'Asia/Tokyo', 
    label: 'Japan Standard Time', 
    offset: 9, 
    countries: ['JP'], 
    region: 'Asia',
    dst: false
  },
  { 
    value: 'Asia/Seoul', 
    label: 'Korea Standard Time', 
    offset: 9, 
    countries: ['KR'], 
    region: 'Asia',
    dst: false
  },
  
  // Australia & Oceania
  { 
    value: 'Australia/Perth', 
    label: 'Australian Western Time', 
    offset: 8, 
    countries: ['AU'], 
    region: 'Oceania',
    dst: false
  },
  { 
    value: 'Australia/Adelaide', 
    label: 'Australian Central Time', 
    offset: 9.5, 
    countries: ['AU'], 
    region: 'Oceania',
    dst: true
  },
  { 
    value: 'Australia/Sydney', 
    label: 'Australian Eastern Time', 
    offset: 10, 
    countries: ['AU'], 
    region: 'Oceania',
    dst: true
  },
  { 
    value: 'Pacific/Auckland', 
    label: 'New Zealand Standard Time', 
    offset: 12, 
    countries: ['NZ'], 
    region: 'Oceania',
    dst: true
  },
  
  // South America
  { 
    value: 'America/Sao_Paulo', 
    label: 'Brasília Time', 
    offset: -3, 
    countries: ['BR'], 
    region: 'Americas',
    dst: true
  },
  { 
    value: 'America/Argentina/Buenos_Aires', 
    label: 'Argentina Time', 
    offset: -3, 
    countries: ['AR'], 
    region: 'Americas',
    dst: false
  },
  { 
    value: 'America/Santiago', 
    label: 'Chile Standard Time', 
    offset: -4, 
    countries: ['CL'], 
    region: 'Americas',
    dst: true
  },
  
  // Africa
  { 
    value: 'Africa/Cairo', 
    label: 'Egypt Standard Time', 
    offset: 2, 
    countries: ['EG'], 
    region: 'Africa',
    dst: false
  },
  { 
    value: 'Africa/Johannesburg', 
    label: 'South Africa Standard Time', 
    offset: 2, 
    countries: ['ZA', 'BW', 'LS', 'SZ'], 
    region: 'Africa',
    dst: false
  },
  { 
    value: 'Africa/Lagos', 
    label: 'West Africa Time', 
    offset: 1, 
    countries: ['NG', 'BJ', 'CF', 'TD', 'CM', 'GQ', 'GA', 'NE'], 
    region: 'Africa',
    dst: false
  }
];

/**
 * Get timezone information by country code
 */
export function getTimezonesByCountry(countryCode: string): TimezoneEntry[] {
  return COMMON_TIMEZONES.filter(tz => tz.countries.includes(countryCode));
}

/**
 * Get country information for a timezone
 */
export function getCountriesForTimezone(timezoneValue: string): Array<{code: string, name: string}> {
  const timezone = COMMON_TIMEZONES.find(tz => tz.value === timezoneValue);
  if (!timezone) return [];
  
  return timezone.countries.map(code => ({
    code,
    name: COUNTRY_CODES[code as keyof typeof COUNTRY_CODES]?.name || code
  }));
}

/**
 * Get timezone by region
 */
export function getTimezonesByRegion(region: string): TimezoneEntry[] {
  return COMMON_TIMEZONES.filter(tz => tz.region === region);
}

/**
 * Get all available regions
 */
export function getAvailableRegions(): string[] {
  return [...new Set(COMMON_TIMEZONES.map(tz => tz.region))].sort();
}

/**
 * Get the user's current timezone
 */
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    console.warn('Could not determine user timezone, falling back to UTC');
    return 'UTC';
  }
}

/**
 * Check if a timezone string is valid
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a safe timezone (fallback to user timezone or UTC)
 */
export function getSafeTimezone(timezone?: string | null): string {
  if (timezone && isValidTimezone(timezone)) {
    return timezone;
  }
  
  const userTimezone = getUserTimezone();
  if (isValidTimezone(userTimezone)) {
    return userTimezone;
  }
  
  return 'UTC';
}

/**
 * Convert ISO datetime string to user's local timezone
 */
export function convertToUserTimezone(
  isoDateTime: string,
  _targetTimezone?: string
): Date {
  try {
    const date = new Date(isoDateTime);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date string');
    }
    
    // The Date object automatically represents the time in the user's timezone
    // when using toLocaleString with the target timezone
    return date;
  } catch (error) {
    console.error('Error converting to user timezone:', error);
    return new Date(); // Fallback to current time
  }
}

/**
 * Format a date with timezone awareness
 */
export function formatDateWithTimezone(
  isoDateTime: string,
  options: {
    timezone?: string;
    showTimezone?: boolean;
    includeSeconds?: boolean;
    use24Hour?: boolean;
    dateStyle?: 'full' | 'long' | 'medium' | 'short';
    timeStyle?: 'full' | 'long' | 'medium' | 'short';
  } = {}
): string {
  try {
    const date = new Date(isoDateTime);
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    
    const {
      timezone = getUserTimezone(),
      showTimezone = true,
      includeSeconds = false,
      use24Hour = false,
      dateStyle = 'medium',
      timeStyle = 'short'
    } = options;
    
    const safeTimezone = getSafeTimezone(timezone);
    
    // Create format options
    const formatOptions: Intl.DateTimeFormatOptions = {
      timeZone: safeTimezone,
      hour12: !use24Hour,
    };
    
    // Add date formatting
    if (dateStyle === 'full') {
      formatOptions.weekday = 'long';
      formatOptions.year = 'numeric';
      formatOptions.month = 'long';
      formatOptions.day = 'numeric';
    } else if (dateStyle === 'long') {
      formatOptions.year = 'numeric';
      formatOptions.month = 'long';
      formatOptions.day = 'numeric';
    } else if (dateStyle === 'medium') {
      formatOptions.year = 'numeric';
      formatOptions.month = 'short';
      formatOptions.day = 'numeric';
    } else {
      formatOptions.year = '2-digit';
      formatOptions.month = 'numeric';
      formatOptions.day = 'numeric';
    }
    
    // Add time formatting
    if (timeStyle === 'full' || timeStyle === 'long') {
      formatOptions.hour = 'numeric';
      formatOptions.minute = '2-digit';
      if (includeSeconds) {
        formatOptions.second = '2-digit';
      }
      if (showTimezone) {
        formatOptions.timeZoneName = timeStyle === 'full' ? 'long' : 'short';
      }
    } else {
      formatOptions.hour = 'numeric';
      formatOptions.minute = '2-digit';
      if (includeSeconds) {
        formatOptions.second = '2-digit';
      }
    }
    
    return date.toLocaleString('en-US', formatOptions);
  } catch (error) {
    console.error('Error formatting date with timezone:', error);
    return 'Invalid Date';
  }
}

/**
 * Get relative time description with timezone awareness
 */
export function getRelativeTimeWithTimezone(
  isoDateTime: string,
  referenceTime?: string | Date,
  _timezone?: string
): string {
  try {
    const targetDate = new Date(isoDateTime);
    const now = referenceTime ? new Date(referenceTime) : new Date();
    
    if (isNaN(targetDate.getTime()) || isNaN(now.getTime())) {
      return 'Invalid Date';
    }
    
    const diffMs = targetDate.getTime() - now.getTime();
    const absDiffMs = Math.abs(diffMs);
    const isPast = diffMs < 0;
    
    // Convert to various time units
    const diffMinutes = Math.floor(absDiffMs / (1000 * 60));
    const diffHours = Math.floor(absDiffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(absDiffMs / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);
    
    let relativeText = '';
    
    if (diffMinutes < 1) {
      relativeText = 'now';
    } else if (diffMinutes < 60) {
      relativeText = `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'}`;
    } else if (diffHours < 24) {
      relativeText = `${diffHours} hour${diffHours === 1 ? '' : 's'}`;
    } else if (diffDays < 7) {
      relativeText = `${diffDays} day${diffDays === 1 ? '' : 's'}`;
    } else if (diffWeeks < 4) {
      relativeText = `${diffWeeks} week${diffWeeks === 1 ? '' : 's'}`;
    } else if (diffMonths < 12) {
      relativeText = `${diffMonths} month${diffMonths === 1 ? '' : 's'}`;
    } else {
      relativeText = `${diffYears} year${diffYears === 1 ? '' : 's'}`;
    }
    
    if (relativeText === 'now') {
      return 'now';
    }
    
    return isPast ? `${relativeText} ago` : `in ${relativeText}`;
  } catch (error) {
    console.error('Error calculating relative time:', error);
    return 'Unknown';
  }
}

/**
 * Get smart time description (Today, Tomorrow, etc.)
 */
export function getSmartTimeDescription(
  isoDateTime: string,
  timezone?: string,
  includeTime: boolean = true
): string {
  try {
    const date = new Date(isoDateTime);
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    
    const safeTimezone = getSafeTimezone(timezone);
    const now = new Date();
    
    // Format dates in the target timezone for comparison
    const dateInTimezone = new Date(date.toLocaleString('en-US', { timeZone: safeTimezone }));
    const nowInTimezone = new Date(now.toLocaleString('en-US', { timeZone: safeTimezone }));
    
    const todayStart = new Date(nowInTimezone);
    todayStart.setHours(0, 0, 0, 0);
    
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    
    const targetStart = new Date(dateInTimezone);
    targetStart.setHours(0, 0, 0, 0);
    
    let dayDescription = '';
    
    if (targetStart.getTime() === todayStart.getTime()) {
      dayDescription = 'Today';
    } else if (targetStart.getTime() === tomorrowStart.getTime()) {
      dayDescription = 'Tomorrow';
    } else if (targetStart.getTime() === yesterdayStart.getTime()) {
      dayDescription = 'Yesterday';
    } else {
      // Use weekday if within the current week
      const diffDays = Math.abs((targetStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 6) {
        dayDescription = date.toLocaleDateString('en-US', { 
          weekday: 'long',
          timeZone: safeTimezone 
        });
      } else {
        dayDescription = date.toLocaleDateString('en-US', { 
          month: 'short',
          day: 'numeric',
          year: nowInTimezone.getFullYear() !== dateInTimezone.getFullYear() ? 'numeric' : undefined,
          timeZone: safeTimezone 
        });
      }
    }
    
    if (includeTime) {
      const timeDescription = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: safeTimezone
      });
      
      return `${dayDescription} at ${timeDescription}`;
    }
    
    return dayDescription;
  } catch (error) {
    console.error('Error getting smart time description:', error);
    return 'Invalid Date';
  }
}

/**
 * Convert local datetime-local input value to UTC ISO string
 */
export function convertLocalInputToUTC(
  localDateTime: string,
  userTimezone?: string
): string {
  try {
    if (!localDateTime) return '';
    
    const safeTimezone = getSafeTimezone(userTimezone);
    
    // The datetime-local input gives us a value without timezone info
    // We need to interpret it as being in the user's timezone
    const localDate = new Date(localDateTime);
    
    if (isNaN(localDate.getTime())) {
      throw new Error('Invalid local datetime');
    }
    
    // Get the timezone offset for the user's timezone at this date
    const tempDate = new Date();
    const utcTime = tempDate.getTime() + (tempDate.getTimezoneOffset() * 60000);
    const targetTime = new Date(utcTime + getTimezoneOffset(safeTimezone) * 3600000);
    
    // Calculate the offset between the local input and UTC
    const offsetMs = targetTime.getTimezoneOffset() * 60000;
    const utcDate = new Date(localDate.getTime() - offsetMs);
    
    return utcDate.toISOString();
  } catch (error) {
    console.error('Error converting local input to UTC:', error);
    return new Date().toISOString(); // Fallback to current time
  }
}

/**
 * Convert UTC ISO string to local datetime-local input value
 */
export function convertUTCToLocalInput(
  utcISOString: string,
  userTimezone?: string
): string {
  try {
    if (!utcISOString) return '';
    
    const date = new Date(utcISOString);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid UTC ISO string');
    }
    
    const safeTimezone = getSafeTimezone(userTimezone);
    
    // Convert to the user's timezone
    const localDate = new Date(date.toLocaleString('en-US', { timeZone: safeTimezone }));
    
    // Format for datetime-local input (YYYY-MM-DDTHH:mm)
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const hours = String(localDate.getHours()).padStart(2, '0');
    const minutes = String(localDate.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch (error) {
    console.error('Error converting UTC to local input:', error);
    return '';
  }
}

/**
 * Get timezone offset in hours for a given timezone
 */
export function getTimezoneOffset(timezone: string): number {
  try {
    const now = new Date();
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const local = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    
    return (local.getTime() - utc.getTime()) / (1000 * 60 * 60);
  } catch (error) {
    console.error('Error getting timezone offset:', error);
    return 0;
  }
}

/**
 * Get timezone display name
 */
export function getTimezoneDisplayName(timezone: string): string {
  const commonTimezone = COMMON_TIMEZONES.find(tz => tz.value === timezone);
  if (commonTimezone) {
    return commonTimezone.label;
  }
  
  try {
    // Generate a display name using Intl
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'long'
    });
    
    const parts = formatter.formatToParts(now);
    const timezonePart = parts.find(part => part.type === 'timeZoneName');
    
    return timezonePart?.value || timezone;
  } catch (error) {
    console.error('Error getting timezone display name:', error);
    return timezone;
  }
}

/**
 * Enhanced format function that combines all features
 */
export function formatDateTimeForDisplay(
  isoDateTime: string,
  options: {
    timezone?: string;
    showRelative?: boolean;
    showTimezone?: boolean;
    format?: 'smart' | 'full' | 'relative-only';
    includeSeconds?: boolean;
  } = {}
): string {
  const {
    timezone,
    showRelative = true,
    showTimezone = false,
    format = 'smart',
    includeSeconds = false
  } = options;
  
  try {
    if (format === 'relative-only') {
      return getRelativeTimeWithTimezone(isoDateTime, undefined, timezone);
    }
    
    const smartTime = getSmartTimeDescription(isoDateTime, timezone, true);
    
    if (format === 'smart') {
      if (showRelative) {
        const relative = getRelativeTimeWithTimezone(isoDateTime, undefined, timezone);
        return `${smartTime} (${relative})`;
      }
      return smartTime;
    }
    
    // Full format
    return formatDateWithTimezone(isoDateTime, {
      timezone,
      showTimezone,
      includeSeconds,
      dateStyle: 'long',
      timeStyle: 'medium'
    });
  } catch (error) {
    console.error('Error formatting datetime for display:', error);
    return 'Invalid Date';
  }
} 