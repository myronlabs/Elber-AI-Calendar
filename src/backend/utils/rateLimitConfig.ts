// src/backend/utils/rateLimitConfig.ts
// Centralized rate limiting configuration - single source of truth for security timing

/**
 * Centralized rate limiting configuration for security and performance
 * This ensures consistent security behavior across all authentication endpoints
 */

/**
 * Time constants for rate limiting (in milliseconds)
 */
export const RATE_LIMIT_TIMES = {
  // Window durations (how long to track requests)
  WINDOWS: {
    SHORT: 5 * 60 * 1000,      // 5 minutes - for sensitive operations
    MEDIUM: 15 * 60 * 1000,    // 15 minutes - for auth operations  
    LONG: 60 * 60 * 1000,      // 1 hour - for password resets, email verification
    VERY_LONG: 24 * 60 * 60 * 1000, // 24 hours - for severe violations
  },
  
  // Progressive blocking durations
  BLOCK_DURATIONS: {
    FIRST: 2 * 60 * 1000,      // 2 minutes - first offense
    SECOND: 5 * 60 * 1000,     // 5 minutes - second offense
    THIRD: 15 * 60 * 1000,     // 15 minutes - third offense
    FOURTH: 30 * 60 * 1000,    // 30 minutes - fourth offense
    SEVERE: 24 * 60 * 60 * 1000, // 24 hours - persistent offender
    DEFAULT: 15 * 60 * 1000,   // 15 minutes - default block
  },
  
  // Progressive delay settings
  PROGRESSIVE_DELAY: {
    BASE_DELAY: 1000,          // 1 second base delay
    MAX_DELAY: 10 * 1000,      // 10 seconds maximum delay
    MULTIPLIER: 2,             // Exponential backoff multiplier
  },
  
  // Reset thresholds
  RESET_THRESHOLDS: {
    BLOCK_COUNT_RESET: 24 * 60 * 60 * 1000, // Reset block count after 24 hours
  },
} as const;

/**
 * Request limits for different operation types
 */
export const REQUEST_LIMITS = {
  // Authentication operations (most sensitive)
  LOGIN_ATTEMPTS: 5,           // Max failed login attempts
  SIGNUP_ATTEMPTS: 3,          // Max signup attempts  
  PASSWORD_RESET_ATTEMPTS: 3,  // Max password reset requests
  EMAIL_VERIFICATION_ATTEMPTS: 5, // Max email verification requests
  
  // Progressive blocking settings
  MAX_BLOCKS_BEFORE_SEVERE: 4, // Max blocks before 24-hour ban
} as const;

/**
 * Security configurations for different endpoints
 */
export const SECURITY_CONFIGS = {
  // High-security authentication endpoints
  HIGH_SECURITY: {
    maxRequests: REQUEST_LIMITS.LOGIN_ATTEMPTS,
    windowMs: RATE_LIMIT_TIMES.WINDOWS.MEDIUM,
    progressiveDelay: true,
    progressiveBlocking: true,
    blockDuration: RATE_LIMIT_TIMES.BLOCK_DURATIONS.DEFAULT,
    maxBlocks: REQUEST_LIMITS.MAX_BLOCKS_BEFORE_SEVERE,
  },
  
  // Medium-security endpoints (signup, email verification)
  MEDIUM_SECURITY: {
    maxRequests: REQUEST_LIMITS.SIGNUP_ATTEMPTS,
    windowMs: RATE_LIMIT_TIMES.WINDOWS.SHORT,
    progressiveDelay: false,
    progressiveBlocking: true,
    blockDuration: RATE_LIMIT_TIMES.BLOCK_DURATIONS.DEFAULT,
    maxBlocks: REQUEST_LIMITS.MAX_BLOCKS_BEFORE_SEVERE,
  },
  
  // Low-security endpoints (password reset - self-service)
  LOW_SECURITY: {
    maxRequests: REQUEST_LIMITS.PASSWORD_RESET_ATTEMPTS,
    windowMs: RATE_LIMIT_TIMES.WINDOWS.LONG,
    progressiveDelay: false,
    progressiveBlocking: true,
    blockDuration: RATE_LIMIT_TIMES.BLOCK_DURATIONS.DEFAULT,
    maxBlocks: REQUEST_LIMITS.MAX_BLOCKS_BEFORE_SEVERE,
  },
} as const;

/**
 * Endpoint-specific rate limit configurations
 */
export const ENDPOINT_RATE_LIMITS = {
  login: {
    ...SECURITY_CONFIGS.HIGH_SECURITY,
    maxRequests: REQUEST_LIMITS.LOGIN_ATTEMPTS,
  },
  
  signup: {
    ...SECURITY_CONFIGS.MEDIUM_SECURITY,
    maxRequests: REQUEST_LIMITS.SIGNUP_ATTEMPTS,
  },
  
  passwordReset: {
    ...SECURITY_CONFIGS.LOW_SECURITY,
    maxRequests: REQUEST_LIMITS.PASSWORD_RESET_ATTEMPTS,
    windowMs: RATE_LIMIT_TIMES.WINDOWS.LONG,
  },
  
  emailVerification: {
    ...SECURITY_CONFIGS.LOW_SECURITY,
    maxRequests: REQUEST_LIMITS.EMAIL_VERIFICATION_ATTEMPTS,
    windowMs: RATE_LIMIT_TIMES.WINDOWS.LONG,
    progressiveBlocking: false, // Email verification is less critical
  },
} as const;

/**
 * Helper function to get progressive block duration based on block count
 */
export function getProgressiveBlockDuration(blockCount: number): number {
  switch (blockCount) {
    case 1:
      return RATE_LIMIT_TIMES.BLOCK_DURATIONS.FIRST;
    case 2:
      return RATE_LIMIT_TIMES.BLOCK_DURATIONS.SECOND;
    case 3:
      return RATE_LIMIT_TIMES.BLOCK_DURATIONS.THIRD;
    case 4:
      return RATE_LIMIT_TIMES.BLOCK_DURATIONS.FOURTH;
    default:
      return blockCount > REQUEST_LIMITS.MAX_BLOCKS_BEFORE_SEVERE 
        ? RATE_LIMIT_TIMES.BLOCK_DURATIONS.SEVERE
        : RATE_LIMIT_TIMES.BLOCK_DURATIONS.DEFAULT;
  }
}

/**
 * Helper function to calculate progressive delay
 */
export function getProgressiveDelay(failedAttempts: number): number {
  const delay = RATE_LIMIT_TIMES.PROGRESSIVE_DELAY.BASE_DELAY * 
    Math.pow(RATE_LIMIT_TIMES.PROGRESSIVE_DELAY.MULTIPLIER, failedAttempts - 1);
  
  return Math.min(delay, RATE_LIMIT_TIMES.PROGRESSIVE_DELAY.MAX_DELAY);
}

/**
 * Helper function to check if block count should be reset
 */
export function shouldResetBlockCount(lastBlockedTime: Date | null): boolean {
  if (!lastBlockedTime) return false;
  
  const now = Date.now();
  const timeSinceLastBlock = now - lastBlockedTime.getTime();
  
  return timeSinceLastBlock > RATE_LIMIT_TIMES.RESET_THRESHOLDS.BLOCK_COUNT_RESET;
}

/**
 * Type-safe endpoint names
 */
export type RateLimitEndpoint = keyof typeof ENDPOINT_RATE_LIMITS;

/**
 * Environment-specific overrides (for development/testing)
 */
export const ENVIRONMENT_OVERRIDES = {
  development: {
    // More lenient limits for development
    LOGIN_ATTEMPTS: 10,
    BLOCK_DURATIONS: {
      ...RATE_LIMIT_TIMES.BLOCK_DURATIONS,
      FIRST: 30 * 1000,        // 30 seconds in dev
      SECOND: 60 * 1000,       // 1 minute in dev
      THIRD: 2 * 60 * 1000,    // 2 minutes in dev
    },
  },
  
  testing: {
    // Very lenient limits for testing
    LOGIN_ATTEMPTS: 100,
    WINDOWS: {
      SHORT: 1000,             // 1 second for tests
      MEDIUM: 2000,            // 2 seconds for tests
      LONG: 5000,              // 5 seconds for tests
    },
  },
} as const;