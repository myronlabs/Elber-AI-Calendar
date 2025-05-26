// src/backend/functions/cleanup-rate-limits.ts
import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { authRateLimiter } from '../services/rateLimiter';

/**
 * Scheduled function to clean up old rate limit entries
 * Should be run periodically (e.g., daily) via Netlify scheduled functions
 */
const handler: Handler = async (_event: HandlerEvent, _context: HandlerContext) => {
  console.log('Starting rate limit cleanup...');
  
  try {
    await authRateLimiter.cleanup();
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Rate limit cleanup completed successfully',
        timestamp: new Date().toISOString()
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (error) {
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

export { handler };