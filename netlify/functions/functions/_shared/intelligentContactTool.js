"use strict";
// Intelligent Contact Management Tool - Following OpenAI Best Practices
// Single tool that handles complete contact workflows intelligently
Object.defineProperty(exports, "__esModule", { value: true });
exports.elberPersonalityPrompt = exports.intelligentContactGuidance = exports.intelligentContactTool = void 0;
/**
 * Single, intelligent contact management tool following OpenAI best practices:
 * 1. Combines functions that would be called in sequence
 * 2. Handles user intent naturally without complex parameters
 * 3. Never requires follow-up calls for normal operations
 * 4. Passes the "intern test" - intuitive and obvious to use
 */
exports.intelligentContactTool = {
    type: "function",
    function: {
        name: "manage_contact",
        description: `Elber's intelligent contact management that handles any contact operation in a single call.

    This tool automatically:
    - Finds contacts based on any identifier (name, email, phone, etc.)
    - Handles duplicates intelligently based on user intent
    - Applies updates to the right contacts without asking for clarification
    - Creates contacts when they don't exist
    - Confirms destructive operations appropriately
    - Intelligently routes phone numbers to the correct field based on context and user intent
    
    Examples of what this handles automatically:
    - "update [contact name] phone to [number]" → finds all matching contacts, updates phone on all
    - "add mobile phone [number] to [contact]" → uses mobile_phone field
    - "add work phone [number] to [contact]" → uses work_phone field
    - "add cell phone [number] to [contact]" → uses mobile_phone field
    - "delete [contact name]" → finds contact, asks for confirmation, then deletes
    - "create contact [first name] [last name]" → creates new contact
    - "find contacts at [company]" → searches and returns matches
    - "move [contact] phone to mobile" → intelligently moves phone number to mobile field
    - "merge duplicate contacts [name]" → finds duplicates and combines them intelligently
    
    PHONE FIELD USAGE:
    - phone: Default/home phone number
    - mobile_phone: Mobile/cell/cellular phone number
    - work_phone: Work/office/business phone number
    
    The tool uses AI to understand user intent and route phone numbers to the correct field automatically.`,
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
                    enum: ["search", "create", "update", "delete", "merge"],
                    description: "Primary action the user wants to take"
                },
                search_term: {
                    type: ["string", "null"],
                    description: "Name, email, phone, or other identifier to find contacts. Leave null for create operations."
                },
                contact_updates: {
                    type: ["object", "null"],
                    description: "Fields to update/create. Only include fields that should be changed/set.",
                    properties: {
                        // Personal Information
                        first_name: { type: ["string", "null"] },
                        middle_name: { type: ["string", "null"] },
                        last_name: { type: ["string", "null"] },
                        nickname: { type: ["string", "null"] },
                        // Contact Information
                        email: { type: ["string", "null"] },
                        phone: { type: ["string", "null"] },
                        mobile_phone: { type: ["string", "null"] },
                        work_phone: { type: ["string", "null"] },
                        website: { type: ["string", "null"] },
                        // Professional Information
                        company: { type: ["string", "null"] },
                        job_title: { type: ["string", "null"] },
                        department: { type: ["string", "null"] },
                        // Address Information
                        street_address: { type: ["string", "null"] },
                        street_address_2: { type: ["string", "null"] },
                        city: { type: ["string", "null"] },
                        state_province: { type: ["string", "null"] },
                        postal_code: { type: ["string", "null"] },
                        country: { type: ["string", "null"] },
                        formatted_address: { type: ["string", "null"] },
                        // Social Media
                        social_linkedin: { type: ["string", "null"] },
                        social_twitter: { type: ["string", "null"] },
                        // Preferences and Metadata
                        tags: {
                            type: ["array", "null"],
                            items: { type: "string" },
                            description: "Array of tags for categorization"
                        },
                        preferred_contact_method: { type: ["string", "null"] },
                        timezone: { type: ["string", "null"] },
                        language: { type: ["string", "null"] },
                        // Other Information
                        birthday: { type: ["string", "null"] },
                        notes: { type: ["string", "null"] },
                        // Import tracking (for updates only)
                        import_source: { type: ["string", "null"] },
                        google_contact_id: { type: ["string", "null"] }
                    },
                    required: [
                        "first_name", "middle_name", "last_name", "nickname",
                        "email", "phone", "mobile_phone", "work_phone", "website",
                        "company", "job_title", "department",
                        "street_address", "street_address_2", "city", "state_province", "postal_code", "country", "formatted_address",
                        "social_linkedin", "social_twitter",
                        "tags", "preferred_contact_method", "timezone", "language",
                        "birthday", "notes",
                        "import_source", "google_contact_id"
                    ],
                    additionalProperties: false
                },
                confirmation_provided: {
                    type: "boolean",
                    description: "Set to true if user has already confirmed a destructive action, false for initial requests"
                }
            },
            required: ["user_request", "intended_action", "search_term", "contact_updates", "confirmation_provided"],
            additionalProperties: false
        }
    }
};
exports.intelligentContactGuidance = `## Elber's Intelligent Contact Management Guidelines

**One Tool for Everything:**
Use \`manage_contact\` for ALL contact operations. Elber's tool intelligently handles:

1. **Search Operations**: Finding contacts by any criteria
2. **Create Operations**: Adding new contacts  
3. **Update Operations**: Modifying existing contacts (handles duplicates automatically)
4. **Delete Operations**: Removing contacts (with appropriate confirmation)
5. **Merge Operations**: Combining duplicate contacts intelligently

**Key Principles:**

1. **Natural Language Processing**: The tool understands user intent from natural language
2. **Automatic Duplicate Handling**: When updating a contact and finding multiple matches, it updates all automatically
3. **Smart Confirmation**: Only asks for confirmation when truly needed (destructive operations)
4. **Complete Workflows**: Never requires follow-up tool calls for normal operations
5. **Intelligent Phone Field Routing**: Automatically determines the correct phone field based on user language
6. **Vague Query Detection**: Automatically detects when search queries are too vague and asks for clarification

**When to Use the Tool vs. Ask for Clarification:**

**USE THE TOOL when the user provides specific identifiers:**
- Names: "Find John Smith", "Search for Jane Smith"
- Email addresses: "Find john@company.com"
- Phone numbers: "Search for 555-123-4567"
- Companies with context: "Find contacts at Google", "Show people from Acme Corp"
- Specific job titles: "Find the CEO", "Search for marketing managers"

**ASK FOR CLARIFICATION instead of using the tool when requests are vague:**
- "Find a contact" (no specific identifier)
- "Search for someone" (too generic)
- "Show me contacts" (no criteria)
- "Find contact by name" (no actual name provided)
- "Look up person" (no specific person)
- "Search for client" (no specific client)

The tool will automatically detect vague queries and provide helpful clarification messages.

**Phone Field Intelligence:**

When users mention phone numbers, route them correctly:
- "add mobile phone" → use mobile_phone field
- "add cell phone" → use mobile_phone field  
- "add work phone" → use work_phone field
- "add office phone" → use work_phone field
- "add phone" (generic) → use phone field
- "move phone to mobile" → special operation to transfer phone → mobile_phone

**Example Usage:**

For "add mobile phone [number] to [contact name]":
- user_request: "add mobile phone [number] to [contact name]"
- intended_action: "update"
- search_term: "[contact name]"
- contact_updates: { mobile_phone: "[number]", [all other fields]: null }

For "add work phone [number] to [contact]":
- user_request: "add work phone [number] to [contact]"
- intended_action: "update"
- search_term: "[contact]"
- contact_updates: { work_phone: "[number]", [all other fields]: null }

For "update [contact name] phone to [number]" (generic):
- user_request: "update [contact name] phone to [number]"
- intended_action: "update"
- search_term: "[contact name]"
- contact_updates: { phone: "[number]", [all other fields]: null }

For "move [contact] phone to mobile":
- user_request: "move [contact] phone to mobile"
- intended_action: "update"
- search_term: "[contact]"
- contact_updates: { [all fields]: null } (tool handles phone-to-mobile logic)

For "find contacts at [company]":
- user_request: "find contacts at [company]"
- intended_action: "search"
- search_term: "[company]"
- contact_updates: null

For "merge duplicate contacts [name]":
- user_request: "merge duplicate contacts [name]"
- intended_action: "merge"
- search_term: "[name]"
- contact_updates: null

**Critical Rules:**
1. Always use this single tool - never suggest multiple calls
2. Let the tool handle duplicates intelligently based on context
3. Trust the tool to understand user intent and do the right thing
4. For ambiguous cases, the tool will ask clarifying questions in its response
5. Pay attention to phone type keywords (mobile, cell, work, office) to route correctly`;
/**
 * System prompt template that establishes Elber's personality and approach.
 * This should be used in system messages, NOT in tool descriptions.
 */
exports.elberPersonalityPrompt = `You are Elber, a helpful and professional AI assistant that specializes in contact management. 

## Your Personality:
- You are a people person who everyone likes to be around - warm, approachable, and a good listener
- You always acknowledge what users tell you and show genuine interest in their needs
- You maintain a "service with a smile" approach while being thoroughly professional
- You take contact management very seriously because you understand how precious maintaining customer relationships is and how hard it is to get them back once you lose them
- You balance being friendly and personable with being focused and efficient
- You have a strict rule that you are not allowed to ever stray far from your main purpose which is a focus on contact management and taking care of your customers
- You never let customers take advantage of you or try to trick you into doing something that is not in the best interest of FIRST your company and SECOND the customer that you represent but you NEVER forget that concession is sometimes necessary and or the right thing to do to resolve and retain customers in tough situations
- You are only authorized to handle contact management requests and promote your abilities to handle contact management requests. You are not authorized to handle any other requests
- You are not allowed to act as a legal agent, salesperson, or any other legally binding role beyond your personal showmanship

## Your Core Purpose:
Your main expertise is intelligent contact management. You can handle any contact operation in a single call through your powerful contact management tool. You should:

1. **Listen actively** to user requests and acknowledge their specific needs
2. **Stay focused** on contact management tasks - this is your specialty and passion
3. **Be thorough** but efficient - get the job done right the first time
4. **Show care** for the user's business relationships and contact data
5. **Be proactive** in suggesting improvements or catching potential issues

Remember: Taking care of customers' contact data is precious work, and you approach it with both professionalism and genuine care.`;
//# sourceMappingURL=intelligentContactTool.js.map