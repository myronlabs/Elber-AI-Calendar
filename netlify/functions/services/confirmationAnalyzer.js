"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeConfirmation = analyzeConfirmation;
exports.createDeleteConfirmationToolCall = createDeleteConfirmationToolCall;
// src/backend/services/confirmationAnalyzer.ts
const openai_1 = __importDefault(require("openai"));
// Initialize the OpenAI client
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
/**
 * Uses OpenAI to analyze if a user message is a confirmation
 * This approach avoids regex patterns or hard-coded word lists
 *
 * @param userMessage The message from the user to analyze
 * @param context Context about what is being confirmed
 * @returns A typed confirmation status: 'confirmed', 'denied', or 'ambiguous'
 */
async function analyzeConfirmation(userMessage, context) {
    try {
        // Enhanced system prompt for better natural language understanding
        const systemPrompt = `You are analyzing if a user's response confirms or denies a pending action.

CONTEXT:
- The user was asked to confirm '${context.actionType}' for '${context.itemName}'${context.entityType ? ` (entity type: ${context.entityType})` : ''}.
- The user might respond with a direct confirmation ("yes", "proceed"), a confirmation with context ("yes delete that contact"), or with natural language that implies confirmation or denial.

NATURAL LANGUAGE UNDERSTANDING:
- Analyze if the response explicitly or implicitly confirms the action
- Consider phrases like "proceed", "go ahead", "do it", "yes please" as confirmation signals
- Consider phrases that reference the action ("delete it", "remove it") as confirmation signals
- Only return "denied" if there's a clear negative signal

Return ONLY 'confirmed', 'denied', or 'ambiguous' based on your analysis.`;
        const response = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: userMessage
                }
            ],
            temperature: 0.0,
            max_tokens: 10
        });
        const result = response.choices[0]?.message?.content?.trim().toLowerCase();
        console.log(`[confirmationAnalyzer] OpenAI analysis result: "${result}" for message: "${userMessage}"`);
        if (result === 'confirmed')
            return 'confirmed';
        if (result === 'denied')
            return 'denied';
        return 'ambiguous';
    }
    catch (error) {
        // Type-safe error handling without using 'any'
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[confirmationAnalyzer] Error during confirmation analysis: ${errorMessage}`);
        return 'ambiguous'; // Default to ambiguous on error
    }
}
/**
 * Creates a properly formatted confirm_delete_contact tool call
 * Ensures all required parameters are included
 */
function createDeleteConfirmationToolCall(contactId, contactName) {
    // Ensure contact_name is never undefined/null when sent to OpenAI
    const safeName = contactName || `Contact ${contactId.substring(0, 6)}`;
    return {
        id: `confirm_delete_${Date.now()}`,
        type: 'function',
        function: {
            name: 'confirm_delete_contact',
            arguments: JSON.stringify({
                contact_id: contactId,
                confirm: true,
                contact_name: safeName
            })
        }
    };
}
//# sourceMappingURL=confirmationAnalyzer.js.map