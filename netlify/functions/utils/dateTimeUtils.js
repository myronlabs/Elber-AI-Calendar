"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DATE_FORMAT_ISO = void 0;
exports.getSafeTimezone = getSafeTimezone;
exports.getTodayInTimezone = getTodayInTimezone;
exports.parseDate = parseDate;
exports.calculateNextBirthday = calculateNextBirthday;
exports.formatDate = formatDate;
/**
 * Date and Time Utilities
 *
 * This module provides robust timezone-aware date operations for consistent
 * handling of dates across the application. It includes utilities specifically
 * designed for birthday calculations and other date-related business logic.
 */
const date_fns_tz_1 = require("date-fns-tz");
const date_fns_1 = require("date-fns");
/**
 * Standard ISO format for dates in the system
 */
exports.DATE_FORMAT_ISO = 'yyyy-MM-dd';
/**
 * Get a safely validated timezone string
 * @param timezone Timezone string (e.g., 'America/New_York')
 * @param logPrefix Optional prefix for logging
 * @returns Valid timezone string, or 'UTC' if the input is invalid
 */
function getSafeTimezone(timezone, logPrefix = '') {
    if (!timezone) {
        return 'UTC';
    }
    try {
        // Test if the timezone is valid by trying to format a date with it
        (0, date_fns_tz_1.format)(new Date(), exports.DATE_FORMAT_ISO, { timeZone: timezone });
        return timezone;
    }
    catch (tzError) {
        console.warn(`${logPrefix} Invalid timezone '${timezone}', falling back to UTC. Error: ${tzError instanceof Error ? tzError.message : String(tzError)}`);
        return 'UTC';
    }
}
/**
 * Get the current date at midnight in the specified timezone
 * @param timezone User's timezone string
 * @returns Date object representing midnight in user's timezone
 */
function getTodayInTimezone(timezone) {
    const safeTimezone = getSafeTimezone(timezone);
    const now = new Date();
    const todayInTz = (0, date_fns_tz_1.toZonedTime)(now, safeTimezone);
    todayInTz.setHours(0, 0, 0, 0);
    return todayInTz;
}
/**
 * Parse a date string into a Date object, considering the specified timezone
 * @param dateString Date string in YYYY-MM-DD format
 * @param timezone User's timezone string
 * @returns Date object in the user's timezone or null if invalid
 */
function parseDate(dateString, timezone) {
    if (!dateString)
        return null;
    const safeTimezone = getSafeTimezone(timezone);
    try {
        // First parse as ISO date - this will be in UTC
        const parsedDate = (0, date_fns_1.parseISO)(dateString);
        if (!(0, date_fns_1.isValid)(parsedDate))
            return null;
        // Extract the year, month, day components
        const [year, month, day] = dateString.split('-').map(Number);
        // Create a UTC date first
        const utcDate = new Date(Date.UTC(year, month - 1, day));
        // Then convert to the specified timezone
        const tzDate = (0, date_fns_tz_1.toZonedTime)(utcDate, safeTimezone);
        // Reset to midnight in that timezone
        tzDate.setHours(0, 0, 0, 0);
        return tzDate;
    }
    catch (error) {
        console.error(`Error parsing date string '${dateString}':`, error instanceof Error ? error.message : String(error));
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
function calculateNextBirthday(birthdayString, timezone, reqId = '') {
    if (!birthdayString)
        return null;
    const safeTimezone = getSafeTimezone(timezone, `[${reqId}][dateTimeUtils]`);
    const today = getTodayInTimezone(safeTimezone);
    try {
        // Parse birthday in user's timezone
        const birthDate = parseDate(birthdayString, safeTimezone);
        if (!birthDate)
            return null;
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
            nextBirthday = (0, date_fns_1.addYears)(nextBirthday, 1);
        }
        else {
            console.log(`[${reqId}][dateTimeUtils] Birthday ${nextBirthday.toISOString()} is in the future, no need to add a year`);
        }
        // Calculate days until birthday
        const diffTimeMs = nextBirthday.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTimeMs / (1000 * 60 * 60 * 24));
        console.log(`[${reqId}][dateTimeUtils] Birthday calculation for '${birthdayString}': Next birthday is ${nextBirthday.toISOString()}, days until: ${diffDays}`);
        // Format the next birthday in user's timezone
        const formattedNextBirthday = (0, date_fns_tz_1.formatInTimeZone)(nextBirthday, safeTimezone, exports.DATE_FORMAT_ISO);
        return {
            birthDate,
            nextBirthday,
            diffDays,
            formattedNextBirthday
        };
    }
    catch (error) {
        console.error(`[${reqId}][dateTimeUtils] Error calculating next birthday for '${birthdayString}':`, error instanceof Error ? error.message : String(error));
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
function formatDate(dateString, timezone, formatString = exports.DATE_FORMAT_ISO) {
    if (!dateString)
        return '';
    const safeTimezone = getSafeTimezone(timezone);
    try {
        const parsedDate = parseDate(dateString, safeTimezone);
        if (!parsedDate)
            return '';
        return (0, date_fns_tz_1.formatInTimeZone)(parsedDate, safeTimezone, formatString);
    }
    catch (error) {
        console.error(`Error formatting date '${dateString}':`, error instanceof Error ? error.message : String(error));
        return '';
    }
}
//# sourceMappingURL=dateTimeUtils.js.map