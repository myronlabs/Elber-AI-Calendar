"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const rateLimiter_1 = require("../services/rateLimiter");
/**
 * Scheduled function to clean up old rate limit entries
 * Should be run periodically (e.g., daily) via Netlify scheduled functions
 */
const handler = async (_event, _context) => {
    console.log('Starting rate limit cleanup...');
    try {
        await rateLimiter_1.authRateLimiter.cleanup();
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Rate limit cleanup completed successfully',
                timestamp: new Date().toISOString()
            }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
    catch (error) {
        console.error('Error during rate limit cleanup:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error during rate limit cleanup',
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=cleanup-rate-limits.js.map