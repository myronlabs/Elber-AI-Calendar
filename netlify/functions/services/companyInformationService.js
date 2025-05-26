"use strict";
/**
 * Company Information Service
 *
 * This service provides company information by leveraging OpenAI's knowledge
 * without requiring a separate database or manual data entry.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryCompanyInformation = queryCompanyInformation;
const openai_1 = __importDefault(require("openai"));
/**
 * Uses OpenAI to generate accurate responses to company information queries
 * This approach leverages the model's knowledge without maintaining a separate database
 */
async function queryCompanyInformation(query) {
    try {
        const openai = new openai_1.default({
            apiKey: process.env.OPENAI_API_KEY,
        });
        // Create a specialized prompt for company information queries
        const response = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a corporate information assistant specializing in answering questions about companies. 
          
Provide accurate, concise answers about company executives, leadership, structure, history, products, and industry information.

Format your response in JSON with two fields:
1. "answer" - Your factual response formatted as markdown
2. "confidence" - One of: "high", "medium", or "low" based on how confident you are in the information

If the question asks about very recent information (within the last few months), mention that your knowledge may not include the most recent changes.`
                },
                {
                    role: "user",
                    content: query
                }
            ],
            temperature: 0.1, // Keep temperature low for factual responses
            response_format: { type: "json_object" }
        });
        // Extract the JSON response
        const content = response.choices[0]?.message?.content || '{"answer": "I could not retrieve information about this company.", "confidence": "low"}';
        try {
            const parsedResult = JSON.parse(content);
            return parsedResult;
        }
        catch (parseError) {
            console.error("Failed to parse company information result as JSON:", parseError);
            return {
                answer: "There was an error processing information about this company.",
                confidence: "low"
            };
        }
    }
    catch (error) {
        console.error("Error querying company information:", error);
        return {
            answer: "I encountered an error while retrieving company information. Please try again later.",
            confidence: "low"
        };
    }
}
//# sourceMappingURL=companyInformationService.js.map