/**
 * OAuth Error Classes
 * 
 * Provides a hierarchy of strongly-typed error classes for OAuth-related operations.
 * This improves error handling by allowing specific error types to be caught and handled,
 * while maintaining a clear inheritance hierarchy.
 */

/**
 * Base class for all OAuth-related errors
 */
export class OAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthError';
    
    // Ensures proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, OAuthError.prototype);
  }
}

/**
 * Error thrown when OAuth configuration is invalid or missing
 */
export class OAuthConfigError extends OAuthError {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthConfigError';
    
    Object.setPrototypeOf(this, OAuthConfigError.prototype);
  }
}

/**
 * Error thrown when a token cannot be found for a user
 */
export class TokenNotFoundError extends OAuthError {
  public userId: string;
  public provider: string;
  
  constructor(userId: string, provider: string) {
    super(`No OAuth token found for user ${userId} with provider ${provider}`);
    this.name = 'TokenNotFoundError';
    this.userId = userId;
    this.provider = provider;
    
    Object.setPrototypeOf(this, TokenNotFoundError.prototype);
  }
}

/**
 * Error thrown when a token is expired and cannot be refreshed
 */
export class TokenExpiredError extends OAuthError {
  public userId: string;
  public provider: string;
  
  constructor(userId: string, provider: string) {
    super(`OAuth token expired for user ${userId} with provider ${provider} and could not be refreshed`);
    this.name = 'TokenExpiredError';
    this.userId = userId;
    this.provider = provider;
    
    Object.setPrototypeOf(this, TokenExpiredError.prototype);
  }
}

/**
 * Error thrown when a token refresh operation fails
 */
export class TokenRefreshError extends OAuthError {
  public userId: string;
  public provider: string;
  public cause?: Error;
  
  constructor(userId: string, provider: string, cause?: Error) {
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

/**
 * Error thrown when a token does not have the required scopes for an operation
 */
export class InsufficientScopeError extends OAuthError {
  public userId: string;
  public provider: string;
  public requiredScopes: string[];
  public currentScopes: string[];
  
  constructor(
    userId: string, 
    provider: string, 
    requiredScopes: string[], 
    currentScopes: string[]
  ) {
    super(
      `OAuth token for user ${userId} with provider ${provider} has insufficient scopes. ` +
      `Required: ${requiredScopes.join(', ')}. ` +
      `Current: ${currentScopes.join(', ')}`
    );
    
    this.name = 'InsufficientScopeError';
    this.userId = userId;
    this.provider = provider;
    this.requiredScopes = requiredScopes;
    this.currentScopes = currentScopes;
    
    Object.setPrototypeOf(this, InsufficientScopeError.prototype);
  }
}

/**
 * Error thrown when there's a database error during OAuth operations
 */
export class OAuthDatabaseError extends OAuthError {
  public operation: string;
  public cause?: Error;
  
  constructor(operation: string, cause?: Error) {
    const baseMessage = `Database error during OAuth ${operation} operation`;
    const fullMessage = cause ? `${baseMessage}: ${cause.message}` : baseMessage;
    
    super(fullMessage);
    this.name = 'OAuthDatabaseError';
    this.operation = operation;
    this.cause = cause;
    
    Object.setPrototypeOf(this, OAuthDatabaseError.prototype);
  }
}