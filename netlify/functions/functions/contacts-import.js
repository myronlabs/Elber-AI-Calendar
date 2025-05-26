"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const index_1 = require('./services/index');
const googleapis_1 = require("googleapis");
const COMMON_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
};
const validateAuthToken = async (token) => {
    const { data: { user }, error } = await index_1.supabaseAdmin.auth.getUser(token);
    if (error || !user) {
        throw new Error('Invalid authentication token');
    }
    const { data: profile, error: profileError } = await index_1.supabaseAdmin
        .from('profiles')
        .select('is_custom_verified')
        .eq('id', user.id)
        .single();
    if (profileError || !profile?.is_custom_verified) {
        throw new Error('User not verified');
    }
    return { userId: user.id, email: user.email || '' };
};
const handleImportHistory = async (request, userId) => {
    if (request.method === 'GET') {
        const page = request.page || 1;
        const limit = request.limit || 10;
        const offset = (page - 1) * limit;
        const { data, error, count } = await index_1.supabaseAdmin
            .from('import_history')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (error) {
            throw new Error(`Failed to fetch import history: ${error.message}`);
        }
        return {
            imports: data || [],
            pagination: {
                page,
                limit,
                total: count || 0,
                totalPages: Math.ceil((count || 0) / limit)
            }
        };
    }
    if (request.method === 'DELETE' && request.deleteId) {
        const { error } = await index_1.supabaseAdmin
            .from('import_history')
            .delete()
            .eq('id', request.deleteId)
            .eq('user_id', userId);
        if (error) {
            throw new Error(`Failed to delete import record: ${error.message}`);
        }
        return { success: true, message: 'Import record deleted successfully' };
    }
    throw new Error('Invalid import history request');
};
const googleContactToElberContact = (googleContact) => {
    const displayName = googleContact.names?.[0]?.displayName || '';
    const givenName = googleContact.names?.[0]?.givenName || '';
    const familyName = googleContact.names?.[0]?.familyName || '';
    const first_name = givenName || displayName.split(' ')[0] || '';
    const last_name = familyName || (displayName.includes(' ') ? displayName.split(' ').slice(1).join(' ') : '');
    const full_name = displayName || `${first_name} ${last_name}`.trim();
    const primaryEmail = googleContact.emailAddresses?.find((email) => email.type === 'home' || email.type === 'work')?.value || googleContact.emailAddresses?.[0]?.value;
    const primaryPhone = googleContact.phoneNumbers?.find((phone) => phone.type === 'mobile' || phone.type === 'home' || phone.type === 'work')?.value || googleContact.phoneNumbers?.[0]?.value;
    const organization = googleContact.organizations?.[0];
    const company = organization?.name || '';
    const job_title = organization?.title || '';
    const address = googleContact.addresses?.[0]?.formattedValue || '';
    let birthday = '';
    if (googleContact.birthdays?.[0]?.date) {
        const { year, month, day } = googleContact.birthdays[0].date;
        if (year && month && day) {
            birthday = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        }
    }
    const website = googleContact.urls?.[0]?.value || '';
    const notes = googleContact.biographies?.[0]?.value || '';
    return {
        first_name,
        last_name,
        full_name,
        email: primaryEmail,
        phone: primaryPhone,
        company,
        job_title,
        address,
        birthday: birthday || undefined,
        website,
        notes,
        google_contact_id: googleContact.resourceName?.replace('people/', '')
    };
};
const getGoogleAccessToken = async (userId) => {
    try {
        const { data, error } = await index_1.supabaseAdmin
            .from('oauth_connections')
            .select('*')
            .eq('user_id', userId)
            .eq('provider', 'google')
            .single();
        if (error || !data) {
            console.log(`No OAuth connection found for user ${userId}`);
            return null;
        }
        const now = new Date();
        const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
        if (expiresAt && now >= expiresAt) {
            console.log(`Access token expired for user ${userId}, attempting refresh`);
            if (!data.refresh_token) {
                console.log(`No refresh token available for user ${userId}`);
                return null;
            }
            try {
                const oauth2Client = new googleapis_1.google.auth.OAuth2();
                oauth2Client.setCredentials({
                    access_token: data.access_token,
                    refresh_token: data.refresh_token
                });
                const { credentials } = await oauth2Client.refreshAccessToken();
                console.log(`Successfully refreshed token for user ${userId}`);
                await index_1.supabaseAdmin
                    .from('oauth_connections')
                    .update({
                    access_token: credentials.access_token,
                    expires_at: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
                    updated_at: new Date().toISOString()
                })
                    .eq('id', data.id);
                return credentials.access_token || null;
            }
            catch (error) {
                console.error(`Error refreshing token for user ${userId}:`, error);
                return null;
            }
        }
        return data.access_token;
    }
    catch (error) {
        console.error(`Error getting OAuth token for user ${userId}:`, error);
        return null;
    }
};
const fetchAllGoogleContacts = async (auth) => {
    const peopleService = googleapis_1.google.people({ version: 'v1', auth });
    let allContacts = [];
    let nextPageToken;
    do {
        const response = await peopleService.people.connections.list({
            resourceName: 'people/me',
            pageToken: nextPageToken,
            pageSize: 1000,
            personFields: 'names,emailAddresses,phoneNumbers,organizations,addresses,birthdays,urls,biographies'
        });
        if (response.data.connections) {
            allContacts = allContacts.concat(response.data.connections);
        }
        nextPageToken = response.data.nextPageToken || undefined;
    } while (nextPageToken);
    return allContacts;
};
const handleImportProcessing = async (request, userId, _userEmail) => {
    if (request.source !== 'google') {
        throw new Error('Only Google Contacts import is currently supported');
    }
    try {
        let accessToken = request.accessToken;
        if (!accessToken) {
            accessToken = await getGoogleAccessToken(userId) || undefined;
        }
        if (!accessToken) {
            throw new Error('No access token available for Google Contacts import');
        }
        const oauth2Client = new googleapis_1.google.auth.OAuth2();
        oauth2Client.setCredentials({
            access_token: accessToken
        });
        const startTime = Date.now();
        const importId = `import_${userId}_${startTime}`;
        await index_1.supabaseAdmin.from('import_history').insert({
            id: importId,
            user_id: userId,
            source: 'google',
            status: 'in_progress',
            started_at: new Date().toISOString()
        });
        const googleContacts = await fetchAllGoogleContacts(oauth2Client);
        if (!googleContacts || googleContacts.length === 0) {
            await index_1.supabaseAdmin.from('import_history').update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                total_contacts: 0,
                imported_contacts: 0,
                skipped_contacts: 0
            }).eq('id', importId);
            return {
                success: true,
                message: 'No contacts found to import',
                totalContacts: 0,
                importedContacts: 0,
                skippedContacts: 0
            };
        }
        const convertedContacts = googleContacts.map(googleContactToElberContact);
        const validContacts = convertedContacts.filter((contact) => contact.full_name.trim() !== '' ||
            contact.email ||
            contact.phone);
        const BATCH_SIZE = 50;
        let importedCount = 0;
        let skippedCount = 0;
        const errors = [];
        for (let i = 0; i < validContacts.length; i += BATCH_SIZE) {
            const batch = validContacts.slice(i, i + BATCH_SIZE);
            const contactsToInsert = batch.map((contact) => ({
                user_id: userId,
                first_name: contact.first_name,
                last_name: contact.last_name,
                full_name: contact.full_name,
                email: contact.email || null,
                phone: contact.phone || null,
                company: contact.company || null,
                job_title: contact.job_title || null,
                address: contact.address || null,
                birthday: contact.birthday || null,
                website: contact.website || null,
                notes: contact.notes || null,
                google_contact_id: contact.google_contact_id || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }));
            try {
                const { data, error } = await index_1.supabaseAdmin
                    .from('contacts')
                    .upsert(contactsToInsert, {
                    onConflict: 'user_id,google_contact_id',
                    ignoreDuplicates: false
                })
                    .select('id');
                if (error) {
                    errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
                    skippedCount += batch.length;
                }
                else {
                    importedCount += data?.length || batch.length;
                }
            }
            catch (batchError) {
                errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchError}`);
                skippedCount += batch.length;
            }
            if (i % (BATCH_SIZE * 5) === 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        await index_1.supabaseAdmin.from('import_history').update({
            status: errors.length > 0 ? 'completed_with_errors' : 'completed',
            completed_at: new Date().toISOString(),
            total_contacts: googleContacts.length,
            imported_contacts: importedCount,
            skipped_contacts: skippedCount,
            error_details: errors.length > 0 ? errors.join('; ') : null
        }).eq('id', importId);
        return {
            success: true,
            message: `Import completed. ${importedCount} contacts imported, ${skippedCount} skipped.`,
            totalContacts: googleContacts.length,
            importedContacts: importedCount,
            skippedContacts: skippedCount,
            errors: errors.length > 0 ? errors : undefined
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
            success: false,
            message: `Import failed: ${errorMessage}`,
            errors: [errorMessage]
        };
    }
};
const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                ...COMMON_HEADERS,
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
            },
            body: ''
        };
    }
    try {
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers: COMMON_HEADERS,
                body: JSON.stringify({ error: 'Missing or invalid authorization header' })
            };
        }
        const token = authHeader.substring(7);
        const { userId, email } = await validateAuthToken(token);
        if (event.httpMethod === 'GET') {
            const page = parseInt(event.queryStringParameters?.page || '1');
            const limit = parseInt(event.queryStringParameters?.limit || '10');
            const request = {
                action: 'history',
                method: 'GET',
                page,
                limit
            };
            const result = await handleImportHistory(request, userId);
            return {
                statusCode: 200,
                headers: COMMON_HEADERS,
                body: JSON.stringify(result)
            };
        }
        if (event.httpMethod === 'DELETE') {
            const deleteId = event.queryStringParameters?.id;
            if (!deleteId) {
                return {
                    statusCode: 400,
                    headers: COMMON_HEADERS,
                    body: JSON.stringify({ error: 'Missing import ID for deletion' })
                };
            }
            const request = {
                action: 'history',
                method: 'DELETE',
                deleteId
            };
            const result = await handleImportHistory(request, userId);
            return {
                statusCode: 200,
                headers: COMMON_HEADERS,
                body: JSON.stringify(result)
            };
        }
        if (event.httpMethod === 'POST') {
            if (!event.body) {
                return {
                    statusCode: 400,
                    headers: COMMON_HEADERS,
                    body: JSON.stringify({ error: 'Missing request body' })
                };
            }
            const requestBody = JSON.parse(event.body);
            if (requestBody.action === 'import') {
                const result = await handleImportProcessing(requestBody, userId, email);
                return {
                    statusCode: 200,
                    headers: COMMON_HEADERS,
                    body: JSON.stringify(result)
                };
            }
            return {
                statusCode: 400,
                headers: COMMON_HEADERS,
                body: JSON.stringify({ error: 'Invalid request action' })
            };
        }
        return {
            statusCode: 405,
            headers: COMMON_HEADERS,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }
    catch (error) {
        console.error('Unified import function error:', error);
        const statusCode = error instanceof Error && error.message.includes('authentication') ? 401 : 500;
        const errorMessage = error instanceof Error ? error.message : 'Internal server error';
        return {
            statusCode,
            headers: COMMON_HEADERS,
            body: JSON.stringify({ error: errorMessage })
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=contacts-import.js.map