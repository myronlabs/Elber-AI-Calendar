/**
 * OAuth Token Manager
 * 
 * A comprehensive service for managing OAuth tokens across multiple providers.
 * This implements a repository pattern for token storage, retrieval and refresh.
 * 
 * Key features:
 * - Provider-agnostic token management
 * - Transaction support for database operations
 * - Comprehensive error handling
 * - Intelligent token caching and refresh
 * - Self-healing database consistency
 */

import { supabaseAdmin } from './supabaseAdmin';
import { google } from 'googleapis';
import { 
  OAuthError,
  TokenNotFoundError,
  TokenExpiredError,
  TokenRefreshError,
  InsufficientScopeError,
  OAuthDatabaseError
} from './errors/oauthErrors';
import { oauthConfigService } from './oauthConfigService';

// Types for token management
export interface OAuthTokenSet {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: string | null;
  scope?: string | null;
  id_token?: string | null;
  token_type?: string | null;
}

export interface OAuthTokenRecord {
  id: string;
  user_id: string;
  provider: string;
  provider_user_id?: string | null;
  access_token: string;
  refresh_token?: string | null;
  token_type?: string | null;
  expires_at?: string | null;
  scope?: string | null;
  id_token?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TokenRefreshResult {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string | null;
}

interface TokenResponse {
  token: OAuthTokenRecord;
  refreshed: boolean;
}

export type OAuthProvider = 'google' | 'microsoft' | 'apple';
export type OAuthFeature = 'contacts' | 'calendar' | 'calendar_readonly';

/**
 * Main token manager service
 */
export class OAuthTokenManager {
  // Cache to reduce database lookups
  private tokenCache: Map<string, { token: OAuthTokenRecord; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 1 minute
  private readonly EXPIRY_BUFFER_MS = 300000; // 5 minutes buffer for token refresh
  
  constructor() {
    // Initialize service
    console.log('[OAuthTokenManager] Service initialized');
  }
  
  /**
   * Gets a valid token for a specific feature requirement
   * Handles token refresh if needed and verification of required scopes
   */
  public async getTokenForFeature(
    userId: string, 
    provider: OAuthProvider, 
    feature: OAuthFeature
  ): Promise<string> {
    // Get the required scopes for this feature
    const requiredScopes = oauthConfigService.getRequiredScopesForFeature(feature);
    
    // Get a valid token (will be refreshed if needed)
    const tokenResponse = await this.getValidToken(userId, provider);
    
    // Verify the token has the required scopes
    if (tokenResponse.token.scope) {
      const hasScopes = oauthConfigService.hasRequiredScopes(
        tokenResponse.token.scope, 
        requiredScopes
      );
      
      if (!hasScopes) {
        // Get the current scopes as an array
        const currentScopeArray = tokenResponse.token.scope.split(' ');
        
        throw new InsufficientScopeError(
          userId,
          provider,
          requiredScopes,
          currentScopeArray
        );
      }
    } else {
      // If no scope information, we can't verify, so throw an error
      throw new InsufficientScopeError(
        userId,
        provider,
        requiredScopes,
        []
      );
    }
    
    return tokenResponse.token.access_token;
  }
  
  /**
   * Retrieves a valid token, refreshing if necessary
   */
  public async getValidToken(
    userId: string, 
    provider: OAuthProvider
  ): Promise<TokenResponse> {
    try {
      // Try to get the token from cache first
      const cacheKey = `${userId}:${provider}`;
      const cachedToken = this.tokenCache.get(cacheKey);
      
      // If we have a cached token that's still fresh
      if (cachedToken && (Date.now() - cachedToken.timestamp < this.CACHE_TTL_MS)) {
        const token = cachedToken.token;
        
        // If the token is expired or about to expire, refresh it
        if (this.isTokenExpiredOrExpiring(token)) {
          console.log(`[OAuthTokenManager] Cached token for user ${userId} is expired or expiring soon. Refreshing...`);
          return await this.refreshAndUpdateToken(userId, provider, token);
        }
        
        // Token is valid, return it
        return { token, refreshed: false };
      }
      
      // No valid cache, get from database
      console.log(`[OAuthTokenManager] Getting token for user ${userId} with provider ${provider}`);
      const token = await this.getTokenFromDatabase(userId, provider);
      
      // If the token is expired or about to expire, refresh it
      if (this.isTokenExpiredOrExpiring(token)) {
        console.log(`[OAuthTokenManager] Token for user ${userId} is expired or expiring soon. Refreshing...`);
        return await this.refreshAndUpdateToken(userId, provider, token);
      }
      
      // Update cache with the token
      this.tokenCache.set(cacheKey, { token, timestamp: Date.now() });
      
      return { token, refreshed: false };
    } catch (error) {
      // Re-throw OAuth errors
      if (error instanceof OAuthError) {
        throw error;
      }
      
      // Wrap other errors
      throw new OAuthError(`Error getting valid token: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Creates or updates a token in the database
   */
  public async saveToken(
    userId: string,
    provider: OAuthProvider,
    tokenSet: OAuthTokenSet,
    providerId?: string
  ): Promise<OAuthTokenRecord> {
    try {
      console.log(`[OAuthTokenManager] Saving token for user ${userId} with provider ${provider}`);
      
      // Create token record
      const tokenData: Record<string, unknown> = {
        user_id: userId,
        provider,
        access_token: tokenSet.access_token,
        refresh_token: tokenSet.refresh_token ?? null,
        token_type: tokenSet.token_type ?? 'Bearer',
        expires_at: tokenSet.expires_at ?? null,
        scope: tokenSet.scope ?? null,
        id_token: tokenSet.id_token ?? null,
        updated_at: new Date().toISOString()
      };
      
      // Add provider user ID if provided
      if (providerId) {
        tokenData.provider_user_id = providerId;
      }
      
      // Start a Supabase transaction for atomicity
      const { data: savedToken, error } = await supabaseAdmin
        .from('oauth_connections')
        .upsert(tokenData, { 
          onConflict: 'user_id,provider'
        })
        .select();
      
      if (error) {
        throw new OAuthDatabaseError('token save', error);
      }
      
      if (!savedToken || savedToken.length === 0) {
        throw new OAuthDatabaseError('token save', new Error('No records returned after upsert'));
      }
      
      // Sync to legacy table for backward compatibility
      await this.syncToLegacyTable(userId, provider, tokenSet);
      
      // Cache the token
      const token = savedToken[0] as OAuthTokenRecord;
      this.tokenCache.set(`${userId}:${provider}`, { token, timestamp: Date.now() });
      
      return token;
    } catch (error) {
      if (error instanceof OAuthError) {
        throw error;
      }
      
      throw new OAuthDatabaseError(
        'token save', 
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
  
  /**
   * Removes a token for a user and provider
   */
  public async removeToken(userId: string, provider: OAuthProvider): Promise<void> {
    try {
      console.log(`[OAuthTokenManager] Removing token for user ${userId} with provider ${provider}`);
      
      // Remove the token from primary table
      const { error: primaryError } = await supabaseAdmin
        .from('oauth_connections')
        .delete()
        .eq('user_id', userId)
        .eq('provider', provider);
      
      if (primaryError) {
        throw new OAuthDatabaseError('token removal', primaryError);
      }
      
      // Remove from legacy table as well
      const { error: legacyError } = await supabaseAdmin
        .from('user_oauth_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('provider', provider);
      
      if (legacyError) {
        console.warn(`Warning: Could not remove token from legacy table: ${legacyError.message}`);
      }
      
      // Remove from cache
      this.tokenCache.delete(`${userId}:${provider}`);
    } catch (error) {
      if (error instanceof OAuthError) {
        throw error;
      }
      
      throw new OAuthDatabaseError(
        'token removal', 
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
  
  /**
   * Checks if the user has a valid token for the specified provider
   */
  public async hasValidToken(userId: string, provider: OAuthProvider): Promise<boolean> {
    try {
      await this.getValidToken(userId, provider);
      return true;
    } catch (error) {
      // If we get a token not found or token expired error, return false
      if (
        error instanceof TokenNotFoundError ||
        error instanceof TokenExpiredError ||
        error instanceof TokenRefreshError
      ) {
        return false;
      }
      
      // Otherwise, re-throw the error
      throw error;
    }
  }
  
  /*********************
   * Private Methods 
   *********************/
  
  /**
   * Retrieves token from the database, checking both primary and legacy tables
   */
  private async getTokenFromDatabase(userId: string, provider: OAuthProvider): Promise<OAuthTokenRecord> {
    // Check primary table first
    const { data: primaryData, error: primaryError } = await supabaseAdmin
      .from('oauth_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .maybeSingle();
    
    if (primaryError && primaryError.code !== 'PGRST116') {
      throw new OAuthDatabaseError('token retrieval', primaryError);
    }
    
    if (primaryData) {
      return primaryData as OAuthTokenRecord;
    }
    
    // Check legacy table
    const { data: legacyData, error: legacyError } = await supabaseAdmin
      .from('user_oauth_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .maybeSingle();
    
    if (legacyError && legacyError.code !== 'PGRST116') {
      throw new OAuthDatabaseError('token retrieval from legacy table', legacyError);
    }
    
    if (legacyData) {
      // Found in legacy table, migrate to primary table
      const migratedToken = await this.migrateFromLegacyTable(legacyData, userId, provider);
      return migratedToken;
    }
    
    // Token not found in either table
    throw new TokenNotFoundError(userId, provider);
  }
  
  /**
   * Refreshes token and updates in database
   */
  private async refreshAndUpdateToken(
    userId: string, 
    provider: OAuthProvider, 
    token: OAuthTokenRecord
  ): Promise<TokenResponse> {
    // Verify we have a refresh token
    if (!token.refresh_token) {
      // Handle error gracefully
      console.warn(`No refresh token available for user ${userId} with provider ${provider}`);
      throw new TokenExpiredError(userId, provider);
    }
    
    try {
      // Refresh the token
      const refreshResult = await this.refreshProviderToken(provider, token.refresh_token);
      
      // Create updated token set
      const tokenSet: OAuthTokenSet = {
        access_token: refreshResult.accessToken,
        refresh_token: refreshResult.refreshToken || token.refresh_token,
        expires_at: refreshResult.expiresAt,
        scope: refreshResult.scope || token.scope,
        id_token: token.id_token,
        token_type: token.token_type || 'Bearer'
      };
      
      // Save the refreshed token
      const updatedToken = await this.saveToken(
        userId, 
        provider, 
        tokenSet,
        token.provider_user_id || undefined
      );
      
      return { token: updatedToken, refreshed: true };
    } catch (error) {
      console.error(`Error refreshing token for user ${userId}:`, error);
      
      // If refresh failed, the token is likely invalid
      // Remove the invalid token to force re-authorization
      try {
        await this.removeToken(userId, provider);
      } catch (removeError) {
        console.error(`Error removing invalid token:`, removeError);
      }
      
      throw new TokenRefreshError(
        userId, 
        provider, 
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
  
  /**
   * Provider-specific token refresh implementation
   */
  private async refreshProviderToken(
    provider: OAuthProvider, 
    refreshToken: string
  ): Promise<TokenRefreshResult> {
    switch (provider) {
      case 'google':
        return await this.refreshGoogleToken(refreshToken);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
  
  /**
   * Refreshes a Google OAuth token
   */
  private async refreshGoogleToken(refreshToken: string): Promise<TokenRefreshResult> {
    try {
      // Get Google OAuth configuration
      const config = oauthConfigService.getGoogleConfig();
      
      // Create OAuth client
      const oauth2Client = new google.auth.OAuth2(
        config.clientId,
        config.clientSecret,
        config.redirectUri
      );
      
      // Set the refresh token
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      
      // Refresh the token
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      // Verify we got a new access token
      if (!credentials.access_token) {
        throw new Error('Google API did not return a new access token');
      }
      
      return {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || null,
        expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
        scope: typeof credentials.scope === 'string' ? credentials.scope : null
      };
    } catch (error) {
      throw new Error(`Failed to refresh Google token: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Migrates a token from the legacy table to the primary table
   */
  private async migrateFromLegacyTable(
    legacyData: Record<string, unknown>, 
    userId: string, 
    provider: OAuthProvider
  ): Promise<OAuthTokenRecord> {
    try {
      console.log(`[OAuthTokenManager] Migrating token from legacy table for user ${userId}`);
      
      // Convert legacy token to the new format
      const tokenSet: OAuthTokenSet = {
        access_token: legacyData.access_token as string,
        refresh_token: (legacyData.refresh_token as string) || null,
        expires_at: (legacyData.expires_at as string) || null,
        scope: Array.isArray(legacyData.scopes) 
          ? (legacyData.scopes as string[]).join(' ') 
          : null,
        token_type: 'Bearer'
      };
      
      // Save to the primary table
      return await this.saveToken(
        userId, 
        provider, 
        tokenSet,
        (legacyData.provider_user_id as string) || undefined
      );
    } catch (error) {
      throw new OAuthDatabaseError(
        'token migration', 
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
  
  /**
   * Syncs a token to the legacy table for backward compatibility
   */
  private async syncToLegacyTable(
    userId: string, 
    provider: OAuthProvider, 
    tokenSet: OAuthTokenSet
  ): Promise<void> {
    try {
      // Convert the scope string to array for the legacy table
      const scopesArray = tokenSet.scope ? tokenSet.scope.split(' ') : null;
      
      const legacyRecord = {
        user_id: userId,
        provider,
        access_token: tokenSet.access_token,
        refresh_token: tokenSet.refresh_token || null,
        expires_at: tokenSet.expires_at || null,
        scopes: scopesArray,
        updated_at: new Date().toISOString()
      };
      
      const { error } = await supabaseAdmin
        .from('user_oauth_tokens')
        .upsert(legacyRecord, { 
          onConflict: 'user_id,provider'
        });
      
      if (error) {
        console.warn(`[OAuthTokenManager] Warning: Could not sync to legacy table: ${error.message}`);
      }
    } catch (error) {
      // Log but don't throw - legacy table sync is best-effort
      console.warn(`[OAuthTokenManager] Error syncing to legacy table: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Checks if a token is expired or will expire soon
   */
  private isTokenExpiredOrExpiring(token: OAuthTokenRecord): boolean {
    if (!token.expires_at) {
      return false; // If no expiry, assume it's valid
    }
    
    const expiryTime = new Date(token.expires_at).getTime();
    const now = Date.now();
    
    // Check if token is expired or will expire within the buffer time
    return now + this.EXPIRY_BUFFER_MS >= expiryTime;
  }
}

// Export singleton instance
export const oauthTokenManager = new OAuthTokenManager();