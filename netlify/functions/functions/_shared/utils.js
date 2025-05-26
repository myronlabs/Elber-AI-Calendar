"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInternalApiBaseUrl = exports.getUserIdFromEvent = exports.isValidUUID = void 0;
exports.getInternalHeaders = getInternalHeaders;
const jwt_decode_1 = require("jwt-decode");
/**
 * Validates if the given string is a valid UUID.
 * @param uuid The string to validate.
 * @returns True if the string is a valid UUID, false otherwise.
 */
const isValidUUID = (uuid) => {
    if (!uuid)
        return false;
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return uuidRegex.test(uuid);
};
exports.isValidUUID = isValidUUID;
/**
 * Extracts the user ID (subject) from a JWT in the Authorization header.
 * @param event The Netlify handler event object.
 * @param functionName Optional name of the calling function for logging purposes.
 * @returns The user ID (sub claim) if found and valid, otherwise null.
 */
const getUserIdFromEvent = (event, functionName = 'shared-utils') => {
    const authHeader = event.headers?.authorization;
    const logPrefix = `[${functionName}]`;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7); // Remove "Bearer " prefix
        try {
            const decodedToken = (0, jwt_decode_1.jwtDecode)(token);
            if (decodedToken && decodedToken.sub) {
                console.log(`${logPrefix} Extracted user ID (sub): ${decodedToken.sub} from JWT.`);
                return decodedToken.sub;
            }
            else {
                console.warn(`${logPrefix} JWT decoded but did not contain a sub (user ID) claim. Decoded token:`, decodedToken);
                return null;
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error during JWT decoding.';
            console.error(`${logPrefix} Error decoding JWT: ${errorMessage}`, error);
            return null;
        }
    }
    // Warn if no auth header to help with debugging, but don't log all headers for security.
    if (!authHeader) {
        console.warn(`${logPrefix} No Authorization header found.`);
    }
    else if (!authHeader.startsWith('Bearer ')) {
        console.warn(`${logPrefix} Authorization header found but is not a Bearer token.`);
    }
    return null;
};
exports.getUserIdFromEvent = getUserIdFromEvent;
/**
 * Constructs the base URL for internal API calls.
 * Uses Netlify environment variables (URL, DEPLOY_PRIME_URL) or defaults to localhost for Netlify Dev.
 * This URL can then be used as a base to construct full paths to other Netlify functions or API endpoints.
 * @returns The base URL string (e.g., "https://your-site.netlify.app" or "http://localhost:8888").
 */
const getInternalApiBaseUrl = () => {
    const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:8888';
    // Ensure no trailing slash on the original baseUrl
    const cleanedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return cleanedBaseUrl;
};
exports.getInternalApiBaseUrl = getInternalApiBaseUrl;
/**
 * Generates a standard set of headers for internal API calls.
 * Includes 'Content-Type: application/json' and forwards the Authorization header from the original event.
 * @param eventHeaders The headers from the original HandlerEvent.
 * @returns A record of HTTP headers.
 */
function getInternalHeaders(eventHeaders = {}) {
    const headers = {
        'Content-Type': 'application/json',
    };
    // Forward the original Authorization header if present, as internal services might need it.
    if (eventHeaders?.authorization) {
        headers['Authorization'] = eventHeaders.authorization;
    }
    // Add other headers if they need to be consistently forwarded, e.g., for tracing or context.
    // Example: 
    // if (eventHeaders?.['x-request-id']) {
    //   headers['x-request-id'] = eventHeaders['x-request-id'];
    // }
    return headers;
}
//# sourceMappingURL=utils.js.map