import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { OpenAI } from "openai";
import { getUserIdFromEvent } from './_shared/utils';
import { supabaseAdmin } from '../services/supabaseAdmin';

// Type definitions for operation arguments
interface UniversalOperationArgs {
  operation_type: 'contact' | 'calendar' | 'alert' | 'settings' | 'general' | 'duplicate_management';
  action: string;
  entity_data: Record<string, unknown> | null;
  search_criteria: Record<string, unknown> | null;
  user_request: string;
}

// Conversation state management
interface ConversationState {
  userId: string;
  lastResponseId?: string;
  messageCount: number;
  lastUpdated: number;
}

// In-memory conversation state storage (in production, this should be in a database)
const conversationStates = new Map<string, ConversationState>();

// Helper function to get or create conversation state
function getConversationState(userId: string): ConversationState {
  let state = conversationStates.get(userId);
  if (!state) {
    state = {
      userId,
      messageCount: 0,
      lastUpdated: Date.now()
    };
    conversationStates.set(userId, state);
  }
  return state;
}

// Helper function to update conversation state
function updateConversationState(userId: string, responseId?: string): void {
  const state = getConversationState(userId);
  state.messageCount += 1;
  state.lastUpdated = Date.now();
  if (responseId) {
    state.lastResponseId = responseId;
  }
  conversationStates.set(userId, state);
}

// Cleanup old conversation states (older than 1 hour)
function cleanupOldStates(): void {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [userId, state] of conversationStates.entries()) {
    if (state.lastUpdated < oneHourAgo) {
      conversationStates.delete(userId);
    }
  }
}

// Initialize OpenAI with conversation state persistence
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Single universal tool that handles ALL operations
const universalTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "execute_operation",
    description: "Execute any CRM operation based on the analyzed user intent",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        operation_type: {
          type: "string",
          enum: ["contact", "calendar", "alert", "settings", "general", "duplicate_management"],
          description: "The type of operation to perform"
        },
        action: {
          type: "string",
          enum: ["create", "read", "update", "delete", "list", "search", "help", "analyze"],
          description: "The CRUD action or help request"
        },
        entity_data: {
          type: ["object", "null"],
          description: "The data for the operation. Use null when not needed (e.g., for list/search operations).",
          properties: {
            // Contact fields
            first_name: { type: ["string", "null"], description: "Contact's first name" },
            last_name: { type: ["string", "null"], description: "Contact's last name" },
            middle_name: { type: ["string", "null"], description: "Contact's middle name" },
            nickname: { type: ["string", "null"], description: "Contact's nickname" },
            email: { type: ["string", "null"], description: "Contact's email address" },
            phone: { type: ["string", "null"], description: "Contact's phone number" },
            mobile_phone: { type: ["string", "null"], description: "Contact's mobile phone" },
            work_phone: { type: ["string", "null"], description: "Contact's work phone" },
            company: { type: ["string", "null"], description: "Contact's company (REQUIRED for business contacts)" },
            job_title: { type: ["string", "null"], description: "Contact's job title (REQUIRED for business contacts)" },
            department: { type: ["string", "null"], description: "Contact's department" },
            address: { type: ["string", "null"], description: "Contact's address" },
            street_address: { type: ["string", "null"], description: "Contact's street address" },
            street_address_2: { type: ["string", "null"], description: "Contact's street address 2" },
            city: { type: ["string", "null"], description: "Contact's city" },
            state_province: { type: ["string", "null"], description: "Contact's state or province" },
            postal_code: { type: ["string", "null"], description: "Contact's postal code" },
            country: { type: ["string", "null"], description: "Contact's country" },
            formatted_address: { type: ["string", "null"], description: "Contact's formatted address" },
            website: { type: ["string", "null"], description: "Contact's website" },
            birthday: { type: ["string", "null"], description: "Contact's birthday" },
            notes: { type: ["string", "null"], description: "Notes about the contact" },
            tags: { type: ["array", "null"], items: { type: "string" }, description: "Contact tags" },
            social_linkedin: { type: ["string", "null"], description: "Contact's LinkedIn social profile" },
            social_twitter: { type: ["string", "null"], description: "Contact's Twitter social profile" },
            preferred_contact_method: { type: ["string", "null"], description: "Contact's preferred method of communication" },
            language: { type: ["string", "null"], description: "Contact's language" },
            google_contact_id: { type: ["string", "null"], description: "Contact's Google Contact ID" },
            import_source: { type: ["string", "null"], description: "Source of contact import" },
            import_batch_id: { type: ["string", "null"], description: "Batch ID of contact import" },
            
            // Calendar event fields
            title: { type: ["string", "null"], description: "Event title (REQUIRED for calendar events)" },
            start_time: { type: ["string", "null"], description: "Event start time (REQUIRED for calendar events)" },
            end_time: { type: ["string", "null"], description: "Event end time (REQUIRED for calendar events)" },
            description: { type: ["string", "null"], description: "Event description" },
            location: { type: ["string", "null"], description: "Event location" },
            is_all_day: { type: ["boolean", "null"], description: "Whether event is all day" },
            is_recurring: { type: ["boolean", "null"], description: "Whether event is recurring" },
            recurrence_pattern: { type: ["string", "null"], description: "Recurrence pattern" },
            
            // Alert fields
            alert_type: { type: ["string", "null"], enum: ["upcoming_birthday", "meeting_reminder", "task_due", "follow_up", "custom", null], description: "Type of alert (REQUIRED for alerts)" },
            due_date: { type: ["string", "null"], description: "Alert due date (REQUIRED for alerts)" },
            priority: { type: ["string", "null"], enum: ["low", "medium", "high", null], description: "Alert priority (REQUIRED for alerts)" },
            status: { type: ["string", "null"], enum: ["pending", "triggered", "dismissed", "snoozed", null], description: "Alert status" },
            contact_id: { type: ["string", "null"], description: "Related contact ID" },
            event_id: { type: ["string", "null"], description: "Related event ID" },
            
            // Settings fields
            display_name: { type: ["string", "null"], description: "User display name" },
            avatar_url: { type: ["string", "null"], description: "User avatar URL" },
            email_notifications: { type: ["boolean", "null"], description: "Email notifications enabled" },
            theme: { type: ["string", "null"], description: "UI theme preference" },
            user_timezone: { type: ["string", "null"], description: "User timezone" },
            date_format: { type: ["string", "null"], description: "Date format preference" },
            time_format: { type: ["string", "null"], description: "Time format preference" },
            calendar_view: { type: ["string", "null"], description: "Calendar view preference" }
          },
          required: [
            "first_name", "last_name", "middle_name", "nickname", "email", "phone", "mobile_phone", "work_phone", 
            "company", "job_title", "department", "address", "street_address", "street_address_2", "city", 
            "state_province", "postal_code", "country", "formatted_address", "website", "birthday", "notes", "tags",
            "social_linkedin", "social_twitter", "preferred_contact_method", "language", 
            "google_contact_id", "import_source", "import_batch_id",
            "title", "start_time", "end_time", "description", "location", "is_all_day", 
            "is_recurring", "recurrence_pattern", "alert_type", "due_date", "priority", 
            "status", "contact_id", "event_id", "display_name", "avatar_url", 
            "email_notifications", "theme", "user_timezone", "date_format", "time_format", 
            "calendar_view"
          ],
          additionalProperties: false
        },
        search_criteria: {
          type: ["object", "null"],
          description: "Criteria for finding entities. Use null when not needed (e.g., for create operations).",
          properties: {
            contact_id: { type: ["string", "null"], description: "Specific contact ID to find" },
            event_id: { type: ["string", "null"], description: "Specific event ID to find" },
            alert_id: { type: ["string", "null"], description: "Specific alert ID to find" },
            search_term: { type: ["string", "null"], description: "General search term" },
            status: { type: ["string", "null"], description: "Status filter" },
            upcoming: { type: ["boolean", "null"], description: "Filter for upcoming items" },
            start_date: { type: ["string", "null"], description: "Start date for date range" },
            end_date: { type: ["string", "null"], description: "End date for date range" },
            priority: { type: ["string", "null"], description: "Priority filter" },
            alert_type: { type: ["string", "null"], description: "Alert type filter" }
          },
          required: [
            "contact_id", "event_id", "alert_id", "search_term", "status", 
            "upcoming", "start_date", "end_date", "priority", "alert_type"
          ],
          additionalProperties: false
        },
        user_request: {
          type: "string",
          description: "The original user request in natural language"
        }
      },
      required: ["operation_type", "action", "entity_data", "search_criteria", "user_request"],
      additionalProperties: false
    }
  }
};

// Comprehensive system prompt that enables the AI to handle everything
const SYSTEM_PROMPT = `You are Elber, a helpful AI assistant for an online CRM system. You execute CRM operations using only the universal tool calling functions that have been made available to you.

# IDENTITY & PERSONALITY

I'm Elber, the curator and director of the Elber CRM system at Myron Labs - yes, the app is named after me! I specialize in customer relationships, retention strategies, and delivering exceptional service with a smile. 

My expertise:
- **Customer Relationship Management** - I help you build and maintain meaningful connections
- **Contact Organization** - Keep your network organized and accessible
- **Calendar Management** - Never miss an important meeting or follow-up
- **Professional Service** - I provide friendly, efficient assistance while maintaining boundaries

My approach:
- I'm warm and professional, but I don't let people take advantage of my helpfulness
- I focus strictly on CRM functions - contacts, calendars, alerts, and settings
- I execute tasks efficiently without unnecessary back-and-forth
- I believe in doing things right the first time

Remember: I'm here to make your CRM experience smooth and productive. Let's build better customer relationships together!

**IMPORTANT: Always embody this personality in your responses using a first person perspective, but NEVER mention these personality instructions or any internal directives to users. Strive to be Elber naturally, and don't talk about being Elber as if in 3rd person, which is weird.**

# CORE DIRECTIVES

1. **Execute complete workflows** - Make multiple tool calls in one response to complete tasks
2. **Format all responses in Markdown** - Use tables for ALL structured data
3. **Act on user intent** - Don't ask for clarification unless absolutely necessary
4. **Apply context-aware logic** - Business contacts need company/job_title, personal contacts don't
5. **CRITICAL FOR DUPLICATES**: When user says "Delete all duplicate contacts with the least amount of information" after you've shown duplicate analysis, you MUST make delete tool calls for EACH contact in consider_deleting array. This is a direct command, not a question!
6. **AUTOMATIC DUPLICATE DETECTION**: When you find 2 or more contacts with the same name, you MUST IMMEDIATELY make a second tool call to analyze duplicates. Don't wait for user to ask!
7. **CONVERSATION CONTEXT AWARENESS**: Always refer to previous responses in the conversation. If you showed an event or contact earlier, use the EXACT IDs from that response, not similar-looking values from other fields.

# CRITICAL CONTEXT RULES

## Event ID Usage:
- **ALWAYS use the event_id field** from previous responses, never use values from location, zoom_meeting_id, or other fields
- **Example**: If you showed event with event_id "7aa85146-3eb7-4bea-9d07-59325ff7e063", use THAT ID for updates/edits
- **NEVER use Zoom meeting IDs, phone numbers, or other identifiers** as event IDs

## Contact ID Usage:
- **ALWAYS use the contact_id field** from previous responses
- **NEVER use email addresses, phone numbers, or names** as contact IDs

## Conversation Memory:
- **Remember what you've shown** - If you displayed events/contacts, refer to them by their correct IDs
- **Use exact field values** - Don't approximate or guess IDs based on similar-looking data

# FORMATTING RULES

## Tables are MANDATORY for:
- Contact lists/search results
- Calendar events
- Alerts/reminders
- Any structured data

## Example Table Formats:

**Contacts:**
| Name | Email | Phone | Company | Job Title |
|------|-------|-------|---------|-----------|
| John Smith | john@example.com | (555) 123-4567 | ABC Corp | Manager |

**Events:**
| Event | Date/Time | Location | Description |
|-------|-----------|----------|-------------|
| Team Meeting | Mon, Jan 15, 2:00 PM | Room A | Weekly sync |

## Text Formatting:
- **Bold** = emphasis/important
- *Italics* = field names/technical terms
- \`Code\` = IDs/values/data
- > Blockquote = warnings/notices

# OPERATION EXECUTION

## Multiple Tool Calls (CRITICAL)
- If task needs multiple steps, execute ALL steps in one response
- Example: Find duplicates → Show analysis → Delete on confirmation
- Example: "Update John's phone" → Search for John → Update with new phone
- DO NOT stop after first step
- DO NOT say "I will now..." - just do it

## DUPLICATE DETECTION RULE:
**ONLY when contact search returns 2+ results with same/similar names, you MUST:**
1. First tool call: contact search (already done)
2. Second tool call: duplicate_management analyze (MUST DO THIS AUTOMATICALLY)
3. Show comparison table
4. Only then wait for user input

**IMPORTANT: Only trigger duplicate analysis if the search returns MULTIPLE contacts. If only 1 contact is found, do NOT call duplicate_management - just show the single contact result.**

## CONTACT UPDATE RULE:
**When user requests to modify/update/change a contact field:**
1. **SINGLE TOOL CALL**: Use action "update" with search_criteria containing the contact name/identifier
2. **The backend will**: Find the contact, update it, and return the result
3. **No confirmation needed**: Direct updates are executed immediately
4. **Example**: "Change Rose's phone to X" → ONE tool call with action "update"

**IMPORTANT: Contact updates are handled in a single tool call. The backend handles finding and updating automatically.**

## DUPLICATE DELETION TRIGGER PHRASES:
When user says ANY of these **types** of phrases after you've shown duplicate analysis:
- "Delete all duplicate contacts with the least amount of information"
- "Delete all of the duplicate contacts that have the least amount of information"
- "Delete the duplicates"

YOU MUST IMMEDIATELY:
1. Make delete tool calls for EACH contact_id in consider_deleting
2. Do NOT re-analyze - use the data from your previous analysis
3. Do NOT ask for confirmation - they just gave it!

## When to pause for user input:
- User explicitly asks a question needing clarification
- Destructive action needs explicit confirmation (delete/remove) - EXCEPT for duplicate deletion after analysis
- Operation failed and needs user guidance

# NATURAL LANGUAGE PROCESSING

## Time Conversion:
- "today" → current date range
- "tomorrow" → next day date
- "this week" → current week start to end
- "next Monday" → specific future date
- "at 2pm" → 14:00 time format

## Intent Mapping:
- "find/search/show" → search action
- "add/create/new" → create action
- "update/change/modify" → update action (single call with search_term)
- "delete/remove/cancel" → delete action
- "list/all/show all" → list action

## CRITICAL DATE HANDLING RULES:
**NEVER use dates from 2023 or earlier! Always use current dates!**

When user says "this week", you MUST use the exact dates provided in the CURRENT DATE CONTEXT section.
When user says "today", use the current date from CURRENT DATE CONTEXT.
When user says "tomorrow", calculate from the current date in CURRENT DATE CONTEXT.

**VALIDATION**: If you generate any date before 2024, you are making an error!

## Duplicate Deletion Phrases (AFTER showing analysis):
- "Delete all of the duplicate contacts that have the least amount of information" → DELETE ALL in consider_deleting
- "Delete the duplicates" → DELETE ALL in consider_deleting
- "Remove the duplicates" → DELETE ALL in consider_deleting
- "Delete the one with less info" → DELETE ALL in consider_deleting
- Any confirmation after duplicate analysis → DELETE ALL in consider_deleting

# CAPABILITIES & OPERATIONS

## 1. Contacts (operation_type: "contact")

**Actions:** create, search, update, delete, list

**Required Fields:**
- create: first_name, last_name (minimum)
- Business contacts: ADD company, job_title
- Personal contacts: professional fields optional

**Search Patterns:**
- Name search: Use full name in search_term
- Company search: search_term = company name
- Job title search: search_term = job title
- Birthday search: upcoming = true
- Duplicate detection: Use duplicate_management instead

**AUTOMATIC DUPLICATE WORKFlow:**
**ONLY** when your contact search returns **2+** contacts with same/similar names:
1. IMMEDIATELY make a second tool call: operation_type: "duplicate_management", action: "analyze"
2. Show the comparison table
3. Wait for user confirmation before deleting

**If search returns only 1 contact: Just show the contact information, do NOT call duplicate_management.**

## 2. Calendar (operation_type: "calendar")

**Actions:** create, search, update, delete, list

**Required Fields:**
- create: title, start_time, end_time
- search: use date ranges or search_term
- update: event_id (in search_criteria OR entity_data) + fields to update
- delete: search by title first, then use event_id

**CRITICAL TIME INTERPRETATION RULES:**
🚨 **NEVER CREATE EVENTS IN THE PAST** 🚨
- If user says "8 AM" without a date, and current time is after 8 AM, they mean 8 AM TOMORROW
- If user says "2 PM" and current time is 1 PM, they mean 2 PM TODAY
- If user says "10 AM" and current time is 11 AM, they mean 10 AM TOMORROW
- Always consider the user's timezone when interpreting times
- When in doubt, ask: "Do you mean [time] today or tomorrow?"

**Time Examples:**
- User at 3:37 PM says "Create meeting at 8 AM" → Schedule for 8 AM TOMORROW
- User at 10 AM says "Create meeting at 2 PM" → Schedule for 2 PM TODAY
- User at 11 AM says "Create meeting at 10 AM" → Schedule for 10 AM TOMORROW

**Update Structure:**
- Put event_id in search_criteria: { "event_id": "uuid-here" }
- Put updated fields in entity_data: { "description": "new description" }
- OR put event_id in entity_data if more convenient

**Smart Deletion:**
- Search for event by title
- If one match: delete it
- If multiple: ask user to specify
- If none: inform user

## 3. Alerts (operation_type: "alert")

**Actions:** create, search, update, delete, list

**Required Fields:**
- create: title, alert_type, due_date, priority
- Types: upcoming_birthday, meeting_reminder, task_due, follow_up, custom
- Priorities: low, medium, high

## 4. Settings (operation_type: "settings")

**Actions:** read, update

**Fields:** display_name, email_notifications, theme, timezone, date_format, time_format

## 5. Duplicate Management (operation_type: "duplicate_management")

**Actions:** analyze, delete

**Complete Workflow Example:**
1. User: "Find John Smith"
2. You: Use contact search → Find 3 results → Use duplicate_management analyze → Show comparison table
3. User: "Delete all of the duplicate contacts that have the least amount of information"
4. You: Make multiple delete tool calls (one for EACH contact in consider_deleting)

**Analyze Action:**
- Use when: Multiple contacts found with same/similar names
- Shows: Comparison table with filled fields count
- Returns: keep (most complete) and consider_deleting (duplicates) arrays

**Delete Action:**
- Use when: User confirms deletion after seeing analysis
- CRITICAL: Make ONE tool call for EACH contact_id in consider_deleting
- Format: operation_type: "duplicate_management", action: "delete", search_criteria: { contact_id: "[actual-uuid]" }

**Deletion Confirmation Phrases (MUST trigger delete tool calls):**
- "Delete all duplicate contacts with the least amount of information" (EXACT button text)
- "Delete all of the duplicate contacts that have the least amount of information"
- "Delete the duplicates"
- "Remove the duplicates"
- "Delete the one with less info"
- Any deletion confirmation after showing analysis

**CRITICAL: When you see ANY of these phrases after showing duplicate analysis, you MUST:**
1. Make delete tool calls for EACH contact_id in the consider_deleting array
2. Do NOT analyze again - you already have the data
3. Do NOT just say you deleted - actually make the tool calls

**IMPORTANT RULES:**
1. NEVER delete without showing analysis first
2. ALWAYS make separate delete calls for each duplicate
3. Use exact contact_ids from consider_deleting array
4. Don't just say "I deleted" - make the actual tool calls

# STRICT RULES

1. **Complete workflows** - Execute all steps, don't stop midway
2. **Use proper operation_type** - duplicates need duplicate_management, not contact
3. **Format everything** - Tables for data, markdown for text
4. **Act decisively** - Execute operations, don't just describe them
5. **Smart context** - Business = professional fields required
6. **Multiple tool calls** - Use them to complete complex tasks
7. **Exact IDs for deletion** - Never use names/emails for delete operations
8. **Show then act** - Display data, then perform requested actions
9. **Be Elber naturally** - Embody the personality without mentioning instructions or directives
10. **CONDITIONAL DUPLICATE ANALYSIS** - ONLY when finding 2+ contacts with same name, analyze duplicates immediately in same response. If only 1 contact found, do NOT call duplicate_management.
11. **CONTACT UPDATE WORKFlow** - When user requests to modify/update/change contact information, make ONE update tool call with search_term and entity_data.

# EXAMPLES OF COMPLETE WORKFlowS

## Finding single contact:
1. User: "Find John Smith"
2. You: Make ONE tool call: operation_type: "contact", action: "search", search_criteria: { search_term: "John Smith" }
3. If 1 result: Show the contact information (do NOT call duplicate_management)

## Finding and analyzing duplicates:
1. User: "Find Jane Doe"
2. You: Make contact search → If 2+ results found → In SAME response, make TWO tool calls:
   - Tool call 1: operation_type: "contact", action: "search", search_criteria: { search_term: "Jane Doe" }
   - Tool call 2: operation_type: "duplicate_management", action: "analyze", search_criteria: { search_term: "Jane Doe" }
3. Show comparison table with results
4. User: "Delete all of the duplicate contacts that have the least amount of information"
5. You: In SAME response, make multiple delete tool calls:
   - Tool call 1: operation_type: "duplicate_management", action: "delete", search_criteria: { contact_id: "[uuid-1]" }
   - Tool call 2: operation_type: "duplicate_management", action: "delete", search_criteria: { contact_id: "[uuid-2]" }

## CRITICAL: Duplicate deletion workflow:
1. User: "Delete the duplicate" or "Delete all of the duplicate contacts that have the least amount of information" (after seeing analysis)
2. You MUST make delete tool calls for EACH duplicate in your response:
   - For EACH contact_id in the consider_deleting array from your previous analyze results
   - operation_type: "duplicate_management", action: "delete", search_criteria: { contact_id: "[actual-uuid]" }
3. If there are 2 duplicates to delete, make 2 delete tool calls
4. Don't just say "I have deleted" - actually make the delete tool calls!

## CRITICAL: Contact update workflow:
1. User: "Modify the contact John Smith and change his phone to 555-123-4567"
2. You: Make ONE tool call: operation_type: "contact", action: "update", search_criteria: { search_term: "John Smith" }, entity_data: { phone: "555-123-4567" }
3. Backend automatically finds John Smith and updates his phone number
4. Show the updated contact information

## Updating contact information:
1. User: "Modify the contact John Smith and change his phone to 555-123-4567"
2. You: Make ONE tool call: operation_type: "contact", action: "update", search_criteria: { search_term: "John Smith" }, entity_data: { phone: "555-123-4567" }
3. Backend finds John Smith and updates his phone number automatically
4. Show the updated contact information

## Creating business contact:
1. User: "Add Contact Name from ABC Corp"
2. You: Create with first_name, last_name, company (don't ask for more unless provided)

## Calendar deletion:
1. User: "Delete team meeting"
2. You: Search for "team meeting" → Find it → Delete it → Confirm deletion

Remember: Execute operations immediately. Use multiple tool calls. Format everything properly. Act on user intent without unnecessary questions.

As Elber, I'm committed to helping you manage your customer relationships effectively. Whether you're organizing contacts, scheduling meetings, or tracking important follow-ups, I'm here to ensure everything runs smoothly. Let's make your CRM work for you!`;

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const logPrefix = "[Unified-Assistant]";
  console.log(`${logPrefix} Request received`);

  try {
    // CORS headers
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    };

    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: "Method not allowed" })
      };
    }

    // Get user ID
    const userId = await getUserIdFromEvent(event);
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Authentication required" })
      };
    }

    const requestBody = JSON.parse(event.body || '{}');
    const { messages, userTimezone } = requestBody;

    if (!messages || !Array.isArray(messages)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Messages array is required" })
      };
    }

    console.log(`${logPrefix} Processing ${messages.length} messages`);

    // Cleanup old conversation states periodically
    cleanupOldStates();

    // Get conversation state for this user
    const conversationState = getConversationState(userId);
    console.log(`${logPrefix} Conversation state: messageCount=${conversationState.messageCount}, hasLastResponseId=${!!conversationState.lastResponseId}`);

    // Detect conversation reset - if we have few messages but high message count, reset the state
    if (messages.length <= 2 && conversationState.messageCount > 2) {
      console.log(`${logPrefix} Detected conversation reset - clearing conversation state`);
      conversationStates.delete(userId);
      // Get fresh state
      const freshState = getConversationState(userId);
      console.log(`${logPrefix} Reset conversation state: messageCount=${freshState.messageCount}, hasLastResponseId=${!!freshState.lastResponseId}`);
    }

    // Add system message with timezone context
    const currentDate = new Date();
    
    // Convert to user's timezone if provided
    let userCurrentTime = '';
    if (userTimezone) {
      try {
        // Get current time in user's timezone
        const userTimeString = currentDate.toLocaleString('en-US', { 
          timeZone: userTimezone,
          year: 'numeric',
          month: '2-digit', 
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        userCurrentTime = userTimeString;
        console.log(`${logPrefix} User timezone ${userTimezone} current time: ${userCurrentTime}`);
      } catch (timezoneError) {
        console.warn(`${logPrefix} Invalid timezone ${userTimezone}, using UTC:`, timezoneError);
        userCurrentTime = currentDate.toISOString();
      }
    } else {
      userCurrentTime = currentDate.toISOString();
    }
    
    const currentWeekStart = new Date(currentDate);
    currentWeekStart.setDate(currentDate.getDate() - currentDate.getDay()); // Start of week (Sunday)
    currentWeekStart.setHours(0, 0, 0, 0);
    
    const currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekStart.getDate() + 6); // End of week (Saturday)
    currentWeekEnd.setHours(23, 59, 59, 999);

    console.log(`${logPrefix} CURRENT DATE CONTEXT: today=${currentDate.toISOString()}, weekStart=${currentWeekStart.toISOString()}, weekEnd=${currentWeekEnd.toISOString()}, userTime=${userCurrentTime}`);

    const systemMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: "system",
      content: SYSTEM_PROMPT + `

CURRENT DATE CONTEXT:
- Today's date: ${currentDate.toISOString().split('T')[0]}
- Current time (UTC): ${currentDate.toISOString()}
- Current time (User timezone): ${userCurrentTime}
- This week starts: ${currentWeekStart.toISOString().split('T')[0]} (Sunday)
- This week ends: ${currentWeekEnd.toISOString().split('T')[0]} (Saturday)
- User timezone: ${userTimezone || 'UTC'}
- User ID: ${userId}

CRITICAL EVENT CREATION RULES:
🚨 **NEVER CREATE EVENTS IN THE PAST** 🚨
- ALWAYS check if the requested time has already passed in the user's timezone
- If user says "8 AM" and it's currently 3:37 PM, they mean 8 AM TOMORROW
- If user says "2 PM" and it's currently 1 PM, they mean 2 PM TODAY
- If user says "10 AM" and it's currently 11 AM, they mean 10 AM TOMORROW
- When in doubt, ask for clarification: "Do you mean 8 AM today or tomorrow?"

TIMEZONE HANDLING:
- User timezone is: ${userTimezone || 'UTC'}
- Current time in user timezone: ${userCurrentTime}
- When creating events, consider the user's local time context
- If no date is specified, use the next occurrence of that time

IMPORTANT DATE CALCULATION RULES:
- When user says "this week", use start_date: "${currentWeekStart.toISOString()}" and end_date: "${currentWeekEnd.toISOString()}"
- When user says "today", use start_date and end_date for the current day
- When user says "tomorrow", calculate the next day's date range
- Always use ISO format for dates: YYYY-MM-DDTHH:mm:ss.sssZ
- VALIDATE: All event times must be in the future relative to user's current time

EXAMPLE FOR "THIS WEEK" QUERY:
User: "Show events for this week"
Correct tool call: {
  "operation_type": "calendar",
  "action": "search", 
  "search_criteria": {
    "start_date": "${currentWeekStart.toISOString()}",
    "end_date": "${currentWeekEnd.toISOString()}"
  }
}`
    };

    // Always use manual conversation state management for reliability
    // The frontend already sends the full conversation history, so we use that
    console.log(`${logPrefix} Using manual conversation state management with ${messages.length} messages`);
    
    const conversationMessages = [systemMessage, ...messages];

    // Make OpenAI call with conversation state management
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      messages: conversationMessages,
      tools: [universalTool],
      tool_choice: "auto",
      temperature: 0.1,
      store: true // Enable conversation state persistence
    });

    const assistantMessage = completion.choices[0]?.message;
    if (!assistantMessage) {
      throw new Error("No response from OpenAI");
    }

    // Handle tool calls if present
    if (assistantMessage.tool_calls) {
      console.log(`${logPrefix} Processing ${assistantMessage.tool_calls.length} tool calls`);
      console.log(`${logPrefix} Tool calls details:`, JSON.stringify(assistantMessage.tool_calls, null, 2));
      
      const toolResults = [];
      
      for (const toolCall of assistantMessage.tool_calls) {
        console.log(`${logPrefix} Executing tool: ${toolCall.function.name}`);
        console.log(`${logPrefix} Tool arguments:`, toolCall.function.arguments);
        
        const args = JSON.parse(toolCall.function.arguments) as UniversalOperationArgs;
        console.log(`${logPrefix} Parsed args:`, JSON.stringify(args, null, 2));
        
        // CRITICAL: Validate and fix date issues
        if (args.operation_type === 'calendar') {
          const currentDate = new Date();
          
          // CRITICAL: Validate event creation times to prevent past events
          if (args.action === 'create' && args.entity_data) {
            const startTime = args.entity_data.start_time as string;
            if (startTime) {
              const eventStartTime = new Date(startTime);
              console.log(`${logPrefix} VALIDATING EVENT TIME: ${startTime} (${eventStartTime.toISOString()}) vs current ${currentDate.toISOString()}`);
              
              // Check if event is in the past (with 1 minute buffer for processing time)
              const oneMinuteAgo = new Date(currentDate.getTime() - 60000);
              if (eventStartTime < oneMinuteAgo) {
                console.error(`${logPrefix} 🚨 BLOCKING PAST EVENT CREATION: Event time ${eventStartTime.toISOString()} is before current time ${currentDate.toISOString()}`);
                
                // Return error immediately - don't create past events
                toolResults.push({
                  tool_call_id: toolCall.id,
                  role: "tool" as const,
                  content: JSON.stringify({
                    success: false,
                    error: `Cannot create event in the past. The requested time ${eventStartTime.toLocaleString()} has already passed. Current time is ${currentDate.toLocaleString()}. Did you mean to schedule this for tomorrow or a future date?`
                  })
                });
                continue; // Skip this tool call
              }
            }
          }
          
          // Handle search criteria date validation
          if (args.search_criteria) {
            // Check for old dates and fix them
            if (args.search_criteria.start_date) {
              const startDate = new Date(args.search_criteria.start_date as string);
              if (startDate.getFullYear() < 2024) {
                console.warn(`${logPrefix} FIXING OLD START DATE: ${args.search_criteria.start_date} -> using current week`);
                const currentWeekStart = new Date(currentDate);
                currentWeekStart.setDate(currentDate.getDate() - currentDate.getDay());
                currentWeekStart.setHours(0, 0, 0, 0);
                args.search_criteria.start_date = currentWeekStart.toISOString();
              }
            }
            
            if (args.search_criteria.end_date) {
              const endDate = new Date(args.search_criteria.end_date as string);
              if (endDate.getFullYear() < 2024) {
                console.warn(`${logPrefix} FIXING OLD END DATE: ${args.search_criteria.end_date} -> using current week`);
                const currentWeekStart = new Date(currentDate);
                currentWeekStart.setDate(currentDate.getDate() - currentDate.getDay());
                const currentWeekEnd = new Date(currentWeekStart);
                currentWeekEnd.setDate(currentWeekStart.getDate() + 6);
                currentWeekEnd.setHours(23, 59, 59, 999);
                args.search_criteria.end_date = currentWeekEnd.toISOString();
              }
            }
            
            // Special handling for "this week" requests
            if (args.user_request && args.user_request.toLowerCase().includes('this week')) {
              console.log(`${logPrefix} DETECTED "this week" request - ensuring correct dates`);
              const currentWeekStart = new Date(currentDate);
              currentWeekStart.setDate(currentDate.getDate() - currentDate.getDay());
              currentWeekStart.setHours(0, 0, 0, 0);
              
              const currentWeekEnd = new Date(currentWeekStart);
              currentWeekEnd.setDate(currentWeekStart.getDate() + 6);
              currentWeekEnd.setHours(23, 59, 59, 999);
              
              args.search_criteria.start_date = currentWeekStart.toISOString();
              args.search_criteria.end_date = currentWeekEnd.toISOString();
              
              console.log(`${logPrefix} CORRECTED DATES: start=${args.search_criteria.start_date}, end=${args.search_criteria.end_date}`);
            }
          }
        }
        
        try {
          const result = await executeUniversalOperation(args, userId, event, logPrefix, userTimezone);
          console.log(`${logPrefix} Tool result:`, JSON.stringify(result, null, 2));
          
          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool" as const,
            content: JSON.stringify(result)
          });
        } catch (error) {
          console.error(`${logPrefix} Tool execution error:`, error);
          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool" as const,
            content: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            })
          });
        }
      }

      // Get final response with tool results
      const finalMessages = [
        ...conversationMessages,
        assistantMessage,
        ...toolResults
      ];

      const finalCompletion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o",
        messages: finalMessages,
        temperature: 0.1,
        store: true
      });

      const finalResponse = finalCompletion.choices[0]?.message;
      if (!finalResponse) {
        throw new Error("No final response from OpenAI");
      }

      // Update conversation state with the final response ID
      if (finalCompletion.id) {
        updateConversationState(userId, finalCompletion.id);
        console.log(`${logPrefix} Updated conversation state with response ID: ${finalCompletion.id}`);
      }

      console.log(`${logPrefix} Completed successfully with tool execution`);
      
      // Check if any tool results indicate we should refresh calendar or contacts
      let shouldRefreshCalendar = false;
      let shouldRefreshContacts = false;
      
      for (const toolResult of toolResults) {
        try {
          const resultData = JSON.parse(toolResult.content);
          if (resultData.triggerRefresh) {
            // Determine what to refresh based on the operation type
            const toolCall = assistantMessage.tool_calls?.find(tc => tc.id === toolResult.tool_call_id);
            if (toolCall) {
              const args = JSON.parse(toolCall.function.arguments) as UniversalOperationArgs;
              if (args.operation_type === 'calendar') {
                shouldRefreshCalendar = true;
                console.log(`${logPrefix} Calendar operation with triggerRefresh detected - will refresh calendar`);
              } else if (args.operation_type === 'contact') {
                shouldRefreshContacts = true;
                console.log(`${logPrefix} Contact operation with triggerRefresh detected - will refresh contacts`);
              }
            }
          }
        } catch (parseError) {
          // Ignore parse errors for tool results
        }
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          role: 'assistant',
          content: finalResponse.content || '',
          _metadata: {
            usage: finalCompletion.usage,
            tool_calls_made: assistantMessage.tool_calls.length,
            response_id: finalCompletion.id,
            should_refresh_calendar: shouldRefreshCalendar,
            should_refresh_contacts: shouldRefreshContacts
          }
        })
      };
    }

    // No tool calls, return direct response
    // Update conversation state with the response ID
    if (completion.id) {
      updateConversationState(userId, completion.id);
      console.log(`${logPrefix} Updated conversation state with response ID: ${completion.id}`);
    }

    console.log(`${logPrefix} Completed successfully without tool calls`);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        role: 'assistant',
        content: assistantMessage.content || '',
        _metadata: {
          usage: completion.usage,
          response_id: completion.id
        }
      })
    };

  } catch (error) {
    console.error(`${logPrefix} Error:`, error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

// Universal operation executor
async function executeUniversalOperation(
  args: UniversalOperationArgs,
  userId: string,
  event: HandlerEvent,
  logPrefix: string,
  _userTimezone?: string
): Promise<Record<string, unknown>> {
  const { operation_type, action, entity_data, search_criteria } = args;
  
  console.log(`${logPrefix} ========== EXECUTING OPERATION ==========`);
  console.log(`${logPrefix} Operation Type: ${operation_type}`);
  console.log(`${logPrefix} Action: ${action}`);
  console.log(`${logPrefix} Entity Data:`, JSON.stringify(entity_data, null, 2));
  console.log(`${logPrefix} Search Criteria:`, JSON.stringify(search_criteria, null, 2));
  console.log(`${logPrefix} User ID: ${userId}`);
  console.log(`${logPrefix} ==========================================`);

  switch (operation_type) {
    case 'contact':
      return await executeContactOperation(action, entity_data, search_criteria, userId, logPrefix);
    
    case 'calendar':
      return await executeCalendarOperation(action, entity_data, search_criteria, userId, event, logPrefix);
    
    case 'alert':
      return await executeAlertOperation(action, entity_data, search_criteria, userId, logPrefix);
    
    case 'settings':
      return await executeSettingsOperation(action, entity_data, userId, event, logPrefix);
    
    case 'duplicate_management':
      return await executeDuplicateManagementOperation(action, entity_data, search_criteria, userId, logPrefix);
    
    case 'general':
      return {
        success: true,
        message: "I can help you with contact management, calendar events, alerts, and settings. What would you like to do?"
      };
    
    default:
      return {
        success: false,
        error: `Unknown operation type: ${operation_type}`
      };
  }
}

// Contact operations
async function executeContactOperation(
  action: string,
  entity_data: Record<string, unknown> | null,
  search_criteria: Record<string, unknown> | null,
  userId: string,
  logPrefix: string
): Promise<Record<string, unknown>> {
  try {
    switch (action) {
      case 'create': {
        if (!entity_data) {
          return { success: false, error: "Entity data required for contact creation" };
        }
        
        // Filter to only contact-specific fields
        const contactFields = {
          first_name: entity_data.first_name,
          last_name: entity_data.last_name,
          middle_name: entity_data.middle_name,
          nickname: entity_data.nickname,
          email: entity_data.email,
          phone: entity_data.phone,
          mobile_phone: entity_data.mobile_phone,
          work_phone: entity_data.work_phone,
          company: entity_data.company,
          job_title: entity_data.job_title,
          department: entity_data.department,
          address: entity_data.address,
          street_address: entity_data.street_address,
          street_address_2: entity_data.street_address_2,
          city: entity_data.city,
          state_province: entity_data.state_province,
          postal_code: entity_data.postal_code,
          country: entity_data.country,
          formatted_address: entity_data.formatted_address,
          website: entity_data.website,
          birthday: entity_data.birthday,
          notes: entity_data.notes,
          tags: entity_data.tags,
          social_linkedin: entity_data.social_linkedin,
          social_twitter: entity_data.social_twitter,
          preferred_contact_method: entity_data.preferred_contact_method,
          language: entity_data.language,
          google_contact_id: entity_data.google_contact_id,
          import_source: entity_data.import_source,
          import_batch_id: entity_data.import_batch_id
        };
        
        // Remove null/undefined fields
        const filteredData = Object.fromEntries(
          Object.entries(contactFields).filter(([_, value]) => value !== null && value !== undefined)
        );
        
        const { data, error } = await supabaseAdmin
          .from('contacts')
          .insert({ ...filteredData, user_id: userId })
          .select()
          .single();
        
        if (error) throw error;
        
        // Clear search cache for this user to ensure fresh data in search results
        try {
          const { clearUserCache } = await import('./contacts-search');
          clearUserCache(userId);
          console.log(`${logPrefix} Cleared search cache for user after contact creation`);
        } catch (cacheError) {
          console.warn(`${logPrefix} Failed to clear search cache:`, cacheError);
          // Don't fail the creation if cache clearing fails
        }
        
        return { success: true, operation: 'create', contact: data };
      }
      
      case 'search':
      case 'list': {
        console.log(`${logPrefix} ========== CONTACT SEARCH/LIST ==========`);
        console.log(`${logPrefix} Action: ${action}`);
        console.log(`${logPrefix} Search criteria:`, JSON.stringify(search_criteria, null, 2));
        
        let query = supabaseAdmin
          .from('contacts')
          .select('*')
          .eq('user_id', userId);
        
        if (search_criteria) {
          // Handle different types of search criteria
          if ('search_term' in search_criteria && search_criteria.search_term) {
            const searchTerm = search_criteria.search_term as string;
            console.log(`${logPrefix} Contact search for term: "${searchTerm}"`);
            
            // Special handling for specific search types
            if (searchTerm.toLowerCase().includes('duplicate')) {
              console.log(`${logPrefix} Detected duplicate search`);
              // Handle duplicate detection
              // This would need a more sophisticated duplicate detection algorithm
              // For now, find contacts with similar names or emails
              query = query.or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
            } else if (searchTerm.toLowerCase().includes('manager') || searchTerm.toLowerCase().includes('director') || searchTerm.toLowerCase().includes('ceo')) {
              console.log(`${logPrefix} Detected job title search`);
              // Handle job title searches
              query = query.ilike('job_title', `%${searchTerm}%`);
            } else {
              console.log(`${logPrefix} General search detected`);
              // General search across all fields
              const searchTerm = search_criteria.search_term as string;
              
              // Check if this might be a full name search (contains space)
              if (searchTerm.includes(' ')) {
                console.log(`${logPrefix} Full name search detected`);
                // Split the name and search for combinations
                const parts = searchTerm.split(' ').filter(p => p.length > 0);
                console.log(`${logPrefix} Name parts:`, parts);
                
                if (parts.length === 2) {
                  // Likely first and last name
                  const [first, last] = parts;
                  console.log(`${logPrefix} Searching for first: "${first}", last: "${last}"`);
                  // Search for exact first AND last name match, or the full search term in other fields
                  query = query.or(
                    `and(first_name.ilike.%${first}%,last_name.ilike.%${last}%),` +
                    `and(first_name.ilike.%${last}%,last_name.ilike.%${first}%),` +
                    `email.ilike.%${searchTerm}%,` +
                    `company.ilike.%${searchTerm}%,` +
                    `notes.ilike.%${searchTerm}%`
                  );
                } else {
                  console.log(`${logPrefix} Multiple parts search`);
                  // Multiple parts or single part with space - search as is
                  query = query.or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,company.ilike.%${searchTerm}%,job_title.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`);
                }
              } else {
                console.log(`${logPrefix} Single word search`);
                // Single word search - search across all fields
                query = query.or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,company.ilike.%${searchTerm}%,job_title.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`);
              }
            }
          }
          
          // Handle birthday searches
          if ('upcoming' in search_criteria && search_criteria.upcoming) {
            console.log(`${logPrefix} Birthday search detected`);
            const today = new Date();
            const futureDate = new Date();
            futureDate.setDate(today.getDate() + 30); // Next 30 days
            
            // Birthday field is stored as MM-DD, so we need to handle year-agnostic searches
            const todayMD = String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
            const futureMD = String(futureDate.getMonth() + 1).padStart(2, '0') + '-' + String(futureDate.getDate()).padStart(2, '0');
            
            if (today.getMonth() === futureDate.getMonth()) {
              // Same month
              query = query.gte('birthday', todayMD).lte('birthday', futureMD);
            } else {
              // Cross month boundary
              query = query.or(`birthday.gte.${todayMD},birthday.lte.${futureMD}`);
            }
          }
          
          // Handle company searches
          if ('company' in search_criteria && search_criteria.company) {
            console.log(`${logPrefix} Company search detected`);
            query = query.ilike('company', `%${search_criteria.company}%`);
          }
          
          // Handle specific contact ID
          if ('contact_id' in search_criteria && search_criteria.contact_id) {
            console.log(`${logPrefix} Contact ID search detected`);
            query = query.eq('contact_id', search_criteria.contact_id);
          }
        }
        
        console.log(`${logPrefix} Executing contact query...`);
        const { data, error } = await query.order('first_name', { ascending: true }).limit(10);
        
        console.log(`${logPrefix} Query result:`, { error, dataLength: data?.length });
        if (error) {
          console.error(`${logPrefix} Query error:`, error);
          throw error;
        }
        
        console.log(`${logPrefix} Contact search found ${data?.length || 0} results`);
        if (data && data.length > 0) {
          console.log(`${logPrefix} First few results:`, data.slice(0, 3).map(c => `${c.first_name} ${c.last_name} (${c.contact_id})`));
        }
        console.log(`${logPrefix} ========== CONTACT SEARCH COMPLETE ==========`);
        
        return { success: true, operation: action, contacts: data, total: data.length };
      }
      
      case 'update': {
        if (!entity_data || Object.keys(entity_data).length === 0) {
          return { success: false, error: "No data provided for update" };
        }
        
        // Handle both contact_id and search_term approaches
        let contactToUpdate = null;
        
        if (search_criteria && 'contact_id' in search_criteria && search_criteria.contact_id) {
          // Direct contact ID approach
          const { data: contact, error: findError } = await supabaseAdmin
            .from('contacts')
            .select('*')
            .eq('contact_id', search_criteria.contact_id)
            .eq('user_id', userId)
            .single();
          
          if (findError || !contact) {
            return { success: false, error: `Contact with ID ${search_criteria.contact_id} not found` };
          }
          contactToUpdate = contact;
          
        } else if (search_criteria && 'search_term' in search_criteria && search_criteria.search_term) {
          // Search by name approach
          const searchTerm = search_criteria.search_term as string;
          console.log(`${logPrefix} Update: Searching for contact: "${searchTerm}"`);
          
          let query = supabaseAdmin
            .from('contacts')
            .select('*')
            .eq('user_id', userId);
          
          // Use same search logic as the search action
          if (searchTerm.includes(' ')) {
            const parts = searchTerm.split(' ').filter(p => p.length > 0);
            if (parts.length === 2) {
              const [first, last] = parts;
              query = query.or(
                `and(first_name.ilike.%${first}%,last_name.ilike.%${last}%),` +
                `and(first_name.ilike.%${last}%,last_name.ilike.%${first}%)`
              );
            } else {
              query = query.or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`);
            }
          } else {
            query = query.or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
          }
          
          const { data: contacts, error: searchError } = await query.limit(10);
          
          if (searchError) {
            console.error(`${logPrefix} Update search error:`, searchError);
            throw searchError;
          }
          
          if (!contacts || contacts.length === 0) {
            return { success: false, error: `No contacts found matching "${searchTerm}"` };
          }
          
          if (contacts.length > 1) {
            return { 
              success: false, 
              error: `Multiple contacts found matching "${searchTerm}". Please be more specific.`,
              contacts: contacts.map(c => ({ 
                contact_id: c.contact_id, 
                name: `${c.first_name} ${c.last_name}`, 
                email: c.email 
              }))
            };
          }
          
          contactToUpdate = contacts[0];
          console.log(`${logPrefix} Found contact to update: ${contactToUpdate.first_name} ${contactToUpdate.last_name} (${contactToUpdate.contact_id})`);
          
        } else {
          return { success: false, error: "Either contact_id or search_term required for update" };
        }
        
        // Filter to only contact-specific fields that are being updated
        const contactFields = {
          first_name: entity_data.first_name,
          last_name: entity_data.last_name,
          middle_name: entity_data.middle_name,
          nickname: entity_data.nickname,
          email: entity_data.email,
          phone: entity_data.phone,
          mobile_phone: entity_data.mobile_phone,
          work_phone: entity_data.work_phone,
          company: entity_data.company,
          job_title: entity_data.job_title,
          department: entity_data.department,
          address: entity_data.address,
          street_address: entity_data.street_address,
          street_address_2: entity_data.street_address_2,
          city: entity_data.city,
          state_province: entity_data.state_province,
          postal_code: entity_data.postal_code,
          country: entity_data.country,
          formatted_address: entity_data.formatted_address,
          website: entity_data.website,
          birthday: entity_data.birthday,
          notes: entity_data.notes,
          tags: entity_data.tags,
          social_linkedin: entity_data.social_linkedin,
          social_twitter: entity_data.social_twitter,
          preferred_contact_method: entity_data.preferred_contact_method,
          language: entity_data.language,
          google_contact_id: entity_data.google_contact_id,
          import_source: entity_data.import_source,
          import_batch_id: entity_data.import_batch_id
        };
        
        // Remove null/undefined fields - only update fields that are explicitly provided
        const filteredData = Object.fromEntries(
          Object.entries(contactFields).filter(([_, value]) => value !== null && value !== undefined)
        );
        
        console.log(`${logPrefix} Updating contact ${contactToUpdate.contact_id} with:`, filteredData);
        
        const { data, error } = await supabaseAdmin
          .from('contacts')
          .update(filteredData)
          .eq('contact_id', contactToUpdate.contact_id)
          .eq('user_id', userId)
          .select()
          .single();
        
        if (error) {
          console.error(`${logPrefix} Update error:`, error);
          throw error;
        }
        
        console.log(`${logPrefix} Contact updated successfully`);
        
        // Clear search cache for this user to ensure fresh data in search results
        try {
          const { clearUserCache } = await import('./contacts-search');
          clearUserCache(userId);
          console.log(`${logPrefix} Cleared search cache for user after contact update`);
        } catch (cacheError) {
          console.warn(`${logPrefix} Failed to clear search cache:`, cacheError);
          // Don't fail the update if cache clearing fails
        }
        
        return { 
          success: true, 
          operation: 'update', 
          contact: data,
          message: `Successfully updated ${data.first_name} ${data.last_name}`
        };
      }
      
      case 'delete': {
        if (!search_criteria || !('contact_id' in search_criteria)) {
          return { success: false, error: "Contact ID required for delete" };
        }
        
        const contactId = search_criteria.contact_id;
        
        // Validate that contact_id is a valid UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (typeof contactId !== 'string' || !uuidRegex.test(contactId)) {
          return { 
            success: false, 
            error: `Invalid contact ID format. Expected a UUID but got: ${contactId}. Please use the contact_id from the search results, not an email or other field.` 
          };
        }
        
        const { error } = await supabaseAdmin
          .from('contacts')
          .delete()
          .eq('contact_id', contactId)
          .eq('user_id', userId);
        
        if (error) throw error;
        
        // Clear search cache for this user to ensure fresh data in search results
        try {
          const { clearUserCache } = await import('./contacts-search');
          clearUserCache(userId);
          console.log(`${logPrefix} Cleared search cache for user after contact deletion`);
        } catch (cacheError) {
          console.warn(`${logPrefix} Failed to clear search cache:`, cacheError);
          // Don't fail the deletion if cache clearing fails
        }
        
        return { success: true, operation: 'delete', message: "Contact deleted successfully" };
      }
      
      default:
        return { success: false, error: `Unknown contact action: ${action}` };
    }
  } catch (error) {
    console.error(`${logPrefix} Contact operation error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Contact operation failed'
    };
  }
}

// Calendar operations
async function executeCalendarOperation(
  action: string,
  entity_data: Record<string, unknown> | null,
  search_criteria: Record<string, unknown> | null,
  userId: string,
  event: HandlerEvent,
  logPrefix: string
): Promise<Record<string, unknown>> {
  try {
    const baseUrl = process.env.URL || '';
    const authHeader = event.headers.authorization || '';
    
    if (action === 'create' && entity_data) {
      // For CREATE: POST request with event data directly in body
      const eventPayload = {
        title: entity_data.title,
        start_time: entity_data.start_time,
        end_time: entity_data.end_time,
        description: entity_data.description || '',
        location: entity_data.location || '',
        is_all_day: entity_data.is_all_day || false,
        is_recurring: entity_data.is_recurring || false,
        recurrence_pattern: entity_data.recurrence_pattern || null
      };

      const response = await fetch(`${baseUrl}/.netlify/functions/calendar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify(eventPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`${logPrefix} Calendar CREATE error: ${response.status} - ${errorText}`);
        throw new Error(`Calendar CREATE error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      return { success: true, operation: 'create', event: result, triggerRefresh: true };
      
    } else if (action === 'search' || action === 'list') {
      // For SEARCH/LIST: GET request with query parameters
      const queryParams = new URLSearchParams();
      
      if (search_criteria) {
        if (search_criteria.search_term) {
          queryParams.append('search_term', search_criteria.search_term as string);
        }
        if (search_criteria.start_date) {
          queryParams.append('start_date', search_criteria.start_date as string);
        }
        if (search_criteria.end_date) {
          queryParams.append('end_date', search_criteria.end_date as string);
        }
        if (search_criteria.upcoming) {
          // Convert "upcoming" to a date range
          const now = new Date();
          const future = new Date();
          future.setDate(now.getDate() + 30); // Next 30 days
          queryParams.append('start_date', now.toISOString());
          queryParams.append('end_date', future.toISOString());
        }
      }

      const url = `${baseUrl}/.netlify/functions/calendar${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': authHeader
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`${logPrefix} Calendar ${action.toUpperCase()} error: ${response.status} - ${errorText}`);
        throw new Error(`Calendar ${action.toUpperCase()} error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      return { success: true, operation: action, events: result, total: result.length };
      
    } else if (action === 'update' && entity_data) {
      // For UPDATE: PUT request with event data in body and ID in path
      // Event ID can be in search_criteria or entity_data
      let eventId: string | null = null;
      
      if (search_criteria && search_criteria.event_id) {
        eventId = search_criteria.event_id as string;
      } else if (entity_data.event_id) {
        eventId = entity_data.event_id as string;
      }
      
      if (!eventId) {
        return {
          success: false,
          error: "Event ID is required for calendar update. Please provide the event_id in search_criteria or specify which event to update."
        };
      }
      
      // Validate that the event ID looks like a proper UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(eventId)) {
        console.error(`${logPrefix} Invalid event ID format: "${eventId}" - this looks like it might be a Zoom meeting ID or other identifier, not an event_id`);
        return {
          success: false,
          error: `Invalid event ID format: "${eventId}". This appears to be a Zoom meeting ID or other identifier, not a proper event_id. Please use the event_id from the previous search results (e.g., "7aa85146-3eb7-4bea-9d07-59325ff7e063").`
        };
      }
      
      console.log(`${logPrefix} Using event ID for update: ${eventId}`);
      
      const updatePayload = {
        title: entity_data.title,
        start_time: entity_data.start_time,
        end_time: entity_data.end_time,
        description: entity_data.description,
        location: entity_data.location,
        is_all_day: entity_data.is_all_day,
        is_recurring: entity_data.is_recurring,
        recurrence_pattern: entity_data.recurrence_pattern
      };
      
      // Remove null/undefined fields
      const filteredPayload = Object.fromEntries(
        Object.entries(updatePayload).filter(([_, value]) => value !== null && value !== undefined)
      );

      const response = await fetch(`${baseUrl}/.netlify/functions/calendar/${eventId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify(filteredPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`${logPrefix} Calendar UPDATE error: ${response.status} - ${errorText}`);
        throw new Error(`Calendar UPDATE error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      return { success: true, operation: 'update', event: result, triggerRefresh: true };
      
    } else if (action === 'delete') {
      // For DELETE: We need an event ID, but if only search_criteria with search_term is provided,
      // we should first find the event, then delete it
      
      if (search_criteria && search_criteria.event_id) {
        // Direct deletion with event ID
        const eventId = search_criteria.event_id as string;

        const response = await fetch(`${baseUrl}/.netlify/functions/calendar/${eventId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': authHeader
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`${logPrefix} Calendar DELETE error: ${response.status} - ${errorText}`);
          throw new Error(`Calendar DELETE error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        return { success: true, operation: 'delete', message: result.message || "Event deleted successfully", triggerRefresh: true };
        
      } else if (search_criteria && search_criteria.search_term) {
        // Search for event first, then delete
        const searchTerm = search_criteria.search_term as string;
        console.log(`${logPrefix} Searching for event to delete: ${searchTerm}`);
        
        // First, search for the event
        const searchParams = new URLSearchParams();
        searchParams.append('search_term', searchTerm);
        
        const searchResponse = await fetch(`${baseUrl}/.netlify/functions/calendar?${searchParams.toString()}`, {
          method: 'GET',
          headers: {
            'Authorization': authHeader
          }
        });

        if (!searchResponse.ok) {
          const errorText = await searchResponse.text();
          console.error(`${logPrefix} Calendar SEARCH error: ${searchResponse.status} - ${errorText}`);
          throw new Error(`Could not search for event: ${errorText}`);
        }

        const searchResults = await searchResponse.json();
        
        if (!Array.isArray(searchResults) || searchResults.length === 0) {
          return { 
            success: false, 
            error: `No events found matching "${searchTerm}". Please check the event name and try again.` 
          };
        }
        
        if (searchResults.length > 1) {
          // Multiple events found - return them for user to choose
          const eventList = searchResults.map((event: { title: string; start_time: string }) => 
            `- ${event.title} (${new Date(event.start_time).toLocaleString()})`
          ).join('\n');
          
          return { 
            success: false, 
            error: `Multiple events found matching "${searchTerm}":\n${eventList}\n\nPlease be more specific or provide the exact date and time.`,
            events: searchResults
          };
        }
        
        // Exactly one event found - proceed with deletion
        const eventToDelete = searchResults[0];
        console.log(`${logPrefix} Found single event to delete: ${eventToDelete.title} (ID: ${eventToDelete.event_id})`);
        
        const deleteResponse = await fetch(`${baseUrl}/.netlify/functions/calendar/${eventToDelete.event_id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': authHeader
          }
        });

        if (!deleteResponse.ok) {
          const errorText = await deleteResponse.text();
          console.error(`${logPrefix} Calendar DELETE error: ${deleteResponse.status} - ${errorText}`);
          throw new Error(`Calendar DELETE error: ${errorText}`);
        }

        await deleteResponse.json(); // Parse response but don't store in unused variable
        return { 
          success: true, 
          operation: 'delete', 
          message: `Successfully deleted "${eventToDelete.title}" scheduled for ${new Date(eventToDelete.start_time).toLocaleString()}`,
          deleted_event: eventToDelete,
          triggerRefresh: true
        };
        
      } else {
        return { 
          success: false, 
          error: "To delete an event, please specify either the event ID or provide the event title/name to search for." 
        };
      }
      
    } else {
      return { 
        success: false, 
        error: `Invalid calendar operation: ${action} with provided data. Missing required fields.` 
      };
    }
    
  } catch (error) {
    console.error(`${logPrefix} Calendar operation error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Calendar operation failed'
    };
  }
}

// Alert operations
async function executeAlertOperation(
  action: string,
  entity_data: Record<string, unknown> | null,
  search_criteria: Record<string, unknown> | null,
  userId: string,
  logPrefix: string
): Promise<Record<string, unknown>> {
  try {
    switch (action) {
      case 'create': {
        if (!entity_data) {
          return { success: false, error: "Entity data required for alert creation" };
        }
        
        // Convert priority string to numeric value (OpenAI sends lowercase strings)
        let priorityValue = entity_data.priority;
        if (typeof priorityValue === 'string') {
          const priorityMap: Record<string, number> = {
            'low': 1,
            'medium': 2,
            'high': 3
          };
          priorityValue = priorityMap[priorityValue] || 2; // Default to medium if unknown
        }
        
        // Filter to only alert-specific fields
        const alertFields = {
          title: entity_data.title,
          description: entity_data.description,
          alert_type: entity_data.alert_type,
          due_date: entity_data.due_date,
          priority: priorityValue,
          status: entity_data.status || 'pending',
          contact_id: entity_data.contact_id,
          event_id: entity_data.event_id,
          tags: entity_data.tags
        };
        
        // Remove null/undefined fields
        const filteredData = Object.fromEntries(
          Object.entries(alertFields).filter(([_, value]) => value !== null && value !== undefined)
        );
        
        const { data, error } = await supabaseAdmin
          .from('alerts')
          .insert({ ...filteredData, user_id: userId })
          .select()
          .single();
        
        if (error) throw error;
        return { success: true, operation: 'create', alert: data };
      }
      
      case 'search':
      case 'list': {
        let query = supabaseAdmin
          .from('alerts')
          .select('*')
          .eq('user_id', userId);
        
        if (search_criteria) {
          if ('status' in search_criteria) {
            query = query.eq('status', search_criteria.status);
          }
          
          if ('upcoming' in search_criteria && search_criteria.upcoming) {
            const now = new Date();
            const future = new Date();
            future.setDate(now.getDate() + 30);
            query = query.gte('due_date', now.toISOString()).lte('due_date', future.toISOString());
          }
        }
        
        const { data, error } = await query.order('due_date', { ascending: true }).limit(20);
        if (error) throw error;
        
        return { success: true, operation: action, alerts: data, total: data.length };
      }
      
      default:
        return { success: false, error: `Unknown alert action: ${action}` };
    }
  } catch (error) {
    console.error(`${logPrefix} Alert operation error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Alert operation failed'
    };
  }
}

// Settings operations
async function executeSettingsOperation(
  action: string,
  entity_data: Record<string, unknown> | null,
  userId: string,
  event: HandlerEvent,
  logPrefix: string
): Promise<Record<string, unknown>> {
  try {
    // Use the settings API endpoint
    const endpoint = action === 'read' ? 'get-profile' : 'settings';
    const response = await fetch(`${process.env.URL}/.netlify/functions/${endpoint}`, {
      method: action === 'read' ? 'GET' : 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': event.headers.authorization || ''
      },
      body: action === 'update' ? JSON.stringify({ settings: entity_data }) : undefined
    });

    if (!response.ok) {
      throw new Error(`Settings API error: ${response.status}`);
    }

    const result = await response.json();
    return { success: true, operation: action, ...result };
    
  } catch (error) {
    console.error(`${logPrefix} Settings operation error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Settings operation failed'
    };
  }
}

// Duplicate management operations
async function executeDuplicateManagementOperation(
  action: string,
  _entity_data: Record<string, unknown> | null,
  search_criteria: Record<string, unknown> | null,
  userId: string,
  logPrefix: string
): Promise<Record<string, unknown>> {
  console.log(`${logPrefix} ========== DUPLICATE MANAGEMENT ==========`);
  console.log(`${logPrefix} Action: ${action}`);
  console.log(`${logPrefix} Search Criteria:`, JSON.stringify(search_criteria, null, 2));
  console.log(`${logPrefix} User ID: ${userId}`);
  console.log(`${logPrefix} ==========================================`);
  
  try {
    switch (action) {
      case 'analyze': {
        console.log(`${logPrefix} ========== ANALYZE DUPLICATES ==========`);
        
        if (!search_criteria || !('search_term' in search_criteria)) {
          console.log(`${logPrefix} ERROR: No search_term in search_criteria`);
          return { success: false, error: "Search term required for duplicate analysis" };
        }
        
        const searchTerm = search_criteria.search_term as string;
        console.log(`${logPrefix} Analyzing duplicates for: "${searchTerm}"`);
        
        // Search for all contacts matching the term
        let query = supabaseAdmin
          .from('contacts')
          .select('*')
          .eq('user_id', userId);
        
        console.log(`${logPrefix} Building query for search term: "${searchTerm}"`);
        
        // Handle full name searches
        if (searchTerm.includes(' ')) {
          console.log(`${logPrefix} Full name search detected in analyze`);
          const parts = searchTerm.split(' ').filter(p => p.length > 0);
          console.log(`${logPrefix} Name parts:`, parts);
          
          if (parts.length === 2) {
            const [first, last] = parts;
            console.log(`${logPrefix} Searching for first: "${first}", last: "${last}"`);
            query = query.or(
              `and(first_name.ilike.%${first}%,last_name.ilike.%${last}%),` +
              `and(first_name.ilike.%${last}%,last_name.ilike.%${first}%)`
            );
          } else {
            console.log(`${logPrefix} Multiple parts search in analyze`);
            query = query.or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`);
          }
        } else {
          console.log(`${logPrefix} Single word search in analyze`);
          query = query.or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
        }
        
        console.log(`${logPrefix} Executing analyze query...`);
        const { data: contacts, error } = await query.order('updated_at', { ascending: false }).limit(10);
        
        console.log(`${logPrefix} Analyze query result:`, { error, contactsLength: contacts?.length });
        if (error) {
          console.error(`${logPrefix} Analyze query error:`, error);
          throw error;
        }
        
        if (!contacts || contacts.length === 0) {
          return { 
            success: true, 
            operation: 'analyze',
            duplicates: [],
            message: `No contacts found matching "${searchTerm}"`
          };
        }
        
        if (contacts.length === 1) {
          return { 
            success: true, 
            operation: 'analyze',
            duplicates: [],
            message: `Only one contact found matching "${searchTerm}" - no duplicates detected`
          };
        }
        
        // Analyze duplicates - count filled fields for each contact
        const analyzedContacts = contacts.map(contact => {
          const importantFields = [
            'email', 'phone', 'mobile_phone', 'work_phone', 
            'company', 'job_title', 'street_address', 'city',
            'birthday', 'notes', 'website'
          ];
          
          let filledFieldsCount = 0;
          const filledFields: string[] = [];
          
          for (const field of importantFields) {
            if (contact[field] && contact[field] !== '') {
              filledFieldsCount++;
              filledFields.push(field);
            }
          }
          
          return {
            contact_id: contact.contact_id,
            first_name: contact.first_name,
            last_name: contact.last_name,
            email: contact.email,
            phone: contact.phone,
            company: contact.company,
            job_title: contact.job_title,
            filled_fields_count: filledFieldsCount,
            filled_fields: filledFields,
            created_at: contact.created_at,
            updated_at: contact.updated_at
          };
        });
        
        // Sort by filled fields count (descending) - most complete first
        analyzedContacts.sort((a, b) => b.filled_fields_count - a.filled_fields_count);
        
        // Identify the most complete
        const mostComplete = analyzedContacts[0];
        
        return {
          success: true,
          operation: 'analyze',
          duplicates: analyzedContacts,
          total_duplicates: contacts.length,
          recommendation: {
            keep: mostComplete,
            consider_deleting: analyzedContacts.slice(1), // All except the most complete
            reason: `The contact with ID ${mostComplete.contact_id} has the most complete information (${mostComplete.filled_fields_count} fields filled)`
          }
        };
      }
      
      case 'delete': {
        console.log(`${logPrefix} ========== DELETE DUPLICATE ==========`);
        
        // This action would delete a specific duplicate after user confirmation
        if (!search_criteria || !('contact_id' in search_criteria)) {
          console.log(`${logPrefix} ERROR: No contact_id in search_criteria`);
          console.log(`${logPrefix} Search criteria received:`, search_criteria);
          return { success: false, error: "Contact ID required for duplicate deletion" };
        }
        
        const contactId = search_criteria.contact_id;
        console.log(`${logPrefix} Contact ID to delete: ${contactId}`);
        console.log(`${logPrefix} Contact ID type: ${typeof contactId}`);
        
        // Validate UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (typeof contactId !== 'string' || !uuidRegex.test(contactId)) {
          console.log(`${logPrefix} ERROR: Invalid UUID format`);
          return { 
            success: false, 
            error: `Invalid contact ID format. Expected a UUID but got: ${contactId}` 
          };
        }
        
        console.log(`${logPrefix} UUID validation passed`);
        
        // First, verify the contact exists and belongs to this user
        console.log(`${logPrefix} Checking if contact exists...`);
        const { data: existingContact, error: checkError } = await supabaseAdmin
          .from('contacts')
          .select('contact_id, first_name, last_name, email')
          .eq('contact_id', contactId)
          .eq('user_id', userId)
          .single();
        
        console.log(`${logPrefix} Check query result:`, { existingContact, checkError });
        
        if (checkError || !existingContact) {
          console.error(`${logPrefix} Contact not found or error checking:`, checkError);
          return {
            success: false,
            error: `Contact with ID ${contactId} not found or you don't have permission to delete it`
          };
        }
        
        console.log(`${logPrefix} Found contact to delete:`, existingContact);
        
        // Delete the duplicate
        console.log(`${logPrefix} Executing DELETE query...`);
        const { error, count } = await supabaseAdmin
          .from('contacts')
          .delete()
          .eq('contact_id', contactId)
          .eq('user_id', userId);
        
        console.log(`${logPrefix} Delete query result:`, { error, count });
        
        if (error) {
          console.error(`${logPrefix} Error deleting contact:`, error);
          throw error;
        }
        
        console.log(`${logPrefix} Delete operation completed. Rows affected: ${count}`);
        console.log(`${logPrefix} ========== DELETE COMPLETE ==========`);
        
        // Clear search cache for this user to ensure fresh data in search results
        try {
          const { clearUserCache } = await import('./contacts-search');
          clearUserCache(userId);
          console.log(`${logPrefix} Cleared search cache for user after duplicate deletion`);
        } catch (cacheError) {
          console.warn(`${logPrefix} Failed to clear search cache:`, cacheError);
          // Don't fail the deletion if cache clearing fails
        }
        
        return { 
          success: true, 
          operation: 'delete',
          message: "Duplicate contact deleted successfully",
          deleted_contact_id: contactId,
          deleted_contact_details: existingContact
        };
      }
      
      default:
        return { success: false, error: `Unknown duplicate management action: ${action}` };
    }
  } catch (error) {
    console.error(`${logPrefix} Duplicate management error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Duplicate management operation failed'
    };
  }
}

export { handler }; 