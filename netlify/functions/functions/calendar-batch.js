"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = exports.getAuthenticatedUserId = void 0;
const services_1 = require("../services");
// Helper function to get authenticated user ID
const getAuthenticatedUserId = (event, context) => {
    // First, try to get user from the clientContext (direct browser calls via Netlify Identity)
    const { user: clientContextUser } = context.clientContext || {};
    if (clientContextUser && clientContextUser.sub) {
        return clientContextUser.sub;
    }
    // If clientContext auth fails, check for Authorization header (when called from another function or frontend)
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.replace('Bearer ', '');
            const parts = token.split('.');
            if (parts.length !== 3) {
                return null;
            }
            const payloadBase64 = parts[1];
            const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
            const payload = JSON.parse(payloadJson);
            return payload.sub || null;
        }
        catch (error) {
            console.error("[authHelper] Error parsing JWT from Authorization header:", error);
            return null;
        }
    }
    return null;
};
exports.getAuthenticatedUserId = getAuthenticatedUserId;
const handler = async (event, context) => {
    // Only allow POST method
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' }),
            headers: { 'Content-Type': 'application/json' }
        };
    }
    // Get authenticated user
    const userId = (0, exports.getAuthenticatedUserId)(event, context);
    if (!userId) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: 'Unauthorized' }),
            headers: { 'Content-Type': 'application/json' }
        };
    }
    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');
    const { operations } = requestBody;
    if (!operations || !Array.isArray(operations) || operations.length === 0) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Operations array is required' }),
            headers: { 'Content-Type': 'application/json' }
        };
    }
    // Process operations
    const results = await Promise.allSettled(operations.map(async (operation) => {
        try {
            let result;
            switch (operation.type) {
                case 'create': {
                    const data = operation.data;
                    const { data: event, error } = await services_1.supabaseAdmin
                        .from('calendar_events')
                        .insert({ ...data, user_id: userId })
                        .select()
                        .single();
                    if (error)
                        throw error;
                    result = event;
                    break;
                }
                case 'update': {
                    const data = operation.data;
                    const { id, ...updateData } = data;
                    const { data: event, error } = await services_1.supabaseAdmin
                        .from('calendar_events')
                        .update(updateData)
                        .match({ id, user_id: userId })
                        .select()
                        .single();
                    if (error)
                        throw error;
                    result = event;
                    break;
                }
                case 'delete': {
                    const data = operation.data;
                    const { error } = await services_1.supabaseAdmin
                        .from('calendar_events')
                        .delete()
                        .match({ id: data.id, user_id: userId });
                    if (error)
                        throw error;
                    result = null;
                    break;
                }
                case 'get': {
                    const data = operation.data;
                    const { data: events, error } = await services_1.supabaseAdmin
                        .from('calendar_events')
                        .select('*')
                        .eq('user_id', userId)
                        .in('id', data.ids);
                    if (error)
                        throw error;
                    result = events;
                    break;
                }
                default:
                    throw new Error(`Unknown operation type: ${operation.type}`);
            }
            return {
                success: true,
                data: result,
                operation: operation.type
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                operation: operation.type
            };
        }
    }));
    const processedResults = results.map((result) => {
        if (result.status === 'fulfilled') {
            return result.value;
        }
        else {
            return {
                success: false,
                error: result.reason?.message || 'Unknown error',
                operation: 'unknown'
            };
        }
    });
    const response = {
        results: processedResults,
        statistics: {
            total: processedResults.length,
            successful: processedResults.filter(r => r.success).length,
            failed: processedResults.filter(r => !r.success).length
        }
    };
    return {
        statusCode: 200,
        body: JSON.stringify(response),
        headers: { 'Content-Type': 'application/json' }
    };
};
exports.handler = handler;
//# sourceMappingURL=calendar-batch.js.map