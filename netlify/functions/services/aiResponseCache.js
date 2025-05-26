"use strict";
/**
 * AI Response Cache Service
 * Caches formatted AI responses to improve performance
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiResponseCache = void 0;
const cacheConfig_1 = require("../utils/cacheConfig");
class AIResponseCache {
    constructor() {
        this.cache = new Map();
        this.DEFAULT_TTL = (0, cacheConfig_1.getCacheTTL)('assistant'); // Use centralized config for assistant updates
    }
    /**
     * Generate a cache key for contact search results
     */
    generateKey(searchTerm, contacts) {
        const contactIds = contacts.map(c => c.contact_id).sort().join(',');
        return `search:${searchTerm}:${contactIds}`;
    }
    /**
     * Get cached response if available and not expired
     */
    get(searchTerm, contacts) {
        const key = this.generateKey(searchTerm, contacts);
        const entry = this.cache.get(key);
        if (!entry)
            return null;
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
    set(searchTerm, contacts, response, ttl) {
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
    cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.cache.delete(key);
            }
        }
    }
}
exports.aiResponseCache = new AIResponseCache();
//# sourceMappingURL=aiResponseCache.js.map