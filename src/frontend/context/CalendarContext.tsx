// src/frontend/context/CalendarContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { apiClient } from '../utils/api';
import { CalendarEvent } from '../../backend/types';
import { RecurringCalendarEvent } from '../types/recurrence';
import { CalendarIntegrationService, CalendarSource } from '../services/CalendarIntegrationService';
import { useAuth } from './AuthContext';
import { calendarDataService } from '../services/calendarDataService';
import { ApiMessage } from '../types/assistantShared';

// Type guard for CalendarSource array
function isCalendarSourceArray(data: unknown): data is CalendarSource[] {
  if (!Array.isArray(data)) return false;
  return data.every(item => 
    item && 
    typeof item.id === 'string' && 
    typeof item.name === 'string' &&
    typeof item.connected === 'boolean' &&
    typeof item.visible === 'boolean'
  );
}

// Helper function to validate UUID format
const isValidUUID = (uuid: string): boolean => {
  if (typeof uuid !== 'string') return false;
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  return uuidRegex.test(uuid);
};

// Assistant API response types
interface AssistantResponse {
  role: string;
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
  messages?: Array<{
    role: string;
    content: string;
  }>;
  _metadata?: {
    should_refresh_calendar?: boolean;
  };
  tool_call_id?: string;
}

// Simplified state structure for better performance
interface CalendarState {
  events: CalendarEvent[];
  isLoading: boolean;
  error: Error | null;
}

interface CalendarContextType extends CalendarState {
  fetchEvents: () => Promise<void>;
  addEvent: (
    _eventData: Omit<RecurringCalendarEvent, 'event_id' | 'user_id' | 'created_at' | 'updated_at'>,
    _assistantMessage?: string
  ) => Promise<CalendarEvent | null>;
  updateEvent: (_eventId: string, _eventData: Partial<Omit<RecurringCalendarEvent, 'event_id' | 'user_id'>>) => Promise<RecurringCalendarEvent | null>;
  deleteEvent: (_eventId: string, _deleteSeries?: boolean) => Promise<boolean>;
  clearError: () => void;
  addEventFromTool: (_newEvent: CalendarEvent) => void;
  setEvents: (_events: CalendarEvent[]) => void;
  
  // Calendar Integration methods
  checkGoogleCalendarConnection: () => Promise<boolean>;
  connectGoogleCalendar: () => Promise<boolean>;
  disconnectGoogleCalendar: () => Promise<boolean>;
  getCalendarSources: () => CalendarSource[];
  updateCalendarSource: (_sourceId: string, _connected: boolean) => void;
  
  // Conversation-aware calendar operations
  addEventWithConversationHistory: (_assistantMessage: string, _conversationHistory: ApiMessage[]) => Promise<CalendarEvent | null>;
}

const CalendarContext = createContext<CalendarContextType | undefined>(undefined);

interface CalendarProviderProps {
  children: ReactNode;
}

// Helper function to prepare event data for submission
const prepareEventForSubmission = (
  eventData: Partial<RecurringCalendarEvent>
): Omit<RecurringCalendarEvent, 'event_id' | 'user_id' | 'created_at' | 'updated_at'> => {
  const {
    event_id, user_id, created_at, updated_at,
    ...restOfData
  } = eventData as RecurringCalendarEvent;
  
  const preparedEvent: Omit<RecurringCalendarEvent, 'event_id' | 'user_id' | 'created_at' | 'updated_at'> = {
    title: restOfData.title || 'Untitled Event',
    start_time: restOfData.start_time,
    end_time: restOfData.end_time,
    description: restOfData.description || null,
    location: restOfData.location || null,
    is_all_day: restOfData.is_all_day || false,
    is_recurring: restOfData.is_recurring || false,
    is_exception: restOfData.is_exception || false,
    google_event_id: restOfData.google_event_id || null,
    zoom_meeting_id: restOfData.zoom_meeting_id || null,
    recurrence_pattern: restOfData.is_recurring ? restOfData.recurrence_pattern : null,
    recurrence_interval: restOfData.is_recurring ? (restOfData.recurrence_interval || 1) : null,
    recurrence_day_of_week: restOfData.is_recurring ? restOfData.recurrence_day_of_week : null,
    recurrence_day_of_month: restOfData.is_recurring ? restOfData.recurrence_day_of_month : null,
    recurrence_month: restOfData.is_recurring ? restOfData.recurrence_month : null,
    recurrence_end_date: restOfData.is_recurring ? restOfData.recurrence_end_date : null,
    recurrence_count: restOfData.is_recurring ? restOfData.recurrence_count : null,
    recurrence_rule: restOfData.is_recurring ? restOfData.recurrence_rule : null,
    recurrence_timezone: restOfData.is_recurring ? restOfData.recurrence_timezone : null,
    parent_event_id: restOfData.is_exception ? restOfData.parent_event_id : (restOfData.parent_event_id || null),
    exception_date: restOfData.is_exception ? restOfData.exception_date : null,
    series_id: restOfData.series_id || null,
  };

  // Filter out undefined values
  Object.keys(preparedEvent).forEach(key => {
    const typedKey = key as keyof typeof preparedEvent;
    if (preparedEvent[typedKey] === undefined) {
      delete preparedEvent[typedKey];
    }
  });

  return preparedEvent;
};

export const CalendarProvider: React.FC<CalendarProviderProps> = ({ children }) => {
  const { user, isLoading: authLoading } = useAuth();
  const abortControllerRef = useRef<AbortController | null>(null);

  const [calendarState, setCalendarState] = useState<CalendarState>({
    events: [],
    isLoading: false,
    error: null,
  });
  
  // State for calendar sources
  const [calendarSources, setCalendarSources] = useState<CalendarSource[]>([]);
  
  // Load calendar sources from localStorage on initial mount
  useEffect(() => {
    try {
      const storedSources = localStorage.getItem('calendarSourcesConfig');
      if (storedSources) {
        const parsedSources: unknown = JSON.parse(storedSources);
        if (isCalendarSourceArray(parsedSources)) {
          setCalendarSources(parsedSources);
        } else {
          console.warn('[CalendarContext] Malformed calendarSourcesConfig in localStorage, using defaults');
          const defaultSources: CalendarSource[] = [
            { id: 'elber', name: 'Elber Calendar', connected: true, visible: true },
            { id: 'google', name: 'Google Calendar', connected: false, visible: true },
            { id: 'birthdays', name: 'Contact Birthdays', connected: true, visible: true },
          ];
          setCalendarSources(defaultSources);
          localStorage.setItem('calendarSourcesConfig', JSON.stringify(defaultSources));
        }
      } else {
        console.log('[CalendarContext] No calendarSourcesConfig in localStorage, initializing defaults');
        const defaultSources: CalendarSource[] = [
          { id: 'elber', name: 'Elber Calendar', connected: true, visible: true },
          { id: 'google', name: 'Google Calendar', connected: false, visible: true },
          { id: 'birthdays', name: 'Contact Birthdays', connected: true, visible: true },
        ];
        setCalendarSources(defaultSources);
        localStorage.setItem('calendarSourcesConfig', JSON.stringify(defaultSources));
      }
    } catch (error) {
      console.error('[CalendarContext] Error loading/parsing calendar sources from localStorage:', error);
      const defaultSources: CalendarSource[] = [
        { id: 'elber', name: 'Elber Calendar', connected: true, visible: true },
        { id: 'google', name: 'Google Calendar', connected: false, visible: true },
        { id: 'birthdays', name: 'Contact Birthdays', connected: true, visible: true },
      ];
      setCalendarSources(defaultSources);
      localStorage.setItem('calendarSourcesConfig', JSON.stringify(defaultSources));
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    if (!user || authLoading) {
      if (authLoading) {
        console.warn("[CalendarContext] fetchEvents called while auth is still loading. Aborting.");
      } else {
        console.warn("[CalendarContext] fetchEvents called without an authenticated user. Aborting.");
      }
      setCalendarState(prev => ({ ...prev, isLoading: false, error: new Error("User not ready or authentication in progress.") }));
      return;
    }

    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    setCalendarState(prev => ({ ...prev, isLoading: true, error: null }));
    console.log(`[CalendarContext] Initiating fetchEvents sequence...`);

    try {
      // Use calendar data service for intelligent caching
      try {
        console.log(`[CalendarContext] fetchEvents - Using calendar data service`);
        
        const events = await calendarDataService.fetchEvents(user.id, { useCache: true });
        const validEvents = events.filter(event => isValidUUID(event.event_id));
        const sortedEvents = validEvents.sort((a, b) => 
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        );
        
        setCalendarState(prev => ({
          ...prev,
          events: sortedEvents,
          isLoading: false,
        }));
        
        console.log(`[CalendarContext] fetchEvents: Successfully fetched and processed ${sortedEvents.length} events via data service.`);
        return;
      } catch (serviceError) {
        console.warn(`[CalendarContext] fetchEvents - Calendar data service failed, falling back to assistant flow:`, serviceError);
        // Fall through to assistant method
      }

      // Fallback to assistant-based method if direct calendar endpoint fails
      const initialRequestPayload = {
        messages: [{ role: 'user' as const, content: 'Find all my calendar events.' }],
      };

      console.log(`[CalendarContext] fetchEvents - Step 1: Requesting tool call for 'Find all my calendar events.'`);
      const firstApiResponse = await apiClient.post('/assistant', initialRequestPayload) as AssistantResponse;

      if (firstApiResponse?.role === 'assistant' && firstApiResponse.tool_calls && firstApiResponse.tool_calls.length > 0) {
        const toolCallToExecute = firstApiResponse.tool_calls[0];

        if (toolCallToExecute.function.name === 'find_calendar_events') {
          console.log(`[CalendarContext] fetchEvents - Step 1 Success: Received tool_call for 'find_calendar_events'. ID: ${toolCallToExecute.id}`);

          const messagesHistory = firstApiResponse.messages || [];

          const toolExecutionPayload = {
            tool_call: { 
              id: toolCallToExecute.id,
              type: toolCallToExecute.type as 'function', 
              function: {
                name: toolCallToExecute.function.name,
                arguments: toolCallToExecute.function.arguments,
              },
            },
            messages: messagesHistory,
          };

          console.log(`[CalendarContext] fetchEvents - Step 2: Executing 'find_calendar_events' tool call with ID: ${toolExecutionPayload.tool_call?.id}`);
          const secondApiResponse = await apiClient.post('/assistant', toolExecutionPayload) as AssistantResponse;

          if (secondApiResponse?.role === 'tool' && typeof secondApiResponse.content === 'string') {
            try {
              const toolResponseContent = JSON.parse(secondApiResponse.content) as { success: boolean; data?: CalendarEvent[]; error?: string; message?: string };

              if (toolResponseContent.error) {
                console.error('[CalendarContext] fetchEvents - Step 2 Error: find_calendar_events tool execution failed with tool error:', toolResponseContent.error);
                throw new Error(`Tool execution failed: ${toolResponseContent.error}`);
              }

              if (!toolResponseContent.success || !Array.isArray(toolResponseContent.data)) {
                console.error('[CalendarContext] fetchEvents - Step 2 Error: Tool execution reported not successful or data is not an array. Content:', toolResponseContent);
                throw new Error(toolResponseContent.message || 'Tool execution failed to return valid event data.');
              }

              console.log(`[CalendarContext] fetchEvents - Step 2 Success: Received tool response for 'find_calendar_events'. Tool Call ID: ${secondApiResponse.tool_call_id}`);
              const eventsData = toolResponseContent.data;
              const validEvents = eventsData ? eventsData.filter(event => isValidUUID(event.event_id)) : [];

              if (eventsData && eventsData.length !== validEvents.length) {
                const invalidCount = eventsData.length - validEvents.length;
                console.warn(`[CalendarContext] fetchEvents: Filtered out ${invalidCount} events with invalid or missing UUIDs.`);
              }
              
              const sortedEvents = validEvents.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
              setCalendarState(prev => ({
                ...prev,
                events: sortedEvents,
                isLoading: false,
              }));
              console.log(`[CalendarContext] fetchEvents: Successfully fetched and processed ${sortedEvents.length} events via assistant.`);
            } catch (parseError) {
              console.error('[CalendarContext] fetchEvents - Step 2 Error: Failed to parse tool content:', parseError, 'Raw content:', secondApiResponse.content);
              setCalendarState(prev => ({ ...prev, isLoading: false, error: new Error('Failed to parse event data from tool.') }));
            }
          } else {
            console.error('[CalendarContext] fetchEvents - Step 2: Unexpected response format from assistant');
            setCalendarState(prev => ({ ...prev, isLoading: false, error: new Error('Unexpected response format from assistant.') }));
          }
        } else {
          console.error('[CalendarContext] fetchEvents - Step 1: Assistant suggested unexpected tool:', toolCallToExecute.function.name);
          setCalendarState(prev => ({ ...prev, isLoading: false, error: new Error('Assistant suggested unexpected tool for event fetching.') }));
        }
      } else {
        console.error('[CalendarContext] fetchEvents - Step 1: Assistant did not provide tool calls');
        setCalendarState(prev => ({ ...prev, isLoading: false, error: new Error('Assistant did not provide tool calls for event fetching.') }));
      }
    } catch (error) {
      // Ignore aborted requests
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      console.error('[CalendarContext] fetchEvents - Error:', error);
      setCalendarState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: error instanceof Error ? error : new Error('Failed to fetch calendar events') 
      }));
    }
  }, [user, authLoading]);

  // Simplified event operations
  const addEvent = useCallback(async (
    eventData: Omit<RecurringCalendarEvent, 'event_id' | 'user_id' | 'created_at' | 'updated_at'>,
    assistantMessage?: string
  ): Promise<CalendarEvent | null> => {
    if (!user) {
      console.error('[CalendarContext] Cannot add event: no authenticated user');
      return null;
    }

    setCalendarState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const preparedEventData = prepareEventForSubmission(eventData);
      
      if (assistantMessage) {
        // Use assistant for event creation
        const response = await apiClient.post('/assistant', {
          messages: [{ role: 'user', content: assistantMessage }]
        }) as AssistantResponse;
        
        if (response?.role === 'assistant' && response._metadata?.should_refresh_calendar) {
          await fetchEvents();
          return null; // Event will be in the refreshed list
        }
      } else {
        // Direct API call
        const newEvent = await apiClient.post<typeof preparedEventData, CalendarEvent>('/calendar', preparedEventData);
        
        setCalendarState(prev => ({
          ...prev,
          events: [...prev.events, newEvent].sort((a, b) => 
            new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
          ),
          isLoading: false
        }));
        
        return newEvent;
      }
    } catch (error) {
      console.error('[CalendarContext] Error adding event:', error);
      setCalendarState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: error instanceof Error ? error : new Error('Failed to add event') 
      }));
    }

    return null;
  }, [user, fetchEvents]);

  const updateEvent = useCallback(async (
    eventId: string,
    eventData: Partial<Omit<RecurringCalendarEvent, 'event_id' | 'user_id'>>
  ): Promise<RecurringCalendarEvent | null> => {
    if (!user) {
      console.error('[CalendarContext] Cannot update event: no authenticated user');
      return null;
    }

    setCalendarState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const updatedEvent = await apiClient.put<typeof eventData, RecurringCalendarEvent>(`/calendar/${eventId}`, eventData);
      
      setCalendarState(prev => ({
        ...prev,
        events: prev.events.map(event => 
          event.event_id === eventId ? updatedEvent : event
        ).sort((a, b) => 
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        ),
        isLoading: false
      }));
      
      return updatedEvent;
    } catch (error) {
      console.error('[CalendarContext] Error updating event:', error);
      setCalendarState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: error instanceof Error ? error : new Error('Failed to update event') 
      }));
      return null;
    }
  }, [user]);

  const deleteEvent = useCallback(async (eventId: string, deleteSeries?: boolean): Promise<boolean> => {
    if (!user) {
      console.error('[CalendarContext] Cannot delete event: no authenticated user');
      return false;
    }

    setCalendarState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      await apiClient.delete(`/calendar/${eventId}${deleteSeries ? '?deleteSeries=true' : ''}`);
      
      setCalendarState(prev => ({
        ...prev,
        events: prev.events.filter(event => event.event_id !== eventId),
        isLoading: false
      }));
      
      return true;
    } catch (error) {
      console.error('[CalendarContext] Error deleting event:', error);
      setCalendarState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: error instanceof Error ? error : new Error('Failed to delete event') 
      }));
      return false;
    }
  }, [user]);

  const clearError = useCallback(() => {
    setCalendarState(prev => ({ ...prev, error: null }));
  }, []);

  const addEventFromTool = useCallback((newEvent: CalendarEvent) => {
    setCalendarState(prev => ({
      ...prev,
      events: [...prev.events, newEvent].sort((a, b) => 
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      )
    }));
  }, []);

  const setEvents = useCallback((events: CalendarEvent[]) => {
    setCalendarState(prev => ({ ...prev, events }));
  }, []);

  // Calendar integration methods
  const checkGoogleCalendarConnection = useCallback(async (): Promise<boolean> => {
    try {
      const response = await CalendarIntegrationService.checkGoogleCalendarConnection();
      return response;
    } catch (error) {
      console.error('[CalendarContext] Error checking Google Calendar connection:', error);
      return false;
    }
  }, []);

  const connectGoogleCalendar = useCallback(async (): Promise<boolean> => {
    try {
      const result = await CalendarIntegrationService.initiateGoogleOAuth('calendar_readonly');
      return result.success;
    } catch (error) {
      console.error('[CalendarContext] Error connecting Google Calendar:', error);
      return false;
    }
  }, []);

  const disconnectGoogleCalendar = useCallback(async (): Promise<boolean> => {
    try {
      await CalendarIntegrationService.disconnectGoogleCalendar();
      return true;
    } catch (error) {
      console.error('[CalendarContext] Error disconnecting Google Calendar:', error);
      return false;
    }
  }, []);

  const getCalendarSources = useCallback((): CalendarSource[] => {
    return calendarSources;
  }, [calendarSources]);

  const updateCalendarSource = useCallback((sourceId: string, connected: boolean) => {
    setCalendarSources(prev => {
      const updated = prev.map(source => 
        source.id === sourceId ? { ...source, connected } : source
      );
      localStorage.setItem('calendarSourcesConfig', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const addEventWithConversationHistory = useCallback(async (
    assistantMessage: string,
    conversationHistory: ApiMessage[]
  ): Promise<CalendarEvent | null> => {
    if (!user) {
      console.error('[CalendarContext] Cannot add event: no authenticated user');
      return null;
    }

    try {
      const messageHistory = [
        ...conversationHistory,
        { role: 'user' as const, content: assistantMessage }
      ];

      const response = await apiClient.post('/assistant', { messages: messageHistory }) as AssistantResponse;

      if (response?.role === 'assistant' && response._metadata?.should_refresh_calendar) {
        await fetchEvents();
        return null; // Event will be in the refreshed list
      }

      return null;
    } catch (error) {
      console.error('[CalendarContext] Error adding event with conversation history:', error);
      return null;
    }
  }, [user, fetchEvents]);

  // PERFORMANCE: Cleanup on unmount and prevent memory leaks
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      // Clear calendar sources to prevent memory leaks
      setCalendarSources([]);
      // Clear state to prevent memory leaks
      setCalendarState({
        events: [],
        isLoading: false,
        error: null
      });
    };
  }, []);

  // Simple context value - only include what components actually need
  const contextValue: CalendarContextType = {
    // State
    events: calendarState.events,
    isLoading: calendarState.isLoading,
    error: calendarState.error,
    
    // Essential functions only
    fetchEvents,
    addEvent,
    updateEvent,
    deleteEvent,
    clearError,
    addEventFromTool,
    setEvents,
    
    // Calendar integration (rarely used)
    checkGoogleCalendarConnection,
    connectGoogleCalendar,
    disconnectGoogleCalendar,
    getCalendarSources,
    updateCalendarSource,
    addEventWithConversationHistory
  };

  return (
    <CalendarContext.Provider value={contextValue}>
      {children}
    </CalendarContext.Provider>
  );
};

export const useCalendar = (): CalendarContextType => {
  const context = useContext(CalendarContext);
  if (!context) {
    throw new Error('useCalendar must be used within a CalendarProvider');
  }
  return context;
};
