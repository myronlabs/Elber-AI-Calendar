import { CalendarQuickActionsService, canUseQuickActions, QuickCreateEventData } from './calendarQuickActions';
import { routeAssistantRequest } from '../utils/assistantRouter';
import { ApiMessage } from '../types/assistantShared';
import { CalendarEvent } from '../../backend/types';
import { addHours } from 'date-fns';

/**
 * Calendar Smart Router
 * 
 * Intelligently routes calendar operations to the fastest execution path:
 * - Simple CRUD operations → Direct API (sub-second response)
 * - Complex queries/scheduling → AI Assistant (10+ seconds but intelligent)
 * 
 * This dramatically improves performance for common calendar operations
 * while preserving AI capabilities for complex scenarios.
 */

export interface CalendarRouterResponse {
  success: boolean;
  data?: CalendarEvent | CalendarEvent[];
  message?: string;
  error?: string;
  usedAI?: boolean;
  executionTime?: number;
}

export class CalendarSmartRouter {
  /**
   * Main entry point for all calendar operations
   * Automatically determines the optimal execution path
   */
  static async handleCalendarRequest(
    userMessage: string,
    context?: {
      conversationHistory?: ApiMessage[];
      userTimezone?: string;
    }
  ): Promise<CalendarRouterResponse> {
    const startTime = Date.now();
    
    console.log('[CalendarSmartRouter] Processing request:', userMessage);
    
    // First, try to extract structured data for quick actions
    const quickAction = this.parseQuickAction(userMessage);
    
    if (quickAction && canUseQuickActions(userMessage)) {
      console.log('[CalendarSmartRouter] Using quick action path for:', quickAction.action);
      
      try {
        const result = await this.executeQuickAction(quickAction);
        const executionTime = Date.now() - startTime;
        
        return {
          ...result,
          usedAI: false,
          executionTime
        };
      } catch (error) {
        console.warn('[CalendarSmartRouter] Quick action failed, falling back to AI:', error);
        // Fall through to AI processing
      }
    }
    
    // Use AI assistant for complex operations
    console.log('[CalendarSmartRouter] Using AI assistant path');
    
    try {
      const messages: ApiMessage[] = [
        ...(context?.conversationHistory || []),
        { role: 'user', content: userMessage }
      ];
      
      const assistantResponse = await routeAssistantRequest(messages);
      const executionTime = Date.now() - startTime;
      
      // Parse AI response to extract calendar data
      const parsedResult = this.parseAIResponse(assistantResponse);
      
      return {
        ...parsedResult,
        usedAI: true,
        executionTime
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('[CalendarSmartRouter] AI assistant failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process calendar request',
        usedAI: true,
        executionTime
      };
    }
  }
  
  /**
   * Parse user message to extract structured data for quick actions
   */
  private static parseQuickAction(message: string): QuickActionRequest | null {
    const msg = message.toLowerCase().trim();
    
    // Event creation patterns
    const createMatch = msg.match(/(?:create|add|schedule|book|new)\s+(?:event\s+)?(?:for\s+)?["']?([^"']+?)["']?\s+(?:on|at|from)\s+(.+)/i);
    if (createMatch) {
      const title = createMatch[1].trim();
      const timeText = createMatch[2].trim();
      
      const timeData = this.parseTimeExpression(timeText);
      if (timeData && timeData.start_time && timeData.end_time) {
        return {
          action: 'create',
          eventData: {
            title,
            start_time: timeData.start_time,
            end_time: timeData.end_time,
            description: timeData.description,
            location: timeData.location,
            is_all_day: timeData.is_all_day || false,
            is_recurring: timeData.is_recurring,
            recurrence_pattern: timeData.recurrence_pattern,
            recurrence_interval: timeData.recurrence_interval,
            recurrence_days_of_week: timeData.recurrence_days_of_week,
            recurrence_day_of_month: timeData.recurrence_day_of_month,
            recurrence_end_date: timeData.recurrence_end_date,
            recurrence_count: timeData.recurrence_count
          }
        };
      }
    }
    
    // Event update patterns with ID
    const updateMatch = msg.match(/(?:update|change|modify)\s+(?:event\s+)?.*?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    if (updateMatch) {
      const eventId = updateMatch[1];
      
      // Extract what to update
      const updates: Partial<QuickCreateEventData> = {};
      
      // Look for title changes
      const titleMatch = msg.match(/(?:title|name)\s+(?:to\s+)?["']([^"']+)["']/i);
      if (titleMatch) updates.title = titleMatch[1];
      
      // Look for time changes
      const timeMatch = msg.match(/(?:time|start|when)\s+(?:to\s+)?(.+)/i);
      if (timeMatch) {
        const timeData = this.parseTimeExpression(timeMatch[1]);
        if (timeData) {
          Object.assign(updates, timeData);
        }
      }
      
      if (Object.keys(updates).length > 0) {
        return {
          action: 'update',
          eventId,
          updates
        };
      }
    }
    
    // Event deletion patterns with ID
    const deleteMatch = msg.match(/(?:delete|remove|cancel)\s+(?:event\s+)?.*?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    if (deleteMatch) {
      return {
        action: 'delete',
        eventId: deleteMatch[1]
      };
    }
    
    return null;
  }
  
  /**
   * Parse natural language time expressions into structured data
   */
  private static parseTimeExpression(timeText: string): Partial<QuickCreateEventData> | null {
    const text = timeText.toLowerCase().trim();
    
    // Handle "today at 3pm" pattern
    const todayMatch = text.match(/today\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (todayMatch) {
      const hour = parseInt(todayMatch[1]);
      const minute = parseInt(todayMatch[2] || '0');
      const isPM = todayMatch[3]?.toLowerCase() === 'pm';
      
      const now = new Date();
      const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 
        isPM && hour !== 12 ? hour + 12 : (!isPM && hour === 12 ? 0 : hour), minute);
      const endTime = addHours(startTime, 1); // Default 1 hour duration
      
      return {
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        is_all_day: false
      };
    }
    
    // Handle "tomorrow at 2pm" pattern  
    const tomorrowMatch = text.match(/tomorrow\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (tomorrowMatch) {
      const hour = parseInt(tomorrowMatch[1]);
      const minute = parseInt(tomorrowMatch[2] || '0');
      const isPM = tomorrowMatch[3]?.toLowerCase() === 'pm';
      
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const startTime = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(),
        isPM && hour !== 12 ? hour + 12 : (!isPM && hour === 12 ? 0 : hour), minute);
      const endTime = addHours(startTime, 1);
      
      return {
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        is_all_day: false
      };
    }
    
    // Handle "3pm to 4pm" pattern
    const rangeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+to\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (rangeMatch) {
      const startHour = parseInt(rangeMatch[1]);
      const startMinute = parseInt(rangeMatch[2] || '0');
      const startPM = rangeMatch[3]?.toLowerCase() === 'pm';
      const endHour = parseInt(rangeMatch[4]);
      const endMinute = parseInt(rangeMatch[5] || '0');
      const endPM = rangeMatch[6]?.toLowerCase() === 'pm';
      
      const now = new Date();
      const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
        startPM && startHour !== 12 ? startHour + 12 : (!startPM && startHour === 12 ? 0 : startHour), startMinute);
      const endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
        endPM && endHour !== 12 ? endHour + 12 : (!endPM && endHour === 12 ? 0 : endHour), endMinute);
      
      return {
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        is_all_day: false
      };
    }
    
    return null;
  }
  
  /**
   * Execute quick action using direct API calls
   */
  private static async executeQuickAction(action: QuickActionRequest): Promise<CalendarRouterResponse> {
    switch (action.action) {
      case 'create': {
        if (!action.eventData) {
          throw new Error('Event data required for creation');
        }
        
        const createResult = await CalendarQuickActionsService.createEvent(action.eventData);
        return {
          success: createResult.success,
          data: createResult.data,
          message: createResult.message,
          error: createResult.error
        };
      }
      
      case 'update': {
        if (!action.eventId || !action.updates) {
          throw new Error('Event ID and updates required for update');
        }
        
        const updateResult = await CalendarQuickActionsService.updateEvent(action.eventId, action.updates);
        return {
          success: updateResult.success,
          data: updateResult.data,
          message: updateResult.message,
          error: updateResult.error
        };
      }
      
      case 'delete': {
        if (!action.eventId) {
          throw new Error('Event ID required for deletion');
        }
        
        const deleteResult = await CalendarQuickActionsService.deleteEvent(action.eventId);
        return {
          success: deleteResult.success,
          message: deleteResult.message,
          error: deleteResult.error
        };
      }
      
      default:
        throw new Error(`Unknown quick action: ${action.action}`);
    }
  }
  
  /**
   * Parse AI assistant response to extract calendar data
   */
  private static parseAIResponse(response: ApiMessage): Omit<CalendarRouterResponse, 'usedAI' | 'executionTime'> {
    try {
      if (response.role === 'tool' && response.content) {
        const toolResult = JSON.parse(response.content);
        
        if (toolResult.success) {
          return {
            success: true,
            data: toolResult.event || toolResult.events || toolResult.data,
            message: toolResult.message
          };
        } else {
          return {
            success: false,
            error: toolResult.error || toolResult.message
          };
        }
      }
      
      if (response.role === 'assistant' && response.content) {
        // AI provided a natural language response
        return {
          success: true,
          message: response.content
        };
      }
      
      return {
        success: false,
        error: 'Invalid AI response format'
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

interface QuickActionRequest {
  action: 'create' | 'update' | 'delete';
  eventData?: QuickCreateEventData;
  eventId?: string;
  updates?: Partial<QuickCreateEventData>;
}

export default CalendarSmartRouter; 