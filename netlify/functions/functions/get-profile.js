"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const services_1 = require("../services");
const utils_1 = require("./_shared/utils");
console.log('[get-profile.ts] MODULE LOADED: Attempting to use imported supabaseAdmin.');
if (services_1.supabaseAdmin) {
    console.log('[get-profile.ts] MODULE LOADED: supabaseAdmin import seems successful.');
}
else {
    console.error('[get-profile.ts] MODULE LOADED: supabaseAdmin import FAILED or is undefined. This is critical!');
    // Potentially throw here or ensure the function cannot proceed if supabaseAdmin is not available.
}
const handler = async (event, _context) => {
    console.log("[get-profile.ts] HANDLER_START: Get-profile function invoked. Method:", event.httpMethod);
    console.log("[get-profile.ts] HANDLER_START: Checking supabaseAdmin object availability within handler:", services_1.supabaseAdmin ? 'Available' : 'NOT AVAILABLE - CRITICAL');
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*", // Allow all origins
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Content-Type": "application/json",
    };
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: {
                ...corsHeaders,
                "Access-Control-Allow-Methods": "GET, OPTIONS", // Only GET and OPTIONS are used
            },
            body: "",
        };
    }
    if (event.httpMethod !== "GET") {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: "Method Not Allowed" }),
            headers: corsHeaders, // Use defined CORS headers
        };
    }
    // Use the shared utility to get userId from event
    const userId = (0, utils_1.getUserIdFromEvent)(event, 'get-profile');
    if (!userId) {
        console.warn("[get-profile.ts] AUTH_FAIL: Auth session missing or userId could not be extracted!");
        return {
            statusCode: 401,
            body: JSON.stringify({ message: "Auth session missing!" }),
            headers: corsHeaders, // Use defined CORS headers
        };
    }
    console.log(`[get-profile.ts] USER_ID_OBTAINED: Fetching profile for authenticated user ID: ${userId}`);
    try {
        console.log('[get-profile.ts] DB_QUERY_START: Attempting to query profiles table using supabaseAdmin.');
        const { data: profileDataFromDb, error: profileError } = await services_1.supabaseAdmin
            .from('profiles')
            .select('*') // Select all profile fields, or be specific: 'is_custom_verified, first_name, last_name'
            .eq('id', userId)
            .single();
        if (profileError) {
            if (profileError.code === 'PGRST116') { // "JSON object requested, multiple (or no) rows returned"
                console.warn(`[get-profile.ts] DB_NO_PROFILE: No profile found in 'profiles' table for user ${userId}. Code: PGRST116.`);
                // This case is critical. If a user is authenticated by Supabase (has a valid token) 
                // but has no profile record, it's an inconsistent state. 
                // The frontend logic in AuthContext already handles signing out if 404 is received here.
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: "Profile not found for authenticated user." }),
                    headers: corsHeaders, // Use defined CORS headers
                };
            }
            console.error(`[get-profile.ts] DB_ERROR: Error fetching from 'profiles' table for user ${userId}:`, profileError.message);
            return {
                statusCode: 500,
                body: JSON.stringify({ message: "Server error fetching profile data." }),
                headers: corsHeaders, // Use defined CORS headers
            };
        }
        if (!profileDataFromDb) {
            // Should be caught by PGRST116, but as a safeguard
            console.warn(`[get-profile.ts] DB_NO_DATA: No profile data returned from 'profiles' table for user ${userId} even without error.`);
            return {
                statusCode: 404,
                body: JSON.stringify({ message: "Profile data not available for authenticated user." }),
                headers: corsHeaders, // Use defined CORS headers
            };
        }
        console.log(`[get-profile.ts] AUTH_FETCH_START: Attempting to fetch user auth data (including user_metadata) for user ID: ${userId}`);
        const { data: authUserData, error: authError } = await services_1.supabaseAdmin.auth.admin.getUserById(userId);
        if (authError) {
            console.error(`[get-profile.ts] AUTH_ERROR: Error fetching user auth data for user ${userId}:`, authError.message);
            // Decide if this is fatal or if we can proceed with just profileDataFromDb
            // For settings, user_metadata is crucial, so let's treat it as an error if it fails.
            return {
                statusCode: 500,
                body: JSON.stringify({ message: "Server error fetching user authentication details." }),
                headers: corsHeaders, // Use defined CORS headers
            };
        }
        if (!authUserData || !authUserData.user) {
            console.warn(`[get-profile.ts] AUTH_NO_DATA: No user auth data returned for user ${userId}.`);
            // This is unexpected if the user is authenticated.
            return {
                statusCode: 404,
                body: JSON.stringify({ message: "User authentication details not found." }),
                headers: corsHeaders, // Use defined CORS headers
            };
        }
        const userMetadata = authUserData.user.user_metadata || {};
        console.log(`[get-profile.ts] AUTH_SUCCESS: User auth data fetched. User_metadata keys: ${Object.keys(userMetadata).join(', ')}`);
        // Combine profileDataFromDb with user_metadata
        // user_metadata might have overlapping fields (like email, names if stored there too),
        // decide on precedence or merge carefully. For settings, user_metadata is key.
        // A simple spread might be okay if `profiles` table is source of truth for some fields
        // and user_metadata for others.
        // Here, we merge them, with user_metadata potentially overwriting profileDataFromDb if keys conflict,
        // or more safely, add user_metadata as a nested object or merge specific fields.
        // Given the problem is about missing settings from user_metadata, ensuring it's present is key.
        const combinedData = {
            ...profileDataFromDb, // Data from 'profiles' table
            user_metadata: userMetadata, // All settings from auth.users.user_metadata
            // Optionally, explicitly pull specific fields from user_metadata to the top level if needed by frontend contracts
            // e.g., profile_visibility: userMetadata.profile_visibility,
        };
        // Log a snippet of the combined data for verification, avoiding overly large logs
        const combinedDataLogSample = {
            ...combinedData,
            user_metadata: `Keys: ${Object.keys(combinedData.user_metadata || {}).join(', ')} (actual values hidden)`
        };
        console.log(`[get-profile.ts] DATA_COMBINED: Profile and auth data combined. Sample:`, JSON.stringify(combinedDataLogSample).substring(0, 300));
        console.log(`[get-profile.ts] DB_SUCCESS: Profile data fetched successfully for user ${userId}. Custom verified: ${profileDataFromDb.is_custom_verified}`);
        return {
            statusCode: 200,
            body: JSON.stringify(combinedData),
            headers: corsHeaders, // Use defined CORS headers
        };
    }
    catch (error) {
        let errorMessage = "An unexpected server error occurred.";
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        console.error("[get-profile.ts] UNEXPECTED_ERROR: Unexpected error in handler after auth:", errorMessage, error instanceof Error ? error.stack : undefined);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "An unexpected server error occurred." }), // Keep generic message for client
            headers: corsHeaders, // Use defined CORS headers
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=get-profile.js.map