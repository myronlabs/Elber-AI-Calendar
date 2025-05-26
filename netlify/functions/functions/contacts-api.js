"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const jwt_decode_1 = require("jwt-decode");
const services_1 = require("../services");
const contactService_1 = require("../services/contactService");
// Get authenticated user ID from JWT token in authorization header
const getUserIdFromEvent = (event) => {
    const authHeader = event.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7); // Remove "Bearer " prefix
        try {
            const decodedToken = (0, jwt_decode_1.jwtDecode)(token);
            if (decodedToken && decodedToken.sub) {
                console.log(`[contacts-api.ts] Extracted user ID (sub): ${decodedToken.sub} from JWT.`);
                return decodedToken.sub;
            }
            else {
                console.warn('[contacts-api.ts] JWT decoded but did not contain a sub (user ID) claim.', decodedToken);
                return null;
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error during JWT decoding.';
            console.error(`[contacts-api.ts] Error decoding JWT: ${errorMessage}`, error);
            return null;
        }
    }
    console.warn('[contacts-api.ts] No Authorization header with Bearer token found.');
    return null;
};
// Validate UUID format
const isValidUUID = (uuid) => {
    if (!uuid)
        return false;
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return uuidRegex.test(uuid);
};
// CORS headers for all responses
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
};
// Handler to execute SQL queries using the Supabase MCP tool
async function executeSupabaseQuery(projectId, query, requestId) {
    console.log(`[contacts-api.ts][${requestId}] Executing SQL query:`, query);
    try {
        // Note: This section validates Supabase connection before raw SQL execution
        // For now, let's execute the query directly with the REST API
        const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/execute_sql`, {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        console.log(`[contacts-api.ts][${requestId}] Query executed successfully`);
        return result;
    }
    catch (error) {
        console.error(`[contacts-api.ts][${requestId}] Error executing SQL query:`, error);
        throw error;
    }
}
// Log contact operations to help with analytics and debugging
async function logContactOperation(projectId, userId, operation, operationSize) {
    try {
        const logQuery = `
      INSERT INTO public.contact_operations_log (user_id, operation, operation_size)
      VALUES ('${userId}', '${operation}', ${operationSize || 'NULL'});
    `;
        await executeSupabaseQuery(projectId, logQuery, `log_${operation}_${Date.now()}`);
    }
    catch (error) {
        // Log but don't fail the main operation if logging fails
        console.error(`[contacts-api.ts] Failed to log contact operation:`, error);
    }
}
// Main handler function for the Netlify function
const handler = async (event, _context) => {
    // Unique request ID for logging
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    console.log(`[contacts-api.ts][${requestId}] Function invoked with method: ${event.httpMethod}, path: ${event.path}`);
    // Supabase project ID
    const SUPABASE_PROJECT_ID = 'tzwipktdyvijxsdpkfco';
    // Handle OPTIONS preflight requests
    if (event.httpMethod === 'OPTIONS') {
        console.log(`[contacts-api.ts][${requestId}] Handling OPTIONS preflight request`);
        return {
            statusCode: 204,
            headers: corsHeaders,
            body: ''
        };
    }
    // Authentication: Get user ID from JWT
    const userId = getUserIdFromEvent(event);
    if (!userId) {
        console.error(`[contacts-api.ts][${requestId}] Authentication failed: No valid user ID found in token`);
        return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Authentication required. Please sign in.' })
        };
    }
    // Extract contactId from path parameter if present
    // Example: /.netlify/functions/contacts-api/123e4567-e89b-12d3-a456-426614174000
    const pathSegments = event.path.split('/');
    const contactId = pathSegments[pathSegments.length - 1];
    // Only consider valid UUIDs as contactId, otherwise treat as a regular path
    const hasContactId = isValidUUID(contactId);
    try {
        // 1. GET Request - Fetch contacts
        if (event.httpMethod === 'GET') {
            // Case 1: Get specific contact by ID
            if (hasContactId) {
                console.log(`[contacts-api.ts][${requestId}] Getting specific contact with ID: ${contactId}`);
                const query = `
          SELECT * FROM public.contacts 
          WHERE contact_id = '${contactId}' AND user_id = '${userId}'
          LIMIT 1;
        `;
                const result = await executeSupabaseQuery(SUPABASE_PROJECT_ID, query, requestId);
                if (!result || !result.length) {
                    return {
                        statusCode: 404,
                        headers: corsHeaders,
                        body: JSON.stringify({ message: 'Contact not found' })
                    };
                }
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify(result[0])
                };
            }
            // Case 2: Get all contacts or search
            else {
                console.log(`[contacts-api.ts][${requestId}] Getting contacts list or searching`);
                // Parse query parameters
                const queryParams = event.queryStringParameters || {};
                const searchTerm = queryParams.search_term;
                let query = '';
                if (searchTerm) {
                    // Use full text search if available
                    query = `
            SELECT * FROM public.contacts 
            WHERE user_id = '${userId}' AND (
              fts_document @@ plainto_tsquery('english', '${searchTerm.replace(/'/g, "''")}')
              OR first_name ILIKE '%${searchTerm.replace(/'/g, "''")}%'
              OR last_name ILIKE '%${searchTerm.replace(/'/g, "''")}%'
              OR email ILIKE '%${searchTerm.replace(/'/g, "''")}%'
              OR company ILIKE '%${searchTerm.replace(/'/g, "''")}%'
              OR COALESCE(phone, '') ILIKE '%${searchTerm.replace(/'/g, "''")}%'
            )
            ORDER BY 
              CASE 
                WHEN first_name ILIKE '${searchTerm.replace(/'/g, "''")}%' THEN 1
                WHEN last_name ILIKE '${searchTerm.replace(/'/g, "''")}%' THEN 2
                ELSE 3
              END,
              first_name, 
              last_name
            LIMIT 100;
          `;
                }
                else {
                    // Return all contacts (with a reasonable limit)
                    query = `
            SELECT * FROM public.contacts 
            WHERE user_id = '${userId}'
            ORDER BY first_name, last_name
            LIMIT 500;
          `;
                }
                const result = await executeSupabaseQuery(SUPABASE_PROJECT_ID, query, requestId);
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify(result || [])
                };
            }
        }
        // 2. POST Request - Create new contact
        else if (event.httpMethod === 'POST') {
            console.log(`[contacts-api.ts][${requestId}] Creating new contact`);
            if (!event.body) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'Missing request body' })
                };
            }
            const contact = JSON.parse(event.body);
            // Associate contact with the authenticated user
            contact.user_id = userId;
            // Validate required fields based on the assistant-contacts schema update
            // Only first_name is truly required now, but we'll check for it
            if (!contact.first_name || contact.first_name.trim() === '') {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'First name is required' })
                };
            }
            // Birthday will be processed by Supabase client directly
            // Create contact using Supabase client
            const contactData = {
                user_id: userId,
                first_name: contact.first_name,
                middle_name: contact.middle_name || null,
                last_name: contact.last_name || null,
                nickname: contact.nickname || null,
                email: contact.email || null,
                phone: contact.phone || null,
                company: contact.company || null,
                job_title: contact.job_title || null,
                address: contact.address || null,
                website: contact.website || null,
                birthday: contact.birthday ? new Date(contact.birthday).toISOString().split('T')[0] : null,
                notes: contact.notes || null
            };
            console.log(`[contacts-api.ts][${requestId}] Creating contact with data:`, contactData);
            const { data: result, error } = await services_1.supabaseAdmin
                .from('contacts')
                .insert(contactData)
                .select()
                .single();
            if (error) {
                console.error(`[contacts-api.ts][${requestId}] Error creating contact:`, error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'Failed to create contact', error: error.message })
                };
            }
            console.log(`[contacts-api.ts][${requestId}] Successfully created contact:`, result);
            // Log the operation for analytics
            await logContactOperation(SUPABASE_PROJECT_ID, userId, 'create', 1);
            return {
                statusCode: 201,
                headers: corsHeaders,
                body: JSON.stringify(result)
            };
        }
        // 3. PUT Request - Update contact
        else if (event.httpMethod === 'PUT') {
            if (!hasContactId) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'Contact ID is required for updates' })
                };
            }
            console.log(`[contacts-api.ts][${requestId}] Updating contact with ID: ${contactId}`);
            if (!event.body) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'Missing request body' })
                };
            }
            const updates = JSON.parse(event.body);
            // Process birthday to ensure it's in a valid date format
            let birthdayValue = 'NULL';
            if (updates.birthday !== undefined) {
                if (updates.birthday === null) {
                    birthdayValue = 'NULL';
                }
                else {
                    try {
                        const date = new Date(updates.birthday);
                        if (!isNaN(date.getTime())) {
                            birthdayValue = `'${date.toISOString().split('T')[0]}'::date`;
                        }
                    }
                    catch {
                        console.warn(`[contacts-api.ts][${requestId}] Invalid birthday format: ${updates.birthday}`);
                        birthdayValue = 'NULL';
                    }
                }
            }
            // Build SQL SET clause dynamically based on provided fields
            const setClause = [];
            // Only include fields that were actually provided in the request
            if (updates.first_name !== undefined) {
                setClause.push(`first_name = ${updates.first_name !== null ? `'${updates.first_name.replace(/'/g, "''")}'` : 'NULL'}`);
            }
            if (updates.middle_name !== undefined) {
                setClause.push(`middle_name = ${updates.middle_name !== null ? `'${updates.middle_name.replace(/'/g, "''")}'` : 'NULL'}`);
            }
            if (updates.last_name !== undefined) {
                setClause.push(`last_name = ${updates.last_name !== null ? `'${updates.last_name.replace(/'/g, "''")}'` : 'NULL'}`);
            }
            if (updates.nickname !== undefined) {
                setClause.push(`nickname = ${updates.nickname !== null ? `'${updates.nickname.replace(/'/g, "''")}'` : 'NULL'}`);
            }
            if (updates.email !== undefined) {
                setClause.push(`email = ${updates.email !== null ? `'${updates.email.replace(/'/g, "''")}'` : 'NULL'}`);
            }
            if (updates.phone !== undefined) {
                setClause.push(`phone = ${updates.phone !== null ? `'${updates.phone.replace(/'/g, "''")}'` : 'NULL'}`);
            }
            if (updates.company !== undefined) {
                setClause.push(`company = ${updates.company !== null ? `'${updates.company.replace(/'/g, "''")}'` : 'NULL'}`);
            }
            if (updates.job_title !== undefined) {
                setClause.push(`job_title = ${updates.job_title !== null ? `'${updates.job_title.replace(/'/g, "''")}'` : 'NULL'}`);
            }
            if (updates.address !== undefined) {
                setClause.push(`address = ${updates.address !== null ? `'${updates.address.replace(/'/g, "''")}'` : 'NULL'}`);
            }
            if (updates.website !== undefined) {
                setClause.push(`website = ${updates.website !== null ? `'${updates.website.replace(/'/g, "''")}'` : 'NULL'}`);
            }
            if (updates.birthday !== undefined) {
                setClause.push(`birthday = ${birthdayValue}`);
            }
            if (updates.notes !== undefined) {
                setClause.push(`notes = ${updates.notes !== null ? `'${updates.notes.replace(/'/g, "''")}'` : 'NULL'}`);
            }
            // Always update the updated_at timestamp
            setClause.push(`updated_at = now()`);
            // If no fields were provided for update, return an error
            if (setClause.length === 1) { // Only updated_at would be set
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'No valid fields provided for update' })
                };
            }
            const query = `
        UPDATE public.contacts 
        SET ${setClause.join(', ')} 
        WHERE contact_id = '${contactId}' AND user_id = '${userId}'
        RETURNING *;
      `;
            const result = await executeSupabaseQuery(SUPABASE_PROJECT_ID, query, requestId);
            if (!result || !result.length) {
                return {
                    statusCode: 404,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'Contact not found or user does not have permission to update it' })
                };
            }
            // Log the operation for analytics
            await logContactOperation(SUPABASE_PROJECT_ID, userId, 'update', 1);
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify(result[0])
            };
        }
        // 4. DELETE Request - Delete contact using ContactService
        else if (event.httpMethod === 'DELETE') {
            if (!userId) {
                return {
                    statusCode: 401,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'Authentication required' })
                };
            }
            console.log(`[contacts-api.ts][${requestId}] Processing DELETE request`);
            // Determine the appropriate contact identifier
            let contactIdentifier;
            let contactName = '';
            // First try to get a contact name from request body if ID is missing
            if (!hasContactId && event.body) {
                try {
                    const body = JSON.parse(event.body);
                    contactName = body.contact_name || '';
                }
                catch (e) {
                    console.warn(`[contacts-api.ts][${requestId}] Error parsing body for contact name:`, e);
                }
            }
            // Create the appropriate identifier based on available information
            if (hasContactId) {
                contactIdentifier = { type: 'id', contact_id: contactId };
                console.log(`[contacts-api.ts][${requestId}] Using ID-based identifier: ${contactId}`);
            }
            else if (contactName) {
                contactIdentifier = { type: 'name', name: contactName };
                console.log(`[contacts-api.ts][${requestId}] Using name-based identifier: ${contactName}`);
            }
            else {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'Contact ID or name is required for deletion' })
                };
            }
            // Use our contact service to handle the deletion
            try {
                const deleteResult = await contactService_1.contactService.deleteContact(userId, contactIdentifier);
                if (!deleteResult.success) {
                    // Handle deletion failures with appropriate status codes
                    let statusCode = 500;
                    if (deleteResult.error?.code === 'CONTACT_NOT_FOUND') {
                        statusCode = 404;
                    }
                    else if (['INVALID_ID', 'INVALID_NAME', 'MISSING_USER_ID'].includes(deleteResult.error?.code || '')) {
                        statusCode = 400;
                    }
                    return {
                        statusCode,
                        headers: corsHeaders,
                        body: JSON.stringify({
                            message: deleteResult.error?.message || 'Failed to delete contact',
                            error: deleteResult.error?.code || 'UNKNOWN_ERROR'
                        })
                    };
                }
                // Deletion successful
                console.log(`[contacts-api.ts][${requestId}] Successfully deleted contact:`, deleteResult.data);
                // Log the operation for analytics
                await logContactOperation(SUPABASE_PROJECT_ID, userId, 'delete', 1);
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        message: 'Contact deleted successfully',
                        contact_id: deleteResult.data?.contact_id
                    })
                };
            }
            catch (error) {
                console.error(`[contacts-api.ts][${requestId}] Unexpected error during contact deletion:`, error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        message: 'An unexpected error occurred during contact deletion',
                        error: error instanceof Error ? error.message : 'Unknown error'
                    })
                };
            }
        }
        // 5. Unsupported method
        else {
            return {
                statusCode: 405,
                headers: {
                    ...corsHeaders,
                    'Allow': 'GET, POST, PUT, DELETE, OPTIONS'
                },
                body: JSON.stringify({ message: 'Method not allowed' })
            };
        }
    }
    catch (error) {
        console.error(`[contacts-api.ts][${requestId}] Error processing request:`, error);
        let statusCode = 500;
        let errorMessage = 'Internal server error';
        if (error instanceof SyntaxError) {
            statusCode = 400;
            errorMessage = 'Invalid JSON in request body';
        }
        else if (error instanceof Error) {
            errorMessage = error.message;
        }
        return {
            statusCode,
            headers: corsHeaders,
            body: JSON.stringify({ message: errorMessage })
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=contacts-api.js.map