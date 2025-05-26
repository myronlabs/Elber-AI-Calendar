"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const services_1 = require("../services");
const googleapis_1 = require("googleapis");
const uuid_1 = require("uuid");
const googleConstants_1 = require("./_shared/googleConstants");
// OAuth configuration is now managed by the oauthConfigService
const googleConfig = services_1.oauthConfigService.getGoogleConfig();
// Log configuration on function initialization for debugging (not in requests)
console.log('[google-contacts] Function loaded with config:', {
    clientIdPresent: !!googleConfig.clientId,
    clientSecretPresent: !!googleConfig.clientSecret,
    redirectUri: googleConfig.redirectUri,
    nodeEnv: process.env.NODE_ENV
});
const COMMON_HEADERS = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, max-age=0'
};
// Helper function to get authenticated user ID
const getAuthenticatedUserId = async (event) => {
    const authHeader = event.headers.authorization;
    if (!authHeader)
        return null;
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await services_1.supabaseAdmin.auth.getUser(token);
    if (error || !user)
        return null;
    return user.id;
};
// Helper function to get OAuth token for a user using the centralized service
const getUserOAuthToken = async (userId) => {
    console.log(`Looking up OAuth token for user: ${userId}`);
    try {
        // First look for token specifically for this user
        const { data, error: fetchError } = await services_1.supabaseAdmin
            .from('oauth_connections')
            .select('*')
            .eq('user_id', userId)
            .eq('provider', 'google')
            .maybeSingle();
        if (fetchError) {
            console.error(`Error fetching OAuth token for user ${userId}:`, fetchError);
            return null;
        }
        if (!data) {
            console.log(`No Google OAuth token found for user ${userId}. User needs to authenticate or re-authenticate.`);
            return null;
        }
        console.log(`Found OAuth token for user ${userId}, expires_at: ${data.expires_at || 'not set'}`);
        // Check if token is expired and refresh if needed
        if (data.expires_at && new Date(data.expires_at) < new Date()) {
            console.log(`Token is expired for user ${userId}, attempting to refresh`);
            if (!data.refresh_token) {
                console.log(`No refresh token available for user ${userId}, need to reauthenticate`);
                return null;
            }
            try {
                const oauth2Client = new googleapis_1.google.auth.OAuth2(googleConfig.clientId, // Using googleConfig from outer scope
                googleConfig.clientSecret, // Using googleConfig from outer scope
                googleConfig.redirectUri // Using googleConfig from outer scope
                );
                oauth2Client.setCredentials({
                    refresh_token: data.refresh_token
                });
                const { credentials } = await oauth2Client.refreshAccessToken();
                console.log(`Successfully refreshed token for user ${userId}`);
                await services_1.supabaseAdmin
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
        console.log(`Returning valid access token for user ${userId}`);
        return data.access_token;
    }
    catch (error) {
        if (error instanceof services_1.TokenNotFoundError) {
            console.error(`No OAuth token found for user ${userId}`);
            return null;
        }
        else if (error instanceof services_1.TokenExpiredError) {
            console.error(`OAuth token expired for user ${userId} and could not be refreshed`);
            return null;
        }
        else if (error instanceof services_1.TokenRefreshError) {
            console.error(`Error refreshing token for user ${userId}:`, error.message);
            return null;
        }
        else if (error instanceof services_1.InsufficientScopeError) {
            console.error(`Insufficient OAuth scopes for user ${userId}. Required: ${error.requiredScopes.join(', ')}`);
            return null;
        }
        else {
            console.error(`Error getting OAuth token for user ${userId}:`, error);
            return null;
        }
    }
};
// Helper function to convert Google Contact to ContactCreatePayload
const googleContactToElberContact = (googleContact) => {
    // Get name information
    let firstName = '';
    let middleName = null;
    let lastName = null;
    if (googleContact.names && googleContact.names.length > 0) {
        const name = googleContact.names[0];
        firstName = name.givenName || 'Unknown';
        middleName = name.middleName || null;
        lastName = name.familyName || null;
    }
    else {
        firstName = 'Google'; // Fallback name if no name is provided
    }
    const contact = {
        first_name: firstName,
        last_name: lastName,
        middle_name: middleName
    };
    // Store Google resource ID for reference
    contact.google_contact_id = googleContact.resourceName;
    // Process nicknames
    if (googleContact.nicknames && googleContact.nicknames.length > 0) {
        contact.nickname = googleContact.nicknames[0].value || null;
    }
    // Process email addresses (take the first one)
    if (googleContact.emailAddresses && googleContact.emailAddresses.length > 0) {
        contact.email = googleContact.emailAddresses[0].value || null;
    }
    // Process phone numbers (take the first one)
    if (googleContact.phoneNumbers && googleContact.phoneNumbers.length > 0) {
        contact.phone = googleContact.phoneNumbers[0].value || null;
    }
    // Process organizations (take the first one)
    if (googleContact.organizations && googleContact.organizations.length > 0) {
        const org = googleContact.organizations[0];
        contact.company = org.name || null;
        contact.job_title = org.title || null;
    }
    // Process addresses (take the first one)
    if (googleContact.addresses && googleContact.addresses.length > 0) {
        // Store the full formatted address
        contact.formatted_address = googleContact.addresses[0].formattedValue || null;
        // With Google Contacts API, we primarily get the formatted address
        // We don't attempt to parse individual components as they're not reliably available
        // in the standard format we receive from the API
    }
    // Process websites (take the first one)
    if (googleContact.urls && googleContact.urls.length > 0) {
        contact.website = googleContact.urls[0].value || null;
    }
    // Process birthdays
    if (googleContact.birthdays && googleContact.birthdays.length > 0) {
        const birthday = googleContact.birthdays[0].date;
        if (birthday && birthday.year && birthday.month && birthday.day) {
            // Format as YYYY-MM-DD
            contact.birthday = `${birthday.year}-${String(birthday.month).padStart(2, '0')}-${String(birthday.day).padStart(2, '0')}`;
        }
    }
    // Process biography/notes
    if (googleContact.biographies && googleContact.biographies.length > 0) {
        contact.notes = googleContact.biographies[0].value || null;
    }
    return contact;
};
// Implement the handler
const handler = async (event, _context) => {
    const { httpMethod, body: eventBodyString } = event;
    const logPrefix = `[google-contacts:${httpMethod}]`;
    // 1. Authentication & authorization
    const userId = await getAuthenticatedUserId(event);
    if (!userId) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: "Authentication required." }),
            headers: COMMON_HEADERS,
        };
    }
    // GET: Fetch contacts from Google
    if (httpMethod === 'GET') {
        try {
            // Get OAuth token - log the request for debugging
            console.log(`${logPrefix} Attempting to get OAuth token for user ${userId}`);
            // First attempt to get token for authenticated user
            const accessToken = await getUserOAuthToken(userId);
            // Log result of dedicated token fetch
            console.log(`${logPrefix} Token specifically for user ${userId} found: ${!!accessToken}`);
            if (!accessToken) {
                return {
                    statusCode: 401,
                    body: JSON.stringify({ message: "Google account not connected or authorization expired. Please reconnect your account." }),
                    headers: COMMON_HEADERS,
                };
            }
            // Set up People API client
            const oauth2Client = new googleapis_1.google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const peopleApi = googleapis_1.google.people({ version: 'v1', auth: oauth2Client });
            // Fetch contacts
            const pageToken = event.queryStringParameters?.pageToken || undefined;
            const pageSize = 100; // Fetch 100 contacts per page
            const response = await peopleApi.people.connections.list({
                resourceName: 'people/me',
                pageSize: pageSize,
                pageToken: pageToken,
                personFields: 'names,emailAddresses,phoneNumbers,organizations,addresses,biographies,urls,birthdays,nicknames',
                // Request totalPeople to get the overall count of connections
                requestSyncToken: false, // Set to false if not using sync tokens, to potentially get totalPeople
            });
            const connections = response.data.connections || [];
            const nextPageToken = response.data.nextPageToken || null;
            const totalPeople = response.data.totalPeople || 0; // Total connections for the user
            return {
                statusCode: 200,
                body: JSON.stringify({
                    contacts: connections,
                    nextPageToken: nextPageToken,
                    totalCount: totalPeople, // Use totalPeople for the overall count
                }),
                headers: COMMON_HEADERS,
            };
        }
        catch (error) {
            console.error(`${logPrefix} Error fetching Google contacts:`, error);
            // Check for specific Google API errors
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Check for People API not enabled error
            if ((0, googleConstants_1.isApiNotEnabledError)(errorMessage)) {
                return {
                    statusCode: 503, // Service Unavailable
                    body: JSON.stringify({
                        message: "Google People API is not enabled for this project. Please enable it in Google Cloud Console.",
                        details: "This application needs access to the Google People API. The API must be enabled in the Google Cloud Console for this project.",
                        setup_required: true,
                        error: errorMessage
                    }),
                    headers: COMMON_HEADERS,
                };
            }
            // Check for insufficient scopes error
            if ((0, googleConstants_1.isInsufficientScopeError)(errorMessage)) {
                // Extract scope information from the www-authenticate header if available
                const errorObj = error;
                const wwwAuthHeader = errorObj.response?.headers?.['www-authenticate'] || '';
                const scopeMatch = wwwAuthHeader.match(/scope="([^"]+)"/);
                const suggestedScopes = scopeMatch ? scopeMatch[1].split(' ') : googleConstants_1.GOOGLE_REQUIRED_SCOPES;
                // Log the detailed error information
                console.log(`${logPrefix} Insufficient permissions detected. Required scopes: ${googleConstants_1.GOOGLE_REQUIRED_SCOPES.join(', ')}`);
                console.log(`${logPrefix} Suggested scopes from error: ${suggestedScopes.join(', ')}`);
                // Clear the oauth connection to force re-authentication with correct scopes
                console.log(`${logPrefix} Clearing OAuth connection for user ${userId} due to insufficient scopes`);
                await services_1.supabaseAdmin
                    .from('oauth_connections')
                    .delete()
                    .eq('user_id', userId)
                    .eq('provider', 'google');
                return {
                    statusCode: 401,
                    body: JSON.stringify({
                        message: "Insufficient permissions to access Google contacts. Please reconnect your Google account.",
                        details: "Your Google authorization doesn't include permission to access contacts. Please reconnect to grant the required permissions.",
                        reauth_required: true,
                        required_scopes: googleConstants_1.GOOGLE_REQUIRED_SCOPES,
                        suggested_scopes: suggestedScopes,
                        error: errorMessage
                    }),
                    headers: COMMON_HEADERS,
                };
            }
            return {
                statusCode: 500,
                body: JSON.stringify({
                    message: "Failed to fetch Google contacts",
                    error: errorMessage
                }),
                headers: COMMON_HEADERS,
            };
        }
    }
    // POST: Import selected Google contacts
    if (httpMethod === 'POST') {
        try {
            if (!eventBodyString) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: "Request body is missing." }),
                    headers: COMMON_HEADERS,
                };
            }
            const requestBody = JSON.parse(eventBodyString);
            const { contactsToImport } = requestBody;
            if (!Array.isArray(contactsToImport) || contactsToImport.length === 0) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: "The 'contactsToImport' field must be a non-empty array of Google contact resource names." }),
                    headers: COMMON_HEADERS,
                };
            }
            // Get OAuth token - log the request for debugging
            console.log(`${logPrefix} Attempting to get OAuth token for user ${userId} for contact import`);
            // First attempt to get token for authenticated user
            const accessToken = await getUserOAuthToken(userId);
            // Log result of dedicated token fetch for import
            console.log(`${logPrefix} Token specifically for user ${userId} for import found: ${!!accessToken}`);
            if (!accessToken) {
                return {
                    statusCode: 401,
                    body: JSON.stringify({ message: "Google account not connected or authorization expired. Please reconnect your account." }),
                    headers: COMMON_HEADERS,
                };
            }
            // Set up People API client
            const oauth2Client = new googleapis_1.google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const peopleApi = googleapis_1.google.people({ version: 'v1', auth: oauth2Client });
            // Create a batch import ID
            const importBatchId = (0, uuid_1.v4)();
            // Fetch contact details for each resourceName
            const elberContacts = [];
            const errors = [];
            // Use smaller batch sizes to avoid timeouts on serverless functions
            // Netlify Functions have a 10 second timeout, so we need to limit how many we process at once
            const BATCH_SIZE = 10; // Reduced from 50 to avoid timeouts
            // We'll use a more robust approach that can handle all contacts
            // First fetch details for all contacts selected for import
            // const totalBatches = Math.ceil(contactsToImport.length / BATCH_SIZE); // Removed - not used
            let processedCount = 0;
            const FETCH_LIMIT = 100; // Maximum contacts to process in a single function call (Reduced from 500)
            // Process contacts in larger batches to prevent timeouts
            // This will return data for the first batch immediately and store the rest for background processing
            const processableBatchSize = Math.min(contactsToImport.length, FETCH_LIMIT);
            const initialContactsToImport = contactsToImport.slice(0, processableBatchSize);
            const remainingContactsToImport = contactsToImport.length > FETCH_LIMIT ?
                contactsToImport.slice(FETCH_LIMIT) : [];
            // Initialize queue record variable outside the conditional block to ensure scope
            let processingQueueId = null;
            // Start background processing for remaining contacts if needed
            if (remainingContactsToImport.length > 0) {
                console.log(`${logPrefix} Scheduling background processing for ${remainingContactsToImport.length} additional contacts`);
                // Store remaining contacts in a temporary processing queue
                const { data: queueRecord, error: queueError } = await services_1.supabaseAdmin
                    .from('import_processing_queue')
                    .insert({
                    user_id: userId,
                    provider: 'google',
                    contacts_to_import: remainingContactsToImport,
                    status: 'pending',
                    created_at: new Date().toISOString(),
                    batch_size: BATCH_SIZE,
                    import_batch_id: importBatchId // Add import_batch_id to maintain consistency
                })
                    .select()
                    .single();
                if (queueError) {
                    console.error(`${logPrefix} Failed to queue remaining contacts for processing:`, queueError);
                }
                else if (queueRecord) {
                    processingQueueId = queueRecord.id;
                    console.log(`${logPrefix} Successfully queued ${remainingContactsToImport.length} contacts for background processing with ID: ${processingQueueId}`);
                }
            }
            // Process initial batch immediately
            console.log(`${logPrefix} Processing initial batch of ${initialContactsToImport.length} contacts using getBatchGet.`);
            if (initialContactsToImport.length > 0) {
                try {
                    const batchGetResponse = await peopleApi.people.getBatchGet({
                        resourceNames: initialContactsToImport, // Pass all resource names for the initial batch
                        personFields: 'names,emailAddresses,phoneNumbers,organizations,addresses,biographies,urls,birthdays,nicknames',
                    });
                    if (batchGetResponse.data.responses) {
                        for (const personResponse of batchGetResponse.data.responses) {
                            if (personResponse.person && personResponse.person.resourceName) {
                                // Successfully fetched person
                                const elberContact = googleContactToElberContact(personResponse.person);
                                elberContacts.push(elberContact);
                                processedCount++; // Increment processedCount here
                            }
                            else if (personResponse.status) {
                                // Error for this specific person
                                const resourceNameWithError = personResponse.requestedResourceName || 'unknown resource';
                                errors.push({
                                    code: 'GOOGLE_API_ERROR',
                                    message: `Failed to fetch contact details for ${resourceNameWithError}: ${personResponse.status.message || 'Unknown error'}`,
                                    details: { resourceName: resourceNameWithError, status: personResponse.status }
                                });
                                console.error(`${logPrefix} Error fetching contact ${resourceNameWithError}: ${personResponse.status.message}`);
                            }
                        }
                    }
                    console.log(`${logPrefix} Processed ${processedCount} contacts from initial batch via getBatchGet.`);
                }
                catch (error) {
                    console.error(`${logPrefix} Error in getBatchGet processing:`, error);
                    errors.push({
                        code: 'BATCH_GET_PROCESSING_ERROR',
                        message: `Failed to process initial batch with getBatchGet`,
                        details: error instanceof Error ? error.message : String(error)
                    });
                }
            }
            // Create import history record
            const { data: importHistoryRecord, error: importHistoryError } = await services_1.supabaseAdmin
                .from('import_history')
                .insert([{
                    user_id: userId,
                    source: 'google',
                    total_contacts: contactsToImport.length,
                    successful_imports: 0, // Will update after processing
                    failed_imports: 0, // Will update after processing
                    status: 'processing',
                    created_at: new Date().toISOString()
                }])
                .select('*')
                .single();
            if (importHistoryError || !importHistoryRecord) {
                console.error(`${logPrefix} Failed to create import history record:`, importHistoryError);
            }
            // Import contacts in batches to the contacts table
            const CONTACTS_BATCH_SIZE = 50;
            let successfulImports = 0;
            let failedImports = 0;
            const importErrors = [];
            for (let i = 0; i < elberContacts.length; i += CONTACTS_BATCH_SIZE) {
                const contactsBatch = elberContacts.slice(i, i + CONTACTS_BATCH_SIZE);
                try {
                    // Prepare contacts with user_id and import metadata
                    const contactsToInsert = contactsBatch.map(contact => ({
                        ...contact,
                        user_id: userId,
                        import_source: 'google',
                        import_batch_id: importBatchId,
                        imported_at: new Date().toISOString()
                    }));
                    // Insert contacts
                    const { data, error } = await services_1.supabaseAdmin
                        .from('contacts')
                        .insert(contactsToInsert)
                        .select('contact_id');
                    if (error) {
                        console.error(`${logPrefix} Error inserting contacts batch:`, error);
                        failedImports += contactsBatch.length;
                        importErrors.push({
                            code: 'DATABASE_ERROR',
                            message: `Failed to insert contacts batch: ${error.message}`,
                            details: error
                        });
                    }
                    else {
                        successfulImports += data.length;
                        failedImports += contactsBatch.length - data.length;
                    }
                }
                catch (error) {
                    console.error(`${logPrefix} Error in contacts batch processing:`, error);
                    failedImports += contactsBatch.length;
                    importErrors.push({
                        code: 'BATCH_PROCESSING_ERROR',
                        message: `Failed to process contacts batch ${Math.floor(i / CONTACTS_BATCH_SIZE) + 1}`,
                        details: error instanceof Error ? error.message : String(error)
                    });
                }
            }
            // Update import history record for the initial batch
            if (importHistoryRecord) {
                await services_1.supabaseAdmin
                    .from('import_history')
                    .update({
                    successful_imports: successfulImports,
                    failed_imports: failedImports,
                    status: remainingContactsToImport.length > 0 ? 'partial' :
                        (failedImports === elberContacts.length ? 'failed' :
                            successfulImports === elberContacts.length ? 'completed' : 'partial'),
                    error_details: importErrors.length > 0 ? importErrors : null,
                    completed_at: remainingContactsToImport.length > 0 ? null : new Date().toISOString()
                })
                    .eq('id', importHistoryRecord.id);
            }
            // Determine background processing status
            const backgroundProcessingStarted = remainingContactsToImport.length > 0;
            // Construct response
            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: remainingContactsToImport.length > 0 ?
                        "Google contacts import partially completed, background processing started" :
                        "Google contacts import completed",
                    importBatchId,
                    totalRequested: contactsToImport.length,
                    totalProcessed: elberContacts.length,
                    successfulImports,
                    failedImports,
                    errors: [...errors, ...importErrors],
                    remainingCount: remainingContactsToImport.length,
                    backgroundProcessingStarted,
                    processingQueueId: backgroundProcessingStarted ? processingQueueId : null
                }),
                headers: COMMON_HEADERS,
            };
        }
        catch (error) {
            console.error(`${logPrefix} Error importing Google contacts:`, error);
            // Check for insufficient scopes error in POST as well
            const errorMessage = error instanceof Error ? error.message : String(error);
            if ((0, googleConstants_1.isInsufficientScopeError)(errorMessage)) {
                // Log the detailed error information
                console.log(`${logPrefix} Insufficient permissions detected during import. Required scopes: ${googleConstants_1.GOOGLE_REQUIRED_SCOPES.join(', ')}`);
                // Clear the oauth connection to force re-authentication with correct scopes
                console.log(`${logPrefix} Clearing OAuth connection for user ${userId} due to insufficient scopes during import`);
                await services_1.supabaseAdmin
                    .from('oauth_connections')
                    .delete()
                    .eq('user_id', userId)
                    .eq('provider', 'google');
                return {
                    statusCode: 401,
                    body: JSON.stringify({
                        message: "Insufficient permissions to access Google contacts. Please reconnect your Google account.",
                        details: "Your Google authorization doesn't include permission to access contacts. Please reconnect to grant the required permissions.",
                        reauth_required: true,
                        required_scopes: googleConstants_1.GOOGLE_REQUIRED_SCOPES,
                        error: errorMessage
                    }),
                    headers: COMMON_HEADERS,
                };
            }
            return {
                statusCode: 500,
                body: JSON.stringify({
                    message: "Failed to import Google contacts",
                    error: errorMessage
                }),
                headers: COMMON_HEADERS,
            };
        }
    }
    return {
        statusCode: 405,
        body: JSON.stringify({ message: `Method ${httpMethod} Not Allowed` }),
        headers: { ...COMMON_HEADERS, 'Allow': 'GET, POST' },
    };
};
exports.handler = handler;
//# sourceMappingURL=google-contacts.js.map