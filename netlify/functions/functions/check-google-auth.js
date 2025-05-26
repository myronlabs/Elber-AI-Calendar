"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const services_1 = require("../services");
// Log initialization
console.log('[check-google-auth] Initialized with OAuth configuration');
const COMMON_HEADERS = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, max-age=0'
};
const handler = async (event, _context) => {
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
            headers: { ...COMMON_HEADERS, 'Allow': 'GET' },
        };
    }
    const authHeader = event.headers.authorization;
    if (!authHeader) {
        return {
            statusCode: 401,
            body: JSON.stringify({ authorized: false, error: "Authentication required" }),
            headers: COMMON_HEADERS,
        };
    }
    let userId;
    try {
        const token = authHeader.split(' ')[1];
        const { data: { user }, error: supabaseError } = await services_1.supabaseAdmin.auth.getUser(token);
        if (supabaseError || !user) {
            console.warn('[check-google-auth] Invalid Supabase session token:', supabaseError?.message);
            throw new Error('Invalid session');
        }
        userId = user.id;
    }
    catch (e) {
        return {
            statusCode: 401,
            body: JSON.stringify({ authorized: false, error: e.message }),
            headers: COMMON_HEADERS,
        };
    }
    try {
        // Check if user has a valid token with contacts scopes
        const isAuthorized = await services_1.oauthTokenManager.hasValidToken(userId, 'google');
        if (isAuthorized) {
            console.log(`[check-google-auth] Valid access token found for user ${userId}`);
            return {
                statusCode: 200,
                body: JSON.stringify({ authorized: true }),
                headers: COMMON_HEADERS,
            };
        }
        else {
            console.log(`[check-google-auth] No valid token found for user ${userId}`);
            return {
                statusCode: 200,
                body: JSON.stringify({ authorized: false, error: 'No valid token available.' }),
                headers: COMMON_HEADERS,
            };
        }
    }
    catch (e) {
        console.error('[check-google-auth] General error:', e instanceof Error ? e.message : String(e));
        return {
            statusCode: 500,
            body: JSON.stringify({ authorized: false, error: e instanceof Error ? e.message : 'Internal server error' }),
            headers: COMMON_HEADERS,
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=check-google-auth.js.map