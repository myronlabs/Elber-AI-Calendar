/**
 * AI Response Cache Service
 * Caches formatted AI responses to improve performance
 */

import { getCacheTTL } from '../utils/cacheConfig';

interface CacheEntry {
  response: string;
  timestamp: number;
  ttl: number;
}

class AIResponseCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly DEFAULT_TTL = getCacheTTL('assistant'); // Use centralized config for assistant updates
  
  /**
   * Generate a cache key for contact search results
   */
  private generateKey(searchTerm: string, contacts: Array<{contact_id: string}>): string {
    const contactIds = contacts.map(c => c.contact_id).sort().join(',');
    return `search:${searchTerm}:${contactIds}`;
  }
  
  /**
   * Get cached response if available and not expired
   */
  get(searchTerm: string, contacts: Array<{contact_id: string}>): string | null {
    const key = this.generateKey(searchTerm, contacts);
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.response;
  }
  
  /**
   * Cache a formatted response
   */
  set(searchTerm: string, contacts: Array<{contact_id: string}>, response: string, ttl?: number): void {
    const key = this.generateKey(searchTerm, contacts);
    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      ttl: ttl || this.DEFAULT_TTL
    });
    
    // Clean up old entries periodically
    if (Math.random() < 0.1) {
      this.cleanup();
    }
  }
  
  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

export const aiResponseCache = new AIResponseCache();