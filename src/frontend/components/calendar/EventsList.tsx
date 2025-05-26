import React, { memo, useMemo, useCallback } from 'react';
import { RecurringCalendarEvent } from '../../types/recurrence';
import Button from '../common/Button';
import { 
  formatDateWithTimezone,
  getSmartTimeDescription 
} from '../../utils/timezoneUtils';
import { 
  transformURLsInText, 
  getURLDisplayText,
  sanitizeURL,
  getMeetingPlatform 
} from '../../utils/urlHelpers';

interface EventsListProps {
  events: RecurringCalendarEvent[];
  onEventClick: (event: RecurringCalendarEvent) => void;
  onCreateEvent: () => void;
  userTimezone: string;
  maxEvents?: number;
}

const EventsList = memo<EventsListProps>(({ 
  events, 
  onEventClick, 
  onCreateEvent, 
  userTimezone,
  maxEvents = 20 
}) => {
  // PERFORMANCE: Pre-sort events once
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const aTime = new Date(a.start_time).getTime();
      const bTime = new Date(b.start_time).getTime();
      return aTime - bTime;
    });
  }, [events]);

  // PERFORMANCE: Memoize event time formatting
  const formatEventTime = useCallback((startTime: string, endTime: string, isAllDay: boolean): string => {
    try {
      if (isAllDay) {
        return getSmartTimeDescription(startTime, userTimezone, false);
      }
      
      const startDate = new Date(startTime);
      const endDate = new Date(endTime);
      
      if (startDate.toDateString() === endDate.toDateString()) {
        const dateStr = formatDateWithTimezone(startTime, {
          timezone: userTimezone,
          dateStyle: 'medium',
          timeStyle: 'short',
          showTimezone: false
        });
        const endTimeStr = formatDateWithTimezone(endTime, {
          timezone: userTimezone,
          dateStyle: undefined,
          timeStyle: 'short',
          showTimezone: false
        }).split(' at ')[1];
        
        return dateStr.replace(/ at /, ' ') + ' - ' + (endTimeStr || '');
      } else {
        const startStr = formatDateWithTimezone(startTime, {
          timezone: userTimezone,
          dateStyle: 'medium',
          timeStyle: 'short',
          showTimezone: false
        });
        const endStr = formatDateWithTimezone(endTime, {
          timezone: userTimezone,
          dateStyle: 'medium',
          timeStyle: 'short',
          showTimezone: false
        });
        return `${startStr} - ${endStr}`;
      }
    } catch (error) {
      console.error('[EventsList] Error formatting event time:', error);
      return 'Invalid date';
    }
  }, [userTimezone]);

  // PERFORMANCE: Slice events only when needed
  const displayEvents = useMemo(() => {
    return sortedEvents.slice(0, maxEvents);
  }, [sortedEvents, maxEvents]);

  if (events.length === 0) {
    return (
      <div className="events-list">
        <h3>Upcoming Events (0)</h3>
        <div className="no-events">
          <p>No upcoming events found.</p>
          <Button
            variant="primary"
            onClick={onCreateEvent}
          >
            Create Your First Event
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="events-list">
      <h3>Upcoming Events ({events.length})</h3>
      <div className="event-items">
        {displayEvents.map((event) => (
          <EventItem
            key={event.event_id}
            event={event}
            onEventClick={onEventClick}
            formatEventTime={formatEventTime}
          />
        ))}
        
        {events.length > maxEvents && (
          <div className="show-more">
            <p>Showing {maxEvents} of {events.length} events</p>
          </div>
        )}
      </div>
    </div>
  );
});

// Transform URLs in text to clickable links
const transformURLsToLinks = (text: string): React.ReactNode => {
  const elements = transformURLsInText(text, (url, index) => {
    const sanitizedURL = sanitizeURL(url);
    if (!sanitizedURL) return <span key={`url-${index}`}>{url}</span>;
    
    const displayText = getURLDisplayText(url);
    const platform = getMeetingPlatform(url);
    
    return (
      <a
        key={`url-${index}`}
        href={sanitizedURL}
        target="_blank"
        rel="noopener noreferrer"
        className="event-link"
        onClick={(e) => e.stopPropagation()}
        title={sanitizedURL}
        data-platform={platform?.name}
      >
        {displayText}
      </a>
    );
  });
  
  return elements.map((element, index) => 
    typeof element === 'string' ? <span key={`text-${index}`}>{element}</span> : element
  );
};

// Separate EventItem component for better performance
const EventItem = memo<{
  event: RecurringCalendarEvent;
  onEventClick: (event: RecurringCalendarEvent) => void;
  formatEventTime: (startTime: string, endTime: string, isAllDay: boolean) => string;
}>(({ event, onEventClick, formatEventTime }) => {
  const handleClick = useCallback(() => {
    onEventClick(event);
  }, [event, onEventClick]);

  return (
    <div
      className={`event-item ${event.event_id.startsWith('birthday-') ? 'birthday-event' : ''}`}
      onClick={handleClick}
    >
      <div className="event-title">{transformURLsToLinks(event.title)}</div>
      <div className="event-time">
        {formatEventTime(event.start_time, event.end_time, event.is_all_day || false)}
      </div>
      {event.location && (
        <div className="event-location">📍 {transformURLsToLinks(event.location)}</div>
      )}
    </div>
  );
});

EventsList.displayName = 'EventsList';
EventItem.displayName = 'EventItem';

export default EventsList; 