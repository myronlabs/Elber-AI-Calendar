// src/frontend/pages/CalendarPage.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../styles/pages/_calendar.scss';

import { RecurringCalendarEvent } from '../../types/recurrence';
import { useAuth } from '../../context/AuthContext';
import { useCalendar } from '../../context/CalendarContext';
import { apiClient } from '../../utils/api';
import Button from '../../components/common/Button';
import { showSuccess, showError } from '../../utils/toastManager';
import { CalendarIntegrationService } from '../../services/CalendarIntegrationService';
import { getUserTimezone } from '../../utils/timezoneUtils';
import CalendarGrid from '../../components/calendar/CalendarGrid';
import EventsList from '../../components/calendar/EventsList';
import CalendarEventDetailsModal from '../../components/modals/CalendarEventDetailsModal';
import { useBirthdayEvents } from '../../hooks/calendar/useBirthdayEvents';

// Define interface for CheckAuthResponse
interface CheckAuthResponse {
  authorized: boolean;
  error?: string;
}

// Calendar sources for sidebar
const calendarSources = [
  { id: 'google', name: 'Google Calendar', connected: false },
  { id: 'elber', name: 'Elber Calendar', connected: true },
  { id: 'birthdays', name: 'Contact Birthdays', connected: true },
];

const CalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useAuth();
  const {
    events: calendarEvents,
    isLoading: calendarIsLoading,
    error: calendarError,
    fetchEvents: contextFetchEvents,
    clearError: clearCalendarError
  } = useCalendar();

  // State management
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);
  const [checkingAuthStatus, setCheckingAuthStatus] = useState(false);
  const authCheckDoneRef = useRef(false);
  const [showBirthdayEvents, setShowBirthdayEvents] = useState<boolean>(() => {
    try {
      return JSON.parse(localStorage.getItem('showBirthdayEventsConfig') || 'true');
    } catch {
      return true;
    }
  });
  const [selectedEvent, setSelectedEvent] = useState<RecurringCalendarEvent | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewType, setViewType] = useState<'month' | 'list'>('month'); // Default to month view to match screenshots

  // PERFORMANCE: Cache today's date to avoid creating it 42+ times
  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []); // Only calculate once on mount

  // PERFORMANCE: Cache timezone
  const userTimezone = useMemo(() => getUserTimezone(), []);

  // Use optimized birthday events hook
  const { birthdayEvents, contactsWithBirthdays, fetchContactsWithBirthdays } = useBirthdayEvents(showBirthdayEvents, today);

  // Check Google Calendar connection status
  const checkGoogleAuthStatus = useCallback(async () => {
    if (!session || checkingAuthStatus || authCheckDoneRef.current) return;
    
    setCheckingAuthStatus(true);
    authCheckDoneRef.current = true;
    try {
      const response = await apiClient.get<CheckAuthResponse>('/check-google-auth');
      if (response && response.authorized) {
        setGoogleCalendarConnected(true);
        console.log('[CalendarPage] Google Calendar is connected');
      } else {
        setGoogleCalendarConnected(false);
        console.log('[CalendarPage] Google Calendar is not connected');
      }
    } catch (error) {
      console.error('[CalendarPage] Error checking Google auth status:', error);
      setGoogleCalendarConnected(false);
    } finally {
      setCheckingAuthStatus(false);
    }
  }, [session, checkingAuthStatus]);

  // Check Google Calendar connection on mount and when session changes
  useEffect(() => {
    if (session && !authCheckDoneRef.current) {
      checkGoogleAuthStatus();
    }
  }, [session, checkGoogleAuthStatus]);

  // Fetch calendar events when page loads
  useEffect(() => {
    if (session && calendarEvents.length === 0 && !calendarIsLoading) {
      console.log('[CalendarPage] Fetching calendar events on page load');
      contextFetchEvents();
    }
  }, [session, calendarEvents.length, calendarIsLoading, contextFetchEvents]);

  // Listen for calendar refresh events from assistant operations
  useEffect(() => {
    const handleCalendarRefresh = (event: CustomEvent) => {
      console.log('[CalendarPage] Received calendar refresh event:', event.detail);
      console.log('[CalendarPage] Refreshing calendar events due to assistant operation');
      contextFetchEvents();
    };

    // Listen for calendar refresh events
    window.addEventListener('assistant-calendar-refresh', handleCalendarRefresh as EventListener);

    return () => {
      window.removeEventListener('assistant-calendar-refresh', handleCalendarRefresh as EventListener);
    };
  }, [contextFetchEvents]);

  // Combined events - PERFORMANCE OPTIMIZED
  const allEvents = useMemo(() => {
    // Avoid unnecessary object spreading and property assignments
    // Only add recurrence properties if they don't exist
    const castEvents = calendarEvents.map(event => {
      // If event already has recurrence properties, return as-is
      if ('is_recurring' in event) {
        return event as RecurringCalendarEvent;
      }
      
      // Otherwise, create a minimal wrapper with only necessary properties
      return {
        ...event,
        // Only add the recurrence properties that are actually missing
        is_recurring: false,
        recurrence_pattern: null,
        recurrence_interval: null,
        recurrence_day_of_week: null,
        recurrence_day_of_month: null,
        recurrence_month: null,
        recurrence_end_date: null,
        recurrence_count: null,
        recurrence_rule: null,
        parent_event_id: null,
        is_exception: false,
        exception_date: null,
        series_id: null,
        recurrence_timezone: null
      } as RecurringCalendarEvent;
    });
    
    return [...castEvents, ...birthdayEvents];
  }, [calendarEvents, birthdayEvents]);

  // Clear error when component mounts
  useEffect(() => {
    if (calendarError) {
      clearCalendarError();
    }
  }, [calendarError, clearCalendarError]);

  // PERFORMANCE: Memoized event handlers
  const handleEventClick = useCallback((event: RecurringCalendarEvent) => {
    setSelectedEvent(event);
    setShowEventModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowEventModal(false);
    setSelectedEvent(null);
  }, []);

  const navigateToAssistant = useCallback((query: string) => {
    navigate(`/assistant?query=${encodeURIComponent(query)}`);
  }, [navigate]);

  const handleEditEvent = useCallback((event: RecurringCalendarEvent) => {
    navigateToAssistant(`Edit calendar event: ${event.title}`);
  }, [navigateToAssistant]);

  const handleDeleteEvent = useCallback((eventId: string) => {
    // Use the selectedEvent to get the title since we only receive the ID
    const eventTitle = selectedEvent?.title || 'Unknown Event';
    navigateToAssistant(`Delete calendar event "${eventTitle}"`);
  }, [navigateToAssistant, selectedEvent]);

  const handleSourceToggle = async (sourceId: string) => {
    if (sourceId === 'birthdays') {
      const newValue = !showBirthdayEvents;
      setShowBirthdayEvents(newValue);
      localStorage.setItem('showBirthdayEventsConfig', JSON.stringify(newValue));
      
      if (newValue && contactsWithBirthdays.length === 0) {
        sessionStorage.setItem('elber_explicit_birthday_request', 'true');
        await fetchContactsWithBirthdays();
      }
      showSuccess(newValue ? 'Birthday events enabled' : 'Birthday events disabled');
    } else if (sourceId === 'google') {
      // Handle Google Calendar toggle
      if (!googleCalendarConnected) {
        // Initiate OAuth flow
        try {
          console.log('[CalendarPage] Initiating Google Calendar OAuth flow');
          const result = await CalendarIntegrationService.initiateGoogleOAuth('calendar_readonly');
          
          if (result.success) {
            showSuccess('Google Calendar connected successfully!');
            await checkGoogleAuthStatus(); // Refresh connection status
            await contextFetchEvents(); // Refresh calendar events
          } else {
            showError(result.error || 'Failed to connect Google Calendar');
          }
        } catch (error) {
          console.error('[CalendarPage] Error connecting Google Calendar:', error);
          showError('Failed to connect Google Calendar. Please try again.');
        }
      } else {
        // TODO: Implement disconnect functionality
        showError('Disconnect functionality not implemented yet. Use Settings to manage connections.');
      }
    } else {
      showError(`${sourceId} integration not implemented yet. Use the assistant to manage calendar events.`);
    }
  };

  // Calendar navigation
  const navigateMonth = (direction: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + direction);
    setCurrentDate(newDate);
  };

  const monthYearString = currentDate.toLocaleDateString('en-US', { 
    month: 'long', 
    year: 'numeric' 
  });

  if (calendarIsLoading) {
    return (
      <div className="page-loader-overlay">
        <div className="page-loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="calendar-page">
      <header className="calendar-header">
        <h1>Calendar</h1>
        <div className="calendar-header-controls">
          {/* Mobile tabs for calendar sources */}
          <div className="calendar-sources-tabs">
            {calendarSources.map((source) => {
              const isConnected = source.id === 'google' ? googleCalendarConnected : source.connected;
              const isActive = source.id === 'birthdays' ? showBirthdayEvents : isConnected;
              
              return (
                <button
                  key={source.id}
                  className={`source-tab ${isActive ? 'active' : ''}`}
                  onClick={() => handleSourceToggle(source.id)}
                  disabled={checkingAuthStatus && source.id === 'google'}
                >
                  <span className="source-name">{source.name}</span>
                  <span className={`source-status ${isConnected ? 'connected' : 'disconnected'}`}>
                    {checkingAuthStatus && source.id === 'google' ? '...' : (isConnected ? '✓' : '○')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>
      
      <div className="calendar-layout">
        <main className="calendar-content-area card">
          <div className="calendar-controls">
            <div className="calendar-navigation">
              <button onClick={() => navigateMonth(-1)}>‹</button>
              <h2>{monthYearString}</h2>
              <button onClick={() => navigateMonth(1)}>›</button>
            </div>
            <div className="calendar-actions">
              <Button
                variant={viewType === 'month' ? 'primary' : 'secondary'}
                onClick={() => setViewType('month')}
              >
                Month View
              </Button>
              <Button
                variant={viewType === 'list' ? 'primary' : 'secondary'}
                onClick={() => setViewType('list')}
              >
                List View
              </Button>
              <Button
                variant="primary"
                onClick={() => navigateToAssistant('Create a new calendar event')}
              >
                New Event
              </Button>
              <Button
                variant="secondary" 
                onClick={() => navigateToAssistant('Show my upcoming calendar events')}
              >
                Ask Assistant
              </Button>
            </div>
          </div>

        {calendarError && (
          <div className="error-banner">
            <p>Error loading calendar: {String(calendarError)}</p>
            <Button variant="secondary" onClick={() => contextFetchEvents()}>
              Retry
            </Button>
          </div>
        )}

        {viewType === 'month' ? (
          <CalendarGrid
            currentDate={currentDate}
            events={allEvents}
            onEventClick={handleEventClick}
            today={today}
          />
        ) : (
          <EventsList
            events={allEvents}
            onEventClick={handleEventClick}
            onCreateEvent={() => navigateToAssistant('Create my first calendar event')}
            userTimezone={userTimezone}
            maxEvents={20}
          />
        )}
        </main>
      </div>

      {/* Event Modal */}
      {selectedEvent && (
        <CalendarEventDetailsModal
          event={selectedEvent}
          isOpen={showEventModal}
          onClose={handleCloseModal}
          onEdit={handleEditEvent}
          onDelete={handleDeleteEvent}
          userTimezone={userTimezone}
        />
      )}
    </div>
  );
};

export default CalendarPage;
