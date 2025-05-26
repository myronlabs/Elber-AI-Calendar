"use strict";
/**
 * Fast Calendar Formatter
 * Provides immediate formatted responses without waiting for AI
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FastCalendarFormatter = void 0;
const date_fns_1 = require("date-fns");
class FastCalendarFormatter {
    constructor(timeZone) {
        this.defaultTimeZone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    /**
     * Formats a list of calendar events for display
     * @param events Array of calendar events
     * @param timeZone Optional time zone for formatting dates
     * @returns Formatted string with event details
     */
    static formatEventsForDisplay(events, _timeZone) {
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
            const startDate = (0, date_fns_1.parseISO)(event.start_time);
            const endDate = (0, date_fns_1.parseISO)(event.end_time);
            if (!(0, date_fns_1.isValid)(startDate) || !(0, date_fns_1.isValid)(endDate)) {
                formattedEvents += `Event ${index + 1}: ${event.title} (invalid date format)\n`;
                return;
            }
            const dateStr = (0, date_fns_1.format)(startDate, 'EEEE, MMMM d, yyyy');
            let timeStr;
            if (event.is_all_day) {
                timeStr = 'All day';
            }
            else {
                const startTimeStr = (0, date_fns_1.format)(startDate, 'h:mm a');
                const endTimeStr = (0, date_fns_1.format)(endDate, 'h:mm a');
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
                }
                else {
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
    static formatEventsSummary(events, summaryThreshold = 10) {
        if (!events || events.length === 0) {
            return "I couldn't find any events matching your criteria.";
        }
        const eventCount = events.length;
        // Sort events by start time
        const sortedEvents = [...events].sort((a, b) => {
            return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
        });
        // Get date ranges
        const firstEventDate = (0, date_fns_1.parseISO)(sortedEvents[0].start_time);
        const lastEventDate = (0, date_fns_1.parseISO)(sortedEvents[eventCount - 1].start_time);
        const dateRangeStr = firstEventDate.toDateString() === lastEventDate.toDateString()
            ? (0, date_fns_1.format)(firstEventDate, 'MMMM d, yyyy')
            : `${(0, date_fns_1.format)(firstEventDate, 'MMMM d, yyyy')} to ${(0, date_fns_1.format)(lastEventDate, 'MMMM d, yyyy')}`;
        let summary = `I found ${eventCount} events from ${dateRangeStr}. Here are the first ${Math.min(summaryThreshold, eventCount)}:\n\n`;
        // Show details for the first few events
        for (let i = 0; i < Math.min(summaryThreshold, eventCount); i++) {
            const event = sortedEvents[i];
            const startDate = (0, date_fns_1.parseISO)(event.start_time);
            if (!(0, date_fns_1.isValid)(startDate)) {
                summary += `- ${event.title} (invalid date format)\n`;
                continue;
            }
            const dateStr = (0, date_fns_1.format)(startDate, 'EEE, MMM d');
            const timeStr = event.is_all_day
                ? 'All day'
                : (0, date_fns_1.format)(startDate, 'h:mm a');
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
exports.FastCalendarFormatter = FastCalendarFormatter;
//# sourceMappingURL=fastCalendarFormatter.js.map