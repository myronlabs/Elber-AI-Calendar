import { apiClient } from '../utils/api';
import { CalendarEvent } from '../../backend/types';

/**
 * Calendar Quick Actions Service
 * 
 * Provides fast, direct calendar operations that bypass the AI assistant
 * for simple CRUD operations, dramatically improving performance.
 * 
 * Use this for:
 * - Creating events with known data
 * - Updating specific event fields  
 * - Deleting events by ID
 * - Fetching events with simple criteria
 * 
 * Use AI assistant for:
 * - Natural language queries
 * - Complex scheduling logic
 * - Smart event suggestions
 */

export interface QuickCreateEventData {
  title: string;
  start_time: string; // ISO format
  end_time: string; // ISO format
  description?: string;
  location?: string;
  is_all_day?: boolean;
  
  // Recurring event properties
  is_recurring?: boolean;
  recurrence_pattern?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrence_interval?: number;
  recurrence_days_of_week?: number[];
  recurrence_day_of_month?: number;
  recurrence_end_date?: string;
  recurrence_count?: number;
}

export interface QuickUpdateEventData {
  title?: string;
  start_time?: string;
  end_time?: string;
  description?: string;
  location?: string;
  is_all_day?: boolean;
}

export interface CalendarQuickResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export class CalendarQuickActionsService {
  /**
   * Create a calendar event directly without AI assistant
   * Ultra-fast for when you have complete event data
   */
  static async createEvent(eventData: QuickCreateEventData): Promise<CalendarQuickResponse<CalendarEvent>> {
    try {
      console.log('[CalendarQuickActions] Creating event directly:', eventData.title);
      
      const response = await apiClient.post<QuickCreateEventData, CalendarEvent>(
        '/calendar',
        eventData
      );

      if (response && typeof response === 'object' && 'event_id' in response) {
        return {
          success: true,
          data: response,
          message: `Event "${eventData.title}" created successfully`
        };
      }

      // Handle wrapped response
      if (response && typeof response === 'object' && 'success' in response) {
        const wrappedResponse = response as { success: boolean; event?: CalendarEvent; message?: string };
        if (wrappedResponse.success && wrappedResponse.event) {
          return {
            success: true,
            data: wrappedResponse.event,
            message: wrappedResponse.message || `Event "${eventData.title}" created successfully`
          };
        }
      }

      throw new Error('Invalid response format from calendar API');
    } catch (error) {
      console.error('[CalendarQuickActions] Error creating event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create event'
      };
    }
  }

  /**
   * Update a calendar event directly by ID
   * Ultra-fast for specific field updates
   */
  static async updateEvent(
    eventId: string, 
    updates: QuickUpdateEventData
  ): Promise<CalendarQuickResponse<CalendarEvent>> {
    try {
      console.log('[CalendarQuickActions] Updating event directly:', eventId);
      
      const response = await apiClient.put<QuickUpdateEventData, CalendarEvent>(
        `/calendar/${eventId}`,
        updates
      );

      if (response && typeof response === 'object') {
        return {
          success: true,
          data: response,
          message: 'Event updated successfully'
        };
      }

      throw new Error('Invalid response format from calendar API');
    } catch (error) {
      console.error('[CalendarQuickActions] Error updating event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update event'
      };
    }
  }

  /**
   * Delete a calendar event directly by ID
   * Ultra-fast deletion
   */
  static async deleteEvent(eventId: string, deleteSeries: boolean = false): Promise<CalendarQuickResponse<{ deleted_event_id: string }>> {
    try {
      console.log('[CalendarQuickActions] Deleting event directly:', eventId);
      
      const endpoint = deleteSeries ? `/calendar/${eventId}?scope=all` : `/calendar/${eventId}`;
      const response = await apiClient.delete<{ success: boolean; message: string; event_id: string }>(endpoint);

      if (response && typeof response === 'object' && 'success' in response && response.success) {
        const typedResponse = response as { success: boolean; message: string; event_id: string };
        return {
          success: true,
          data: { deleted_event_id: typedResponse.event_id },
          message: typedResponse.message || 'Event deleted successfully'
        };
      }

      throw new Error('Invalid response format from calendar API');
    } catch (error) {
      console.error('[CalendarQuickActions] Error deleting event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete event'
      };
    }
  }

  /**
   * Fetch events directly with simple criteria
   * Ultra-fast for basic event retrieval
   */
  static async getEvents(options: {
    search_term?: string;
    start_date?: string;
    end_date?: string;
    force_refresh?: boolean;
  } = {}): Promise<CalendarQuickResponse<CalendarEvent[]>> {
    try {
      console.log('[CalendarQuickActions] Fetching events directly');
      
      const queryParams = new URLSearchParams();
      if (options.search_term) queryParams.append('search_term', options.search_term);
      if (options.start_date) queryParams.append('start_date', options.start_date);
      if (options.end_date) queryParams.append('end_date', options.end_date);
      if (options.force_refresh) queryParams.append('force_refresh', 'true');
      
      const endpoint = `/calendar${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await apiClient.get<CalendarEvent[]>(endpoint);

      if (Array.isArray(response)) {
        return {
          success: true,
          data: response,
          message: `Found ${response.length} events`
        };
      }

      throw new Error('Invalid response format from calendar API');
    } catch (error) {
      console.error('[CalendarQuickActions] Error fetching events:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch events'
      };
    }
  }

  /**
   * Get a specific event by ID directly
   * Ultra-fast single event retrieval
   */
  static async getEventById(eventId: string): Promise<CalendarQuickResponse<CalendarEvent>> {
    try {
      console.log('[CalendarQuickActions] Fetching event by ID directly:', eventId);
      
      const response = await apiClient.get<CalendarEvent>(`/calendar/${eventId}`);

      if (response && typeof response === 'object' && 'event_id' in response) {
        return {
          success: true,
          data: response,
          message: 'Event retrieved successfully'
        };
      }

      throw new Error('Invalid response format from calendar API');
    } catch (error) {
      console.error('[CalendarQuickActions] Error fetching event by ID:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch event'
      };
    }
  }
}

/**
 * Utility function to determine if a calendar operation can use quick actions
 * Returns true for simple CRUD operations that don't need AI processing
 */
export function canUseQuickActions(userRequest: string): boolean {
  const request = userRequest.toLowerCase().trim();
  
  // Direct event creation patterns
  const createPatterns = [
    /^create\s+event\s+/,
    /^add\s+event\s+/,
    /^schedule\s+/,
    /^book\s+/,
    /^new\s+event\s+/
  ];
  
  // Direct update patterns with specific event ID
  const updatePatterns = [
    /update\s+event\s+.*[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i,
    /change\s+.*[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i,
    /modify\s+.*[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i
  ];
  
  // Direct delete patterns with specific event ID
  const deletePatterns = [
    /delete\s+event\s+.*[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i,
    /remove\s+.*[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i,
    /cancel\s+.*[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i
  ];
  
  // Complex patterns that need AI processing
  const complexPatterns = [
    /when\s+is/,
    /when\s+am\s+i/,
    /what.*next/,
    /find.*meeting/,
    /search.*for/,
    /show.*me/,
    /do\s+i\s+have/,
    /am\s+i\s+(free|busy)/,
    /schedule.*with/,
    /available.*time/,
    /conflict/,
    /reschedule/,
    /move.*meeting/
  ];
  
  // If it contains complex patterns, use AI
  if (complexPatterns.some(pattern => pattern.test(request))) {
    return false;
  }
  
  // If it matches simple CRUD patterns, use quick actions
  return [...createPatterns, ...updatePatterns, ...deletePatterns].some(pattern => pattern.test(request));
}

export default CalendarQuickActionsService; 