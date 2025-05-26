/**
 * OAuth Configuration Service
 * 
 * A centralized service for managing OAuth provider configurations.
 * This follows the dependency injection pattern to make testing and configuration easier.
 * 
 * Using a dedicated configuration service allows us to:
 * 1. Centralize environment variable validation
 * 2. Support multiple OAuth providers consistently
 * 3. Enable easy mocking for testing
 * 4. Ensure type safety across configurations
 */

// Define interfaces for OAuth provider configurations
export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: {
    /** 
     * Basic profile scope - minimal scope required for identification
     * https://developers.google.com/identity/protocols/oauth2/scopes#oauth2
     */
    profile: string;
    
    /** 
     * Read-only access to Google contacts
     * https://developers.google.com/identity/protocols/oauth2/scopes#people
     */
    contactsReadonly: string;
    
    /** 
     * Read-only access to "other contacts" from Gmail, etc.
     * https://developers.google.com/identity/protocols/oauth2/scopes#people
     */
    otherContactsReadonly: string;
    
    /**
     * Read-only access to calendar data
     * https://developers.google.com/identity/protocols/oauth2/scopes#calendar
     */
    calendarReadonly: string;
    
    /**
     * Full access to calendar data (read/write)
     * https://developers.google.com/identity/protocols/oauth2/scopes#calendar
     */
    calendar: string;
  };
}

export interface OAuthProviderConfigs {
  google: GoogleOAuthConfig;
  // Add other providers as needed, like 'microsoft', 'apple', etc.
}

/**
 * Main configuration service class for OAuth providers
 */
export class OAuthConfigService {
  private configs: OAuthProviderConfigs;
  
  constructor() {
    // Initialize with validated configurations
    this.configs = {
      google: this.initializeGoogleConfig()
    };
    
    // Verify that all required configurations are valid
    this.validateConfigurations();
  }
  
  /**
   * Initialize and validate Google OAuth configuration
   */
  private initializeGoogleConfig(): GoogleOAuthConfig {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_CALLBACK_URL || 
                       'https://elber-ai.netlify.app/.netlify/functions/google-oauth/callback';
    
    // Validate environment variables
    if (!clientId) {
      throw new Error('GOOGLE_CLIENT_ID environment variable is required');
    }
    
    if (!clientSecret) {
      throw new Error('GOOGLE_CLIENT_SECRET environment variable is required');
    }
    
    return {
      clientId,
      clientSecret,
      redirectUri,
      scopes: {
        profile: 'https://www.googleapis.com/auth/userinfo.profile',
        contactsReadonly: 'https://www.googleapis.com/auth/contacts.readonly',
        otherContactsReadonly: 'https://www.googleapis.com/auth/contacts.other.readonly',
        calendarReadonly: 'https://www.googleapis.com/auth/calendar.readonly',
        calendar: 'https://www.googleapis.com/auth/calendar'
      }
    };
  }
  
  /**
   * Validate that all required configurations are present
   */
  private validateConfigurations(): void {
    // Validate Google config
    const { google } = this.configs;
    
    if (!google.clientId || !google.clientSecret || !google.redirectUri) {
      throw new Error('Invalid Google OAuth configuration');
    }
    
    // Add validation for other providers as needed
  }
  
  /**
   * Get Google OAuth configuration
   */
  public getGoogleConfig(): GoogleOAuthConfig {
    return this.configs.google;
  }
  
  /**
   * Get all required scopes for a specific feature
   * @param feature - The feature requiring OAuth scopes
   * @returns Array of required scopes
   */
  public getRequiredScopesForFeature(feature: 'contacts' | 'calendar' | 'calendar_readonly'): string[] {
    const { google } = this.configs;
    
    switch (feature) {
      case 'contacts':
        return [
          google.scopes.contactsReadonly,
          google.scopes.otherContactsReadonly,
          google.scopes.profile
        ];
        
      case 'calendar':
        return [
          google.scopes.calendar,
          google.scopes.profile
        ];
        
      case 'calendar_readonly':
        return [
          google.scopes.calendarReadonly,
          google.scopes.profile
        ];
        
      default:
        return [google.scopes.profile];
    }
  }
  
  /**
   * Utility method to check if a scope string contains all required scopes
   * @param tokenScopes - Space-separated scope string from OAuth token
   * @param requiredScopes - Array of required scope strings
   * @returns Boolean indicating if all required scopes are present
   */
  public hasRequiredScopes(tokenScopes: string | null, requiredScopes: string[]): boolean {
    if (!tokenScopes) {
      return false;
    }
    
    const scopeArray = tokenScopes.split(' ');
    return requiredScopes.every(scope => scopeArray.includes(scope));
  }
}

// Singleton instance for use across the application
export const oauthConfigService = new OAuthConfigService();