// src/frontend/utils/cacheInvalidationManager.ts

import { CACHE_CLEANUP_CONFIG } from './cacheConfig';

/**
 * Centralized cache invalidation management system
 * Coordinates between different data sources and ensures consistency
 */

interface InvalidationToken {
  timestamp: number;
  source: 'assistant' | 'user' | 'system' | 'external';
  operation: string;
  entityType: 'calendar' | 'contacts' | 'user' | 'settings';
  entityId?: string;
}

interface CacheInvalidationListeners {
  calendar: Set<() => void>;
  contacts: Set<() => void>;
  user: Set<() => void>;
  settings: Set<() => void>;
}

class CacheInvalidationManager {
  private listeners: CacheInvalidationListeners = {
    calendar: new Set(),
    contacts: new Set(), 
    user: new Set(),
    settings: new Set()
  };

  private lastInvalidation: Map<string, number> = new Map();

  /**
   * Register a listener for specific entity type invalidations
   */
  registerListener(entityType: keyof CacheInvalidationListeners, callback: () => void): () => void {
    this.listeners[entityType].add(callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners[entityType].delete(callback);
    };
  }

  /**
   * Invalidate cache for specific entity type with token
   */
  invalidate(token: InvalidationToken): void {
    const tokenKey = `${token.entityType}-${token.entityId || 'all'}`;
    const lastInvalidation = this.lastInvalidation.get(tokenKey) || 0;
    
    // Prevent duplicate invalidations using centralized config
    if (token.timestamp - lastInvalidation < CACHE_CLEANUP_CONFIG.INVALIDATION_DEBOUNCE) {
      console.log(`[CacheInvalidationManager] Debounced invalidation for ${tokenKey}`);
      return;
    }

    this.lastInvalidation.set(tokenKey, token.timestamp);
    
    console.log(`[CacheInvalidationManager] Invalidating ${token.entityType} cache:`, {
      source: token.source,
      operation: token.operation,
      entityId: token.entityId,
      timestamp: token.timestamp
    });

    // Notify all listeners for this entity type
    const listenersToNotify = this.listeners[token.entityType];
    let notifiedCount = 0;
    
    for (const listener of listenersToNotify) {
      try {
        listener();
        notifiedCount++;
      } catch (error) {
        console.error(`[CacheInvalidationManager] Error in invalidation listener:`, error);
      }
    }

    console.log(`[CacheInvalidationManager] Notified ${notifiedCount} listeners for ${token.entityType}`);
  }

  /**
   * Create invalidation token from assistant contact operations
   */
  fromAssistantContactOperation(operation: string, contactId?: string): InvalidationToken {
    return {
      timestamp: Date.now(),
      source: 'assistant',
      operation,
      entityType: 'contacts',
      entityId: contactId
    };
  }

  /**
   * Create invalidation token for calendar operations
   */
  fromCalendarOperation(operation: string, eventId?: string, source: 'assistant' | 'user' = 'user'): InvalidationToken {
    return {
      timestamp: Date.now(),
      source,
      operation,
      entityType: 'calendar',
      entityId: eventId
    };
  }

  /**
   * Get invalidation statistics for debugging
   */
  getStats(): { listenerCounts: Record<string, number>; lastInvalidations: Record<string, number> } {
    return {
      listenerCounts: {
        calendar: this.listeners.calendar.size,
        contacts: this.listeners.contacts.size,
        user: this.listeners.user.size,
        settings: this.listeners.settings.size
      },
      lastInvalidations: Object.fromEntries(this.lastInvalidation)
    };
  }

  /**
   * Clear all invalidation history (for testing)
   */
  reset(): void {
    this.lastInvalidation.clear();
    for (const entityType of Object.keys(this.listeners) as Array<keyof CacheInvalidationListeners>) {
      this.listeners[entityType].clear();
    }
    console.log(`[CacheInvalidationManager] Reset all listeners and invalidation history`);
  }
}

// Export singleton instance
export const cacheInvalidationManager = new CacheInvalidationManager();

// Export types for use in other modules
export type { InvalidationToken, CacheInvalidationListeners };