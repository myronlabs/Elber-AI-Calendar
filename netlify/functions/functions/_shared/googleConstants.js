"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleErrorType = exports.GOOGLE_REQUIRED_SCOPES = void 0;
exports.isInsufficientScopeError = isInsufficientScopeError;
exports.isApiNotEnabledError = isApiNotEnabledError;
/**
 * Required scopes for Google People API access
 */
exports.GOOGLE_REQUIRED_SCOPES = [
    'https://www.googleapis.com/auth/contacts.readonly',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/contacts.other.readonly'
];
/**
 * Common error types for Google API errors
 */
var GoogleErrorType;
(function (GoogleErrorType) {
    GoogleErrorType["INSUFFICIENT_SCOPE"] = "insufficient_scope";
    GoogleErrorType["TOKEN_EXPIRED"] = "token_expired";
    GoogleErrorType["API_NOT_ENABLED"] = "api_not_enabled";
    GoogleErrorType["UNAUTHORIZED"] = "unauthorized";
    GoogleErrorType["RATE_LIMIT"] = "rate_limit";
    GoogleErrorType["SERVER_ERROR"] = "server_error";
})(GoogleErrorType || (exports.GoogleErrorType = GoogleErrorType = {}));
/**
 * Helper function to check if an error is related to insufficient scopes
 */
function isInsufficientScopeError(errorMessage) {
    return !!(errorMessage.includes("Insufficient Permission") ||
        errorMessage.includes("insufficient_scope") ||
        errorMessage.includes("insufficientPermissions"));
}
/**
 * Helper function to check if an error indicates the API is not enabled
 */
function isApiNotEnabledError(errorMessage) {
    return !!(errorMessage.includes("People API has not been used") ||
        errorMessage.includes("API not enabled") ||
        errorMessage.includes("accessNotConfigured"));
}
//# sourceMappingURL=googleConstants.js.map