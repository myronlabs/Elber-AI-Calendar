// src/backend/services/rateLimiter.ts
import { supabaseAdmin } from './supabaseAdmin';
import { 
  RATE_LIMIT_TIMES, 
  getProgressiveBlockDuration, 
  getProgressiveDelay,
  shouldResetBlockCount,
  ENDPOINT_RATE_LIMITS,
  type RateLimitEndpoint
} from '../utils/rateLimitConfig';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum number of requests allowed
  progressiveDelay?: boolean; // Enable progressive delays for failed attempts
  blockDuration?: number; // How long to block after max failures (ms)
  progressiveBlocking?: boolean; // Enable progressive blocking with escalating penalties
  maxBlocks?: number; // Maximum blocks before 24-hour ban
}

interface RateLimitEntry {
  identifier: string;
  endpoint: string;
  attempts: number;
  first_attempt: string;
  last_attempt: string;
  blocked_until: string | null;
  failed_attempts: number;
  block_count: number; // Track how many times user has been blocked
  last_blocked: string | null; // Track when last block occurred
}

export class RateLimiter {
  constructor() {
    // No need for cleanup interval as database handles expiration
  }

  /**
   * Check if a request is allowed based on rate limiting rules
   */
  async isAllowed(
    identifier: string,
    endpoint: string,
    config: RateLimitConfig,
    failed: boolean = false
  ): Promise<{ allowed: boolean; retryAfter?: number; delay?: number }> {
    const now = new Date();

    try {
      // Get or create rate limit entry
      const { data: existingEntry, error: fetchError } = await supabaseAdmin
        .from('rate_limit_attempts')
        .select('*')
        .eq('identifier', identifier)
        .eq('endpoint', endpoint)
        .single();

      let entry: RateLimitEntry;

      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error('Error fetching rate limit entry:', fetchError);
        // Allow request on database error to avoid blocking users
        return { allowed: true };
      }

      if (!existingEntry) {
        // Create new entry
        const { data: newEntry, error: insertError } = await supabaseAdmin
          .from('rate_limit_attempts')
          .insert({
            identifier,
            endpoint,
            attempts: 1,
            failed_attempts: failed ? 1 : 0
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error creating rate limit entry:', insertError);
          return { allowed: true };
        }

        entry = newEntry;
      } else {
        entry = existingEntry;
      }

      // Check if currently blocked
      if (entry.blocked_until) {
        const blockedUntil = new Date(entry.blocked_until);
        if (blockedUntil > now) {
          return {
            allowed: false,
            retryAfter: Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000),
          };
        }
      }

      // Reset window if expired
      const firstAttempt = new Date(entry.first_attempt);
      if (now.getTime() - firstAttempt.getTime() > config.windowMs) {
        // Reset the entry
        const { error: updateError } = await supabaseAdmin
          .from('rate_limit_attempts')
          .update({
            attempts: 1,
            first_attempt: now.toISOString(),
            last_attempt: now.toISOString(),
            failed_attempts: failed ? 1 : 0,
            blocked_until: null
          })
          .eq('identifier', identifier)
          .eq('endpoint', endpoint);

        if (updateError) {
          console.error('Error resetting rate limit entry:', updateError);
        }

        return { allowed: true };
      }

      // Track failed attempts for progressive delays/blocking
      if (failed && (config.progressiveDelay || config.progressiveBlocking)) {
        const newFailedAttempts = entry.failed_attempts + 1;

        // Block after too many failures
        if (newFailedAttempts >= config.maxRequests) {
          let blockDuration = config.blockDuration || RATE_LIMIT_TIMES.BLOCK_DURATIONS.DEFAULT;
          let newBlockCount = (entry.block_count || 0) + 1;

          // Progressive blocking system using centralized config
          if (config.progressiveBlocking) {
            const maxBlocks = config.maxBlocks || 4;

            // Reset block count using centralized helper
            if (entry.last_blocked && shouldResetBlockCount(new Date(entry.last_blocked))) {
              newBlockCount = 1;
            }

            // Calculate progressive block duration using centralized config
            blockDuration = getProgressiveBlockDuration(newBlockCount);
            
            // Reset count for next cycle if exceeded max blocks
            if (newBlockCount > maxBlocks) {
              newBlockCount = 0;
            }
          }

          const blockedUntil = new Date(now.getTime() + blockDuration);

          const { error: blockError } = await supabaseAdmin
            .from('rate_limit_attempts')
            .update({
              failed_attempts: newFailedAttempts,
              blocked_until: blockedUntil.toISOString(),
              last_attempt: now.toISOString(),
              block_count: newBlockCount,
              last_blocked: now.toISOString()
            })
            .eq('identifier', identifier)
            .eq('endpoint', endpoint);

          if (blockError) {
            console.error('Error blocking user:', blockError);
          }

          // Log suspicious activity
          await this.logSuspiciousActivity(identifier, endpoint, `Too many failed attempts (block #${newBlockCount})`);

          return {
            allowed: false,
            retryAfter: Math.ceil(blockDuration / 1000),
          };
        }

        // Update failed attempts
        const { error: updateError } = await supabaseAdmin
          .from('rate_limit_attempts')
          .update({
            failed_attempts: newFailedAttempts,
            last_attempt: now.toISOString()
          })
          .eq('identifier', identifier)
          .eq('endpoint', endpoint);

        if (updateError) {
          console.error('Error updating failed attempts:', updateError);
        }
      }

      // Check rate limit
      if (entry.attempts >= config.maxRequests) {
        const windowRemaining = config.windowMs - (now.getTime() - firstAttempt.getTime());
        return {
          allowed: false,
          retryAfter: Math.ceil(windowRemaining / 1000),
        };
      }

      // Update attempts
      const { error: updateError } = await supabaseAdmin
        .from('rate_limit_attempts')
        .update({
          attempts: entry.attempts + 1,
          last_attempt: now.toISOString()
        })
        .eq('identifier', identifier)
        .eq('endpoint', endpoint);

      if (updateError) {
        console.error('Error updating attempts:', updateError);
      }

      // Calculate progressive delay using centralized config
      let delay = 0;
      if (config.progressiveDelay && entry.failed_attempts > 0) {
        delay = getProgressiveDelay(entry.failed_attempts);
      }

      return {
        allowed: true,
        delay,
      };
    } catch (error) {
      console.error('Unexpected error in rate limiter:', error);
      // Allow request on unexpected error to avoid blocking users
      return { allowed: true };
    }
  }

  /**
   * Reset rate limit for an identifier (e.g., after successful login)
   */
  async reset(identifier: string, endpoint: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('rate_limit_attempts')
        .delete()
        .eq('identifier', identifier)
        .eq('endpoint', endpoint);

      if (error) {
        console.error('Error resetting rate limit:', error);
      }
    } catch (error) {
      console.error('Unexpected error resetting rate limit:', error);
    }
  }

  /**
   * Log suspicious activity to the database
   */
  private async logSuspiciousActivity(
    identifier: string,
    endpoint: string,
    reason: string
  ): Promise<void> {
    try {
      await supabaseAdmin
        .from('security_logs')
        .insert({
          identifier,
          endpoint,
          reason,
          created_at: new Date().toISOString(),
        });
    } catch (error) {
      console.error('Failed to log suspicious activity:', error);
    }
  }

  /**
   * Clean up old entries from database
   */
  async cleanup(): Promise<void> {
    try {
      // Call the database function that cleans up old entries
      const { error } = await supabaseAdmin
        .rpc('cleanup_old_rate_limits');

      if (error) {
        console.error('Error cleaning up rate limits:', error);
      }
    } catch (error) {
      console.error('Unexpected error during cleanup:', error);
    }
  }
}

// Export singleton instances for different endpoints
export const authRateLimiter = new RateLimiter();

// Export centralized rate limit configurations
export const RATE_LIMITS = ENDPOINT_RATE_LIMITS;

/**
 * Get rate limit configuration for a specific endpoint
 */
export function getRateLimitConfig(endpoint: RateLimitEndpoint): RateLimitConfig {
  return ENDPOINT_RATE_LIMITS[endpoint];
}