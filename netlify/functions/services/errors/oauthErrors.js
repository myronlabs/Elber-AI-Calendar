"use strict";
/**
 * OAuth Error Classes
 *
 * Provides a hierarchy of strongly-typed error classes for OAuth-related operations.
 * This improves error handling by allowing specific error types to be caught and handled,
 * while maintaining a clear inheritance hierarchy.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuthDatabaseError = exports.InsufficientScopeError = exports.TokenRefreshError = exports.TokenExpiredError = exports.TokenNotFoundError = exports.OAuthConfigError = exports.OAuthError = void 0;
/**
 * Base class for all OAuth-related errors
 */
class OAuthError extends Error {
    constructor(message) {
        super(message);
        this.name = 'OAuthError';
        // Ensures proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, OAuthError.prototype);
    }
}
exports.OAuthError = OAuthError;
/**
 * Error thrown when OAuth configuration is invalid or missing
 */
class OAuthConfigError extends OAuthError {
    constructor(message) {
        super(message);
        this.name = 'OAuthConfigError';
        Object.setPrototypeOf(this, OAuthConfigError.prototype);
    }
}
exports.OAuthConfigError = OAuthConfigError;
/**
 * Error thrown when a token cannot be found for a user
 */
class TokenNotFoundError extends OAuthError {
    constructor(userId, provider) {
        super(`No OAuth token found for user ${userId} with provider ${provider}`);
        this.name = 'TokenNotFoundError';
        this.userId = userId;
        this.provider = provider;
        Object.setPrototypeOf(this, TokenNotFoundError.prototype);
    }
}
exports.TokenNotFoundError = TokenNotFoundError;
/**
 * Error thrown when a token is expired and cannot be refreshed
 */
class TokenExpiredError extends OAuthError {
    constructor(userId, provider) {
        super(`OAuth token expired for user ${userId} with provider ${provider} and could not be refreshed`);
        this.name = 'TokenExpiredError';
        this.userId = userId;
        this.provider = provider;
        Object.setPrototypeOf(this, TokenExpiredError.prototype);
    }
}
exports.TokenExpiredError = TokenExpiredError;
/**
 * Error thrown when a token refresh operation fails
 */
class TokenRefreshError extends OAuthError {
    constructor(userId, provider, cause) {
        const baseMessage = `Failed to refresh OAuth token for user ${userId} with provider ${provider}`;
        const fullMessage = cause ? `${baseMessage}: ${cause.message}` : baseMessage;
        super(fullMessage);
        this.name = 'TokenRefreshError';
        this.userId = userId;
        this.provider = provider;
        this.cause = cause;
        Object.setPrototypeOf(this, TokenRefreshError.prototype);
    }
}
exports.TokenRefreshError = TokenRefreshError;
/**
 * Error thrown when a token does not have the required scopes for an operation
 */
class InsufficientScopeError extends OAuthError {
    constructor(userId, provider, requiredScopes, currentScopes) {
        super(`OAuth token for user ${userId} with provider ${provider} has insufficient scopes. ` +
            `Required: ${requiredScopes.join(', ')}. ` +
            `Current: ${currentScopes.join(', ')}`);
        this.name = 'InsufficientScopeError';
        this.userId = userId;
        this.provider = provider;
        this.requiredScopes = requiredScopes;
        this.currentScopes = currentScopes;
        Object.setPrototypeOf(this, InsufficientScopeError.prototype);
    }
}
exports.InsufficientScopeError = InsufficientScopeError;
/**
 * Error thrown when there's a database error during OAuth operations
 */
class OAuthDatabaseError extends OAuthError {
    constructor(operation, cause) {
        const baseMessage = `Database error during OAuth ${operation} operation`;
        const fullMessage = cause ? `${baseMessage}: ${cause.message}` : baseMessage;
        super(fullMessage);
        this.name = 'OAuthDatabaseError';
        this.operation = operation;
        this.cause = cause;
        Object.setPrototypeOf(this, OAuthDatabaseError.prototype);
    }
}
exports.OAuthDatabaseError = OAuthDatabaseError;
//# sourceMappingURL=oauthErrors.js.map