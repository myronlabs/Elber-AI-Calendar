"use strict";
// src/backend/utils/cacheConfig.ts
// Centralized cache configuration for backend services - single source of truth
Object.defineProperty(exports, "__esModule", { value: true });
exports.CACHE_SIZE_CONFIG = exports.CACHE_CLEANUP_CONFIG = exports.CACHE_CONFIG = void 0;
exports.getCacheTTL = getCacheTTL;
/**
 * Centralized cache configuration for backend services
 * This ensures consistent cache behavior across all backend functions
 */
exports.CACHE_CONFIG = {
    // Reasonable TTL for assistant operations (prevents server overload)
    ASSISTANT_UPDATES: 30 * 1000, // 30 seconds - prevents cache thrashing
    // Interactive operations with proper caching  
    USER_OPERATIONS: 60 * 1000, // 1 minute - reduces database load
    // Search operations (balanced responsiveness vs performance)
    SEARCH_RESULTS: 30 * 1000, // 30 seconds - prevents search request storms
    // General data operations
    GENERAL_DATA: 2 * 60 * 1000, // 2 minutes - reduces database pressure
    // Static/configuration data (can be cached longer)
    STATIC_DATA: 10 * 60 * 1000, // 10 minutes - for data that rarely changes
    // Rate limiting and security (can be cached longer)
    RATE_LIMIT_DATA: 5 * 60 * 1000, // 5 minutes - for rate limiting data
    // OAuth tokens and auth data
    AUTH_TOKENS: 15 * 60 * 1000, // 15 minutes - for auth tokens (security sensitive)
};
/**
 * Cache cleanup intervals
 */
exports.CACHE_CLEANUP_CONFIG = {
    // Backend cache cleanup interval (reduced frequency to prevent server load)
    BACKEND_CLEANUP_INTERVAL: 10 * 60 * 1000, // 10 minutes - reduces server load
    // Query timeout (reasonable timeout)
    QUERY_TIMEOUT_MS: 10 * 1000, // 10 seconds - prevents hanging requests
};
/**
 * Cache size limits
 */
exports.CACHE_SIZE_CONFIG = {
    // Backend cache limits  
    SEARCH_CACHE_MAX_SIZE: 200,
    AI_RESPONSE_CACHE_MAX_SIZE: 100,
    CONFIG_CACHE_MAX_SIZE: 50,
};
/**
 * Helper function to get appropriate TTL based on operation type
 */
function getCacheTTL(operationType) {
    switch (operationType) {
        case 'assistant':
            return exports.CACHE_CONFIG.ASSISTANT_UPDATES;
        case 'user':
            return exports.CACHE_CONFIG.USER_OPERATIONS;
        case 'search':
            return exports.CACHE_CONFIG.SEARCH_RESULTS;
        case 'general':
            return exports.CACHE_CONFIG.GENERAL_DATA;
        case 'static':
            return exports.CACHE_CONFIG.STATIC_DATA;
        case 'auth':
            return exports.CACHE_CONFIG.AUTH_TOKENS;
        default:
            return exports.CACHE_CONFIG.GENERAL_DATA;
    }
}
//# sourceMappingURL=cacheConfig.js.map