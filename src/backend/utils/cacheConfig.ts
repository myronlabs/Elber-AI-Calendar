// src/backend/utils/cacheConfig.ts
// Centralized cache configuration for backend services - single source of truth

/**
 * Centralized cache configuration for backend services
 * This ensures consistent cache behavior across all backend functions
 */
export const CACHE_CONFIG = {
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
} as const;

/**
 * Cache cleanup intervals
 */
export const CACHE_CLEANUP_CONFIG = {
  // Backend cache cleanup interval (reduced frequency to prevent server load)
  BACKEND_CLEANUP_INTERVAL: 10 * 60 * 1000, // 10 minutes - reduces server load
  
  // Query timeout (reasonable timeout)
  QUERY_TIMEOUT_MS: 10 * 1000, // 10 seconds - prevents hanging requests
} as const;

/**
 * Cache size limits
 */
export const CACHE_SIZE_CONFIG = {
  // Backend cache limits  
  SEARCH_CACHE_MAX_SIZE: 200,
  AI_RESPONSE_CACHE_MAX_SIZE: 100,
  CONFIG_CACHE_MAX_SIZE: 50,
} as const;

/**
 * Helper function to get appropriate TTL based on operation type
 */
export function getCacheTTL(operationType: 'assistant' | 'user' | 'search' | 'general' | 'static' | 'auth'): number {
  switch (operationType) {
    case 'assistant':
      return CACHE_CONFIG.ASSISTANT_UPDATES;
    case 'user':
      return CACHE_CONFIG.USER_OPERATIONS;
    case 'search':
      return CACHE_CONFIG.SEARCH_RESULTS;
    case 'general':
      return CACHE_CONFIG.GENERAL_DATA;
    case 'static':
      return CACHE_CONFIG.STATIC_DATA;
    case 'auth':
      return CACHE_CONFIG.AUTH_TOKENS;
    default:
      return CACHE_CONFIG.GENERAL_DATA;
  }
}

/**
 * Type-safe cache operation types
 */
export type CacheOperationType = 'assistant' | 'user' | 'search' | 'general' | 'static' | 'auth';