"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const confirmationAnalyzer_1 = require("../services/confirmationAnalyzer");
const utils_1 = require("./_shared/utils");
const handler = async (event, context) => {
    const reqId = context.awsRequestId || `local-${Date.now()}`;
    const logPrefix = `[analyze-confirmation][ReqID:${reqId}]`;
    console.log(`${logPrefix} Function invoked ---`);
    console.log(`${logPrefix} HTTP Method: ${event.httpMethod}`);
    if (event.httpMethod !== 'POST') {
        console.warn(`${logPrefix} Method Not Allowed: ${event.httpMethod}`);
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
            headers: { 'Content-Type': 'application/json', 'Allow': 'POST' },
        };
    }
    // Verify authentication
    const userId = (0, utils_1.getUserIdFromEvent)(event, 'analyze-confirmation.ts');
    if (!userId) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Authentication required. User ID could not be determined.' }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
    // Parse request body
    let requestBody;
    try {
        if (!event.body) {
            console.warn(`${logPrefix} Request body is missing.`);
            throw new Error("Request body is missing.");
        }
        requestBody = JSON.parse(event.body);
        console.log(`${logPrefix} Analyzing confirmation message: "${requestBody.message}" for context:`, requestBody.context);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error parsing request body.";
        console.error(`${logPrefix} Failed to parse request body: ${errorMessage}`);
        return {
            statusCode: 400,
            body: JSON.stringify({ message: `Invalid request body: ${errorMessage}` }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
    try {
        // Validate request
        if (!requestBody.message || !requestBody.context || !requestBody.context.actionType || !requestBody.context.itemName) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Required parameters missing: message, context.actionType, and context.itemName are required' }),
                headers: { 'Content-Type': 'application/json' },
            };
        }
        // Analyze the confirmation using the confirmationAnalyzer service
        console.log(`${logPrefix} Analyzing message: "${requestBody.message}" for action "${requestBody.context.actionType}" on item "${requestBody.context.itemName}"`);
        const status = await (0, confirmationAnalyzer_1.analyzeConfirmation)(requestBody.message, requestBody.context);
        // Prepare a more detailed response with confidence and reasoning
        const response = {
            status,
            confidence: status === 'confirmed' ? 0.9 : (status === 'denied' ? 0.9 : 0.5),
            reasoning: `Message "${requestBody.message}" was analyzed as ${status} for ${requestBody.context.actionType} of ${requestBody.context.itemName}`
        };
        console.log(`${logPrefix} Analysis result: ${status}`);
        return {
            statusCode: 200,
            body: JSON.stringify(response),
            headers: { 'Content-Type': 'application/json' },
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        console.error(`${logPrefix} Error in handler: ${errorMessage}`);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "An internal server error occurred.", details: errorMessage }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=analyze-confirmation.js.map