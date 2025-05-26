"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const services_1 = require("../services");
const uuid_1 = require("uuid");
const COMMON_HEADERS = { 'Content-Type': 'application/json' };
// Error codes for all operations
var ErrorCode;
(function (ErrorCode) {
    ErrorCode["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ErrorCode["DUPLICATE_SKIPPED"] = "DUPLICATE_SKIPPED";
    ErrorCode["DATABASE_ERROR"] = "DATABASE_ERROR";
    ErrorCode["UNEXPECTED_ERROR"] = "UNEXPECTED_ERROR";
    ErrorCode["AUTHENTICATION_ERROR"] = "AUTHENTICATION_ERROR";
    ErrorCode["BAD_REQUEST"] = "BAD_REQUEST";
})(ErrorCode || (ErrorCode = {}));
// type UnifiedBatchResponse = StandardBatchResponse | BulkImportResponse;
// Helper function to get authenticated user ID with both auth methods
const getAuthenticatedUserId = async (event, context) => {
    // Try clientContext first (Netlify Identity)
    if (context?.clientContext?.user?.sub) {
        return context.clientContext.user.sub;
    }
    // Try Authorization header (Supabase token)
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader)
        return null;
    if (authHeader.startsWith('Bearer ')) {
        try {
            // Try Supabase token first
            const token = authHeader.replace('Bearer ', '');
            const { data: { user }, error } = await services_1.supabaseAdmin.auth.getUser(token);
            if (!error && user)
                return user.id;
            // Fallback to JWT parsing for other tokens
            const parts = token.split('.');
            if (parts.length === 3) {
                const payloadBase64 = parts[1];
                const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
                const payload = JSON.parse(payloadJson);
                return payload.sub || null;
            }
        }
        catch (error) {
            console.error("[authHelper] Error parsing token:", error);
        }
    }
    return null;
};
// Contact validation function
const validateContact = (contact) => {
    const errors = [];
    if (!contact.first_name && !contact.last_name) {
        errors.push('Contact must have at least a first name or last name');
    }
    if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
        errors.push('Invalid email format');
    }
    if (contact.phone && !/^[+]?[\d\s()-]{7,}$/.test(contact.phone)) {
        errors.push('Invalid phone format');
    }
    if (contact.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(contact.birthday)) {
        errors.push('Invalid birthday format (should be YYYY-MM-DD)');
    }
    return {
        isValid: errors.length === 0,
        errors
    };
};
// Helper function to check if database error is recoverable
const isRecoverableDBError = (error) => {
    return error.code === 'PGRST116' || error.code === '23505' || error.message.includes('timeout');
};
// Duplicate detection function
const findDuplicateContact = async (contact, userId) => {
    // Tier 1: Exact email match
    if (contact.email) {
        const emailMatch = await services_1.supabaseAdmin
            .from('contacts')
            .select('*')
            .eq('user_id', userId)
            .ilike('email', contact.email)
            .maybeSingle();
        if (emailMatch.data) {
            return emailMatch.data;
        }
    }
    // Tier 2: Phone number match
    if (contact.phone) {
        const normalizedPhone = contact.phone.replace(/[^0-9+]/g, '');
        const phoneMatches = await services_1.supabaseAdmin
            .from('contacts')
            .select('*')
            .eq('user_id', userId)
            .not('phone', 'is', null);
        const phoneMatch = phoneMatches.data?.find(c => {
            if (!c.phone)
                return false;
            return c.phone.replace(/[^0-9+]/g, '') === normalizedPhone;
        });
        if (phoneMatch) {
            return phoneMatch;
        }
    }
    // Tier 3: Name + Company match
    if ((contact.first_name || contact.last_name) && contact.company) {
        const nameCompanyMatches = await services_1.supabaseAdmin
            .from('contacts')
            .select('*')
            .eq('user_id', userId)
            .eq('company', contact.company);
        const nameMatch = nameCompanyMatches.data?.find(c => {
            const firstNameMatch = !contact.first_name ||
                (c.first_name && c.first_name.toLowerCase() === contact.first_name.toLowerCase());
            const lastNameMatch = !contact.last_name ||
                (c.last_name && c.last_name.toLowerCase() === contact.last_name.toLowerCase());
            return firstNameMatch && lastNameMatch;
        });
        if (nameMatch) {
            return nameMatch;
        }
    }
    return null;
};
// Retry mechanism with exponential backoff
const retryWithBackoff = async (fn, retries = 5, initialDelay = 1000, factor = 2) => {
    let attempt = 0;
    let delay = initialDelay;
    while (true) {
        try {
            return await fn();
        }
        catch (error) {
            if (!(error instanceof Error)) {
                throw error;
            }
            const isRateLimitError = error.message.includes('rate limit') ||
                error.message.includes('quota exceeded') ||
                (error instanceof Error && 'status' in error && error.status === 429);
            attempt++;
            if (attempt >= retries || !isRateLimitError) {
                throw error;
            }
            const jitter = Math.random() * 0.3 + 0.85;
            const waitTime = Math.min(delay * jitter, 60000);
            console.log(`Rate limit hit, retrying in ${Math.round(waitTime)}ms (attempt ${attempt}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            delay *= factor;
        }
    }
};
// Process standard batch operations
const processStandardBatchOperations = async (operations, userId) => {
    const results = await Promise.allSettled(operations.map(async (operation, index) => {
        try {
            let result;
            switch (operation.type) {
                case 'create': {
                    const data = operation.data;
                    const { data: contact, error } = await services_1.supabaseAdmin
                        .from('contacts')
                        .insert({ ...data, user_id: userId })
                        .select()
                        .single();
                    if (error)
                        throw error;
                    result = contact;
                    break;
                }
                case 'update': {
                    const data = operation.data;
                    const { contact_id, ...updateData } = data;
                    const { data: contact, error } = await services_1.supabaseAdmin
                        .from('contacts')
                        .update(updateData)
                        .match({ contact_id, user_id: userId })
                        .select()
                        .single();
                    if (error)
                        throw error;
                    result = contact;
                    break;
                }
                case 'delete': {
                    const data = operation.data;
                    const { error } = await services_1.supabaseAdmin
                        .from('contacts')
                        .delete()
                        .match({ contact_id: data.contact_id, user_id: userId });
                    if (error)
                        throw error;
                    result = null;
                    break;
                }
                case 'get': {
                    const data = operation.data;
                    const { data: contacts, error } = await services_1.supabaseAdmin
                        .from('contacts')
                        .select('*')
                        .eq('user_id', userId)
                        .in('contact_id', data.contact_ids);
                    if (error)
                        throw error;
                    result = contacts;
                    break;
                }
                default:
                    throw new Error(`Unknown operation type: ${operation.type}`);
            }
            return {
                success: true,
                data: result,
                operation: operation.type,
                index
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                operation: operation.type,
                index
            };
        }
    }));
    const processedResults = results.map((result) => {
        if (result.status === 'fulfilled') {
            return result.value;
        }
        else {
            return {
                success: false,
                error: result.reason?.message || 'Unknown error',
                operation: 'unknown',
                index: -1
            };
        }
    });
    return {
        results: processedResults,
        statistics: {
            total: processedResults.length,
            successful: processedResults.filter(r => r.success).length,
            failed: processedResults.filter(r => !r.success).length
        }
    };
};
// Process bulk import operations
const processBulkImport = async (contacts, userId, batchId, duplicateHandling = 'skip', importSource = 'csv') => {
    const results = {
        successful: [],
        failed: []
    };
    // Create import history record
    const { data: importHistoryRecord, error: importHistoryError } = await services_1.supabaseAdmin
        .from('import_history')
        .insert([{
            user_id: userId,
            source: importSource,
            total_contacts: contacts.length,
            successful_imports: 0,
            failed_imports: 0,
            status: 'processing',
            created_at: new Date().toISOString()
        }])
        .select()
        .single();
    if (importHistoryError) {
        console.error('Failed to create import history record:', importHistoryError);
    }
    // Process each contact
    for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        try {
            // Validate contact data
            const validationResult = validateContact(contact);
            if (!validationResult.isValid) {
                results.failed.push({
                    code: ErrorCode.VALIDATION_ERROR,
                    message: `Validation failed: ${validationResult.errors.join(', ')}`,
                    details: validationResult.errors,
                    recoverable: true,
                    contactData: contact,
                    index: i,
                    batchId
                });
                continue;
            }
            // Check for duplicates
            const duplicate = await findDuplicateContact(contact, userId);
            if (duplicate) {
                if (duplicateHandling === 'skip') {
                    results.failed.push({
                        code: ErrorCode.DUPLICATE_SKIPPED,
                        message: `Contact with ${contact.email ? `email ${contact.email}` : 'similar information'} already exists`,
                        recoverable: false,
                        contactData: contact,
                        index: i,
                        batchId
                    });
                    continue;
                }
                else if (duplicateHandling === 'update') {
                    const { error: updateError } = await services_1.supabaseAdmin
                        .from('contacts')
                        .update({
                        ...contact,
                        updated_at: new Date().toISOString(),
                        import_batch_id: batchId,
                        import_source: importSource,
                        imported_at: new Date().toISOString()
                    })
                        .eq('contact_id', duplicate.contact_id);
                    if (updateError) {
                        results.failed.push({
                            code: ErrorCode.DATABASE_ERROR,
                            message: updateError.message,
                            details: updateError,
                            recoverable: isRecoverableDBError(updateError),
                            contactData: contact,
                            index: i,
                            batchId
                        });
                    }
                    else {
                        results.successful.push(contact);
                    }
                    continue;
                }
            }
            // Create contact
            const { data, error } = await services_1.supabaseAdmin
                .from('contacts')
                .insert([{
                    ...contact,
                    user_id: userId,
                    import_batch_id: batchId,
                    import_source: importSource,
                    imported_at: new Date().toISOString()
                }])
                .select();
            if (error) {
                results.failed.push({
                    code: ErrorCode.DATABASE_ERROR,
                    message: error.message,
                    details: error,
                    recoverable: isRecoverableDBError(error),
                    contactData: contact,
                    index: i,
                    batchId
                });
            }
            else if (data && data.length > 0) {
                results.successful.push(contact);
            }
        }
        catch (error) {
            results.failed.push({
                code: ErrorCode.UNEXPECTED_ERROR,
                message: error instanceof Error ? error.message : 'Unknown error',
                details: error,
                recoverable: false,
                contactData: contact,
                index: i,
                batchId
            });
        }
    }
    // Update import history record
    if (importHistoryRecord) {
        await services_1.supabaseAdmin
            .from('import_history')
            .update({
            successful_imports: results.successful.length,
            failed_imports: results.failed.length,
            status: results.failed.length === contacts.length ? 'failed' :
                results.successful.length === contacts.length ? 'completed' : 'partial',
            error_details: results.failed.length > 0 ? results.failed : null,
            completed_at: new Date().toISOString()
        })
            .eq('id', importHistoryRecord.id);
    }
    return results;
};
// Request type detection
const isBulkImportRequest = (body) => {
    return 'contacts' in body && Array.isArray(body.contacts);
};
// Main handler
const handler = async (event, context) => {
    const { httpMethod, body: eventBodyString } = event;
    const logPrefix = `[contacts-batch-unified:${httpMethod}]`;
    if (httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: `Method ${httpMethod} Not Allowed` }),
            headers: { ...COMMON_HEADERS, 'Allow': 'POST' },
        };
    }
    // Authentication
    const userId = await getAuthenticatedUserId(event, context);
    if (!userId) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: "Authentication required." }),
            headers: COMMON_HEADERS,
        };
    }
    try {
        // Parse request body
        if (!eventBodyString) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "Request body is missing." }),
                headers: COMMON_HEADERS,
            };
        }
        const requestBody = JSON.parse(eventBodyString);
        // Route to appropriate handler based on request structure
        if (isBulkImportRequest(requestBody)) {
            // Handle bulk import
            const { contacts, import_batch_id = (0, uuid_1.v4)(), duplicate_handling = 'skip', import_source = 'csv' } = requestBody;
            if (!Array.isArray(contacts) || contacts.length === 0) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: "The 'contacts' field must be a non-empty array." }),
                    headers: COMMON_HEADERS,
                };
            }
            const results = await retryWithBackoff(() => processBulkImport(contacts, userId, import_batch_id, duplicate_handling, import_source));
            return {
                statusCode: 200,
                body: JSON.stringify(results),
                headers: COMMON_HEADERS,
            };
        }
        else {
            // Handle standard batch operations
            const { operations } = requestBody;
            if (!operations || !Array.isArray(operations) || operations.length === 0) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'Operations array is required' }),
                    headers: COMMON_HEADERS,
                };
            }
            const results = await processStandardBatchOperations(operations, userId);
            return {
                statusCode: 200,
                body: JSON.stringify(results),
                headers: COMMON_HEADERS,
            };
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`${logPrefix} Unhandled error:`, error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: `An unexpected error occurred: ${errorMessage}` }),
            headers: COMMON_HEADERS,
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=contacts-batch.js.map