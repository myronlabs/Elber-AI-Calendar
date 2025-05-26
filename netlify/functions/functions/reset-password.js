"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const services_1 = require("../services");
const passwordValidator_1 = require("../utils/passwordValidator"); // Import the requirements
/**
 * Helper function to handle verification during password reset
 * This ensures a consistent approach to verification across the app
 */
async function verifyUserDuringPasswordReset(userId, requestId) {
    try {
        console.log(`[reset-password] Request ${requestId}: Checking verification status for user ${userId}`);
        // First check current verification status
        const { data: profileData, error: profileError } = await services_1.supabaseAdmin
            .from('profiles')
            .select('is_custom_verified')
            .eq('id', userId)
            .single();
        if (profileError && profileError.code !== 'PGRST116') { // PGRST116: 'No rows found' which is acceptable
            console.error(`[reset-password] Request ${requestId}: Error fetching profile (and not PGRST116):`, profileError);
            // We will still attempt to verify the auth user
        }
        if (profileData?.is_custom_verified) {
            console.log(`[reset-password] Request ${requestId}: User ${userId} is already verified via profile.`);
            // Optionally, ensure auth.users.email_confirmed_at is also set
            const { data: authUser, error: authUserError } = await services_1.supabaseAdmin.auth.admin.getUserById(userId);
            if (authUserError) {
                console.warn(`[reset-password] Request ${requestId}: Error fetching auth user ${userId} during pre-verification check:`, authUserError);
            }
            else if (authUser && !authUser.user.email_confirmed_at) {
                console.log(`[reset-password] Request ${requestId}: User ${userId} verified in profile but not in auth. Syncing auth email_confirmed_at.`);
                await services_1.supabaseAdmin.auth.admin.updateUserById(userId, {
                    email_confirm: true,
                    user_metadata: { ...(authUser.user.user_metadata || {}), is_verified: true }
                });
            }
            return true;
        }
        // User is not verified or profile check had issues, proceed to update verification status
        console.log(`[reset-password] Request ${requestId}: Attempting to update verification status for user ${userId}`);
        const [profileUpdateResult, supabaseUpdateResult] = await Promise.all([
            services_1.supabaseAdmin
                .from('profiles')
                .update({
                is_custom_verified: true,
                updated_at: new Date().toISOString()
            })
                .eq('id', userId),
            services_1.supabaseAdmin.auth.admin.updateUserById(userId, {
                email_confirm: true,
                user_metadata: { is_verified: true } // Ensure is_verified is set
            })
        ]);
        const profileUpdateError = profileUpdateResult.error;
        const supabaseUpdateError = supabaseUpdateResult.error;
        if (supabaseUpdateError) {
            console.error(`[reset-password] Request ${requestId}: Error updating Supabase auth user verification for ${userId}:`, supabaseUpdateError);
            if (profileUpdateError) {
                console.error(`[reset-password] Request ${requestId}: Also failed to update profile verification for ${userId}:`, profileUpdateError);
            }
            return false;
        }
        if (profileUpdateError && profileUpdateError.code !== 'PGRST116') { // Allow 'No rows found' for profile update
            console.warn(`[reset-password] Request ${requestId}: Supabase auth user verified for ${userId}, but profile update failed (and not PGRST116):`, profileUpdateError);
        }
        console.log(`[reset-password] Request ${requestId}: Successfully updated verification status for user ${userId}`);
        return true;
    }
    catch (error) {
        console.error(`[reset-password] Request ${requestId}: Unexpected error during verifyUserDuringPasswordReset for ${userId}:`, error);
        return false;
    }
}
const handler = async (event, _context) => {
    const requestId = `reset-password-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    console.log(`[reset-password] Request ${requestId}: FUNCTION INVOKED - Method: ${event.httpMethod}`);
    if (event.httpMethod !== "POST") {
        console.log(`[reset-password] Request ${requestId}: Method not allowed: ${event.httpMethod}`);
        return {
            statusCode: 405,
            body: JSON.stringify({
                message: "Method Not Allowed",
                toast: { type: "error", message: "Invalid request method" }
            }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
    let requestBody;
    try {
        if (!event.body) {
            console.error(`[reset-password] Request ${requestId}: Error - Request body is missing.`);
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: "Request body is missing.",
                    toast: { type: "error", message: "Missing request data" }
                }),
                headers: { 'Content-Type': 'application/json' },
            };
        }
        requestBody = JSON.parse(event.body);
        console.log(`[reset-password] Request ${requestId}: Request body parsed, contains password: ${!!requestBody.password}`);
    }
    catch (error) {
        console.error(`[reset-password] Request ${requestId}: Error - Failed to parse request body.`, error);
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: "Invalid request body. Failed to parse JSON.",
                toast: { type: "error", message: "Invalid request format" }
            }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
    const { password, token, user_id } = requestBody;
    // Validate required fields
    if (!password) {
        console.error(`[reset-password] Request ${requestId}: Error - Missing password.`);
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: "Missing required field: password is required.",
                toast: { type: "error", message: "Password is required" }
            }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
    // Validate password strength using the centralized requirements
    if (password.length < passwordValidator_1.DEFAULT_PASSWORD_REQUIREMENTS.minLength) {
        console.error(`[reset-password] Request ${requestId}: Error - Password too short. Min length: ${passwordValidator_1.DEFAULT_PASSWORD_REQUIREMENTS.minLength}`);
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: `Password must be at least ${passwordValidator_1.DEFAULT_PASSWORD_REQUIREMENTS.minLength} characters long.`,
                toast: { type: "error", message: `Password must be at least ${passwordValidator_1.DEFAULT_PASSWORD_REQUIREMENTS.minLength} characters long` }
            }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
    try {
        // Attempt to update the user's password
        console.log(`[reset-password] Request ${requestId}: Processing password reset request`);
        // Check if we have user_id directly from the request
        if (user_id) {
            // If user_id is provided directly, prioritize it
            console.log(`[reset-password] Request ${requestId}: Using direct user_id parameter for password reset`);
            let wasVerified = false;
            try {
                console.log(`[reset-password] Request ${requestId}: Attempting to verify user ${user_id} as part of password reset.`);
                wasVerified = await verifyUserDuringPasswordReset(user_id, requestId);
                if (wasVerified) {
                    console.log(`[reset-password] Request ${requestId}: User ${user_id} was successfully marked as verified (or already was).`);
                }
                else {
                    console.warn(`[reset-password] Request ${requestId}: User ${user_id} could not be marked as verified during password reset. Proceeding with password update anyway.`);
                }
            }
            catch (verificationError) {
                console.error(`[reset-password] Request ${requestId}: Error during main verification call for ${user_id}:`, verificationError);
                // Continue with password reset even if verification fails, but log the error
            }
            // Now update the password
            console.log(`[reset-password] Request ${requestId}: Updating password for user ${user_id}`);
            const { error } = await services_1.supabaseAdmin.auth.admin.updateUserById(user_id, { password });
            if (error) {
                console.error(`[reset-password] Request ${requestId}: Error updating password with user_id:`, error);
                // Create an appropriate error response
                const response = {
                    success: false,
                    message: "Failed to reset password. The user ID may be invalid.",
                    toast: { type: "error", message: "Invalid user ID for password reset" }
                };
                return {
                    statusCode: 400,
                    body: JSON.stringify(response),
                    headers: { 'Content-Type': 'application/json' },
                };
            }
            // Password reset successful with user_id
            console.log(`[reset-password] Request ${requestId}: Password updated successfully via user_id`);
            // Create a successful response with verification info
            const response = {
                success: true,
                message: "Your password has been reset successfully.",
                toast: { type: "success", message: "Password updated successfully" },
                userId: user_id,
                verified: wasVerified
            };
            return {
                statusCode: 200,
                body: JSON.stringify(response),
                headers: { 'Content-Type': 'application/json' },
            };
        }
        else if (token) {
            // If token is provided, use it to reset the password
            console.log(`[reset-password] Request ${requestId}: Using token-based password reset`);
            let extractedUserId = ''; // Initialize extractedUserId
            // Logic to extract user_id from token - this needs to be robust
            // For Supabase, the access_token from the recovery link is handled by the client.
            // If this function is called with a 'token', it might be a user_id directly,
            // or a custom token that this function needs to resolve to a user_id.
            // The original code parsed `user_id` from a hash.
            // Let's refine the token extraction logic:
            // 1. Check if `token` is a valid UUID (likely a direct user_id).
            // 2. If not, try to parse from a URL hash if it contains common recovery params.
            const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
            if (uuidRegex.test(token)) {
                extractedUserId = token;
                console.log(`[reset-password] Request ${requestId}: Token appears to be a UUID, using as user_id: ${extractedUserId}`);
            }
            else if (token.includes('#')) {
                console.log(`[reset-password] Request ${requestId}: Token contains '#', attempting to parse as URL fragment.`);
                try {
                    // Getting the fragment is not needed for standard Supabase flow
                    // token.substring(token.indexOf('#') + 1);
                    // const params = new URLSearchParams(fragment); // Not needed for standard Supabase flow
                    // Supabase recovery links use 'access_token'. We can't directly get user_id from it here without client sdk.
                    // The old code looked for 'user_id' in params, which isn't standard for Supabase.
                    // If your flow *does* put user_id in the hash, you can use:
                    // const userIdFromHash = params.get('user_id');
                    // if (userIdFromHash) extractedUserId = userIdFromHash;
                    // For now, if it's a hash and not a UUID, we're in an ambiguous state for this backend function
                    // unless the client resolves the user_id first.
                    // The most reliable way is for client to send user_id if known.
                    console.warn(`[reset-password] Request ${requestId}: Token is a hash but cannot reliably extract user_id without client SDK interaction or a non-standard 'user_id' param. This flow might fail if user_id is not otherwise available.`);
                    // If `user_id` was part of the original body, it would have been caught by the `if (user_id)` block.
                    // This 'token' flow without a clear user_id is problematic for `updateUserById`.
                    // We will proceed assuming the `token` *might* be the user_id if not a UUID and not parsable to one.
                    if (!extractedUserId)
                        extractedUserId = token; // Fallback: assume token is user_id
                }
                catch (parseError) {
                    console.error(`[reset-password] Request ${requestId}: Error parsing token as hash:`, parseError);
                    extractedUserId = token; // Fallback: assume token is user_id
                }
            }
            else {
                // Not a UUID, not a hash, assume it's a user_id or a custom token string that is the user_id
                extractedUserId = token;
                console.log(`[reset-password] Request ${requestId}: Token is not a UUID and not a hash, assuming it is user_id: ${extractedUserId}`);
            }
            if (!extractedUserId) {
                console.error(`[reset-password] Request ${requestId}: Critical error - could not determine user ID from token: '${token}'`);
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: "Invalid token or unable to identify user.", toast: { type: "error", message: "Invalid reset link." } }),
                    headers: { 'Content-Type': 'application/json' },
                };
            }
            console.log(`[reset-password] Request ${requestId}: Using extracted/determined userId: ${extractedUserId} for password reset via token flow.`);
            let wasVerified = false;
            try {
                console.log(`[reset-password] Request ${requestId}: Attempting to verify user ${extractedUserId} as part of password reset.`);
                wasVerified = await verifyUserDuringPasswordReset(extractedUserId, requestId);
                if (wasVerified) {
                    console.log(`[reset-password] Request ${requestId}: User ${extractedUserId} was successfully marked as verified (or already was).`);
                }
                else {
                    console.warn(`[reset-password] Request ${requestId}: User ${extractedUserId} could not be marked as verified. Proceeding with password update anyway.`);
                }
            }
            catch (verificationError) {
                console.error(`[reset-password] Request ${requestId}: Error during main verification call for ${extractedUserId}:`, verificationError);
            }
            // Now update the password
            console.log(`[reset-password] Request ${requestId}: Updating password for user ${extractedUserId}`);
            const { error } = await services_1.supabaseAdmin.auth.admin.updateUserById(extractedUserId, { password });
            if (error) {
                console.error(`[reset-password] Request ${requestId}: Error updating password with token:`, error);
                // Create an appropriate error response
                const response = {
                    success: false,
                    message: "Failed to reset password. The token may be invalid or expired.",
                    toast: { type: "error", message: "Invalid or expired reset token" }
                };
                return {
                    statusCode: 400,
                    body: JSON.stringify(response),
                    headers: { 'Content-Type': 'application/json' },
                };
            }
            // Password reset successful with token
            console.log(`[reset-password] Request ${requestId}: Password updated successfully via token`);
            // Create a successful response with verification info
            const response = {
                success: true,
                message: "Your password has been reset successfully.",
                toast: { type: "success", message: "Password updated successfully" },
                userId: extractedUserId,
                verified: wasVerified
            };
            return {
                statusCode: 200,
                body: JSON.stringify(response),
                headers: { 'Content-Type': 'application/json' },
            };
        }
        else {
            // No token or user_id provided
            console.log(`[reset-password] Request ${requestId}: No token or user_id provided, password update should be handled client-side`);
            // Create a response indicating client-side handling needed
            const response = {
                success: true,
                message: "No token or user_id provided. Password reset should be handled client-side.",
                useClientSideUpdate: true,
                toast: { type: "info", message: "Please use the password reset link from your email" }
            };
            return {
                statusCode: 200,
                body: JSON.stringify(response),
                headers: { 'Content-Type': 'application/json' },
            };
        }
    }
    catch (error) {
        const typedError = error instanceof Error ? error : new Error(String(error));
        console.error(`[reset-password] Request ${requestId}: Unexpected error:`, typedError.message, typedError.stack);
        // Create a standard error response
        const response = {
            success: false,
            message: "An unexpected server error occurred during password reset.",
            toast: { type: "error", message: "Server error during password reset" }
        };
        return {
            statusCode: 500,
            body: JSON.stringify(response),
            headers: { 'Content-Type': 'application/json' },
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=reset-password.js.map