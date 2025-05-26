// src/frontend/utils/routingCache.ts
import { ApiMessage } from '../types/assistantShared';
import { getCacheTTL, CACHE_SIZE_CONFIG } from './cacheConfig';

interface CacheEntry {
  pattern: string;
  endpoint: string;
  confidence: number;
  timestamp: number;
}

export class RoutingCache {
  private cache: CacheEntry[] = [];
  private readonly MAX_ENTRIES = CACHE_SIZE_CONFIG.ROUTING_CACHE_MAX_SIZE; // Use centralized config
  private readonly CACHE_TTL = getCacheTTL('user'); // Use centralized config for user operations

  // Generate a pattern from messages for caching
  private generatePattern(messages: ApiMessage[]): string {
    // Take last 3 messages to create a pattern
    const recentMessages = messages.slice(-3);
    return recentMessages
      .map(msg => {
        const role = msg.role;
        const content = msg.content || '';
        const tool = msg.tool_calls?.[0]?.function?.name || msg.name || '';
        
        if (role === 'user') {
          // Extract key phrases from user messages
          const keyWords = this.extractKeyWords(content);
          return `user:${keyWords.join(',')}`;
        } else if (role === 'assistant' && tool) {
          return `assistant:${tool}`;
        } else if (role === 'tool') {
          return `tool:${tool}`;
        }
        return `${role}:generic`;
      })
      .join('|');
  }

  private extractKeyWords(content: string): string[] {
    const lowerContent = content.toLowerCase();
    const keywords: string[] = [];

    // Calendar keywords
    if (lowerContent.match(/\b(calendar|event|schedule|meeting|appointment)\b/)) {
      keywords.push('calendar');
    }

    // Contact keywords
    if (lowerContent.match(/\b(contact|person|email|phone|address)\b/)) {
      keywords.push('contact');
    }

    // Action keywords
    if (lowerContent.match(/\b(create|add|new)\b/)) keywords.push('create');
    if (lowerContent.match(/\b(update|edit|modify|change)\b/)) keywords.push('update');
    if (lowerContent.match(/\b(delete|remove)\b/)) keywords.push('delete');
    if (lowerContent.match(/\b(list|show|display|find|search)\b/)) keywords.push('find');

    return keywords;
  }

  // Get cached endpoint if available
  get(messages: ApiMessage[]): string | null {
    const pattern = this.generatePattern(messages);
    const now = Date.now();

    // Find matching pattern
    const entry = this.cache.find(e => 
      e.pattern === pattern && 
      (now - e.timestamp) < this.CACHE_TTL
    );

    if (entry) {
      console.log(`[RoutingCache] Cache hit for pattern: ${pattern.substring(0, 50)}...`);
      return entry.endpoint;
    }

    return null;
  }

  // Cache a routing decision
  set(messages: ApiMessage[], endpoint: string, confidence: number = 1): void {
    const pattern = this.generatePattern(messages);
    
    // Check if we already have this pattern
    const existingIndex = this.cache.findIndex(e => e.pattern === pattern);
    
    if (existingIndex >= 0) {
      // Update existing entry
      this.cache[existingIndex] = {
        pattern,
        endpoint,
        confidence,
        timestamp: Date.now()
      };
    } else {
      // Add new entry
      this.cache.push({
        pattern,
        endpoint,
        confidence,
        timestamp: Date.now()
      });

      // Trim cache if it gets too large
      if (this.cache.length > this.MAX_ENTRIES) {
        // Remove oldest entries
        this.cache.sort((a, b) => b.timestamp - a.timestamp);
        this.cache = this.cache.slice(0, this.MAX_ENTRIES);
      }
    }

    console.log(`[RoutingCache] Cached pattern: ${pattern.substring(0, 50)}... -> ${endpoint}`);
  }

  // Clear expired entries
  cleanup(): void {
    const now = Date.now();
    this.cache = this.cache.filter(e => (now - e.timestamp) < this.CACHE_TTL);
  }

  // Get cache statistics
  getStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.length,
      hitRate: 0 // Would need to track hits/misses for this
    };
  }
}

// Export singleton instance
export const routingCache = new RoutingCache();