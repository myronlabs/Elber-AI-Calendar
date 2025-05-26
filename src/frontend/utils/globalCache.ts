// src/frontend/utils/globalCache.ts

import { CACHE_CONFIG, CACHE_SIZE_CONFIG } from './cacheConfig';
import { memoryManager } from '../services/memoryManager';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  version: number; // Cache version for invalidation coordination
}

interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  invalidations: number;
}

class GlobalCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private readonly DEFAULT_TTL = CACHE_CONFIG.ASSISTANT_UPDATES; // Use centralized config
  private readonly MAX_CACHE_SIZE = CACHE_SIZE_CONFIG.GLOBAL_CACHE_MAX_SIZE; // Use centralized config
  private metrics: CacheMetrics = { hits: 0, misses: 0, sets: 0, deletes: 0, invalidations: 0 };
  private currentVersion = 1;
  private memoryCleanupUnregister: (() => void) | null = null;

  // Set an item in the cache
  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    // Enforce max cache size - more aggressive cleanup
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldestEntries(Math.max(10, Math.floor(this.MAX_CACHE_SIZE * 0.1))); // Remove 10% of cache
    }

    // Limit TTL to prevent indefinite caching of dynamic data
    const maxTTL = 5 * 60 * 1000; // 5 minutes max
    const safeTTL = Math.min(ttl, maxTTL);

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: safeTTL,
      version: this.currentVersion
    });
    
    this.metrics.sets++;
    
    // Register with memory manager if not already registered
    this.registerMemoryCleanup();
  }

  // Get an item from the cache
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    
    if (!entry) {
      this.metrics.misses++;
      console.log(`[GlobalCache] Cache miss for key: ${key}`);
      return null;
    }

    const now = Date.now();
    const isExpired = (now - entry.timestamp) > entry.ttl;

    if (isExpired) {
      this.metrics.misses++;
      console.log(`[GlobalCache] Cache expired for key: ${key} (age: ${now - entry.timestamp}ms)`);
      this.cache.delete(key);
      return null;
    }

    this.metrics.hits++;
    console.log(`[GlobalCache] Cache hit for key: ${key} (v${entry.version})`);
    return entry.data;
  }

  // Check if a key exists and is not expired
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    const isExpired = (now - entry.timestamp) > entry.ttl;

    if (isExpired) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  // Delete a specific key
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      console.log(`[GlobalCache] Deleted key: ${key}`);
    }
    return deleted;
  }

  // Clear all cache entries
  clear(): void {
    this.cache.clear();
    console.log(`[GlobalCache] Cleared all cache entries`);
  }

  // Clear all entries matching a pattern
  clearPattern(pattern: string): number {
    let deletedCount = 0;
    const regex = new RegExp(pattern);
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[GlobalCache] Deleted ${deletedCount} entries matching pattern: ${pattern}`);
    }
    return deletedCount;
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    let deletedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if ((now - entry.timestamp) > entry.ttl) {
        this.cache.delete(key);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[GlobalCache] Cleaned up ${deletedCount} expired entries`);
    }
  }

  // Force refresh by clearing specific cache keys
  forceRefresh(keys: string[]): void {
    let deletedCount = 0;
    for (const key of keys) {
      if (this.cache.delete(key)) {
        deletedCount++;
        this.metrics.invalidations++;
      }
    }
    
    // Increment version to invalidate any remaining cached data
    this.currentVersion++;
    
    console.log(`[GlobalCache] Force refreshed ${deletedCount} cache keys (new version: ${this.currentVersion})`);
  }

  // Evict oldest entries when cache is full
  private evictOldestEntries(count: number): void {
    const entries = Array.from(this.cache.entries()).sort(([, a], [, b]) => a.timestamp - b.timestamp);
    
    for (let i = 0; i < Math.min(count, entries.length); i++) {
      const [key] = entries[i];
      this.cache.delete(key);
      this.metrics.deletes++;
    }
    
    console.log(`[GlobalCache] Evicted ${Math.min(count, entries.length)} oldest entries`);
  }

  // Get cache statistics
  getStats(): { size: number; entries: string[]; metrics: CacheMetrics; version: number } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
      metrics: { ...this.metrics },
      version: this.currentVersion
    };
  }

  // Reset metrics (for testing/debugging)
  resetMetrics(): void {
    this.metrics = { hits: 0, misses: 0, sets: 0, deletes: 0, invalidations: 0 };
    console.log(`[GlobalCache] Reset metrics`);
  }

  // Register with memory manager for cleanup
  private registerMemoryCleanup(): void {
    if (!this.memoryCleanupUnregister) {
      this.memoryCleanupUnregister = memoryManager.registerCleanup(() => {
        console.log('[GlobalCache] Memory pressure cleanup triggered');
        this.aggressiveCleanup();
      });
    }
  }

  // Unregister from memory manager
  unregisterMemoryCleanup(): void {
    if (this.memoryCleanupUnregister) {
      this.memoryCleanupUnregister();
      this.memoryCleanupUnregister = null;
    }
  }

  // Aggressive cleanup for memory pressure situations
  private aggressiveCleanup(): void {
    const now = Date.now();
    let deletedCount = 0;

    // Remove entries that are more than 50% through their TTL
    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      const halfLife = entry.ttl * 0.5;
      
      if (age > halfLife) {
        this.cache.delete(key);
        deletedCount++;
      }
    }

    // If still too large, remove oldest entries
    if (this.cache.size > this.MAX_CACHE_SIZE * 0.7) {
      this.evictOldestEntries(Math.floor(this.cache.size * 0.3));
      deletedCount += Math.floor(this.cache.size * 0.3);
    }

    console.log(`[GlobalCache] Aggressive cleanup removed ${deletedCount} entries`);
  }
}

// Export singleton instance
export const globalCache = new GlobalCache();

// No automatic initialization - memory manager is used on-demand