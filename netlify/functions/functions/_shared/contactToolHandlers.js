"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCreateContact = handleCreateContact;
exports.handleUpdateContact = handleUpdateContact;
exports.createUpdateContactArgs = createUpdateContactArgs;
exports.handleFindContacts = handleFindContacts;
const node_fetch_1 = __importDefault(require("node-fetch"));
// Assuming AssistantConfig is a known type, if not, it might need to be defined or imported from its actual location
// For now, let's use a placeholder if its exact definition isn't critical for the structure.
// import type { AssistantConfig } from '@services/assistantConfig'; // Path might vary
// For the purpose of this edit, we'll assume AssistantConfig is available or use `any` if strictly needed for structure.
// Let's assume AssistantConfig is correctly typed and imported where `executeSingleToolCall` can access it.
const contacts_1 = require("../contacts"); // Adjusted path
/**
 * Handles the 'create_contact' tool call.
 * @param args - The parsed arguments for the create_contact tool.
 * @param userId - The ID of the user performing the action.
 * @param internalApiBaseUrl - The base URL for internal API calls.
 * @param internalHeaders - Headers for internal API calls.
 * @param reqId - Request ID for logging.
 * @returns A promise that resolves to a JSON string representing the tool result.
 */
async function handleCreateContact(args, userId, internalApiBaseUrl, internalHeaders, reqId) {
    const currentReqId = reqId || `handleCreateContact_${Date.now()}`;
    console.log(`[${currentReqId}][handleCreateContact] Executing with args:`, args);
    if (!userId) {
        console.error(`[${currentReqId}][handleCreateContact] User ID is required.`);
        return JSON.stringify({
            success: false,
            error: "AuthenticationError",
            message: "User ID is required to create a contact.",
        });
    }
    if (!args.first_name) {
        console.error(`[${currentReqId}][handleCreateContact] Create contact failed: first_name is required.`);
        return JSON.stringify({
            success: false,
            error: "MissingParameter",
            message: "Cannot create contact: First name is a required field.",
        });
    }
    const apiUrl = `${internalApiBaseUrl}/.netlify/functions/contacts-api`;
    console.log(`[${currentReqId}][handleCreateContact] Calling internal contacts-api (POST) at: ${apiUrl}`);
    try {
        const response = await (0, node_fetch_1.default)(apiUrl, {
            method: 'POST',
            headers: internalHeaders,
            body: JSON.stringify({ ...args, user_id: userId }),
        });
        const responseBody = await response.text();
        if (!response.ok) {
            console.error(`[${currentReqId}][handleCreateContact] Error from internal API call: ${response.status} ${response.statusText}`, responseBody);
            let errorDetail = { message: `API error: ${response.statusText}` };
            try {
                const parsedError = JSON.parse(responseBody);
                if (parsedError && typeof parsedError.message === 'string') {
                    errorDetail = parsedError;
                }
            }
            catch (parseError) {
                console.error(`[${currentReqId}][handleCreateContact] Failed to parse error response:`, parseError);
            }
            return JSON.stringify({
                success: false,
                error: `APIError_${response.status}`,
                message: errorDetail.message || `Failed to create contact. API responded with ${response.status}.`,
                details: responseBody
            });
        }
        else {
            const createdContact = JSON.parse(responseBody);
            console.log(`[${currentReqId}][handleCreateContact] Successfully created contact:`, createdContact);
            return JSON.stringify({
                success: true,
                message: `Contact "${createdContact.first_name} ${createdContact.last_name || ''}" created successfully.`,
                contact: createdContact
            });
        }
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[${currentReqId}][handleCreateContact] Unexpected error:`, error);
        return JSON.stringify({
            success: false,
            error: "UnexpectedError",
            message: `An unexpected error occurred while creating the contact: ${errorMsg}`
        });
    }
}
/**
 * Handles the 'update_contact' tool call.
 * @param args - The parsed arguments for the update_contact tool.
 * @param userId - The ID of the user performing the action. // Though not directly used if API handles user context
 * @param internalApiBaseUrl - The base URL for internal API calls.
 * @param internalHeaders - Headers for internal API calls.
 * @param reqId - Request ID for logging.
 * @returns A promise that resolves to a JSON string representing the tool result.
 */
async function handleUpdateContact(args, userId, // Keep for consistency, even if API infers user from JWT
internalApiBaseUrl, internalHeaders, reqId) {
    const currentReqId = reqId || `handleUpdateContact_${Date.now()}`;
    console.log(`[${currentReqId}][handleUpdateContact] Executing with args:`, args);
    // The UUID check is part of UpdateContactToolArgs type guard, so args.contact_id is a valid UUID here.
    const apiUrl = `${internalApiBaseUrl}/.netlify/functions/contacts-api/${args.contact_id}`;
    console.log(`[${currentReqId}][handleUpdateContact] Calling internal contacts-api (PUT) at: ${apiUrl}`);
    // Construct payload. The user_id will be injected by the contacts-api based on the JWT token.
    // The API should handle not attempting to update contact_id itself from the payload.
    const payload = { ...args };
    try {
        const response = await (0, node_fetch_1.default)(apiUrl, {
            method: 'PUT',
            headers: internalHeaders,
            body: JSON.stringify(payload),
        });
        const responseBody = await response.text();
        if (!response.ok) {
            console.error(`[${currentReqId}][handleUpdateContact] Error from internal API call: ${response.status} ${response.statusText}`, responseBody);
            let errorDetail = { message: `API error: ${response.statusText}` };
            try {
                const parsedError = JSON.parse(responseBody);
                if (parsedError && typeof parsedError.message === 'string') {
                    errorDetail = parsedError;
                }
            }
            catch (parseError) {
                console.error(`[${currentReqId}][handleUpdateContact] Failed to parse error response:`, parseError);
            }
            // Special handling for 404 Not Found errors
            if (response.status === 404) {
                console.error(`[${currentReqId}][handleUpdateContact] Contact not found with ID: ${args.contact_id}`);
                return JSON.stringify({
                    success: false,
                    error: `APIError_404`,
                    message: `Contact not found. The contact may have been deleted or the ID (${args.contact_id}) is incorrect.`
                });
            }
            return JSON.stringify({
                success: false,
                error: `APIError_${response.status}`,
                message: errorDetail.message || `Failed to update contact. API responded with ${response.status}.`,
                details: responseBody
            });
        }
        else {
            const updatedContact = JSON.parse(responseBody);
            console.log(`[${currentReqId}][handleUpdateContact] Successfully updated contact:`, updatedContact);
            return JSON.stringify({
                success: true,
                message: `Contact "${updatedContact.first_name} ${updatedContact.last_name || ''}" updated successfully.`,
                contact: updatedContact
            });
        }
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[${currentReqId}][handleUpdateContact] Unexpected error:`, error);
        return JSON.stringify({
            success: false,
            error: "UnexpectedError",
            message: `An unexpected error occurred while updating the contact: ${errorMsg}`
        });
    }
}
function createUpdateContactArgs(contactId, currentContact, fieldsToUpdate) {
    const updatedArgs = { contact_id: contactId };
    const updatableKeys = [
        'first_name', 'middle_name', 'last_name', 'nickname', 'email', 'phone',
        'company', 'job_title', 'address', 'website', 'birthday', 'notes'
    ];
    for (const key of updatableKeys) {
        let valueToSet = undefined;
        if (Object.prototype.hasOwnProperty.call(fieldsToUpdate, key)) {
            valueToSet = fieldsToUpdate[key]; // string | null
        }
        else if (Object.prototype.hasOwnProperty.call(currentContact, key)) {
            const currentValue = currentContact[key];
            valueToSet = currentValue; // string | null | undefined (from ContactData which uses BaseContactDetails)
        }
        // Assign to updatedArgs, ensuring type compatibility
        if (key === 'first_name') {
            // first_name in UpdateContactToolArgs is string | undefined.
            // If valueToSet is null, it must become undefined.
            updatedArgs[key] = (valueToSet === null) ? undefined : valueToSet;
        }
        else {
            // Other keys in UpdateContactToolArgs are string | null | undefined.
            // valueToSet (string | null | undefined) can be assigned directly.
            updatedArgs[key] = valueToSet;
        }
    }
    return updatedArgs;
}
/**
 * Handles the 'find_contacts' tool call.
 * @param args - The parsed arguments for the find_contacts tool.
 * @param userId - The ID of the user performing the action.
 * @param context - Context object containing necessary dependencies and configurations.
 * @param reqId - Request ID for logging (optional, as logPrefix is in context).
 * @returns A promise that resolves to a JSON string representing the tool result.
 */
async function handleFindContacts(args, userId, context) {
    const { supabaseAdmin, internalApiBaseUrl, internalHeaders, config, currentUserEmail, logPrefix } = context;
    const { contactSummaryThreshold } = config;
    if (args.birthday_query_type) {
        console.log(`${logPrefix} Processing birthday query: ${args.birthday_query_type}`);
        if (!userId) {
            return JSON.stringify({ success: false, error: "AuthenticationError", message: "User ID is required for birthday queries." });
        }
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            let query = supabaseAdmin.from('contacts')
                .select('contact_id, user_id, created_at, updated_at, first_name, middle_name, last_name, nickname, email, phone, company, job_title, address, website, birthday, notes, google_contact_id, import_source, import_batch_id, imported_at, normalized_phone, street_address, street_address_2, city, state_province, postal_code, country, department, mobile_phone, work_phone, social_linkedin, social_twitter, tags, preferred_contact_method, timezone, language, formatted_address')
                .eq('user_id', userId)
                .not('birthday', 'is', null);
            switch (args.birthday_query_type) {
                case 'upcoming': {
                    const upcomingDays = (args.date_range_start && args.date_range_end &&
                        args.date_range_start !== args.date_range_end) ?
                        (new Date(args.date_range_end).getTime() - new Date(args.date_range_start).getTime()) / (1000 * 3600 * 24) :
                        config.upcomingBirthdayDays;
                    console.log(`${logPrefix} Using upcoming birthday window of ${upcomingDays} days (default from config: ${config.upcomingBirthdayDays})`);
                    // Filtering logic for 'upcoming' will be applied after fetching
                    break;
                }
                case 'on_date':
                    if (args.date_range_start) {
                        const targetDate = new Date(args.date_range_start + 'T00:00:00');
                        const month = targetDate.getMonth() + 1;
                        const day = targetDate.getDate();
                        query = query.filter('birthday', 'like', `%-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
                    }
                    else {
                        throw new Error("date_range_start is required for 'on_date' birthday query.");
                    }
                    break;
                case 'in_month':
                    if (args.month) {
                        query = query.filter('birthday', 'like', `%-${String(args.month).padStart(2, '0')}-%`);
                    }
                    else {
                        throw new Error("month is required for 'in_month' birthday query.");
                    }
                    break;
                case 'in_range':
                    if (args.date_range_start && args.date_range_end) {
                        query = query.gte('birthday', args.date_range_start).lte('birthday', args.date_range_end);
                    }
                    else {
                        throw new Error("date_range_start and date_range_end are required for 'in_range' birthday query.");
                    }
                    break;
                default:
                    throw new Error(`Unsupported birthday_query_type: ${args.birthday_query_type}`);
            }
            const { data: contacts, error } = await query.returns();
            if (error) {
                console.error(`${logPrefix} Supabase error fetching birthdays:`, error);
                throw error;
            }
            let processedContacts = contacts || [];
            if (args.birthday_query_type === 'upcoming') {
                const upcomingDays = (args.date_range_start && args.date_range_end &&
                    args.date_range_start !== args.date_range_end) ?
                    (new Date(args.date_range_end).getTime() - new Date(args.date_range_start).getTime()) / (1000 * 3600 * 24) :
                    config.upcomingBirthdayDays;
                processedContacts = (contacts || [])
                    .map((c) => {
                    if (!c.birthday)
                        return null;
                    const birthDate = new Date(c.birthday + 'T00:00:00');
                    return { ...c, birthDate };
                })
                    .filter((c) => c !== null)
                    .map((c) => {
                    const birthDate = c.birthDate;
                    const nextBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());
                    if (nextBirthday < today) {
                        nextBirthday.setFullYear(today.getFullYear() + 1);
                    }
                    const diffTime = nextBirthday.getTime() - today.getTime();
                    const diffDays = diffTime / (1000 * 3600 * 24);
                    return { ...c, diffDays, nextBirthday };
                })
                    .filter((c) => c.diffDays >= 0 && c.diffDays <= upcomingDays)
                    .sort((a, b) => a.diffDays - b.diffDays);
            }
            else if (contacts && contacts.length > 0) {
                processedContacts = [...contacts].sort((a, b) => {
                    if (!a.birthday || !b.birthday)
                        return 0;
                    const dateA = new Date(a.birthday + 'T00:00:00');
                    const dateB = new Date(b.birthday + 'T00:00:00');
                    if (dateA.getMonth() === dateB.getMonth()) {
                        return dateA.getDate() - dateB.getDate();
                    }
                    return dateA.getMonth() - dateB.getMonth();
                });
            }
            if (processedContacts.length === 0) {
                return JSON.stringify({ success: true, message: "No contacts found with matching birthdays for your criteria.", contacts: [] });
            }
            else {
                const displayContacts = processedContacts.map((c) => {
                    return {
                        ...c,
                        name: (0, contacts_1.generateDisplayName)(c),
                        days_until_birthday: args.birthday_query_type === 'upcoming' && c.diffDays !== undefined ? Math.round(c.diffDays) : undefined
                    };
                });
                return JSON.stringify({
                    success: true,
                    message: `Found ${displayContacts.length} contact(s) with birthdays matching your criteria.`,
                    contacts: displayContacts
                });
            }
        }
        catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            console.error(`${logPrefix} Error processing birthday query: ${errorMsg}`);
            return JSON.stringify({ success: false, error: "BirthdayQueryError", message: `Failed to process birthday query: ${errorMsg}` });
        }
    }
    // Logic for search_term or contact_id
    const displayLimit = args.max_results ? Math.min(args.max_results, config.maxContactResults) : contactSummaryThreshold;
    console.log(`${logPrefix} Using display limit: ${displayLimit} (max_results: ${args.max_results || 'not provided'}, configured threshold: ${contactSummaryThreshold})`);
    let response;
    let responseBody;
    if ((args.search_term || (args.job_title_keywords && args.job_title_keywords.length > 0)) && !args.contact_id) {
        const apiUrl = `${internalApiBaseUrl}/.netlify/functions/contacts-search`;
        const requestBody = {
            query: args.search_term,
            limit: 50, // Fetch more initially, then slice to displayLimit
            offset: 0,
            currentUserEmail: currentUserEmail,
            job_title_keywords: args.job_title_keywords,
        };
        const jobTitleKeywordsLog = args.job_title_keywords && args.job_title_keywords.length > 0
            ? args.job_title_keywords.join(', ')
            : 'none';
        console.log(`${logPrefix} Using optimized search. Term: "${args.search_term || 'N/A'}", Job Title Keywords: "${jobTitleKeywordsLog}", User: ${currentUserEmail || 'N/A'}`);
        console.log(`${logPrefix} Making API call to: ${apiUrl} with method: POST`);
        response = await (0, node_fetch_1.default)(apiUrl, {
            method: 'POST',
            headers: {
                ...internalHeaders,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        responseBody = await response.text();
        if (response.ok) {
            const searchResponse = JSON.parse(responseBody);
            const { contacts: searchResults, total } = searchResponse;
            let messagePrefix = "";
            if (args.search_term && args.job_title_keywords && args.job_title_keywords.length > 0) {
                messagePrefix = `Searching for "${args.search_term}" and job titles like "${args.job_title_keywords.join('", "')}"`;
            }
            else if (args.search_term) {
                messagePrefix = `Searching for "${args.search_term}"`;
            }
            else if (args.job_title_keywords && args.job_title_keywords.length > 0) {
                messagePrefix = `Searching for job titles like "${args.job_title_keywords.join('", "')}"`;
            }
            if (searchResults.length === 0) {
                const noResultsMessage = `${messagePrefix}${messagePrefix ? ": N" : "N"}o exact contacts found.`;
                return JSON.stringify({
                    success: true,
                    message: noResultsMessage,
                    contacts: [],
                    summary: { totalFound: 0, displaying: 0, searchPerformed: args.search_term || (args.job_title_keywords ? args.job_title_keywords.join(',') : null) || "criteria_search", jobTitleKeywordsUsed: args.job_title_keywords }
                });
            }
            else if (searchResults.length > displayLimit) { // Changed from contactSummaryThreshold to displayLimit
                const summaryMessage = `${messagePrefix}${messagePrefix ? ": F" : "F"}ound ${searchResults.length} exact contact(s). Displaying the first ${displayLimit}. (Total related: ${total})`;
                return JSON.stringify({
                    success: true,
                    message: summaryMessage,
                    contacts: searchResults.slice(0, displayLimit),
                    summary: { totalExactFound: searchResults.length, totalRelatedFound: total, displaying: displayLimit, searchPerformed: args.search_term || (args.job_title_keywords ? args.job_title_keywords.join(',') : null) || "criteria_search", jobTitleKeywordsUsed: args.job_title_keywords }
                });
            }
            else {
                let message;
                if (searchResults.length === 1) {
                    message = `${messagePrefix}${messagePrefix ? ": H" : "H"}ere is the contact found:`;
                }
                else {
                    message = `${messagePrefix}${messagePrefix ? ": F" : "F"}ound ${searchResults.length} exact contacts.`;
                }
                return JSON.stringify({
                    success: true,
                    message: message,
                    contacts: searchResults,
                    summary: { totalExactFound: searchResults.length, totalRelatedFound: total, displaying: searchResults.length, searchPerformed: args.search_term || (args.job_title_keywords ? args.job_title_keywords.join(',') : null) || "criteria_search", jobTitleKeywordsUsed: args.job_title_keywords }
                });
            }
        }
        else {
            console.error(`${logPrefix} Error from internal contacts-search call: ${response.status} ${response.statusText}`, responseBody);
            let errorDetail = { message: `API error: ${response.statusText}` };
            try {
                const parsedError = JSON.parse(responseBody);
                if (parsedError && typeof parsedError.message === 'string') {
                    errorDetail = parsedError;
                }
            }
            catch { /* Do nothing */ }
            return JSON.stringify({
                success: false,
                error: `APIError_contacts-search_${response.status}`,
                message: errorDetail.message || `Failed to find contacts via contacts-search. API responded with ${response.status}.`,
                details: responseBody.substring(0, 500)
            });
        }
    }
    else {
        // Regular contacts-api for specific ID or listing all
        let apiUrlRegular = `${internalApiBaseUrl}/.netlify/functions/contacts-api`;
        const queryParamsRegular = new URLSearchParams();
        if (args.contact_id) { // isValidUUID is assumed to be checked by type guard on args
            apiUrlRegular += `/${args.contact_id}`;
            console.log(`${logPrefix} Finding contact by specific ID: ${args.contact_id}`);
        }
        else {
            console.log(`${logPrefix} No specific ID, search term, or job title keywords. Listing all contacts (or up to limit).`);
            // Potentially add limit for listing all, e.g., queryParamsRegular.set('limit', String(displayLimit));
        }
        const queryStringRegular = queryParamsRegular.toString();
        if (queryStringRegular) {
            apiUrlRegular += `?${queryStringRegular}`;
        }
        response = await (0, node_fetch_1.default)(apiUrlRegular, { method: 'GET', headers: internalHeaders });
        responseBody = await response.text();
        if (!response.ok) {
            console.error(`${logPrefix} Error from internal contacts-api call: ${response.status} ${response.statusText}`, responseBody);
            // ... (error handling as before) ...
            return JSON.stringify({ success: false, error: `APIError_${response.status}`, message: `Failed to find contacts. API responded with ${response.status}.`, details: responseBody });
        }
        else {
            const parsedData = JSON.parse(responseBody);
            const contacts = Array.isArray(parsedData) ? parsedData : (parsedData ? [parsedData] : []);
            if (contacts.length === 0) {
                return JSON.stringify({ success: true, message: "No contacts found.", contacts: [] });
            }
            else if (contacts.length > displayLimit && !args.contact_id) { // Only summarize if not fetching specific ID
                return JSON.stringify({
                    success: true,
                    message: `Found ${contacts.length} contacts. Displaying the first ${displayLimit} as a summary.`,
                    contacts: contacts.slice(0, displayLimit),
                    summary: { totalFound: contacts.length, displaying: displayLimit }
                });
            }
            else {
                return JSON.stringify({ success: true, contacts });
            }
        }
    }
}
// Add other handlers here (handleFindContacts, etc.) // This comment will be outdated 
//# sourceMappingURL=contactToolHandlers.js.map