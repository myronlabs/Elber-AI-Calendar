/**
 * Date and Time Utilities
 * 
 * This module provides robust timezone-aware date operations for consistent 
 * handling of dates across the application. It includes utilities specifically
 * designed for birthday calculations and other date-related business logic.
 */
import { toZonedTime, format, formatInTimeZone } from 'date-fns-tz';
import { parseISO, isValid, addYears } from 'date-fns';

/**
 * Standard ISO format for dates in the system
 */
export const DATE_FORMAT_ISO = 'yyyy-MM-dd';

/**
 * Interface for birthday calculation results
 */
export interface BirthdayCalculation {
  /** Original date of birth */
  birthDate: Date;
  /** Next occurrence of birthday */
  nextBirthday: Date;
  /** Days until next birthday */
  diffDays: number;
  /** Formatted next birthday in user's timezone */
  formattedNextBirthday: string;
}

/**
 * Get a safely validated timezone string
 * @param timezone Timezone string (e.g., 'America/New_York')
 * @param logPrefix Optional prefix for logging
 * @returns Valid timezone string, or 'UTC' if the input is invalid
 */
export function getSafeTimezone(timezone: string | null | undefined, logPrefix = ''): string {
  if (!timezone) {
    return 'UTC';
  }

  try {
    // Test if the timezone is valid by trying to format a date with it
    format(new Date(), DATE_FORMAT_ISO, { timeZone: timezone });
    return timezone;
  } catch (tzError) {
    console.warn(`${logPrefix} Invalid timezone '${timezone}', falling back to UTC. Error: ${
      tzError instanceof Error ? tzError.message : String(tzError)
    }`);
    return 'UTC';
  }
}

/**
 * Get the current date at midnight in the specified timezone
 * @param timezone User's timezone string
 * @returns Date object representing midnight in user's timezone
 */
export function getTodayInTimezone(timezone: string): Date {
  const safeTimezone = getSafeTimezone(timezone);
  const now = new Date();
  const todayInTz = toZonedTime(now, safeTimezone);
  todayInTz.setHours(0, 0, 0, 0);
  return todayInTz;
}

/**
 * Parse a date string into a Date object, considering the specified timezone
 * @param dateString Date string in YYYY-MM-DD format
 * @param timezone User's timezone string
 * @returns Date object in the user's timezone or null if invalid
 */
export function parseDate(dateString: string, timezone: string): Date | null {
  if (!dateString) return null;
  
  const safeTimezone = getSafeTimezone(timezone);
  
  try {
    // First parse as ISO date - this will be in UTC
    const parsedDate = parseISO(dateString);
    if (!isValid(parsedDate)) return null;
    
    // Extract the year, month, day components
    const [year, month, day] = dateString.split('-').map(Number);
    
    // Create a UTC date first
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    
    // Then convert to the specified timezone
    const tzDate = toZonedTime(utcDate, safeTimezone);
    
    // Reset to midnight in that timezone
    tzDate.setHours(0, 0, 0, 0);
    
    return tzDate;
  } catch (error) {
    console.error(`Error parsing date string '${dateString}':`, 
      error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Calculate next birthday and days until it occurs
 * @param birthdayString Birthday string in YYYY-MM-DD format
 * @param timezone User's timezone string
 * @param reqId Optional request ID for logging
 * @returns Birthday calculation object or null if calculation fails
 */
export function calculateNextBirthday(
  birthdayString: string, 
  timezone: string,
  reqId = ''
): BirthdayCalculation | null {
  if (!birthdayString) return null;
  
  const safeTimezone = getSafeTimezone(timezone, `[${reqId}][dateTimeUtils]`);
  const today = getTodayInTimezone(safeTimezone);
  
  try {
    // Parse birthday in user's timezone
    const birthDate = parseDate(birthdayString, safeTimezone);
    if (!birthDate) return null;
    
    // Get month and day from birth date
    const birthMonth = birthDate.getMonth();
    const birthDay = birthDate.getDate();
    
    // Create this year's birthday date
    let nextBirthday = new Date(today);
    nextBirthday.setMonth(birthMonth);
    nextBirthday.setDate(birthDay);
    nextBirthday.setHours(0, 0, 0, 0);
    
    // Log both dates for comparison before the check
    console.log(`[${reqId}][dateTimeUtils] Comparing dates - Today: ${today.toISOString()}, This year's birthday: ${nextBirthday.toISOString()}`);
    
    // If birthday has passed this year, move to next year
    if (nextBirthday < today) {
      console.log(`[${reqId}][dateTimeUtils] Birthday ${nextBirthday.toISOString()} is in the past, adding 1 year`);
      nextBirthday = addYears(nextBirthday, 1);
    } else {
      console.log(`[${reqId}][dateTimeUtils] Birthday ${nextBirthday.toISOString()} is in the future, no need to add a year`);
    }
    
    // Calculate days until birthday
    const diffTimeMs = nextBirthday.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTimeMs / (1000 * 60 * 60 * 24));
    
    console.log(`[${reqId}][dateTimeUtils] Birthday calculation for '${birthdayString}': Next birthday is ${nextBirthday.toISOString()}, days until: ${diffDays}`);
    
    // Format the next birthday in user's timezone
    const formattedNextBirthday = formatInTimeZone(
      nextBirthday,
      safeTimezone,
      DATE_FORMAT_ISO
    );
    
    return {
      birthDate,
      nextBirthday,
      diffDays,
      formattedNextBirthday
    };
  } catch (error) {
    console.error(`[${reqId}][dateTimeUtils] Error calculating next birthday for '${birthdayString}':`, 
      error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Format a date string in the user's timezone
 * @param dateString Date string in YYYY-MM-DD format
 * @param timezone User's timezone string
 * @param formatString Optional output format string (defaults to ISO)
 * @returns Formatted date string or empty string if invalid
 */
export function formatDate(
  dateString: string, 
  timezone: string,
  formatString = DATE_FORMAT_ISO
): string {
  if (!dateString) return '';
  
  const safeTimezone = getSafeTimezone(timezone);
  
  try {
    const parsedDate = parseDate(dateString, safeTimezone);
    if (!parsedDate) return '';
    
    return formatInTimeZone(parsedDate, safeTimezone, formatString);
  } catch (error) {
    console.error(`Error formatting date '${dateString}':`, 
      error instanceof Error ? error.message : String(error));
    return '';
  }
}