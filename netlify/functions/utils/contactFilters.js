"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports._testExports = exports.applyContactQualityFilters = exports.filterImportedGoogleContacts = void 0;
/**
 * System-generated or placeholder names that indicate erroneous imports
 * These are common patterns from failed imports or system defaults
 */
const SYSTEM_GENERATED_NAMES = new Set([
    'google',
    'unknown',
    'no name',
    'unnamed',
    'default',
    'test',
    'placeholder',
    'n/a',
    'na',
    'none',
    'null',
    'undefined',
    'contact',
    'new contact',
    'imported contact'
]);
/**
 * Email patterns that indicate system or placeholder emails
 */
const INVALID_EMAIL_PATTERNS = [
    /^(noreply|no-reply|donotreply|do-not-reply)@/i,
    /^(test|example|placeholder|temp|temporary)@/i,
    /@(example|test|localhost|placeholder)\./i,
    /^[a-f0-9]{32}@/i, // MD5 hash-like emails
    /^user[0-9]+@/i // Generic numbered users
];
/**
 * Phone patterns that indicate invalid or placeholder numbers
 */
const INVALID_PHONE_PATTERNS = [
    /^0{7,}$/, // All zeros
    /^1{7,}$/, // All ones
    /^123456/, // Sequential numbers
    /^555-?0{3}/, // Hollywood numbers
    /^999/, // Emergency service placeholders
    /^000/ // Invalid area codes
];
/**
 * Evaluates the quality score of a contact based on data completeness
 * @returns Score between 0-100, higher is better quality
 */
const calculateContactQualityScore = (contact) => {
    let score = 0;
    let fieldCount = 0;
    // Name fields (40 points total)
    if (contact.first_name && contact.first_name.trim().length > 1) {
        score += 20;
        fieldCount++;
    }
    if (contact.last_name && contact.last_name.trim().length > 1) {
        score += 15;
        fieldCount++;
    }
    if (contact.middle_name && contact.middle_name.trim().length > 1) {
        score += 5;
        fieldCount++;
    }
    // Contact methods (30 points total)
    if (contact.email && contact.email.includes('@') && contact.email.includes('.')) {
        score += 15;
        fieldCount++;
    }
    if (contact.phone || contact.mobile_phone || contact.work_phone) {
        score += 15;
        fieldCount++;
    }
    // Professional info (15 points total)
    if (contact.company && contact.company.trim().length > 1) {
        score += 10;
        fieldCount++;
    }
    if (contact.job_title && contact.job_title.trim().length > 1) {
        score += 5;
        fieldCount++;
    }
    // Additional valuable fields (15 points total)
    if (contact.notes && contact.notes.trim().length > 10) {
        score += 5;
        fieldCount++;
    }
    if (contact.website && contact.website.includes('.')) {
        score += 5;
        fieldCount++;
    }
    if (contact.street_address || contact.city || contact.country) {
        score += 5;
        fieldCount++;
    }
    // Penalty for too few fields
    if (fieldCount < 2) {
        score = Math.max(0, score - 20);
    }
    return Math.min(100, score);
};
/**
 * Checks if a contact appears to be system-generated or erroneous
 */
const isSystemGeneratedContact = (contact) => {
    // Check for system-generated names
    const firstName = (contact.first_name || '').toLowerCase().trim();
    const lastName = (contact.last_name || '').toLowerCase().trim();
    const fullName = `${firstName} ${lastName}`.trim();
    // Check against known system names
    if (SYSTEM_GENERATED_NAMES.has(firstName) ||
        SYSTEM_GENERATED_NAMES.has(lastName) ||
        SYSTEM_GENERATED_NAMES.has(fullName)) {
        return true;
    }
    // Check for single character names (likely initials used as placeholders)
    if (firstName.length === 1 && !lastName) {
        return true;
    }
    // Check for invalid email patterns
    if (contact.email) {
        const emailLower = contact.email.toLowerCase();
        if (INVALID_EMAIL_PATTERNS.some(pattern => pattern.test(emailLower))) {
            return true;
        }
    }
    // Check for invalid phone patterns
    const phones = [contact.phone, contact.mobile_phone, contact.work_phone].filter(Boolean);
    for (const phone of phones) {
        const cleanPhone = phone.replace(/\D/g, ''); // Remove non-digits
        if (INVALID_PHONE_PATTERNS.some(pattern => pattern.test(cleanPhone))) {
            return true;
        }
    }
    return false;
};
/**
 * Determines if a contact should be filtered out based on quality criteria
 */
const shouldFilterContact = (contact, logPrefix) => {
    // Special case: Google import errors with specific pattern
    if (contact.first_name === 'Google' &&
        !contact.last_name &&
        contact.import_source === 'google' &&
        !contact.email &&
        !contact.phone) {
        console.log(`${logPrefix} Filtering out Google import error: ID ${contact.contact_id}`);
        return true;
    }
    // Check if system-generated
    if (isSystemGeneratedContact(contact)) {
        console.log(`${logPrefix} Filtering out system-generated contact: ID ${contact.contact_id}, Name: ${contact.first_name} ${contact.last_name || ''}`);
        return true;
    }
    // Calculate quality score
    const qualityScore = calculateContactQualityScore(contact);
    // Filter out extremely low quality contacts (score < 10)
    if (qualityScore < 10) {
        console.log(`${logPrefix} Filtering out low quality contact (score: ${qualityScore}): ID ${contact.contact_id}`);
        return true;
    }
    // Contact has no meaningful identifying information
    if (!contact.first_name && !contact.last_name && !contact.email && !contact.phone &&
        !contact.mobile_phone && !contact.work_phone && !contact.company) {
        console.log(`${logPrefix} Filtering out contact with no identifying information: ID ${contact.contact_id}`);
        return true;
    }
    return false;
};
/**
 * Filters out erroneous contacts from imports using intelligent quality checks
 * This function evaluates contacts based on multiple criteria to identify
 * system-generated, placeholder, or extremely low-quality entries
 */
const filterImportedGoogleContacts = (contacts, logPrefix) => {
    if (!contacts || contacts.length === 0)
        return [];
    const originalCount = contacts.length;
    const filtered = contacts.filter(contact => !shouldFilterContact(contact, logPrefix));
    if (originalCount > filtered.length) {
        const removedCount = originalCount - filtered.length;
        console.log(`${logPrefix} Contact quality filter removed ${removedCount} erroneous contacts (${((removedCount / originalCount) * 100).toFixed(1)}% of total)`);
    }
    return filtered;
};
exports.filterImportedGoogleContacts = filterImportedGoogleContacts;
/**
 * Additional contact quality filters can be added here
 * This provides a centralized location for all contact data quality operations
 */
/**
 * Apply all quality filters to a contact array
 * This is the main function that should be used throughout the application
 */
const applyContactQualityFilters = (contacts, logPrefix) => {
    let filteredContacts = contacts;
    // Apply intelligent quality filter
    filteredContacts = (0, exports.filterImportedGoogleContacts)(filteredContacts, logPrefix);
    // Future filters can be added here
    // filteredContacts = filterDuplicateContacts(filteredContacts, logPrefix);
    // filteredContacts = filterSpamContacts(filteredContacts, logPrefix);
    return filteredContacts;
};
exports.applyContactQualityFilters = applyContactQualityFilters;
/**
 * Exports for testing purposes
 */
exports._testExports = {
    calculateContactQualityScore,
    isSystemGeneratedContact,
    shouldFilterContact,
    SYSTEM_GENERATED_NAMES,
    INVALID_EMAIL_PATTERNS,
    INVALID_PHONE_PATTERNS
};
//# sourceMappingURL=contactFilters.js.map