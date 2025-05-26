"use strict";
/**
 * Type definitions for recurring calendar events
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DayOfWeek = exports.RecurrencePatternType = void 0;
exports.extractRecurrenceInfo = extractRecurrenceInfo;
exports.createRecurrenceFields = createRecurrenceFields;
exports.formatRecurrenceSummary = formatRecurrenceSummary;
/**
 * Enum for recurrence pattern types
 * Matches the PostgreSQL ENUM type defined in the database
 */
var RecurrencePatternType;
(function (RecurrencePatternType) {
    RecurrencePatternType["DAILY"] = "daily";
    RecurrencePatternType["WEEKLY"] = "weekly";
    RecurrencePatternType["MONTHLY"] = "monthly";
    RecurrencePatternType["YEARLY"] = "yearly";
    RecurrencePatternType["CUSTOM"] = "custom";
})(RecurrencePatternType || (exports.RecurrencePatternType = RecurrencePatternType = {}));
/**
 * Days of the week, using ISO 8601 numbering (1-7, Monday-Sunday)
 */
var DayOfWeek;
(function (DayOfWeek) {
    DayOfWeek[DayOfWeek["MONDAY"] = 1] = "MONDAY";
    DayOfWeek[DayOfWeek["TUESDAY"] = 2] = "TUESDAY";
    DayOfWeek[DayOfWeek["WEDNESDAY"] = 3] = "WEDNESDAY";
    DayOfWeek[DayOfWeek["THURSDAY"] = 4] = "THURSDAY";
    DayOfWeek[DayOfWeek["FRIDAY"] = 5] = "FRIDAY";
    DayOfWeek[DayOfWeek["SATURDAY"] = 6] = "SATURDAY";
    DayOfWeek[DayOfWeek["SUNDAY"] = 7] = "SUNDAY";
})(DayOfWeek || (exports.DayOfWeek = DayOfWeek = {}));
/**
 * Helper function to convert database model to RecurrenceInfo interface
 */
function extractRecurrenceInfo(event) {
    if (!event.is_recurring) {
        return null;
    }
    // Build the recurrence end specification
    let end;
    if (event.recurrence_count) {
        end = { type: 'count', count: event.recurrence_count };
    }
    else if (event.recurrence_end_date) {
        end = { type: 'until', until: event.recurrence_end_date };
    }
    else {
        end = { type: 'never' };
    }
    return {
        isRecurring: true,
        pattern: event.recurrence_pattern || undefined,
        interval: event.recurrence_interval || undefined,
        daysOfWeek: event.recurrence_day_of_week?.map(day => day) || undefined,
        dayOfMonth: event.recurrence_day_of_month || undefined,
        month: event.recurrence_month || undefined,
        end,
        rule: event.recurrence_rule || undefined,
        timezone: event.recurrence_timezone || undefined
    };
}
/**
 * Helper function to convert RecurrenceInfo to database model properties
 */
function createRecurrenceFields(info) {
    const result = {
        is_recurring: info.isRecurring,
    };
    if (!info.isRecurring) {
        return result;
    }
    // Add pattern fields if recurring
    if (info.pattern) {
        result.recurrence_pattern = info.pattern;
    }
    if (info.interval) {
        result.recurrence_interval = info.interval;
    }
    if (info.daysOfWeek && info.daysOfWeek.length > 0) {
        result.recurrence_day_of_week = info.daysOfWeek;
    }
    if (info.dayOfMonth) {
        result.recurrence_day_of_month = info.dayOfMonth;
    }
    if (info.month) {
        result.recurrence_month = info.month;
    }
    // Handle recurrence end
    if (info.end) {
        if (info.end.type === 'count') {
            result.recurrence_count = info.end.count;
        }
        else if (info.end.type === 'until') {
            result.recurrence_end_date = info.end.until;
        }
    }
    if (info.rule) {
        result.recurrence_rule = info.rule;
    }
    if (info.timezone) {
        result.recurrence_timezone = info.timezone;
    }
    return result;
}
/**
 * Generates a human-readable summary of a recurrence pattern
 */
function formatRecurrenceSummary(info) {
    if (!info.isRecurring || !info.pattern) {
        return 'Not recurring';
    }
    const interval = info.interval && info.interval > 1 ? `every ${info.interval} ` : '';
    let base = '';
    switch (info.pattern) {
        case RecurrencePatternType.DAILY:
            base = `${interval}day${info.interval && info.interval > 1 ? 's' : ''}`;
            break;
        case RecurrencePatternType.WEEKLY:
            base = `${interval}week${info.interval && info.interval > 1 ? 's' : ''}`;
            if (info.daysOfWeek && info.daysOfWeek.length > 0) {
                const days = info.daysOfWeek.map(day => {
                    switch (day) {
                        case DayOfWeek.MONDAY: return 'Mon';
                        case DayOfWeek.TUESDAY: return 'Tue';
                        case DayOfWeek.WEDNESDAY: return 'Wed';
                        case DayOfWeek.THURSDAY: return 'Thu';
                        case DayOfWeek.FRIDAY: return 'Fri';
                        case DayOfWeek.SATURDAY: return 'Sat';
                        case DayOfWeek.SUNDAY: return 'Sun';
                        default: return '';
                    }
                }).filter(d => d).join(', ');
                base += ` on ${days}`;
            }
            break;
        case RecurrencePatternType.MONTHLY:
            base = `${interval}month${info.interval && info.interval > 1 ? 's' : ''}`;
            if (info.dayOfMonth) {
                base += ` on day ${info.dayOfMonth}`;
            }
            break;
        case RecurrencePatternType.YEARLY:
            base = `${interval}year${info.interval && info.interval > 1 ? 's' : ''}`;
            if (info.month) {
                const months = [
                    'January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'
                ];
                base += ` in ${months[info.month - 1]}`;
                if (info.dayOfMonth) {
                    base += ` on day ${info.dayOfMonth}`;
                }
            }
            break;
        case RecurrencePatternType.CUSTOM:
            base = 'custom pattern';
            if (info.rule) {
                base += ` (${info.rule})`;
            }
            break;
    }
    // Add ending information
    if (info.end) {
        if (info.end.type === 'count') {
            base += `, ${info.end.count} time${info.end.count > 1 ? 's' : ''}`;
        }
        else if (info.end.type === 'until') {
            // Format the end date more nicely
            const endDate = new Date(info.end.until);
            base += `, until ${endDate.toLocaleDateString()}`;
        }
    }
    return `Repeats ${base}`;
}
//# sourceMappingURL=recurrence.js.map