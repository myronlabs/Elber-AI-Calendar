"use strict";
// src/backend/utils/rateLimitConfig.ts
// Centralized rate limiting configuration - single source of truth for security timing
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENVIRONMENT_OVERRIDES = exports.ENDPOINT_RATE_LIMITS = exports.SECURITY_CONFIGS = exports.REQUEST_LIMITS = exports.RATE_LIMIT_TIMES = void 0;
exports.getProgressiveBlockDuration = getProgressiveBlockDuration;
exports.getProgressiveDelay = getProgressiveDelay;
exports.shouldResetBlockCount = shouldResetBlockCount;
/**
 * Centralized rate limiting configuration for security and performance
 * This ensures consistent security behavior across all authentication endpoints
 */
/**
 * Time constants for rate limiting (in milliseconds)
 */
exports.RATE_LIMIT_TIMES = {
    // Window durations (how long to track requests)
    WINDOWS: {
        SHORT: 5 * 60 * 1000, // 5 minutes - for sensitive operations
        MEDIUM: 15 * 60 * 1000, // 15 minutes - for auth operations  
        LONG: 60 * 60 * 1000, // 1 hour - for password resets, email verification
        VERY_LONG: 24 * 60 * 60 * 1000, // 24 hours - for severe violations
    },
    // Progressive blocking durations
    BLOCK_DURATIONS: {
        FIRST: 2 * 60 * 1000, // 2 minutes - first offense
        SECOND: 5 * 60 * 1000, // 5 minutes - second offense
        THIRD: 15 * 60 * 1000, // 15 minutes - third offense
        FOURTH: 30 * 60 * 1000, // 30 minutes - fourth offense
        SEVERE: 24 * 60 * 60 * 1000, // 24 hours - persistent offender
        DEFAULT: 15 * 60 * 1000, // 15 minutes - default block
    },
    // Progressive delay settings
    PROGRESSIVE_DELAY: {
        BASE_DELAY: 1000, // 1 second base delay
        MAX_DELAY: 10 * 1000, // 10 seconds maximum delay
        MULTIPLIER: 2, // Exponential backoff multiplier
    },
    // Reset thresholds
    RESET_THRESHOLDS: {
        BLOCK_COUNT_RESET: 24 * 60 * 60 * 1000, // Reset block count after 24 hours
    },
};
/**
 * Request limits for different operation types
 */
exports.REQUEST_LIMITS = {
    // Authentication operations (most sensitive)
    LOGIN_ATTEMPTS: 5, // Max failed login attempts
    SIGNUP_ATTEMPTS: 3, // Max signup attempts  
    PASSWORD_RESET_ATTEMPTS: 3, // Max password reset requests
    EMAIL_VERIFICATION_ATTEMPTS: 5, // Max email verification requests
    // Progressive blocking settings
    MAX_BLOCKS_BEFORE_SEVERE: 4, // Max blocks before 24-hour ban
};
/**
 * Security configurations for different endpoints
 */
exports.SECURITY_CONFIGS = {
    // High-security authentication endpoints
    HIGH_SECURITY: {
        maxRequests: exports.REQUEST_LIMITS.LOGIN_ATTEMPTS,
        windowMs: exports.RATE_LIMIT_TIMES.WINDOWS.MEDIUM,
        progressiveDelay: true,
        progressiveBlocking: true,
        blockDuration: exports.RATE_LIMIT_TIMES.BLOCK_DURATIONS.DEFAULT,
        maxBlocks: exports.REQUEST_LIMITS.MAX_BLOCKS_BEFORE_SEVERE,
    },
    // Medium-security endpoints (signup, email verification)
    MEDIUM_SECURITY: {
        maxRequests: exports.REQUEST_LIMITS.SIGNUP_ATTEMPTS,
        windowMs: exports.RATE_LIMIT_TIMES.WINDOWS.SHORT,
        progressiveDelay: false,
        progressiveBlocking: true,
        blockDuration: exports.RATE_LIMIT_TIMES.BLOCK_DURATIONS.DEFAULT,
        maxBlocks: exports.REQUEST_LIMITS.MAX_BLOCKS_BEFORE_SEVERE,
    },
    // Low-security endpoints (password reset - self-service)
    LOW_SECURITY: {
        maxRequests: exports.REQUEST_LIMITS.PASSWORD_RESET_ATTEMPTS,
        windowMs: exports.RATE_LIMIT_TIMES.WINDOWS.LONG,
        progressiveDelay: false,
        progressiveBlocking: true,
        blockDuration: exports.RATE_LIMIT_TIMES.BLOCK_DURATIONS.DEFAULT,
        maxBlocks: exports.REQUEST_LIMITS.MAX_BLOCKS_BEFORE_SEVERE,
    },
};
/**
 * Endpoint-specific rate limit configurations
 */
exports.ENDPOINT_RATE_LIMITS = {
    login: {
        ...exports.SECURITY_CONFIGS.HIGH_SECURITY,
        maxRequests: exports.REQUEST_LIMITS.LOGIN_ATTEMPTS,
    },
    signup: {
        ...exports.SECURITY_CONFIGS.MEDIUM_SECURITY,
        maxRequests: exports.REQUEST_LIMITS.SIGNUP_ATTEMPTS,
    },
    passwordReset: {
        ...exports.SECURITY_CONFIGS.LOW_SECURITY,
        maxRequests: exports.REQUEST_LIMITS.PASSWORD_RESET_ATTEMPTS,
        windowMs: exports.RATE_LIMIT_TIMES.WINDOWS.LONG,
    },
    emailVerification: {
        ...exports.SECURITY_CONFIGS.LOW_SECURITY,
        maxRequests: exports.REQUEST_LIMITS.EMAIL_VERIFICATION_ATTEMPTS,
        windowMs: exports.RATE_LIMIT_TIMES.WINDOWS.LONG,
        progressiveBlocking: false, // Email verification is less critical
    },
};
/**
 * Helper function to get progressive block duration based on block count
 */
function getProgressiveBlockDuration(blockCount) {
    switch (blockCount) {
        case 1:
            return exports.RATE_LIMIT_TIMES.BLOCK_DURATIONS.FIRST;
        case 2:
            return exports.RATE_LIMIT_TIMES.BLOCK_DURATIONS.SECOND;
        case 3:
            return exports.RATE_LIMIT_TIMES.BLOCK_DURATIONS.THIRD;
        case 4:
            return exports.RATE_LIMIT_TIMES.BLOCK_DURATIONS.FOURTH;
        default:
            return blockCount > exports.REQUEST_LIMITS.MAX_BLOCKS_BEFORE_SEVERE
                ? exports.RATE_LIMIT_TIMES.BLOCK_DURATIONS.SEVERE
                : exports.RATE_LIMIT_TIMES.BLOCK_DURATIONS.DEFAULT;
    }
}
/**
 * Helper function to calculate progressive delay
 */
function getProgressiveDelay(failedAttempts) {
    const delay = exports.RATE_LIMIT_TIMES.PROGRESSIVE_DELAY.BASE_DELAY *
        Math.pow(exports.RATE_LIMIT_TIMES.PROGRESSIVE_DELAY.MULTIPLIER, failedAttempts - 1);
    return Math.min(delay, exports.RATE_LIMIT_TIMES.PROGRESSIVE_DELAY.MAX_DELAY);
}
/**
 * Helper function to check if block count should be reset
 */
function shouldResetBlockCount(lastBlockedTime) {
    if (!lastBlockedTime)
        return false;
    const now = Date.now();
    const timeSinceLastBlock = now - lastBlockedTime.getTime();
    return timeSinceLastBlock > exports.RATE_LIMIT_TIMES.RESET_THRESHOLDS.BLOCK_COUNT_RESET;
}
/**
 * Environment-specific overrides (for development/testing)
 */
exports.ENVIRONMENT_OVERRIDES = {
    development: {
        // More lenient limits for development
        LOGIN_ATTEMPTS: 10,
        BLOCK_DURATIONS: {
            ...exports.RATE_LIMIT_TIMES.BLOCK_DURATIONS,
            FIRST: 30 * 1000, // 30 seconds in dev
            SECOND: 60 * 1000, // 1 minute in dev
            THIRD: 2 * 60 * 1000, // 2 minutes in dev
        },
    },
    testing: {
        // Very lenient limits for testing
        LOGIN_ATTEMPTS: 100,
        WINDOWS: {
            SHORT: 1000, // 1 second for tests
            MEDIUM: 2000, // 2 seconds for tests
            LONG: 5000, // 5 seconds for tests
        },
    },
};
//# sourceMappingURL=rateLimitConfig.js.map