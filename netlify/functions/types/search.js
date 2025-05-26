"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchMatchType = void 0;
exports.isRankedContact = isRankedContact;
exports.determineMatchType = determineMatchType;
exports.groupContactsByMatchType = groupContactsByMatchType;
exports.prioritizeContactsByMatchType = prioritizeContactsByMatchType;
/**
 * Type guard to check if a contact has a match score
 */
function isRankedContact(contact) {
    return 'match_score' in contact;
}
/**
 * Enum for search match types to improve type safety
 */
var SearchMatchType;
(function (SearchMatchType) {
    SearchMatchType["EXACT_FULL_NAME"] = "EXACT_FULL_NAME";
    SearchMatchType["EXACT_FIRST_NAME"] = "EXACT_FIRST_NAME";
    SearchMatchType["EXACT_LAST_NAME"] = "EXACT_LAST_NAME";
    SearchMatchType["PARTIAL_NAME"] = "PARTIAL_NAME";
    SearchMatchType["CONTACT_INFO"] = "CONTACT_INFO";
    SearchMatchType["COMPANY_INFO"] = "COMPANY_INFO";
    SearchMatchType["GENERAL_INFO"] = "GENERAL_INFO";
    SearchMatchType["NO_MATCH"] = "NO_MATCH";
})(SearchMatchType || (exports.SearchMatchType = SearchMatchType = {}));
/**
 * Function to determine the match type between a contact and a query string
 */
function determineMatchType(contact, query) {
    if (!query)
        return SearchMatchType.NO_MATCH;
    const cleanQuery = query.trim().toLowerCase();
    const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim().toLowerCase();
    if (fullName === cleanQuery) {
        return SearchMatchType.EXACT_FULL_NAME;
    }
    if (contact.first_name?.toLowerCase() === cleanQuery) {
        return SearchMatchType.EXACT_FIRST_NAME;
    }
    if (contact.last_name?.toLowerCase() === cleanQuery) {
        return SearchMatchType.EXACT_LAST_NAME;
    }
    if (fullName.includes(cleanQuery) ||
        (contact.first_name?.toLowerCase().includes(cleanQuery)) ||
        (contact.last_name?.toLowerCase().includes(cleanQuery))) {
        return SearchMatchType.PARTIAL_NAME;
    }
    if ((contact.email?.toLowerCase().includes(cleanQuery)) ||
        (contact.phone?.includes(cleanQuery))) {
        return SearchMatchType.CONTACT_INFO;
    }
    if ((contact.company?.toLowerCase().includes(cleanQuery)) ||
        (contact.job_title?.toLowerCase().includes(cleanQuery))) {
        return SearchMatchType.COMPANY_INFO;
    }
    // Check address fields
    if ((contact.formatted_address?.toLowerCase().includes(cleanQuery)) ||
        (contact.street_address?.toLowerCase().includes(cleanQuery)) ||
        (contact.street_address_2?.toLowerCase().includes(cleanQuery)) ||
        (contact.city?.toLowerCase().includes(cleanQuery)) ||
        (contact.state_province?.toLowerCase().includes(cleanQuery)) ||
        (contact.postal_code?.toLowerCase().includes(cleanQuery)) ||
        (contact.country?.toLowerCase().includes(cleanQuery)) ||
        (contact.notes?.toLowerCase().includes(cleanQuery))) {
        return SearchMatchType.GENERAL_INFO;
    }
    return SearchMatchType.NO_MATCH;
}
/**
 * Groups contacts by their match type relative to a search query
 */
function groupContactsByMatchType(contacts, query) {
    const contactsByMatchType = new Map();
    // Initialize all match type groups
    Object.values(SearchMatchType).forEach(matchType => {
        contactsByMatchType.set(matchType, []);
    });
    // Categorize each contact by match type
    contacts.forEach(contact => {
        const matchType = determineMatchType(contact, query);
        const matchGroup = contactsByMatchType.get(matchType) || [];
        matchGroup.push(contact);
        contactsByMatchType.set(matchType, matchGroup);
    });
    return contactsByMatchType;
}
/**
 * Prioritizes contacts based on match type relative to a search query
 * Returns a new array with contacts ordered by match type priority
 */
function prioritizeContactsByMatchType(contacts, query) {
    if (!query.trim() || contacts.length <= 1)
        return [...contacts];
    const contactsByMatchType = groupContactsByMatchType(contacts, query);
    // Build prioritized array based on match type order
    const prioritized = [];
    // Order by match type priority
    const priorityOrder = [
        SearchMatchType.EXACT_FULL_NAME,
        SearchMatchType.EXACT_FIRST_NAME,
        SearchMatchType.EXACT_LAST_NAME,
        SearchMatchType.PARTIAL_NAME,
        SearchMatchType.CONTACT_INFO,
        SearchMatchType.COMPANY_INFO,
        SearchMatchType.GENERAL_INFO,
        SearchMatchType.NO_MATCH
    ];
    // Add contacts in priority order
    priorityOrder.forEach(matchType => {
        const matchesForType = contactsByMatchType.get(matchType) || [];
        prioritized.push(...matchesForType);
    });
    return prioritized;
}
//# sourceMappingURL=search.js.map