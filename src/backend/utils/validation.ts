/**
 * Validates if a string is a valid UUID format
 * @param uuid The string to validate
 * @returns true if the string is a valid UUID, false otherwise
 */
export function isValidUUID(uuid: string): boolean {
  if (!uuid) return false;
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  return uuidRegex.test(uuid);
}

/**
 * Validates if a string is a valid email format
 * @param email The string to validate
 * @returns true if the string is a valid email, false otherwise
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates if a string is a valid phone format
 * This is a very basic check and can be enhanced as needed
 * @param phone The string to validate
 * @returns true if the string is a valid phone, false otherwise
 */
export function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  const phoneRegex = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
  return phoneRegex.test(phone);
}

/**
 * Validates if a string is a valid URL format
 * @param url The string to validate
 * @returns true if the string is a valid URL, false otherwise
 */
export function isValidURL(url: string): boolean {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates if a string is a valid date format (YYYY-MM-DD)
 * @param date The string to validate
 * @returns true if the string is a valid date in YYYY-MM-DD format, false otherwise
 */
export function isValidDateFormat(date: string): boolean {
  if (!date) return false;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) return false;
  
  // Parse the date parts to integers
  const parts = date.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  
  // Check the ranges of month and day
  if (month < 1 || month > 12) return false;
  
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return false;
  
  return true;
}

/**
 * Validates if a string is a valid ISO 8601 date format
 * @param date The string to validate
 * @returns true if the string is a valid ISO 8601 date, false otherwise
 */
export function isValidISODate(date: string): boolean {
  if (!date) return false;
  try {
    const d = new Date(date);
    return !isNaN(d.getTime()) && date.includes('T');
  } catch {
    return false;
  }
}

/**
 * Validates if a tag array contains valid tag strings
 * @param tags The array of tags to validate
 * @returns true if all tags are valid, false otherwise
 */
export function hasValidTags(tags: string[] | null): boolean {
  if (!tags) return true;
  if (!Array.isArray(tags)) return false;
  return tags.every(tag => typeof tag === 'string' && tag.trim() !== '');
} 