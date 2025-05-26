"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.oauthTokenManager = exports.OAuthTokenManager = void 0;
const supabaseAdmin_1 = require("./supabaseAdmin");
const googleapis_1 = require("googleapis");
const oauthErrors_1 = require("./errors/oauthErrors");
const oauthConfigService_1 = require("./oauthConfigService");
/**
 * Main token manager service
 */
class OAuthTokenManager {
    constructor() {
        // Cache to reduce database lookups
        this.tokenCache = new Map();
        this.CACHE_TTL_MS = 60000; // 1 minute
        this.EXPIRY_BUFFER_MS = 300000; // 5 minutes buffer for token refresh
        // Initialize service
        console.log('[OAuthTokenManager] Service initialized');
    }
    /**
     * Gets a valid token for a specific feature requirement
     * Handles token refresh if needed and verification of required scopes
     */
    async getTokenForFeature(userId, provider, feature) {
        // Get the required scopes for this feature
        const requiredScopes = oauthConfigService_1.oauthConfigService.getRequiredScopesForFeature(feature);
        // Get a valid token (will be refreshed if needed)
        const tokenResponse = await this.getValidToken(userId, provider);
        // Verify the token has the required scopes
        if (tokenResponse.token.scope) {
            const hasScopes = oauthConfigService_1.oauthConfigService.hasRequiredScopes(tokenResponse.token.scope, requiredScopes);
            if (!hasScopes) {
                // Get the current scopes as an array
                const currentScopeArray = tokenResponse.token.scope.split(' ');
                throw new oauthErrors_1.InsufficientScopeError(userId, provider, requiredScopes, currentScopeArray);
            }
        }
        else {
            // If no scope information, we can't verify, so throw an error
            throw new oauthErrors_1.InsufficientScopeError(userId, provider, requiredScopes, []);
        }
        return tokenResponse.token.access_token;
    }
    /**
     * Retrieves a valid token, refreshing if necessary
     */
    async getValidToken(userId, provider) {
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
        }
        catch (error) {
            // Re-throw OAuth errors
            if (error instanceof oauthErrors_1.OAuthError) {
                throw error;
            }
            // Wrap other errors
            throw new oauthErrors_1.OAuthError(`Error getting valid token: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Creates or updates a token in the database
     */
    async saveToken(userId, provider, tokenSet, providerId) {
        try {
            console.log(`[OAuthTokenManager] Saving token for user ${userId} with provider ${provider}`);
            // Create token record
            const tokenData = {
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
            const { data: savedToken, error } = await supabaseAdmin_1.supabaseAdmin
                .from('oauth_connections')
                .upsert(tokenData, {
                onConflict: 'user_id,provider'
            })
                .select();
            if (error) {
                throw new oauthErrors_1.OAuthDatabaseError('token save', error);
            }
            if (!savedToken || savedToken.length === 0) {
                throw new oauthErrors_1.OAuthDatabaseError('token save', new Error('No records returned after upsert'));
            }
            // Sync to legacy table for backward compatibility
            await this.syncToLegacyTable(userId, provider, tokenSet);
            // Cache the token
            const token = savedToken[0];
            this.tokenCache.set(`${userId}:${provider}`, { token, timestamp: Date.now() });
            return token;
        }
        catch (error) {
            if (error instanceof oauthErrors_1.OAuthError) {
                throw error;
            }
            throw new oauthErrors_1.OAuthDatabaseError('token save', error instanceof Error ? error : new Error(String(error)));
        }
    }
    /**
     * Removes a token for a user and provider
     */
    async removeToken(userId, provider) {
        try {
            console.log(`[OAuthTokenManager] Removing token for user ${userId} with provider ${provider}`);
            // Remove the token from primary table
            const { error: primaryError } = await supabaseAdmin_1.supabaseAdmin
                .from('oauth_connections')
                .delete()
                .eq('user_id', userId)
                .eq('provider', provider);
            if (primaryError) {
                throw new oauthErrors_1.OAuthDatabaseError('token removal', primaryError);
            }
            // Remove from legacy table as well
            const { error: legacyError } = await supabaseAdmin_1.supabaseAdmin
                .from('user_oauth_tokens')
                .delete()
                .eq('user_id', userId)
                .eq('provider', provider);
            if (legacyError) {
                console.warn(`Warning: Could not remove token from legacy table: ${legacyError.message}`);
            }
            // Remove from cache
            this.tokenCache.delete(`${userId}:${provider}`);
        }
        catch (error) {
            if (error instanceof oauthErrors_1.OAuthError) {
                throw error;
            }
            throw new oauthErrors_1.OAuthDatabaseError('token removal', error instanceof Error ? error : new Error(String(error)));
        }
    }
    /**
     * Checks if the user has a valid token for the specified provider
     */
    async hasValidToken(userId, provider) {
        try {
            await this.getValidToken(userId, provider);
            return true;
        }
        catch (error) {
            // If we get a token not found or token expired error, return false
            if (error instanceof oauthErrors_1.TokenNotFoundError ||
                error instanceof oauthErrors_1.TokenExpiredError ||
                error instanceof oauthErrors_1.TokenRefreshError) {
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
    async getTokenFromDatabase(userId, provider) {
        // Check primary table first
        const { data: primaryData, error: primaryError } = await supabaseAdmin_1.supabaseAdmin
            .from('oauth_connections')
            .select('*')
            .eq('user_id', userId)
            .eq('provider', provider)
            .maybeSingle();
        if (primaryError && primaryError.code !== 'PGRST116') {
            throw new oauthErrors_1.OAuthDatabaseError('token retrieval', primaryError);
        }
        if (primaryData) {
            return primaryData;
        }
        // Check legacy table
        const { data: legacyData, error: legacyError } = await supabaseAdmin_1.supabaseAdmin
            .from('user_oauth_tokens')
            .select('*')
            .eq('user_id', userId)
            .eq('provider', provider)
            .maybeSingle();
        if (legacyError && legacyError.code !== 'PGRST116') {
            throw new oauthErrors_1.OAuthDatabaseError('token retrieval from legacy table', legacyError);
        }
        if (legacyData) {
            // Found in legacy table, migrate to primary table
            const migratedToken = await this.migrateFromLegacyTable(legacyData, userId, provider);
            return migratedToken;
        }
        // Token not found in either table
        throw new oauthErrors_1.TokenNotFoundError(userId, provider);
    }
    /**
     * Refreshes token and updates in database
     */
    async refreshAndUpdateToken(userId, provider, token) {
        // Verify we have a refresh token
        if (!token.refresh_token) {
            // Handle error gracefully
            console.warn(`No refresh token available for user ${userId} with provider ${provider}`);
            throw new oauthErrors_1.TokenExpiredError(userId, provider);
        }
        try {
            // Refresh the token
            const refreshResult = await this.refreshProviderToken(provider, token.refresh_token);
            // Create updated token set
            const tokenSet = {
                access_token: refreshResult.accessToken,
                refresh_token: refreshResult.refreshToken || token.refresh_token,
                expires_at: refreshResult.expiresAt,
                scope: refreshResult.scope || token.scope,
                id_token: token.id_token,
                token_type: token.token_type || 'Bearer'
            };
            // Save the refreshed token
            const updatedToken = await this.saveToken(userId, provider, tokenSet, token.provider_user_id || undefined);
            return { token: updatedToken, refreshed: true };
        }
        catch (error) {
            console.error(`Error refreshing token for user ${userId}:`, error);
            // If refresh failed, the token is likely invalid
            // Remove the invalid token to force re-authorization
            try {
                await this.removeToken(userId, provider);
            }
            catch (removeError) {
                console.error(`Error removing invalid token:`, removeError);
            }
            throw new oauthErrors_1.TokenRefreshError(userId, provider, error instanceof Error ? error : new Error(String(error)));
        }
    }
    /**
     * Provider-specific token refresh implementation
     */
    async refreshProviderToken(provider, refreshToken) {
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
    async refreshGoogleToken(refreshToken) {
        try {
            // Get Google OAuth configuration
            const config = oauthConfigService_1.oauthConfigService.getGoogleConfig();
            // Create OAuth client
            const oauth2Client = new googleapis_1.google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
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
        }
        catch (error) {
            throw new Error(`Failed to refresh Google token: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Migrates a token from the legacy table to the primary table
     */
    async migrateFromLegacyTable(legacyData, userId, provider) {
        try {
            console.log(`[OAuthTokenManager] Migrating token from legacy table for user ${userId}`);
            // Convert legacy token to the new format
            const tokenSet = {
                access_token: legacyData.access_token,
                refresh_token: legacyData.refresh_token || null,
                expires_at: legacyData.expires_at || null,
                scope: Array.isArray(legacyData.scopes)
                    ? legacyData.scopes.join(' ')
                    : null,
                token_type: 'Bearer'
            };
            // Save to the primary table
            return await this.saveToken(userId, provider, tokenSet, legacyData.provider_user_id || undefined);
        }
        catch (error) {
            throw new oauthErrors_1.OAuthDatabaseError('token migration', error instanceof Error ? error : new Error(String(error)));
        }
    }
    /**
     * Syncs a token to the legacy table for backward compatibility
     */
    async syncToLegacyTable(userId, provider, tokenSet) {
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
            const { error } = await supabaseAdmin_1.supabaseAdmin
                .from('user_oauth_tokens')
                .upsert(legacyRecord, {
                onConflict: 'user_id,provider'
            });
            if (error) {
                console.warn(`[OAuthTokenManager] Warning: Could not sync to legacy table: ${error.message}`);
            }
        }
        catch (error) {
            // Log but don't throw - legacy table sync is best-effort
            console.warn(`[OAuthTokenManager] Error syncing to legacy table: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Checks if a token is expired or will expire soon
     */
    isTokenExpiredOrExpiring(token) {
        if (!token.expires_at) {
            return false; // If no expiry, assume it's valid
        }
        const expiryTime = new Date(token.expires_at).getTime();
        const now = Date.now();
        // Check if token is expired or will expire within the buffer time
        return now + this.EXPIRY_BUFFER_MS >= expiryTime;
    }
}
exports.OAuthTokenManager = OAuthTokenManager;
// Export singleton instance
exports.oauthTokenManager = new OAuthTokenManager();
//# sourceMappingURL=oauthTokenManager.js.map