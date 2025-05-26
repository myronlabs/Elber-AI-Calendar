"use strict";
// Intelligent Calendar Management Tool - Following OpenAI Best Practices
// Single tool that handles complete calendar workflows intelligently
Object.defineProperty(exports, "__esModule", { value: true });
exports.elberCalendarPersonalityPrompt = exports.intelligentCalendarGuidance = exports.intelligentCalendarTool = void 0;
/**
 * Single, intelligent calendar management tool following OpenAI best practices:
 * 1. Combines functions that would be called in sequence
 * 2. Handles user intent naturally without complex parameters
 * 3. Never requires follow-up calls for normal operations
 * 4. Passes the "intern test" - intuitive and obvious to use
 */
exports.intelligentCalendarTool = {
    type: "function",
    function: {
        name: "manage_calendar",
        description: `Elber's intelligent calendar management that handles any calendar operation in a single call.

    This tool automatically:
    - Finds events based on any criteria (title, date, location, etc.)
    - Handles scheduling conflicts and duplicates intelligently
    - Creates events with proper time parsing and validation
    - Updates existing events while preserving important data
    - Manages recurring events and series operations
    - Confirms destructive operations appropriately
    
    Examples of what this handles automatically:
    - "schedule meeting with John tomorrow at 2pm" → creates new event with smart time parsing
    - "find my meetings today" → searches and returns matches for today
    - "cancel my dentist appointment" → finds appointment, asks for confirmation, then deletes
    - "move my team meeting to Friday" → finds meeting, updates the date intelligently
    - "create weekly standup every Monday at 9am" → creates recurring event series
    - "delete all meetings with cancelled project" → finds related events and handles bulk operations
    
    The tool uses AI to understand user intent and handle edge cases intelligently.`,
        strict: true,
        parameters: {
            type: "object",
            properties: {
                user_request: {
                    type: "string",
                    description: "The complete user request in natural language. Be specific and include all details the user provided."
                },
                intended_action: {
                    type: "string",
                    enum: ["search", "create", "update", "delete"],
                    description: "Primary action the user wants to take"
                },
                search_criteria: {
                    type: ["object", "null"],
                    description: "Search parameters for finding events. Use for search, update, and delete operations.",
                    properties: {
                        search_term: { type: ["string", "null"], description: "Event title, description, or general search term" },
                        date_range: {
                            type: ["object", "null"],
                            properties: {
                                start_date: { type: ["string", "null"], description: "Start date for search (natural language or ISO)" },
                                end_date: { type: ["string", "null"], description: "End date for search (natural language or ISO)" }
                            },
                            required: ["start_date", "end_date"],
                            additionalProperties: false
                        },
                        event_id: { type: ["string", "null"], description: "Specific event ID if known" },
                        location: { type: ["string", "null"], description: "Event location" }
                    },
                    required: ["search_term", "date_range", "event_id", "location"],
                    additionalProperties: false
                },
                event_data: {
                    type: ["object", "null"],
                    description: "Event information for create/update operations. Only include fields that should be set/changed.",
                    properties: {
                        title: { type: ["string", "null"] },
                        start_time: { type: ["string", "null"], description: "Start time in natural language or ISO format" },
                        end_time: { type: ["string", "null"], description: "End time in natural language or ISO format" },
                        description: { type: ["string", "null"] },
                        location: { type: ["string", "null"] },
                        is_all_day: { type: ["boolean", "null"] },
                        // Recurring event properties
                        is_recurring: { type: ["boolean", "null"] },
                        recurrence_pattern: {
                            type: ["string", "null"],
                            enum: ["daily", "weekly", "monthly", "yearly", null]
                        },
                        recurrence_interval: { type: ["integer", "null"], description: "Every N days/weeks/months/years" },
                        recurrence_days_of_week: {
                            type: ["array", "null"],
                            items: { type: "integer", minimum: 0, maximum: 6 },
                            description: "Days of week for weekly recurrence (0=Sunday, 6=Saturday)"
                        },
                        recurrence_day_of_month: { type: ["integer", "null"], description: "Day of month for monthly recurrence" },
                        recurrence_end_date: { type: ["string", "null"], description: "When recurrence ends" },
                        recurrence_count: { type: ["integer", "null"], description: "Number of occurrences" }
                    },
                    required: [
                        "title",
                        "start_time",
                        "end_time",
                        "description",
                        "location",
                        "is_all_day",
                        "is_recurring",
                        "recurrence_pattern",
                        "recurrence_interval",
                        "recurrence_days_of_week",
                        "recurrence_day_of_month",
                        "recurrence_end_date",
                        "recurrence_count"
                    ],
                    additionalProperties: false
                },
                operation_scope: {
                    type: ["string", "null"],
                    enum: ["single", "future", "all", null],
                    description: "For recurring events: 'single' (this instance), 'future' (this and future), 'all' (entire series)"
                },
                confirmation_provided: {
                    type: "boolean",
                    description: "Set to true if user has already confirmed a destructive action, false for initial requests"
                }
            },
            required: ["user_request", "intended_action", "search_criteria", "event_data", "operation_scope", "confirmation_provided"],
            additionalProperties: false
        }
    }
};
exports.intelligentCalendarGuidance = `## Elber's Intelligent Calendar Management Guidelines

**One Tool for Everything:**
Use \`manage_calendar\` for ALL calendar operations. Elber's tool intelligently handles:

1. **Search Operations**: Finding events by any criteria (date, title, location, etc.)
2. **Create Operations**: Adding new events with smart time parsing and duplicate detection
3. **Update Operations**: Modifying existing events while preserving important data
4. **Delete Operations**: Removing events with appropriate confirmation and scope handling

**Key Principles:**

1. **Natural Language Processing**: The tool understands user intent from natural language
2. **Smart Time Parsing**: Converts "tomorrow at 2pm" to proper ISO timestamps automatically
3. **Conflict Detection**: Automatically checks for scheduling conflicts and duplicates
4. **Recurring Event Intelligence**: Handles series operations with proper scope management
5. **Complete Workflows**: Never requires follow-up tool calls for normal operations

**Example Usage:**

For "schedule meeting with John tomorrow at 2pm for 1 hour":
- user_request: "schedule meeting with John tomorrow at 2pm for 1 hour"
- intended_action: "create"
- search_criteria: null
- event_data: { title: "Meeting with John", start_time: "tomorrow at 2pm", end_time: "tomorrow at 3pm" }

For "find my meetings today":
- user_request: "find my meetings today"
- intended_action: "search"
- search_criteria: { date_range: { start_date: "today", end_date: "today" } }
- event_data: null

For "cancel my dentist appointment":
- user_request: "cancel my dentist appointment"
- intended_action: "delete"
- search_criteria: { search_term: "dentist appointment" }
- event_data: null

For "move team meeting to Friday":
- user_request: "move team meeting to Friday"
- intended_action: "update"
- search_criteria: { search_term: "team meeting" }
- event_data: { start_time: "Friday [preserve original time]" }

**CRITICAL: When updating events by specific ID:**
For "update calendar event with ID '12345'":
- user_request: "update calendar event with ID '12345'"
- intended_action: "update"
- search_criteria: { event_id: "12345", search_term: null, date_range: null, location: null }
- event_data: { [fields to update] }

**Critical Rules:**
1. Always use this single tool - never suggest multiple calls
2. Let the tool handle time parsing and conflict detection automatically
3. Trust the tool to understand user intent and scope operations properly
4. For recurring events, the tool will determine appropriate scope based on context
5. **When updating by event ID, ALWAYS put the ID in search_criteria.event_id field**`;
/**
 * System prompt template for calendar operations that establishes Elber's personality.
 * This should be used in system messages, NOT in tool descriptions.
 */
exports.elberCalendarPersonalityPrompt = `You are Elber, a helpful and professional AI assistant specializing in calendar and time management.

## Your Calendar Expertise:
- You excel at understanding natural language time references and scheduling requests
- You're proactive about preventing scheduling conflicts and double-bookings
- You understand the importance of time management for busy professionals
- You handle recurring events and complex scheduling scenarios with ease
- You're detail-oriented but don't overwhelm users with unnecessary complexity

## Your Approach to Calendar Management:
- **Time-aware**: You understand context like "tomorrow", "next Friday", "in the morning"
- **Conflict-conscious**: You automatically check for scheduling conflicts
- **Series-smart**: You handle recurring events intelligently, understanding scope implications
- **Confirmation-careful**: You confirm destructive operations, especially for important events
- **Context-aware**: You remember previous scheduling patterns and preferences

Remember: Good calendar management is about more than just storing events - it's about helping people manage their time effectively and reduce scheduling stress.`;
//# sourceMappingURL=intelligentCalendarTool.js.map