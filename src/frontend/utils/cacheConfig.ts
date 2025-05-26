// Centralized cache configuration - single source of truth for all cache TTL values

/**
 * Centralized cache configuration for the entire application
 * This ensures consistent cache behavior across frontend and backend
 */
export const CACHE_CONFIG = {
  // Reasonable TTL for assistant operations (based on Emma Delaney's guide)
  ASSISTANT_UPDATES: 30 * 1000, // 30 seconds - prevents cache thrashing
  
  // Interactive operations with proper caching
  USER_OPERATIONS: 60 * 1000, // 1 minute - reduces network requests
  
  // Search operations (balanced responsiveness vs performance)
  SEARCH_RESULTS: 30 * 1000, // 30 seconds - prevents search request storms
  
  // General data operations
  GENERAL_DATA: 2 * 60 * 1000, // 2 minutes - reduces garbage collection pressure
  
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
  // Frontend cache cleanup interval (reduced frequency to prevent GC pressure)
  FRONTEND_CLEANUP_INTERVAL: 5 * 60 * 1000, // 5 minutes - prevents excessive garbage collection
  
  // Backend cache cleanup interval
  BACKEND_CLEANUP_INTERVAL: 10 * 60 * 1000, // 10 minutes - reduces server load
  
  // Debounce intervals for invalidation
  INVALIDATION_DEBOUNCE: 1000, // 1 second - prevents invalidation storms
} as const;

/**
 * Cache size limits
 */
export const CACHE_SIZE_CONFIG = {
  // Frontend cache limits
  GLOBAL_CACHE_MAX_SIZE: 100,
  ROUTING_CACHE_MAX_SIZE: 50,
  
  // Backend cache limits  
  SEARCH_CACHE_MAX_SIZE: 200,
  AI_RESPONSE_CACHE_MAX_SIZE: 100,
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