// src/frontend/services/calendarDataService.ts

import { apiClient } from '../utils/api';
import { CalendarEvent } from '../../backend/types';
import { globalCache } from '../utils/globalCache';
import { cacheInvalidationManager } from '../utils/cacheInvalidationManager';
import { getCacheTTL } from '../utils/cacheConfig';

/**
 * Centralized calendar data service with intelligent caching and invalidation
 * Coordinates between cache, API calls, and invalidation events
 */

interface CalendarDataOptions {
  forceRefresh?: boolean;
  useCache?: boolean;
  searchTerm?: string;
  startDate?: string;
  endDate?: string;
}

export class CalendarDataService {
  private static instance: CalendarDataService;
  private pendingRequests = new Map<string, Promise<CalendarEvent[]>>();
  
  private constructor() {
    // Register for cache invalidation events
    cacheInvalidationManager.registerListener('calendar', () => {
      this.handleCacheInvalidation();
    });
  }

  static getInstance(): CalendarDataService {
    if (!CalendarDataService.instance) {
      CalendarDataService.instance = new CalendarDataService();
    }
    return CalendarDataService.instance;
  }

  /**
   * Fetch calendar events with intelligent caching
   */
  async fetchEvents(userId: string, options: CalendarDataOptions = {}): Promise<CalendarEvent[]> {
    const {
      forceRefresh = false,
      useCache = true,
      searchTerm,
      startDate,
      endDate
    } = options;

    // Create cache key based on parameters
    const cacheKey = this.createCacheKey(userId, { searchTerm, startDate, endDate });
    
    // Check for pending request to prevent duplicate API calls
    const pendingRequest = this.pendingRequests.get(cacheKey);
    if (pendingRequest) {
      console.log(`[CalendarDataService] Returning pending request for key: ${cacheKey}`);
      return pendingRequest;
    }

    // Check cache first (unless force refresh)
    if (useCache && !forceRefresh) {
      const cachedEvents = globalCache.get<CalendarEvent[]>(cacheKey);
      if (cachedEvents) {
        console.log(`[CalendarDataService] Cache hit for ${cacheKey}: ${cachedEvents.length} events`);
        return cachedEvents;
      }
    }

    // Create and store the API request promise
    const requestPromise = this.performAPIRequest(userId, options);
    this.pendingRequests.set(cacheKey, requestPromise);

    try {
      const events = await requestPromise;
      
      // Cache the results if successful
      if (useCache && events.length >= 0) { // Cache even empty results
        globalCache.set(cacheKey, events, this.getCacheTTL(options));
      }
      
      console.log(`[CalendarDataService] Successfully fetched and cached ${events.length} events for ${cacheKey}`);
      return events;
    } finally {
      // Clean up pending request
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Perform the actual API request
   */
  private async performAPIRequest(userId: string, options: CalendarDataOptions): Promise<CalendarEvent[]> {
    const { forceRefresh, searchTerm, startDate, endDate } = options;
    
    // Build query parameters
    const queryParams = new URLSearchParams();
    if (searchTerm) queryParams.append('search_term', searchTerm);
    if (startDate) queryParams.append('start_date', startDate);
    if (endDate) queryParams.append('end_date', endDate);
    if (forceRefresh) queryParams.append('force_refresh', 'true');
    
    // Add timestamp to prevent browser caching when force refreshing
    if (forceRefresh) {
      queryParams.append('_t', Date.now().toString());
    }

    const endpoint = `/calendar${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    
    console.log(`[CalendarDataService] Making API request to: ${endpoint}`);
    
    try {
      const response = await apiClient.get<CalendarEvent[]>(endpoint);
      
      if (!Array.isArray(response)) {
        console.error(`[CalendarDataService] API returned non-array response:`, response);
        throw new Error('Invalid response format from calendar API');
      }

      // Validate and filter events
      const validEvents = response.filter(event => 
        event && 
        typeof event.event_id === 'string' && 
        event.event_id.length > 0
      );

      if (validEvents.length !== response.length) {
        const invalidCount = response.length - validEvents.length;
        console.warn(`[CalendarDataService] Filtered out ${invalidCount} invalid events`);
      }

      // Sort events by start time
      validEvents.sort((a, b) => 
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );

      return validEvents;
    } catch (error) {
      console.error(`[CalendarDataService] API request failed:`, error);
      throw new Error(`Failed to fetch calendar events: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle cache invalidation events
   */
  private handleCacheInvalidation(): void {
    console.log(`[CalendarDataService] Handling cache invalidation`);
    
    // Clear all pending requests to prevent stale data
    this.pendingRequests.clear();
    
    // Clear cache entries for all calendar keys
    globalCache.clearPattern('^calendar-events-');
    
    console.log(`[CalendarDataService] Cleared ${this.pendingRequests.size} pending requests and calendar cache`);
  }

  /**
   * Create cache key for given parameters
   */
  private createCacheKey(userId: string, params: { searchTerm?: string; startDate?: string; endDate?: string }): string {
    const parts = [`calendar-events-${userId}`];
    
    if (params.searchTerm) parts.push(`search-${params.searchTerm}`);
    if (params.startDate) parts.push(`start-${params.startDate}`);
    if (params.endDate) parts.push(`end-${params.endDate}`);
    
    return parts.join('-');
  }

  /**
   * Get cache TTL based on request options using centralized config
   */
  private getCacheTTL(options: CalendarDataOptions): number {
    // Use centralized cache configuration
    if (options.searchTerm) return getCacheTTL('search');
    return getCacheTTL('assistant'); // Calendar operations are often assistant-driven
  }

  /**
   * Invalidate calendar cache (triggered by assistant operations)
   */
  invalidateCache(source: 'assistant' | 'user' = 'user', operation = 'update'): void {
    const token = cacheInvalidationManager.fromCalendarOperation(operation, undefined, source);
    cacheInvalidationManager.invalidate(token);
  }

  /**
   * Get service statistics for debugging
   */
  getStats(): { pendingRequests: number; cacheStats: ReturnType<typeof globalCache.getStats> } {
    return {
      pendingRequests: this.pendingRequests.size,
      cacheStats: globalCache.getStats()
    };
  }
}

// Export singleton instance
export const calendarDataService = CalendarDataService.getInstance();