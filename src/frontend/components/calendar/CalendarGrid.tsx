import React from 'react';
import { RecurringCalendarEvent } from '../../types/recurrence';

interface CalendarGridProps {
  currentDate: Date;
  events: RecurringCalendarEvent[];
  onEventClick: (event: RecurringCalendarEvent) => void;
  today: Date;
}

const CalendarGrid = ({ currentDate, events, onEventClick, today }: CalendarGridProps) => {
  // Simple computed values - no excessive memoization
  const todayDateString = today.toDateString();

  // Generate calendar days
  const generateCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    
    const days: Date[] = [];
    const current = new Date(startDate);
    
    const endDate = new Date(lastDay);
    const daysToAdd = 6 - endDate.getDay();
    endDate.setDate(endDate.getDate() + daysToAdd);
    
    while (current <= endDate) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    while (days.length < 35) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    if (days.length > 42) {
      days.length = 42;
    }
    
    return days;
  };

  // Create events map
  const createEventsMap = () => {
    const map = new Map<string, RecurringCalendarEvent[]>();
    
    events.forEach(event => {
      const eventDate = new Date(event.start_time);
      const dateKey = eventDate.toDateString();
      
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(event);
    });
    
    return map;
  };

  const calendarDays = generateCalendarDays();
  const eventsByDate = createEventsMap();

  // Helper functions
  const getEventsForDay = (date: Date): RecurringCalendarEvent[] => {
    const dateKey = date.toDateString();
    return eventsByDate.get(dateKey) || [];
  };

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentDate.getMonth() && date.getFullYear() === currentDate.getFullYear();
  };

  const isToday = (date: Date) => {
    return date.toDateString() === todayDateString;
  };

  return (
    <div className="calendar-grid">
      {/* Day headers */}
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
        <div key={day} className="day-header">{day}</div>
      ))}
      
      {/* Calendar days */}
      {calendarDays.map((date, index) => {
        const dayEvents = getEventsForDay(date);
        const dayClasses = [
          'day-cell',
          !isCurrentMonth(date) && 'other-month',
          isToday(date) && 'today'
        ].filter(Boolean).join(' ');
        
        return (
          <CalendarDay
            key={index}
            date={date}
            events={dayEvents}
            className={dayClasses}
            onEventClick={onEventClick}
          />
        );
      })}
    </div>
  );
};

// Simple CalendarDay component
const CalendarDay = ({ date, events, className, onEventClick }: {
  date: Date;
  events: RecurringCalendarEvent[];
  className: string;
  onEventClick: (event: RecurringCalendarEvent) => void;
}) => {
  return (
    <div className={className}>
      <div className="day-number">{date.getDate()}</div>
      <div className="events-container">
        {events.slice(0, 3).map(event => (
          <div
            key={event.event_id}
            className={`calendar-event ${event.event_id.startsWith('birthday-') ? 'event-birthday' : ''} ${event.is_all_day ? 'event-all-day' : ''} ${event.is_recurring ? 'event-recurring' : ''}`}
            onClick={() => onEventClick(event)}
          >
            {event.title}
          </div>
        ))}
        {events.length > 3 && (
          <div className="more-events">+{events.length - 3} more</div>
        )}
      </div>
    </div>
  );
};

CalendarGrid.displayName = 'CalendarGrid';
CalendarDay.displayName = 'CalendarDay';

export default CalendarGrid; 