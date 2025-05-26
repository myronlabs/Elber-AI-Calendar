/**
 * Fast Calendar Formatter
 * Provides immediate formatted responses without waiting for AI
 */

import { format, parseISO, isValid } from 'date-fns';

// Interface for calendar events - must match our database schema 
// and what's returned from the calendar API
interface CalendarEvent {
  event_id: string;
  user_id: string;
  title: string;
  start_time: string; // ISO 8601 format
  end_time: string; // ISO 8601 format
  description?: string | null;
  location?: string | null;
  is_all_day?: boolean;
  created_at: string;
  updated_at: string;
  
  // Recurring event fields
  is_recurring?: boolean;
  recurrence_pattern?: string | null;
  recurrence_interval?: number | null;
  recurrence_day_of_week?: number[] | null;
  recurrence_day_of_month?: number | null;
  recurrence_month?: number | null;
  recurrence_end_date?: string | null;
  recurrence_count?: number | null;
  recurrence_rule?: string | null;
  series_id?: string | null;
  [key: string]: unknown; // Allow other fields
}

export class FastCalendarFormatter {
  private defaultTimeZone: string;
  
  constructor(timeZone?: string) {
    this.defaultTimeZone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  
  /**
   * Formats a list of calendar events for display
   * @param events Array of calendar events
   * @param timeZone Optional time zone for formatting dates
   * @returns Formatted string with event details
   */
  public static formatEventsForDisplay(events: CalendarEvent[], _timeZone?: string): string {
    if (!events || events.length === 0) {
      return "I couldn't find any events matching your criteria.";
    }
    
    // timeZone is available for future use
    const eventCount = events.length;
    
    // Sort events by start time
    const sortedEvents = [...events].sort((a, b) => {
      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    });
    
    let formattedEvents = `Here are your ${eventCount} event${eventCount === 1 ? '' : 's'}:\n\n`;
    
    sortedEvents.forEach((event, index) => {
      const startDate = parseISO(event.start_time);
      const endDate = parseISO(event.end_time);
      
      if (!isValid(startDate) || !isValid(endDate)) {
        formattedEvents += `Event ${index + 1}: ${event.title} (invalid date format)\n`;
        return;
      }
      
      const dateStr = format(startDate, 'EEEE, MMMM d, yyyy');
      let timeStr;
      
      if (event.is_all_day) {
        timeStr = 'All day';
      } else {
        const startTimeStr = format(startDate, 'h:mm a');
        const endTimeStr = format(endDate, 'h:mm a');
        timeStr = `${startTimeStr} - ${endTimeStr}`;
      }
      
      formattedEvents += `**${event.title}**\n`;
      formattedEvents += `📅 ${dateStr}\n`;
      formattedEvents += `⏰ ${timeStr}\n`;
      
      if (event.location) {
        formattedEvents += `📍 ${event.location}\n`;
      }
      
      if (event.description) {
        formattedEvents += `📝 ${event.description}\n`;
      }
      
      if (event.is_recurring) {
        let recurrenceInfo = '🔄 Recurring: ';
        if (event.recurrence_pattern) {
          recurrenceInfo += event.recurrence_pattern.charAt(0).toUpperCase() + event.recurrence_pattern.slice(1);
          if (event.recurrence_interval && event.recurrence_interval > 1) {
            recurrenceInfo += ` (every ${event.recurrence_interval} ${event.recurrence_pattern}s)`;
          }
        } else {
          recurrenceInfo += 'Yes';
        }
        formattedEvents += `${recurrenceInfo}\n`;
      }
      
      // Add a separator between events
      if (index < sortedEvents.length - 1) {
        formattedEvents += '\n---\n\n';
      }
    });
    
    return formattedEvents;
  }
  
  /**
   * Formats a summary of calendar events when there are too many to show in detail
   * @param events Array of calendar events
   * @param summaryThreshold Number of events to summarize (default 10)
   * @returns Formatted summary string
   */
  public static formatEventsSummary(events: CalendarEvent[], summaryThreshold: number = 10): string {
    if (!events || events.length === 0) {
      return "I couldn't find any events matching your criteria.";
    }
    
    const eventCount = events.length;
    
    // Sort events by start time
    const sortedEvents = [...events].sort((a, b) => {
      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    });
    
    // Get date ranges
    const firstEventDate = parseISO(sortedEvents[0].start_time);
    const lastEventDate = parseISO(sortedEvents[eventCount - 1].start_time);
    
    const dateRangeStr = firstEventDate.toDateString() === lastEventDate.toDateString()
      ? format(firstEventDate, 'MMMM d, yyyy')
      : `${format(firstEventDate, 'MMMM d, yyyy')} to ${format(lastEventDate, 'MMMM d, yyyy')}`;
    
    let summary = `I found ${eventCount} events from ${dateRangeStr}. Here are the first ${Math.min(summaryThreshold, eventCount)}:\n\n`;
    
    // Show details for the first few events
    for (let i = 0; i < Math.min(summaryThreshold, eventCount); i++) {
      const event = sortedEvents[i];
      const startDate = parseISO(event.start_time);
      
      if (!isValid(startDate)) {
        summary += `- ${event.title} (invalid date format)\n`;
        continue;
      }
      
      const dateStr = format(startDate, 'EEE, MMM d');
      const timeStr = event.is_all_day 
        ? 'All day' 
        : format(startDate, 'h:mm a');
      
      summary += `- **${event.title}** · ${dateStr} · ${timeStr}\n`;
    }
    
    // Add a note about remaining events
    if (eventCount > summaryThreshold) {
      const remainingCount = eventCount - summaryThreshold;
      summary += `\n...and ${remainingCount} more event${remainingCount === 1 ? '' : 's'}. Would you like to see more specific details about any of these events?`;
    }
    
    return summary;
  }
} 