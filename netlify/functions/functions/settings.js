"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
// Import from supabase-js using ES import syntax
const supabase_js_1 = require("@supabase/supabase-js");
// Initialize supabaseAdmin directly in this file to avoid relative imports
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl) {
    console.error('CRITICAL: SUPABASE_URL is not defined in environment variables.');
    throw new Error('SUPABASE_URL is not defined in environment variables.');
}
if (!supabaseServiceRoleKey) {
    console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY is not defined in environment variables.');
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not defined in environment variables.');
}
// Create a supabase admin client for this function
const supabaseAdmin = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    }
});
// Corrected and type-safe function to update user metadata in Supabase
// with fallback mechanism for different Supabase versions
async function updateUserMetadataInSupabase(userId, metadataToUpdate) {
    console.log(`[settings.ts] Attempting to update user_metadata for userId: ${userId}`);
    console.log('[settings.ts] Metadata to apply:', JSON.stringify(metadataToUpdate, null, 2));
    // In this Supabase configuration, we use raw_user_meta_data directly
    const result = await tryUpdateUserMetadata(userId, { raw_user_meta_data: metadataToUpdate });
    if (result.error) {
        console.error(`[settings.ts] Update attempt failed for userId ${userId}:`, result.error.message, result.error);
        return { data: null, error: result.error };
    }
    // Ensure 'data' and 'data.user' are not null before accessing user_metadata
    if (!result.data || !result.data.user) {
        console.error(`[settings.ts] User data not returned or user is null after update for userId ${userId}. This is unexpected.`);
        return { data: null, error: new Error('User data not returned or user is null after update.') };
    }
    console.log(`[settings.ts] user_metadata updated successfully for userId: ${userId}`);
    // Log the actual user_metadata returned by Supabase
    console.log('[settings.ts] User object after update (from Supabase):', JSON.stringify(result.data.user, null, 2));
    return { data: { user: result.data.user }, error: null };
}
// Helper function to try updating user metadata with different parameter formats
async function tryUpdateUserMetadata(userId, updateParamsInput // This is expected to be an object like { raw_user_meta_data: actual_metadata } or { user_metadata: actual_metadata } etc.
) {
    try {
        let actualMetadataPayload;
        if (updateParamsInput.raw_user_meta_data) {
            actualMetadataPayload = updateParamsInput.raw_user_meta_data;
            console.log('[settings.ts] tryUpdateUserMetadata: Extracted metadata from raw_user_meta_data key.');
        }
        else if (updateParamsInput.user_metadata) {
            actualMetadataPayload = updateParamsInput.user_metadata;
            console.log('[settings.ts] tryUpdateUserMetadata: Extracted metadata from user_metadata key.');
        }
        else if (updateParamsInput.meta) { // legacy support
            actualMetadataPayload = updateParamsInput.meta;
            console.log('[settings.ts] tryUpdateUserMetadata: Extracted metadata from meta key (legacy).');
        }
        else if (updateParamsInput.data && typeof updateParamsInput.data === 'object') { // common pattern for data wrapper
            actualMetadataPayload = updateParamsInput.data;
            console.log('[settings.ts] tryUpdateUserMetadata: Extracted metadata from data key.');
        }
        else if (typeof updateParamsInput === 'object' && updateParamsInput !== null &&
            !Object.prototype.hasOwnProperty.call(updateParamsInput, 'raw_user_meta_data') &&
            !Object.prototype.hasOwnProperty.call(updateParamsInput, 'user_metadata') &&
            !Object.prototype.hasOwnProperty.call(updateParamsInput, 'meta') &&
            !Object.prototype.hasOwnProperty.call(updateParamsInput, 'data')) {
            // If updateParamsInput is the metadata object itself (no wrapper key)
            actualMetadataPayload = updateParamsInput;
            console.log('[settings.ts] tryUpdateUserMetadata: Used input directly as metadata payload.');
        }
        else {
            console.error('[settings.ts] tryUpdateUserMetadata: Could not determine actual metadata payload from input:', JSON.stringify(updateParamsInput, null, 2));
            return { data: null, error: new Error('Invalid parameters structure for metadata update in tryUpdateUserMetadata.') };
        }
        const paramsForSupabaseCall = { user_metadata: actualMetadataPayload };
        console.log(`[settings.ts] tryUpdateUserMetadata: Calling supabaseAdmin.auth.admin.updateUserById with userId: ${userId}.`);
        console.log('[settings.ts] tryUpdateUserMetadata: Parameters for Supabase call:', JSON.stringify(paramsForSupabaseCall, null, 2));
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, paramsForSupabaseCall // Now consistently { user_metadata: { ... } }
        );
        if (error) {
            console.error(`[settings.ts] tryUpdateUserMetadata: Error from supabaseAdmin.auth.admin.updateUserById for userId ${userId}:`, error.message, error);
        }
        else if (!data || !data.user) {
            console.warn(`[settings.ts] tryUpdateUserMetadata: supabaseAdmin.auth.admin.updateUserById returned no user data or null user for userId ${userId}. Response data:`, JSON.stringify(data, null, 2));
        }
        else {
            console.log(`[settings.ts] tryUpdateUserMetadata: Successfully called supabaseAdmin.auth.admin.updateUserById for userId ${userId}.`);
            // console.log('[settings.ts] tryUpdateUserMetadata: Returned user data:', JSON.stringify(data.user, null, 2)); // This might be too verbose for every call, covered by updateUserMetadataInSupabase
        }
        return { data, error };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'An unexpected error occurred during metadata update attempt in tryUpdateUserMetadata';
        const stack = error instanceof Error ? error.stack : undefined;
        console.error(`[settings.ts] tryUpdateUserMetadata: Exception for userId ${userId}:`, message, stack);
        return {
            data: null,
            error: error instanceof Error ? error : new Error(message)
        };
    }
}
// Helper function to handle the UpdateNotificationPreferences action
async function handleUpdateNotificationPreferences(parsedBody, authenticatedUserId, // This is the ID from the validated JWT
_eventHeaders) {
    const effectiveUserId = parsedBody.userId || authenticatedUserId; // Allow admin override for testing if needed
    console.log(`[settings.ts] handleUpdateNotificationPreferences for user ID: ${effectiveUserId}`);
    console.log('[settings.ts] Received notification settings payload:', JSON.stringify(parsedBody.settings, null, 2));
    // Construct metadata object with correct prefixes
    const metadataToUpdate = {};
    if (parsedBody.settings.notifications_general !== undefined) {
        metadataToUpdate.notifications_general = parsedBody.settings.notifications_general;
    }
    if (parsedBody.settings.notifications_marketing_emails !== undefined) {
        metadataToUpdate.notifications_marketing_emails = parsedBody.settings.notifications_marketing_emails;
    }
    if (parsedBody.settings.notifications_in_app !== undefined) {
        metadataToUpdate.notifications_in_app = parsedBody.settings.notifications_in_app;
    }
    if (parsedBody.settings.notifications_reminders !== undefined) {
        metadataToUpdate.notifications_reminders = parsedBody.settings.notifications_reminders;
    }
    // Add a debug timestamp
    metadataToUpdate.debug_last_notification_update_timestamp = new Date().toISOString();
    metadataToUpdate.debug_update_status = 'Attempting notification update';
    if (Object.keys(metadataToUpdate).length === 0) {
        console.log('[settings.ts] No notification settings provided in payload to update.');
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "No notification settings provided to update." }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
    try {
        console.log('[settings.ts] Calling updateUserMetadataInSupabase with prepared notification settings for user ID:', effectiveUserId);
        const { data: updatedUserResponse, error: updateError } = await updateUserMetadataInSupabase(effectiveUserId, metadataToUpdate);
        if (updateError) {
            console.error('[settings.ts] Error updating notification preferences via updateUserMetadataInSupabase:', updateError.message, updateError);
            // Ensure a user-friendly message is sent, but log the detailed error
            return {
                statusCode: 500,
                body: JSON.stringify({ message: `Failed to update notification preferences: ${updateError.message}` }),
                headers: { 'Content-Type': 'application/json' },
            };
        }
        if (!updatedUserResponse || !updatedUserResponse.user) {
            console.error('[settings.ts] User data not returned or user is null after notification preferences update.');
            return {
                statusCode: 500,
                body: JSON.stringify({ message: "Failed to update notification preferences: Server error, user data not returned." }),
                headers: { 'Content-Type': 'application/json' },
            };
        }
        // Extract the relevant part of the metadata that was updated for the response
        const returnedMetadata = updatedUserResponse.user.raw_user_meta_data || updatedUserResponse.user.user_metadata || {};
        const relevantNotificationSettings = {
            notifications_general: returnedMetadata.notifications_general,
            notifications_marketing_emails: returnedMetadata.notifications_marketing_emails,
            notifications_in_app: returnedMetadata.notifications_in_app,
            notifications_reminders: returnedMetadata.notifications_reminders,
        };
        console.log('[settings.ts] Notification preferences updated successfully. Returning updated settings.');
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "Notification preferences updated successfully.",
                updatedSettings: relevantNotificationSettings,
                // Optionally include the full user_metadata if needed for debugging or client-side state update
                // fullUserMetadata: returnedMetadata 
            }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
    catch (fetchErr) {
        const message = fetchErr instanceof Error ? fetchErr.message : 'An unexpected error occurred while updating notification preferences.';
        const stack = fetchErr instanceof Error ? fetchErr.stack : undefined;
        console.error('[settings.ts] Unexpected error in handleUpdateNotificationPreferences:', message, stack);
        return {
            statusCode: 500,
            body: JSON.stringify({ message }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
}
const handler = async (event, _context) => {
    // ########### DEBUG LOGGING START ###########
    console.log("[[[SETTINGS.TS]]] EXECUTION STARTED - TOP OF HANDLER");
    console.log("[[[SETTINGS.TS]]] Received Event Headers:", JSON.stringify(event.headers, null, 2));
    console.log("[[[SETTINGS.TS]]] Received Event HTTP Method:", event.httpMethod);
    console.log("[[[SETTINGS.TS]]] Received Event Body (first 500 chars):", event.body ? event.body.substring(0, 500) : 'null or undefined');
    // ########### DEBUG LOGGING END ###########
    console.log("--- settings.ts function invoked --- A (Post-Debug Logging) ---");
    // 1. Check HTTP Method
    if (event.httpMethod !== "POST") {
        console.warn(`Invalid HTTP method: ${event.httpMethod}. Expected POST.`);
        return {
            statusCode: 405,
            headers: {
                "Content-Type": "application/json",
                "Allow": "POST"
            },
            body: JSON.stringify({ error: "Method Not Allowed", message: "Only POST requests are accepted." }),
        };
    }
    // 2. Authentication Check (using Supabase JWT from Authorization header)
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error("[settings.ts] Authentication error: Authorization header missing or not Bearer token.");
        return {
            statusCode: 401,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Unauthorized", message: "Authentication required: Missing or invalid Bearer token." }),
        };
    }
    const token = authHeader.split(' ')[1];
    let supabaseUser; // Use our defined type
    let userId;
    try {
        // supabaseAdmin.auth.getUser() returns { data: { user: User | null }, error: AuthError | null }
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
        if (userError || !user) {
            console.error("[settings.ts] Supabase auth error: Invalid token or user not found.", userError?.message);
            return {
                statusCode: 401,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: "Unauthorized", message: userError?.message || "Authentication failed: Invalid token." }),
            };
        }
        supabaseUser = user; // Cast to our local type
        userId = supabaseUser.id;
        console.log(`[settings.ts] Authenticated user via Supabase JWT: ${supabaseUser.email} (ID: ${userId})`);
    }
    catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error("[settings.ts] Critical error during Supabase token validation:", errorMessage);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Internal Server Error", message: "An unexpected error occurred during authentication." }),
        };
    }
    // 3. Parse Request Body with Error Handling
    let parsedBody;
    try {
        if (!event.body) {
            throw new Error("Request body is missing or empty.");
        }
        parsedBody = JSON.parse(event.body); // Type assertion to our new discriminated union
        console.log("Successfully parsed request body:", parsedBody);
    }
    catch (e) {
        let errorMessage = "An unknown error occurred during JSON parsing.";
        if (e instanceof Error) {
            errorMessage = e.message;
        }
        console.error("Failed to parse request body as JSON:", errorMessage);
        console.error("Raw request body that failed parsing:", event.body);
        return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Bad Request", message: "Invalid JSON format in request body.", details: errorMessage }),
        };
    }
    // 4. Basic Input Validation
    if (typeof parsedBody !== 'object' || parsedBody === null) {
        console.warn("Parsed request body is not an object.", parsedBody);
        return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Bad Request", message: "Request body must be a JSON object." }),
        };
    }
    const action = parsedBody.action;
    console.log(`[settings.ts] Action: ${action}`);
    let responseMessage = "Request processed.";
    let responseData = {}; // Using Record<string, unknown> for generic response data
    try {
        switch (action) {
            case 'get_settings': {
                console.log(`[settings.ts] User ${userId} requested 'get_settings'.`);
                // Be flexible in reading metadata for the response
                const currentSettingsUserMetadata = supabaseUser.user_metadata || supabaseUser.raw_user_meta_data || {};
                responseData = {
                    message: "Current user settings.",
                    user_metadata: currentSettingsUserMetadata,
                    profile: {
                        first_name: currentSettingsUserMetadata.first_name, // Assumes first_name is part of UserSupabaseMetadata
                        last_name: currentSettingsUserMetadata.last_name, // Assumes last_name is part of UserSupabaseMetadata
                        email: supabaseUser.email
                    }
                };
                responseMessage = "User settings retrieved.";
                break;
            }
            case 'UpdateNotificationPreferences':
                if (!parsedBody.settings) {
                    console.error("[settings.ts] 'settings' field missing in payload for UpdateNotificationPreferences.");
                    return { statusCode: 400, body: JSON.stringify({ error: "Bad Request", message: "'settings' field is required." }) };
                }
                return handleUpdateNotificationPreferences(parsedBody, supabaseUser.id, event.headers);
            case 'update_profile_data': {
                if (parsedBody.action !== 'update_profile_data') {
                    throw new Error("Mismatched action type in update_profile_data handler.");
                }
                const { payload: clientProfileData } = parsedBody;
                if (!clientProfileData || typeof clientProfileData !== 'object') {
                    console.warn('[settings.ts] Invalid or missing payload for update_profile_data');
                    return {
                        statusCode: 400,
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ error: "Bad Request", message: "Missing or invalid 'payload' object for profile data." }),
                    };
                }
                // BEGIN FIX: Fetch fresh user data
                let freshExistingUserMetadataProfile = {};
                try {
                    console.log(`[settings.ts] Attempting to fetch fresh user data for ${userId} in update_profile_data.`);
                    const { data: freshUserDataContainer, error: freshUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
                    if (freshUserError) {
                        console.error(`[settings.ts] Error fetching fresh user data for ${userId} in update_profile_data:`, freshUserError.message);
                        freshExistingUserMetadataProfile = supabaseUser.user_metadata || {};
                        console.warn(`[settings.ts] Using potentially stale metadata for ${userId} in profile_data after fresh fetch failed.`);
                    }
                    else if (freshUserDataContainer && freshUserDataContainer.user) {
                        freshExistingUserMetadataProfile = freshUserDataContainer.user.user_metadata || {};
                        console.log('[settings.ts] Successfully fetched fresh user_metadata for profile_data update:', JSON.stringify(freshExistingUserMetadataProfile, null, 2));
                    }
                    else {
                        console.warn(`[settings.ts] No user data returned from fresh fetch for ${userId} in update_profile_data. Falling back.`);
                        freshExistingUserMetadataProfile = supabaseUser.user_metadata || {};
                    }
                }
                catch (fetchErr) {
                    const errorMessage = fetchErr instanceof Error ? fetchErr.message : 'Unknown error';
                    console.error(`[settings.ts] Exception fetching fresh user data for ${userId} in update_profile_data:`, errorMessage);
                    freshExistingUserMetadataProfile = supabaseUser.raw_user_meta_data || supabaseUser.user_metadata || {};
                    console.warn(`[settings.ts] Using potentially stale metadata for ${userId} in profile_data after exception during fresh fetch.`);
                }
                // END FIX
                // Directly use clientProfileData for mapping as it's not nested under 'settings'
                // And it maps to UserSupabaseMetadata directly for profile fields
                const combinedProfileMetadata = {
                    ...freshExistingUserMetadataProfile, // Use fresh data
                    ...clientProfileData, // Spread the client payload which contains fields like first_name, etc.
                };
                console.log('[settings.ts] Current user_metadata for profile before update (using fresh/fallback):', JSON.stringify(freshExistingUserMetadataProfile, null, 2));
                console.log('[settings.ts] Client profile data to apply:', JSON.stringify(clientProfileData, null, 2));
                console.log('[settings.ts] Combined metadata for profile update (to be saved):', JSON.stringify(combinedProfileMetadata, null, 2));
                const { data: updateOpResult, error: updateError } = await updateUserMetadataInSupabase(userId, combinedProfileMetadata);
                if (updateError || !updateOpResult || !updateOpResult.user) {
                    console.error(`[settings.ts] Failed to update profile data for user ${userId}:`, updateError?.message);
                    return {
                        statusCode: 500,
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ error: "Server Error", message: `Failed to update profile data: ${updateError?.message || 'Unknown error'}` }),
                    };
                }
                const actualUpdatedProfileMetadata = updateOpResult.user.user_metadata || updateOpResult.user.raw_user_meta_data || {};
                console.log('[settings.ts] User metadata from Supabase (read flexibly) after profile update:', JSON.stringify(actualUpdatedProfileMetadata, null, 2));
                responseData = {
                    message: "User profile data updated successfully.",
                    user_metadata: actualUpdatedProfileMetadata,
                };
                break;
            }
            case 'update_privacy_settings': {
                if (parsedBody.action !== 'update_privacy_settings') {
                    throw new Error("Mismatched action type in update_privacy_settings handler.");
                }
                // newPrivacySettingsFromClient will have keys like 'profile_visibility'
                const { settings: newPrivacySettingsFromClient } = parsedBody;
                if (!newPrivacySettingsFromClient || typeof newPrivacySettingsFromClient !== 'object') {
                    console.warn('[settings.ts] Invalid or missing settings object for update_privacy_settings');
                    return {
                        statusCode: 400,
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ error: "Bad Request", message: "Missing or invalid 'settings' object for privacy settings." }),
                    };
                }
                // BEGIN FIX: Fetch fresh user data to get current metadata
                let freshExistingUserMetadata = {};
                try {
                    const { data: freshUserDataContainer, error: freshUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
                    if (freshUserError) {
                        console.error(`[settings.ts] Error fetching fresh user data for ${userId} in privacy settings:`, freshUserError.message);
                        // Proceed with potentially stale metadata from JWT, or handle error more strictly
                    }
                    else if (freshUserDataContainer && freshUserDataContainer.user) {
                        freshExistingUserMetadata = freshUserDataContainer.user.user_metadata || {};
                        console.log('[settings.ts] Successfully fetched fresh user_metadata for privacy update:', JSON.stringify(freshExistingUserMetadata, null, 2));
                    }
                    else {
                        console.warn(`[settings.ts] No user data returned from fresh fetch for ${userId} in privacy settings.`);
                    }
                }
                catch (fetchErr) {
                    const errorMessage = fetchErr instanceof Error ? fetchErr.message : 'Unknown error';
                    console.error(`[settings.ts] Exception fetching fresh user data for ${userId} in privacy settings:`, errorMessage);
                    // Proceed with potentially stale metadata from JWT
                }
                // END FIX
                // Map client payload to BOTH the prefixed and non-prefixed versions to ensure compatibility
                const mappedPrivacySettings = {};
                // Update prefixed fields (new format with privacy_ prefix)
                if (newPrivacySettingsFromClient.profile_visibility !== undefined) {
                    mappedPrivacySettings.privacy_profile_visibility = newPrivacySettingsFromClient.profile_visibility;
                }
                if (newPrivacySettingsFromClient.share_activity_with_contacts !== undefined) {
                    mappedPrivacySettings.privacy_share_activity = newPrivacySettingsFromClient.share_activity_with_contacts;
                }
                if (newPrivacySettingsFromClient.allow_contact_requests !== undefined) {
                    mappedPrivacySettings.privacy_allow_contact_requests = newPrivacySettingsFromClient.allow_contact_requests;
                }
                // ALSO update the unprefixed fields (legacy format) to ensure both versions stay in sync
                if (newPrivacySettingsFromClient.profile_visibility !== undefined) {
                    mappedPrivacySettings.profile_visibility = newPrivacySettingsFromClient.profile_visibility;
                }
                if (newPrivacySettingsFromClient.share_activity_with_contacts !== undefined) {
                    mappedPrivacySettings.share_activity_with_contacts = newPrivacySettingsFromClient.share_activity_with_contacts;
                }
                if (newPrivacySettingsFromClient.allow_contact_requests !== undefined) {
                    mappedPrivacySettings.allow_contact_requests = newPrivacySettingsFromClient.allow_contact_requests;
                }
                // Use the freshly fetched metadata
                const existingUserMetadata = freshExistingUserMetadata;
                console.log('[settings.ts] Current user_metadata for privacy before update (using fresh/fallback):', JSON.stringify(existingUserMetadata, null, 2));
                console.log('[settings.ts] Mapped privacy settings (with both prefixed and unprefixed fields) to apply:', JSON.stringify(mappedPrivacySettings, null, 2));
                const metadataPayloadToUpdate = {
                    ...existingUserMetadata,
                    ...mappedPrivacySettings, // Use the mapped settings with both prefixed and unprefixed fields
                };
                console.log('[settings.ts] Combined metadata for privacy update (to be saved):', JSON.stringify(metadataPayloadToUpdate, null, 2));
                const { data: updateOpResult, error: updateError } = await updateUserMetadataInSupabase(userId, metadataPayloadToUpdate);
                if (updateError || !updateOpResult || !updateOpResult.user) {
                    console.error(`[settings.ts] Failed to update privacy settings for user ${userId}:`, updateError?.message);
                    return {
                        statusCode: 500,
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ error: "Server Error", message: `Failed to update privacy settings: ${updateError?.message || 'Unknown error'}` }),
                    };
                }
                // Be flexible in reading metadata after privacy update
                const actualUpdatedPrivacyMetadata = updateOpResult.user.user_metadata || updateOpResult.user.raw_user_meta_data || {};
                console.log('[settings.ts] User metadata from Supabase (read flexibly) after privacy update:', JSON.stringify(actualUpdatedPrivacyMetadata, null, 2));
                responseData = {
                    message: "User privacy settings updated successfully.",
                    updatedSettings: mappedPrivacySettings,
                    user_metadata: actualUpdatedPrivacyMetadata,
                };
                break;
            }
            case 'update_security_settings': {
                if (parsedBody.action !== 'update_security_settings') {
                    throw new Error("Mismatched action type in update_security_settings handler.");
                }
                const { settings: clientSettings } = parsedBody;
                if (!clientSettings || typeof clientSettings !== 'object') {
                    return { statusCode: 400, body: JSON.stringify({ error: "Bad Request", message: "Missing or invalid 'settings' object for security settings." }), headers: { "Content-Type": "application/json" } };
                }
                // BEGIN FIX: Fetch fresh user data to get current metadata
                let freshExistingUserMetadataSec = {};
                try {
                    console.log(`[settings.ts] Attempting to fetch fresh user data for ${userId} in security settings.`);
                    const { data: freshUserDataContainer, error: freshUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
                    if (freshUserError) {
                        console.error(`[settings.ts] Error fetching fresh user data for ${userId} in security settings:`, freshUserError.message);
                        // Fallback to metadata from JWT user object if fresh fetch fails
                        freshExistingUserMetadataSec = supabaseUser.user_metadata || {};
                        console.warn(`[settings.ts] Using potentially stale metadata for ${userId} in security after fresh fetch failed.`);
                    }
                    else if (freshUserDataContainer && freshUserDataContainer.user) {
                        freshExistingUserMetadataSec = freshUserDataContainer.user.user_metadata || {};
                        console.log('[settings.ts] Successfully fetched fresh user_metadata for security update:', JSON.stringify(freshExistingUserMetadataSec, null, 2));
                    }
                    else {
                        console.warn(`[settings.ts] No user data returned from fresh fetch for ${userId} in security settings. Falling back.`);
                        freshExistingUserMetadataSec = supabaseUser.user_metadata || {};
                    }
                }
                catch (fetchErr) {
                    const errorMessage = fetchErr instanceof Error ? fetchErr.message : 'Unknown error';
                    console.error(`[settings.ts] Exception fetching fresh user data for ${userId} in security settings:`, errorMessage);
                    freshExistingUserMetadataSec = supabaseUser.raw_user_meta_data || supabaseUser.user_metadata || {};
                    console.warn(`[settings.ts] Using potentially stale metadata for ${userId} in security after exception during fresh fetch.`);
                }
                // END FIX
                const mappedSettings = {};
                if (clientSettings.activity_log_retention_preference !== undefined) {
                    mappedSettings.security_activity_log_retention_preference = clientSettings.activity_log_retention_preference;
                }
                if (clientSettings.share_login_status_preference !== undefined) {
                    mappedSettings.security_share_login_status_preference = clientSettings.share_login_status_preference;
                }
                const existingUserMetadata = freshExistingUserMetadataSec;
                const metadataPayloadToUpdate = { ...existingUserMetadata, ...mappedSettings };
                const { data: updateOpResult, error: updateError } = await updateUserMetadataInSupabase(userId, metadataPayloadToUpdate);
                if (updateError || !updateOpResult || !updateOpResult.user) {
                    return { statusCode: 500, body: JSON.stringify({ error: "Server Error", message: `Failed to update security settings: ${updateError?.message || 'Unknown error'}` }), headers: { "Content-Type": "application/json" } };
                }
                const actualUpdatedUserMetadata = updateOpResult.user.user_metadata || updateOpResult.user.raw_user_meta_data || {};
                responseData = {
                    message: "User security settings updated successfully.",
                    updatedSettings: mappedSettings,
                    user_metadata: actualUpdatedUserMetadata,
                };
                break;
            }
            case 'update_contact_organization_settings': {
                if (parsedBody.action !== 'update_contact_organization_settings') {
                    throw new Error("Mismatched action type in update_contact_organization_settings handler.");
                }
                const { settings: clientSettings } = parsedBody;
                if (!clientSettings || typeof clientSettings !== 'object') {
                    return { statusCode: 400, body: JSON.stringify({ error: "Bad Request", message: "Missing or invalid 'settings' object for contact organization settings." }), headers: { "Content-Type": "application/json" } };
                }
                // BEGIN FIX: Fetch fresh user data
                let freshExistingUserMetadataContact = {};
                try {
                    console.log(`[settings.ts] Attempting to fetch fresh user data for ${userId} in contact_organization settings.`);
                    const { data: freshUserDataContainer, error: freshUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
                    if (freshUserError) {
                        console.error(`[settings.ts] Error fetching fresh user data for ${userId} in contact_organization settings:`, freshUserError.message);
                        freshExistingUserMetadataContact = supabaseUser.user_metadata || {};
                        console.warn(`[settings.ts] Using potentially stale metadata for ${userId} in contact_organization after fresh fetch failed.`);
                    }
                    else if (freshUserDataContainer && freshUserDataContainer.user) {
                        freshExistingUserMetadataContact = freshUserDataContainer.user.user_metadata || {};
                        console.log('[settings.ts] Successfully fetched fresh user_metadata for contact_organization update:', JSON.stringify(freshExistingUserMetadataContact, null, 2));
                    }
                    else {
                        console.warn(`[settings.ts] No user data returned from fresh fetch for ${userId} in contact_organization settings. Falling back.`);
                        freshExistingUserMetadataContact = supabaseUser.user_metadata || {};
                    }
                }
                catch (fetchErr) {
                    const errorMessage = fetchErr instanceof Error ? fetchErr.message : 'Unknown error';
                    console.error(`[settings.ts] Exception fetching fresh user data for ${userId} in contact_organization settings:`, errorMessage);
                    freshExistingUserMetadataContact = supabaseUser.raw_user_meta_data || supabaseUser.user_metadata || {};
                    console.warn(`[settings.ts] Using potentially stale metadata for ${userId} in contact_organization after exception during fresh fetch.`);
                }
                // END FIX
                const mappedSettings = {};
                if (clientSettings.default_sort_order !== undefined) {
                    mappedSettings.contacts_default_sort_order = clientSettings.default_sort_order;
                }
                if (clientSettings.view_density !== undefined) {
                    mappedSettings.contacts_view_density = clientSettings.view_density;
                }
                const existingUserMetadata = freshExistingUserMetadataContact; // Use fresh data
                const metadataPayloadToUpdate = { ...existingUserMetadata, ...mappedSettings };
                const { data: updateOpResult, error: updateError } = await updateUserMetadataInSupabase(userId, metadataPayloadToUpdate);
                if (updateError || !updateOpResult || !updateOpResult.user) {
                    return { statusCode: 500, body: JSON.stringify({ error: "Server Error", message: `Failed to update contact organization settings: ${updateError?.message || 'Unknown error'}` }), headers: { "Content-Type": "application/json" } };
                }
                const actualUpdatedUserMetadata = updateOpResult.user.user_metadata || updateOpResult.user.raw_user_meta_data || {};
                responseData = {
                    message: "User contact organization settings updated successfully.",
                    updatedSettings: mappedSettings,
                    user_metadata: actualUpdatedUserMetadata,
                };
                break;
            }
            case 'update_integration_settings': {
                if (parsedBody.action !== 'update_integration_settings') {
                    throw new Error("Mismatched action type in update_integration_settings handler.");
                }
                const { settings: clientSettings } = parsedBody;
                if (!clientSettings || typeof clientSettings !== 'object') {
                    return { statusCode: 400, body: JSON.stringify({ error: "Bad Request", message: "Missing or invalid 'settings' object for integration settings." }), headers: { "Content-Type": "application/json" } };
                }
                // BEGIN FIX: Fetch fresh user data
                let freshExistingUserMetadataIntegration = {};
                try {
                    console.log(`[settings.ts] Attempting to fetch fresh user data for ${userId} in integration settings.`);
                    const { data: freshUserDataContainer, error: freshUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
                    if (freshUserError) {
                        console.error(`[settings.ts] Error fetching fresh user data for ${userId} in integration settings:`, freshUserError.message);
                        freshExistingUserMetadataIntegration = supabaseUser.user_metadata || {};
                        console.warn(`[settings.ts] Using potentially stale metadata for ${userId} in integration after fresh fetch failed.`);
                    }
                    else if (freshUserDataContainer && freshUserDataContainer.user) {
                        freshExistingUserMetadataIntegration = freshUserDataContainer.user.user_metadata || {};
                        console.log('[settings.ts] Successfully fetched fresh user_metadata for integration update:', JSON.stringify(freshExistingUserMetadataIntegration, null, 2));
                    }
                    else {
                        console.warn(`[settings.ts] No user data returned from fresh fetch for ${userId} in integration settings. Falling back.`);
                        freshExistingUserMetadataIntegration = supabaseUser.user_metadata || {};
                    }
                }
                catch (fetchErr) {
                    const errorMessage = fetchErr instanceof Error ? fetchErr.message : 'Unknown error';
                    console.error(`[settings.ts] Exception fetching fresh user data for ${userId} in integration settings:`, errorMessage);
                    freshExistingUserMetadataIntegration = supabaseUser.user_metadata || {};
                    console.warn(`[settings.ts] Using potentially stale metadata for ${userId} in integration after exception during fresh fetch.`);
                }
                // END FIX
                const mappedSettings = {};
                if (clientSettings.google_calendar_sync_enabled !== undefined) {
                    mappedSettings.integrations_google_calendar_sync_enabled = clientSettings.google_calendar_sync_enabled;
                }
                if (clientSettings.zoom_default_meeting_type !== undefined) {
                    mappedSettings.integrations_zoom_default_meeting_type = clientSettings.zoom_default_meeting_type;
                }
                const existingUserMetadata = freshExistingUserMetadataIntegration; // Use fresh data
                const metadataPayloadToUpdate = { ...existingUserMetadata, ...mappedSettings };
                const { data: updateOpResult, error: updateError } = await updateUserMetadataInSupabase(userId, metadataPayloadToUpdate);
                if (updateError || !updateOpResult || !updateOpResult.user) {
                    return { statusCode: 500, body: JSON.stringify({ error: "Server Error", message: `Failed to update integration settings: ${updateError?.message || 'Unknown error'}` }), headers: { "Content-Type": "application/json" } };
                }
                const actualUpdatedUserMetadata = updateOpResult.user.user_metadata || updateOpResult.user.raw_user_meta_data || {};
                responseData = {
                    message: "User integration settings updated successfully.",
                    updatedSettings: mappedSettings,
                    user_metadata: actualUpdatedUserMetadata,
                };
                break;
            }
            default: {
                // Type safety: This block should ideally be unreachable if all actions are handled
                // However, as a fallback for undefined actions:
                const unhandledAction = action; // This will cause a type error if 'action' is not exhausted
                console.warn(`[settings.ts] Unhandled action: ${unhandledAction}`);
                return {
                    statusCode: 400,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ error: "Bad Request", message: `Unknown action: ${unhandledAction}` }),
                };
            }
        }
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(responseData.message ? responseData : { message: responseMessage, data: responseData }),
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'An unexpected error occurred while processing your request.';
        const stack = error instanceof Error ? error.stack : undefined;
        console.error(`[settings.ts] Error processing action '${action}':`, message, stack);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Internal Server Error", message: `An error occurred while processing your request: ${message}` }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=settings.js.map