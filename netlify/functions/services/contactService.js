"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactService = exports.ContactService = void 0;
// src/backend/services/contactService.ts
const supabaseAdmin_1 = require("./supabaseAdmin");
const utils_1 = require("../functions/_shared/utils");
const dateTimeUtils_1 = require("../utils/dateTimeUtils");
const assistantConfig_1 = require("./assistantConfig");
/**
 * Service class for contact-related operations.
 * Centralizes all contact functionality to provide:
 * - Type-safe operations
 * - Consistent error handling
 * - Single point for contact resolution
 */
class ContactService {
    /**
     * Find contacts with improperly formatted phone numbers
     * @param userId The authenticated user ID
     * @param options Optional parameters for pagination and filtering
     * @returns Operation result with contacts having improper phone formats and detailed format issues
     */
    async findContactsWithImproperPhoneFormats(userId, options = {}) {
        console.log(`[contactService] findContactsWithImproperPhoneFormats called for userId=${userId}, options=`, JSON.stringify(options));
        try {
            // Input validation
            if (!userId) {
                console.error('[contactService] findContactsWithImproperPhoneFormats failed: Missing user ID');
                return this.createError('MISSING_USER_ID', 'User ID is required for finding contacts with improper phone formats');
            }
            const { includeEmpty = false, page = 1, limit: rawLimit = 20 } = options;
            // Enforce limit boundaries
            const limit = Math.min(Math.max(1, rawLimit), 50);
            // First query to get all relevant contacts
            let query = supabaseAdmin_1.supabaseAdmin
                .from('contacts')
                .select('*')
                .eq('user_id', userId);
            if (!includeEmpty) {
                // Only include contacts with non-empty phone numbers
                query = query.not('phone', 'is', null)
                    .neq('phone', '');
            }
            const { data: allContacts, error } = await query;
            if (error) {
                console.error('[contactService] Error finding contacts with phone numbers:', error);
                return this.createError('DATABASE_ERROR', `Error finding contacts: ${error.message}`, { error });
            }
            if (!allContacts || allContacts.length === 0) {
                return {
                    success: true,
                    data: {
                        contacts: [],
                        pagination: {
                            currentPage: page,
                            totalPages: 0,
                            totalContacts: 0,
                            limit,
                            hasMore: false
                        }
                    }
                };
            }
            // Validate phone numbers in memory with detailed reasons
            const contactsWithImproperPhones = allContacts
                .map(contact => {
                // Skip contacts without phone numbers if we're not including empty
                if (!contact.phone) {
                    if (includeEmpty) {
                        return { ...contact, formatIssue: 'Missing phone number' };
                    }
                    return null;
                }
                const phone = contact.phone.trim();
                // Check for empty strings after trimming
                if (phone === '') {
                    if (includeEmpty) {
                        return { ...contact, formatIssue: 'Empty phone number' };
                    }
                    return null;
                }
                // Check for non-digit characters (except for allowed formatting characters)
                // eslint-disable-next-line no-useless-escape
                if (/[^\d\+\-\(\)\s\.]/g.test(phone)) {
                    return {
                        ...contact,
                        formatIssue: 'Contains invalid characters',
                        suggestedFormat: this.getSuggestedPhoneFormat(phone)
                    };
                }
                // Check for proper formatting with various patterns
                // International format: +1-234-567-8901
                const internationalPattern = /^\+\d{1,3}[\s-.]?\(?\d{3}\)?[\s-.]?\d{3}[\s-.]?\d{4}$/;
                // US format: (234) 567-8901 or 234-567-8901
                const usPattern = /^(\(\d{3}\)|\d{3})[\s-.]?\d{3}[\s-.]?\d{4}$/;
                if (internationalPattern.test(phone) || usPattern.test(phone)) {
                    return null; // Properly formatted
                }
                // Additional validation checks
                if (phone.replace(/\D/g, '').length !== 10 && !phone.startsWith('+')) {
                    return {
                        ...contact,
                        formatIssue: 'Does not have 10 digits (excluding country code)',
                        suggestedFormat: this.getSuggestedPhoneFormat(phone)
                    };
                }
                if (phone.startsWith('+') && phone.replace(/\D/g, '').length !== 11 && phone.replace(/\D/g, '').length !== 12) {
                    return {
                        ...contact,
                        formatIssue: 'International number with incorrect digit count',
                        suggestedFormat: this.getSuggestedPhoneFormat(phone)
                    };
                }
                return {
                    ...contact,
                    formatIssue: 'Improperly formatted',
                    suggestedFormat: this.getSuggestedPhoneFormat(phone)
                };
            })
                .filter((contact) => contact !== null);
            // Calculate pagination
            const totalContacts = contactsWithImproperPhones.length;
            const totalPages = Math.ceil(totalContacts / limit);
            const validPage = Math.max(1, Math.min(page, totalPages || 1));
            const startIndex = (validPage - 1) * limit;
            const endIndex = Math.min(startIndex + limit, totalContacts);
            // Get the items for this page
            const pageResults = contactsWithImproperPhones.slice(startIndex, endIndex);
            console.log(`[contactService] Found ${totalContacts} contacts with improper phone formats, showing page ${validPage}/${totalPages}`);
            return {
                success: true,
                data: {
                    contacts: pageResults,
                    pagination: {
                        currentPage: validPage,
                        totalPages,
                        totalContacts,
                        limit,
                        hasMore: validPage < totalPages
                    }
                }
            };
        }
        catch (error) {
            console.error('[contactService] Error finding contacts with improper phone formats:', error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || 'No stack trace available'}` : error);
            return this.createError('UNEXPECTED_ERROR', error instanceof Error ? error.message : 'Unknown error finding contacts with improper phone formats', { error });
        }
    }
    /**
     * Suggests a properly formatted phone number based on the input
     * @private
     * @param phone The original phone number string
     * @returns A suggested proper format
     */
    getSuggestedPhoneFormat(phone) {
        // Extract just the digits
        const digits = phone.replace(/\D/g, '');
        // Not enough digits to format
        if (digits.length < 10) {
            return 'Needs at least 10 digits';
        }
        // Standard US 10-digit number
        if (digits.length === 10) {
            return `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
        }
        // US number with country code
        if (digits.length === 11 && digits.startsWith('1')) {
            return `+1 (${digits.substring(1, 4)}) ${digits.substring(4, 7)}-${digits.substring(7)}`;
        }
        // International number (simple suggestion)
        if (digits.length > 10) {
            const countryCodeLength = digits.length - 10;
            return `+${digits.substring(0, countryCodeLength)} (${digits.substring(countryCodeLength, countryCodeLength + 3)}) ${digits.substring(countryCodeLength + 3, countryCodeLength + 6)}-${digits.substring(countryCodeLength + 6)}`;
        }
        return 'Cannot determine proper format';
    }
    /**
     * Find potential duplicate contacts for a user
     * @param userId The authenticated user ID
     * @param options Optional parameters for duplicate detection
     * @returns Operation result with duplicate contacts or error
     */
    async findDuplicateContacts(userId, options = {}) {
        console.log(`[contactService] findDuplicateContacts called for userId=${userId}, options=`, JSON.stringify(options));
        try {
            // Input validation
            if (!userId) {
                console.error('[contactService] findDuplicateContacts failed: Missing user ID');
                return this.createError('MISSING_USER_ID', 'User ID is required for finding duplicate contacts');
            }
            const { threshold = 0.6, includeArchived = false, page = 1, limit: rawLimit = 10, sortBy = 'confidence' } = options;
            // Enforce limit boundaries (max 25 items per page to prevent timeouts)
            const limit = Math.min(Math.max(1, rawLimit), 25);
            console.log(`[contactService] Using threshold=${threshold}, includeArchived=${includeArchived}, page=${page}, limit=${limit}, sortBy=${sortBy}`);
            // First, check if we have at least 2 contacts (minimum needed for duplicates)
            const { count, error: countError } = await supabaseAdmin_1.supabaseAdmin
                .from('contacts')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId)
                .is('is_archived', includeArchived ? null : false);
            if (countError) {
                console.error('[contactService] Error counting contacts:', countError);
                // Continue with fallback approach instead of failing
                console.log('[contactService] Falling back to direct fetch method due to count error');
            }
            if (!count || count < 2) {
                console.log(`[contactService] Insufficient contacts for duplicate detection (found ${count}, need at least 2)`);
                return {
                    success: true,
                    data: {
                        groups: [],
                        pagination: {
                            currentPage: page,
                            totalPages: 0,
                            totalGroups: 0,
                            limit,
                            hasMore: false
                        }
                    }
                };
            }
            console.log(`[contactService] Found ${count} eligible contacts for user, proceeding with duplicate detection`);
            // Use the database function to find potential duplicates
            // We'll gather all contacts and their potential duplicates from the database function
            const duplicateContactsMap = new Map();
            console.log(`[contactService] Executing SQL to find duplicate contacts using database function`);
            // Get all contacts first to have their full details
            const { data: contacts, error: contactsError } = await supabaseAdmin_1.supabaseAdmin
                .from('contacts')
                .select('*')
                .eq('user_id', userId)
                .is('is_archived', includeArchived ? null : false);
            if (contactsError) {
                console.error('[contactService] Error fetching contacts:', contactsError);
                return this.createError('DATABASE_ERROR', `Error fetching contacts: ${contactsError.message}`, { error: contactsError });
            }
            if (!contacts || contacts.length === 0) {
                // Should not happen since we already checked the count, but handle it anyway
                console.log('[contactService] No contacts found for user despite positive count');
                return {
                    success: true,
                    data: {
                        groups: [],
                        pagination: {
                            currentPage: page,
                            totalPages: 0,
                            totalGroups: 0,
                            limit,
                            hasMore: false
                        }
                    }
                };
            }
            console.log(`[contactService] Found ${contacts.length} contacts for user`);
            // Create a map of contacts by ID for quick lookup
            const contactsById = new Map();
            for (const contact of contacts) {
                contactsById.set(contact.contact_id, contact);
            }
            // Calculate pagination offset for database function
            const offset = (page - 1) * limit;
            // Call the optimized database function for finding duplicates
            console.log(`[contactService] Calling find_all_duplicate_contacts with userId=${userId}, includeArchived=${includeArchived}, limit=${limit}, offset=${offset}`);
            const { data: potentialDuplicates, error: duplicatesError } = await supabaseAdmin_1.supabaseAdmin
                .rpc('find_all_duplicate_contacts', {
                p_user_id: userId,
                p_include_archived: includeArchived,
                p_limit: limit * 5, // Fetch more to ensure we have enough for grouping
                p_offset: offset
            });
            if (duplicatesError) {
                console.error('[contactService] Error executing find_all_duplicate_contacts function:', duplicatesError);
                return this.createError('DATABASE_ERROR', `Error finding duplicate contacts: ${duplicatesError.message}`, { error: duplicatesError });
            }
            console.log(`[contactService] Database function returned ${potentialDuplicates?.length || 0} potential duplicate matches`);
            if (!potentialDuplicates || potentialDuplicates.length === 0) {
                // No duplicates found
                console.log('[contactService] No duplicates found by database function');
                return {
                    success: true,
                    data: {
                        groups: [],
                        pagination: {
                            currentPage: page,
                            totalPages: 0,
                            totalGroups: 0,
                            limit,
                            hasMore: false
                        }
                    }
                };
            }
            // Process the results from the database function
            // The function returns pairs of duplicate contacts with source_contact_id, duplicate_contact_id, confidence, and match_reasons
            if (potentialDuplicates && potentialDuplicates.length > 0) {
                console.log(`[contactService] Processing ${potentialDuplicates.length} potential duplicate matches`);
                // Group the duplicates by source contact
                for (const duplicate of potentialDuplicates) {
                    // Skip if we can't find either contact
                    if (!duplicate.source_contact_id || !duplicate.duplicate_contact_id ||
                        !contactsById.has(duplicate.source_contact_id) ||
                        !contactsById.has(duplicate.duplicate_contact_id)) {
                        continue;
                    }
                    // Get the source contact
                    const sourceContact = contactsById.get(duplicate.source_contact_id);
                    if (!sourceContact) {
                        continue; // Skip if we can't find the source contact
                    }
                    // Get the duplicate contact
                    const duplicateContact = contactsById.get(duplicate.duplicate_contact_id);
                    if (!duplicateContact) {
                        continue; // Skip if we can't find the duplicate contact
                    }
                    // Get existing entry or create a new one for the source contact
                    let contactEntry = duplicateContactsMap.get(duplicate.source_contact_id);
                    if (!contactEntry) {
                        contactEntry = {
                            contact: sourceContact,
                            duplicates: []
                        };
                        duplicateContactsMap.set(duplicate.source_contact_id, contactEntry);
                    }
                    // Add the duplicate to the entry with the confidence and match reasons directly from the database
                    contactEntry.duplicates.push({
                        contact: duplicateContact,
                        confidence: duplicate.confidence,
                        matchReason: duplicate.match_reasons || ['Match found']
                    });
                }
            }
            // Convert the map to an array for processing
            const allResults = Array.from(duplicateContactsMap.values());
            console.log(`[contactService] Processed ${allResults.length} duplicate groups`);
            // Sort the duplicates within each group by confidence
            for (const result of allResults) {
                result.duplicates.sort((a, b) => b.confidence - a.confidence);
            }
            // Sort the entire result set based on the requested sort parameter
            const sortedResults = [...allResults].sort((a, b) => {
                let aName, bName;
                let aEmail, bEmail;
                let aMaxConfidence, bMaxConfidence;
                switch (sortBy) {
                    case 'name':
                        aName = `${a.contact.first_name || ''} ${a.contact.last_name || ''}`.trim().toLowerCase();
                        bName = `${b.contact.first_name || ''} ${b.contact.last_name || ''}`.trim().toLowerCase();
                        return aName.localeCompare(bName);
                    case 'email':
                        aEmail = (a.contact.email || '').toLowerCase();
                        bEmail = (b.contact.email || '').toLowerCase();
                        return aEmail.localeCompare(bEmail);
                    case 'confidence':
                    default:
                        // For confidence sorting, use the highest confidence duplicate
                        aMaxConfidence = a.duplicates.length > 0 ? a.duplicates[0].confidence : 0;
                        bMaxConfidence = b.duplicates.length > 0 ? b.duplicates[0].confidence : 0;
                        return bMaxConfidence - aMaxConfidence; // Higher confidence first
                }
            });
            // Calculate pagination values
            const totalGroups = sortedResults.length;
            const totalPages = Math.ceil(totalGroups / limit);
            const validPage = Math.max(1, Math.min(page, totalPages || 1));
            const startIndex = (validPage - 1) * limit;
            const endIndex = Math.min(startIndex + limit, totalGroups);
            // Get the items for this page
            const pageResults = sortedResults.slice(startIndex, endIndex);
            console.log(`[contactService] Duplicate detection complete. Found ${totalGroups} groups with pagination: page ${validPage}/${totalPages}, showing ${pageResults.length} items`);
            return {
                success: true,
                data: {
                    groups: pageResults,
                    pagination: {
                        currentPage: validPage,
                        totalPages,
                        totalGroups,
                        limit,
                        hasMore: validPage < totalPages
                    }
                }
            };
        }
        catch (error) {
            console.error('[contactService] Error finding duplicate contacts:', error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || 'No stack trace available'}` : error);
            return this.createError('UNEXPECTED_ERROR', error instanceof Error ? error.message : 'Unknown error during duplicate contact detection', { error });
        }
    }
    /**
     * Finds contacts based on birthday criteria.
     * @param userId The authenticated user ID.
     * @param birthdayArgs Arguments for the birthday query.
     * @param localTimeZone The user's local timezone string (e.g., 'America/New_York').
     * @returns Operation result with contacts matching birthday criteria.
     */
    async findContactsByBirthday(userId, birthdayArgs, localTimeZone) {
        const reqId = `contactService-findByBirthday-${Date.now()}`;
        console.log(`[${reqId}][contactService] findContactsByBirthday called for userId=${userId}, args=`, birthdayArgs, `tz=${localTimeZone || 'N/A'}`);
        if (!userId) {
            return this.createError('MISSING_USER_ID', 'User ID is required for birthday queries.');
        }
        if (!birthdayArgs || !birthdayArgs.birthday_query_type) {
            return this.createError('INVALID_ARGUMENTS', 'birthday_query_type is required.');
        }
        try {
            // Get a safely validated timezone string
            const validTimeZone = (0, dateTimeUtils_1.getSafeTimezone)(localTimeZone, `[${reqId}][contactService]`);
            // We pass validTimeZone to other utility functions that need it instead of using todayInLocalTz directly
            console.log(`[${reqId}][contactService] Processing birthday query type '${birthdayArgs.birthday_query_type}' in timezone ${validTimeZone}`);
            // Build the database query
            let query = supabaseAdmin_1.supabaseAdmin.from('contacts')
                .select('*') // Select all fields as per the Contact type from domain
                .eq('user_id', userId)
                .not('birthday', 'is', null);
            switch (birthdayArgs.birthday_query_type) {
                case 'upcoming':
                    // JS filtering for 'upcoming' will be done post-fetch
                    // The query itself doesn't need specific date filters here for upcoming, it fetches all with birthdays.
                    break;
                case 'on_date':
                    if (birthdayArgs.date_range_start) {
                        // Assuming date_range_start is YYYY-MM-DD. We need to find birthdays on this MM-DD in any year.
                        const [, month, day] = birthdayArgs.date_range_start.split('-').map(Number); // Ignore year part
                        // Supabase stores dates as 'YYYY-MM-DD'. The `like` query is good for MM-DD matching across years.
                        query = query.filter('birthday', 'like', `%-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
                    }
                    else {
                        return this.createError('INVALID_ARGUMENTS', "date_range_start is required for 'on_date' birthday query.");
                    }
                    break;
                case 'in_month':
                    if (birthdayArgs.month) {
                        query = query.filter('birthday', 'like', `%-${String(birthdayArgs.month).padStart(2, '0')}-%`);
                    }
                    else {
                        return this.createError('INVALID_ARGUMENTS', "month is required for 'in_month' birthday query.");
                    }
                    break;
                case 'in_range':
                    if (birthdayArgs.date_range_start && birthdayArgs.date_range_end) {
                        query = query.gte('birthday', birthdayArgs.date_range_start).lte('birthday', birthdayArgs.date_range_end);
                    }
                    else {
                        return this.createError('INVALID_ARGUMENTS', "date_range_start and date_range_end are required for 'in_range' birthday query.");
                    }
                    break;
                default:
                    return this.createError('INVALID_ARGUMENTS', `Unsupported birthday_query_type: ${birthdayArgs.birthday_query_type}`);
            }
            // Corrected usage for typed Supabase results
            const { data, error } = await query;
            const contacts = data;
            if (error) {
                console.error(`[${reqId}][contactService] Supabase error fetching birthdays:`, error);
                return this.createError('DATABASE_ERROR', `Error fetching birthdays: ${error.message}`, { error });
            }
            if (!contacts) {
                return { success: true, data: [] };
            }
            let processedContacts = contacts;
            if (birthdayArgs.birthday_query_type === 'upcoming') {
                // Calculate upcoming days - from explicit range or use configured default (90 days)
                const config = (0, assistantConfig_1.getAssistantConfig)();
                const upcomingDays = (birthdayArgs.date_range_start && birthdayArgs.date_range_end &&
                    birthdayArgs.date_range_start !== birthdayArgs.date_range_end) ?
                    (new Date(birthdayArgs.date_range_end).getTime() - new Date(birthdayArgs.date_range_start).getTime()) / (1000 * 3600 * 24) :
                    config.upcomingBirthdayDays;
                console.log(`[${reqId}][contactService] Using upcoming days window: ${upcomingDays} (default config: ${config.upcomingBirthdayDays})`);
                // Process contacts using the utility functions
                processedContacts = contacts
                    .map((c) => {
                    if (!c.birthday)
                        return null;
                    // Calculate next birthday for this contact
                    const birthdayCalc = (0, dateTimeUtils_1.calculateNextBirthday)(c.birthday, validTimeZone, reqId);
                    if (!birthdayCalc)
                        return null;
                    // Combine contact with birthday calculation
                    return { ...c, ...birthdayCalc };
                })
                    .filter((c) => c !== null)
                    // Filter contacts whose birthday is within the upcoming days period
                    .filter(c => c.diffDays >= 0 && c.diffDays <= upcomingDays)
                    // Sort by days until birthday (soonest first)
                    .sort((a, b) => a.diffDays - b.diffDays);
                console.log(`[${reqId}][contactService] Found ${processedContacts.length} contacts with upcoming birthdays in the next ${upcomingDays} days`);
            }
            else if (contacts.length > 0) {
                // For other queries, sort contacts by month/day of birthday
                processedContacts = [...contacts]
                    // Filter out contacts without birthdays (should be handled by DB query, but just to be safe)
                    .filter(c => !!c.birthday)
                    // Sort contacts by month and day
                    .sort((a, b) => {
                    if (!a.birthday || !b.birthday)
                        return 0;
                    try {
                        // Calculate birthday data for both contacts
                        const birthdayCalcA = (0, dateTimeUtils_1.calculateNextBirthday)(a.birthday, validTimeZone, reqId);
                        const birthdayCalcB = (0, dateTimeUtils_1.calculateNextBirthday)(b.birthday, validTimeZone, reqId);
                        // If we couldn't calculate either birthday, use string comparison as fallback
                        if (!birthdayCalcA || !birthdayCalcB) {
                            return (a.birthday || '').localeCompare(b.birthday || '');
                        }
                        // Compare birthdays by month, then by day
                        const monthA = birthdayCalcA.birthDate.getMonth();
                        const dayA = birthdayCalcA.birthDate.getDate();
                        const monthB = birthdayCalcB.birthDate.getMonth();
                        const dayB = birthdayCalcB.birthDate.getDate();
                        if (monthA === monthB) {
                            return dayA - dayB;
                        }
                        return monthA - monthB;
                    }
                    catch (sortError) {
                        // Fallback to simple string comparison if there's an error
                        console.warn(`[${reqId}][contactService] Error sorting dates ${a.birthday} and ${b.birthday}:`, sortError instanceof Error ? sortError.message : String(sortError));
                        return (a.birthday || '').localeCompare(b.birthday || '');
                    }
                });
                console.log(`[${reqId}][contactService] Found ${processedContacts.length} contacts with birthday data`);
            }
            return { success: true, data: processedContacts };
        }
        catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            console.error(`[${reqId}][contactService] Error processing birthday query: ${errorMsg}`, e);
            return this.createError('SERVICE_ERROR', `Failed to process birthday query: ${errorMsg}`, {
                error: e,
                timezone: localTimeZone,
                queryType: birthdayArgs.birthday_query_type,
                birthdayArgs: JSON.stringify(birthdayArgs),
                originalStackTrace: e instanceof Error ? e.stack : undefined
            });
        }
    }
    /**
     * Calculate string similarity using Levenshtein distance
     * @param str1 First string
     * @param str2 Second string
     * @returns Similarity score between 0 and 1
     */
    calculateStringSimilarity(str1, str2) {
        if (str1 === str2)
            return 1.0;
        if (str1.length === 0 || str2.length === 0)
            return 0.0;
        const len1 = str1.length;
        const len2 = str2.length;
        // Create distance matrix
        const distanceMatrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
        // Initialize first row and column
        for (let i = 0; i <= len1; i++) {
            distanceMatrix[i][0] = i;
        }
        for (let j = 0; j <= len2; j++) {
            distanceMatrix[0][j] = j;
        }
        // Fill in the rest of the matrix
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                distanceMatrix[i][j] = Math.min(distanceMatrix[i - 1][j] + 1, // deletion
                distanceMatrix[i][j - 1] + 1, // insertion
                distanceMatrix[i - 1][j - 1] + cost // substitution
                );
            }
        }
        // Levenshtein distance
        const distance = distanceMatrix[len1][len2];
        // Convert to similarity score (0-1)
        const maxLength = Math.max(len1, len2);
        return maxLength === 0 ? 1.0 : 1.0 - distance / maxLength;
    }
    /**
     * Normalize phone number for comparison
     * @param phone Phone number to normalize
     * @returns Normalized phone number with only digits
     */
    normalizePhone(phone) {
        // Remove all non-digit characters
        return phone.replace(/\D/g, '');
    }
    /**
     * Resolves a contact using different identifier types
     * @param userId The authenticated user ID
     * @param identifier Type-safe contact identifier (by ID, name, or email)
     * @returns Operation result with contact data or error
     */
    async resolveContact(userId, identifier) {
        try {
            // Input validation
            if (!userId) {
                return this.createError('MISSING_USER_ID', 'User ID is required');
            }
            // Resolve based on identifier type
            if (identifier.type === 'id') {
                // Must be a valid UUID
                if (!(0, utils_1.isValidUUID)(identifier.contact_id)) {
                    return this.createError('INVALID_ID', `Contact ID is not a valid UUID: ${identifier.contact_id}`);
                }
                return await this.getContactById(userId, identifier.contact_id);
            }
            else if (identifier.type === 'name') {
                // Name cannot be empty
                if (!identifier.name.trim()) {
                    return this.createError('INVALID_NAME', 'Contact name cannot be empty');
                }
                return await this.findContactByName(userId, identifier.name);
            }
            else if (identifier.type === 'email') {
                // Email should be provided
                if (!identifier.email.trim()) {
                    return this.createError('INVALID_EMAIL', 'Contact email cannot be empty');
                }
                return await this.findContactByEmail(userId, identifier.email);
            }
            // This should be unreachable with TypeScript's discriminated unions
            return this.createError('INVALID_IDENTIFIER_TYPE', 'Invalid contact identifier type');
        }
        catch (error) {
            // Handle unexpected errors
            return this.createError('RESOLUTION_ERROR', error instanceof Error ? error.message : 'Unknown error during contact resolution', { error });
        }
    }
    /**
     * Deletes a contact with proper error handling
     * @param userId The authenticated user ID
     * @param identifier Type-safe contact identifier
     * @returns Operation result with deleted contact info or error
     */
    async deleteContact(userId, identifier) {
        try {
            // First resolve the contact to ensure it exists and belongs to user
            const resolution = await this.resolveContact(userId, identifier);
            if (!resolution.success || !resolution.data) {
                return {
                    success: false,
                    error: resolution.error || {
                        code: 'CONTACT_NOT_FOUND',
                        message: 'Contact could not be resolved for deletion'
                    }
                };
            }
            const contact = resolution.data;
            const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown';
            // Perform the delete operation
            const { error } = await supabaseAdmin_1.supabaseAdmin
                .from('contacts')
                .delete()
                .eq('contact_id', contact.contact_id)
                .eq('user_id', userId);
            if (error) {
                return this.createError('DELETE_FAILED', `Failed to delete contact: ${error.message}`, { error });
            }
            // Return success with the contact info
            return {
                success: true,
                data: {
                    contact_id: contact.contact_id,
                    name: contactName
                }
            };
        }
        catch (error) {
            return this.createError('UNEXPECTED_ERROR', error instanceof Error ? error.message : 'Unknown error during contact deletion', { error });
        }
    }
    /**
     * Helper method to get a contact by ID
     * @private
     */
    async getContactById(userId, contactId) {
        const { data, error } = await supabaseAdmin_1.supabaseAdmin
            .from('contacts')
            .select('*')
            .eq('contact_id', contactId)
            .eq('user_id', userId)
            .single();
        if (error) {
            return this.createError(error.code === 'PGRST116' ? 'CONTACT_NOT_FOUND' : 'DATABASE_ERROR', error.code === 'PGRST116'
                ? `Contact with ID ${contactId} not found`
                : `Database error: ${error.message}`, { error });
        }
        return {
            success: true,
            data: data
        };
    }
    /**
     * Helper method to find a contact by name
     * @private
     */
    async findContactByName(userId, name) {
        // Extract first name for better matching
        const firstName = name.split(' ')[0];
        const { data, error } = await supabaseAdmin_1.supabaseAdmin
            .from('contacts')
            .select('*')
            .eq('user_id', userId)
            .ilike('first_name', `%${firstName}%`)
            .order('created_at', { ascending: false })
            .limit(5);
        if (error) {
            return this.createError('DATABASE_ERROR', `Error searching for contact by name: ${error.message}`, { error });
        }
        if (!data || data.length === 0) {
            return this.createError('CONTACT_NOT_FOUND', `No contacts found matching name "${name}"`);
        }
        // If multiple contacts match, use the most recently created one
        // This is a simple heuristic - in a real system, you might want
        // to implement more sophisticated matching or ask for clarification
        return {
            success: true,
            data: data[0]
        };
    }
    /**
     * Helper method to find a contact by email
     * @private
     */
    async findContactByEmail(userId, email) {
        const { data, error } = await supabaseAdmin_1.supabaseAdmin
            .from('contacts')
            .select('*')
            .eq('user_id', userId)
            .ilike('email', email)
            .single();
        if (error) {
            return this.createError(error.code === 'PGRST116' ? 'CONTACT_NOT_FOUND' : 'DATABASE_ERROR', error.code === 'PGRST116'
                ? `Contact with email ${email} not found`
                : `Database error: ${error.message}`, { error });
        }
        return {
            success: true,
            data: data
        };
    }
    /**
     * Helper to create error results with a consistent structure
     * @private
     */
    createError(code, message, details) {
        const error = {
            code,
            message
        };
        if (details !== undefined) {
            error.details = details;
        }
        return {
            success: false,
            error
        };
    }
}
exports.ContactService = ContactService;
// Export a singleton instance
exports.contactService = new ContactService();
//# sourceMappingURL=contactService.js.map