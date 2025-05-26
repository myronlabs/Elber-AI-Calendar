// src/frontend/utils/assistantRouter.ts
// Simplified router that only uses the unified assistant endpoint

import { apiClient } from './api';
import {
  ApiMessage,
  ConfirmationContext,
  PendingConfirmation,
  EntityType,
  EntityActionType,
  NoFollowUpToolConfig,
  PROCEED_MESSAGE_PATTERNS
} from '../types/assistantShared';
import { confirmationService } from '../services/confirmationService';

// Define tools that should not ask follow-up questions when user confirms
const NO_FOLLOW_UP_TOOLS: NoFollowUpToolConfig[] = [
  { toolName: 'create_calendar_event', entityType: 'calendar', actionType: 'create' },
  { toolName: 'update_calendar_event', entityType: 'calendar', actionType: 'update' }
];

// Define tools that require explicit confirmation
const TOOLS_REQUIRING_CONFIRMATION: string[] = [
  'delete_calendar_event',
  'delete_contact'
];

// Keep track of conversation context between requests
let pendingConfirmation: PendingConfirmation | null = null;

/**
 * Checks if a message is a "proceed" confirmation based on known patterns
 * This is a fallback method; the primary method uses the confirmationService
 * which leverages OpenAI for better natural language understanding
 * 
 * @param message The message to check
 * @returns True if the message is a proceed confirmation
 */
function isProceedMessage(message: string): boolean {
  return PROCEED_MESSAGE_PATTERNS.some(pattern => pattern.test(message.trim()));
}

/**
 * Analyzes if a message is a confirmation using advanced NLU
 * 
 * @param message The message to analyze
 * @param pendingConfirmation The pending confirmation context
 * @returns A promise resolving to true if the message is a confirmation
 */
async function isConfirmationMessage(message: string, pendingConfirmation: PendingConfirmation): Promise<boolean> {
  try {
    // Use the confirmation service to analyze the message
    const analysisResult = await confirmationService.analyzeConfirmation(message, pendingConfirmation);
    
    console.log(`[assistantRouter] Confirmation analysis for "${message}": ${analysisResult.confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'} (confidence: ${analysisResult.confidence})`);
    console.log(`[assistantRouter] Reasoning: ${analysisResult.reasoning}`);
    
    return analysisResult.confirmed;
  } catch (error) {
    // Fallback to basic pattern matching if the service fails
    console.error('[assistantRouter] Error using confirmation service, falling back to basic pattern matching:', error);
    return isProceedMessage(message);
  }
}

/**
 * Checks if a tool should skip follow-up questions
 * @param toolName Name of the tool
 * @param entityType Type of entity the tool operates on
 * @returns True if the tool should skip follow-up questions
 */
function isNoFollowUpTool(toolName: string, entityType: EntityType): boolean {
  return NO_FOLLOW_UP_TOOLS.some(
    config => config.toolName === toolName && config.entityType === entityType
  );
}

/**
 * Updates conversation context, particularly for pending confirmations based on assistant's responses or tool executions.
 * @param message The ApiMessage (assistant response or tool result) to process for context updates.
 */
function updateContextFromResponse(message: ApiMessage): void {
  console.log('[assistantRouter] updateContextFromResponse processing message:', message);

  if (message.role === 'assistant' && message.tool_calls && message.tool_calls.length > 0) {
    const toolCall = message.tool_calls[0]; // Assuming one primary tool call needing confirmation
    const functionName = toolCall.function?.name || '';

    // Check if this is a tool that asks for confirmation
    const isConfirmationTool = functionName.startsWith('ask_to_confirm_');

    if (isConfirmationTool || TOOLS_REQUIRING_CONFIRMATION.includes(functionName)) {
      try {
        const args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
        
        // For duplicate contact deletion, check for a contact_number field that may be added
        // by the assistant to differentiate between duplicates with the same name
        const entityId = args.contact_number 
          ? `${args.contact_id}_${args.contact_number}` // Create a composite ID for duplicates
          : (args.event_id || args.contact_id || args.id);
        
        const entityName = args.contact_name || args.event_title || args.title || args.name;

        // Store the original entity ID separately for API calls
        const originalEntityId = args.event_id || args.contact_id || args.id;

        // Determine entity type based on tool name
        let entityType: EntityType | null = null;
        if (functionName.includes('calendar') || functionName.includes('event')) entityType = 'calendar';
        else if (functionName.includes('contact')) entityType = 'contact';

        // Determine action type
        let actionType: EntityActionType | null = null;
        if (functionName.includes('delete')) actionType = 'delete';
        else if (functionName.includes('create')) actionType = 'create';
        else if (functionName.includes('update')) actionType = 'update';
        else if (functionName.includes('find')) actionType = 'find';

        if (entityType && entityId && actionType) {
          // Check if this tool should skip follow-up questions
          const requiresFollowUp = !isNoFollowUpTool(functionName, entityType);

          pendingConfirmation = {
            type: entityType,
            entityId,
            originalEntityId, // Store the original ID without the contact_number
            entityName: entityName || 'Unknown',
            actionType,
            requiresFollowUp,
            toolCallId: toolCall.id,
            toolName: functionName,
            timestamp: Date.now(),
            parameters: args
          };
          console.log(`[assistantRouter] SET pendingConfirmation: ${entityType} ${actionType} for ID ${entityId} (originalEntityId: ${originalEntityId}, requiresFollowUp: ${requiresFollowUp})`);
        } else {
          console.warn(`[assistantRouter] Could not set pendingConfirmation from tool ${functionName}. Missing type, entityId, or actionType.`);
        }
      } catch (e) {
        console.error(`[assistantRouter] Error parsing arguments for ${functionName}:`, e);
      }
    }
  } else if (message.role === 'tool') {
    // Handle tool execution completions
    if (pendingConfirmation && message.tool_call_id === pendingConfirmation.toolCallId) {
      // Clear confirmation when tool execution completes
      console.log(`[assistantRouter] CLEARING pendingConfirmation: tool call ID matched.`);
      pendingConfirmation = null;
    } else if (pendingConfirmation && message.name) {
      const executedToolName = message.name;
      const pendingToolName = pendingConfirmation.toolName;

      // Check if this tool execution completes a pending action
      if (pendingToolName && executedToolName) {
        // Case 1: Direct tool match (like deleting with delete_calendar_event)
        if (executedToolName === pendingToolName.replace('ask_to_confirm_', '')) {
          console.log(`[assistantRouter] CLEARING pendingConfirmation: executed tool matches confirmation action.`);
          pendingConfirmation = null;
        }
        // Case 2: Tool is in our no-follow-up list
        else if (
          pendingConfirmation.type === 'calendar' &&
          isNoFollowUpTool(executedToolName, pendingConfirmation.type)
        ) {
          console.log(`[assistantRouter] CLEARING pendingConfirmation: executed no-follow-up tool.`);
          pendingConfirmation = null;
        }
      }
    }

  } else if (message.role === 'assistant' && message.content) {
    // Check if assistant's response indicates completion of a pending action
    if (pendingConfirmation) {
      const lowerContent = message.content.toLowerCase();
      const actionWords = {
        create: ['created', 'added', 'scheduled', 'booked'],
        update: ['updated', 'modified', 'changed', 'rescheduled'],
        delete: ['deleted', 'removed', 'cancelled', 'cleared']
      };

      // Get applicable keywords for this action type
      const actionKeywords = actionWords[pendingConfirmation.actionType as keyof typeof actionWords] || [];

      // Check if content suggests action completion
      const actionComplete = actionKeywords.some(kw => lowerContent.includes(kw));
      const entityTypeMatches = lowerContent.includes(pendingConfirmation.type);
      const entityNameMatches = pendingConfirmation.entityName &&
                               lowerContent.includes(pendingConfirmation.entityName.toLowerCase());

      if (actionComplete && (entityTypeMatches || entityNameMatches)) {
        console.log(`[assistantRouter] CLEARING pendingConfirmation based on text response`);
        pendingConfirmation = null;
      }
    }
  }
}

/**
 * Routes the assistant request to the unified assistant endpoint.
 * Simplified version that only uses the unified assistant.
 */
export async function routeAssistantRequest(messages: ApiMessage[]): Promise<ApiMessage> {
  try {
    console.log('[assistantRouter] Routing to unified assistant');

    // Check for continuous error messages to prevent loops
    const lastMessages = messages.slice(-2);
    const errorCount = lastMessages.filter(msg =>
      msg.role === 'assistant' &&
      msg.content &&
      msg.content.includes('Error in assistant router')
    ).length;

    if (errorCount > 0) {
      console.warn('[assistantRouter] Detected previous error responses, preventing additional calls to avoid infinite loops');
      return {
        role: 'assistant',
        content: 'I encountered an issue with the assistant. Please refresh the page and try again.',
      };
    }

    // Update context from all messages *except* the current user's message if it's the last one and new.
    const historyForContextUpdate = messages.slice(0, messages.length - (messages[messages.length-1]?.role === 'user' ? 1: 0) );
    historyForContextUpdate.forEach(msg => updateContextFromResponse(msg));

    const lastMessageInHistory = messages.length > 0 ? messages[messages.length - 1] : null;
    const currentMessage = lastMessageInHistory?.role === 'user' ? lastMessageInHistory.content : null;

    // Special handling for confirmation messages in confirmation context
    if (currentMessage &&
        typeof currentMessage === 'string' &&
        pendingConfirmation) {

      // First try to analyze with advanced NLU service
      const isConfirmation = await isConfirmationMessage(currentMessage, pendingConfirmation);

      if (isConfirmation) {
        console.log(`[assistantRouter] Detected confirmation message in ${pendingConfirmation.type} context`);

        // Disable follow-up questions for calendar operations
        if (pendingConfirmation.type === 'calendar' &&
            (pendingConfirmation.actionType === 'create' || pendingConfirmation.actionType === 'update')) {
          pendingConfirmation.requiresFollowUp = false;
          console.log(`[assistantRouter] Calendar event ${pendingConfirmation.actionType} - marking as no follow-up needed`);
        }
      }
    }

    // Get user's timezone
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    console.log(`[assistantRouter] User timezone: ${userTimezone}`);

    console.log('[assistantRouter] Current pendingConfirmation state before sending:', pendingConfirmation);
    console.log('[assistantRouter] Sending messages to backend. Message count:', messages.length);

    // Improved message sanitization for OpenAI API compatibility
    const toolCallMap = new Map<string, number>();
    messages.forEach((msg, index) => {
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        msg.tool_calls.forEach(tc => {
          if (tc.id) {
            toolCallMap.set(tc.id, index);
          }
        });
      }
    });

    // Process all messages, but ensure tool messages have corresponding assistant tool_calls
    const sanitizedMessages = messages
      .filter(msg => {
        if (msg.role !== 'tool') return true;
        return msg.tool_call_id && toolCallMap.has(msg.tool_call_id);
      })
      .map(msg => {
        const baseMessage = {
          role: msg.role,
          content: msg.content ?? ''
        };

        if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
          return {
            ...baseMessage,
            tool_calls: msg.tool_calls.map(tc => ({
              id: tc.id,
              type: tc.type as 'function',
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments
              }
            }))
          };
        }

        if (msg.role === 'tool' && msg.tool_call_id) {
          return {
            ...baseMessage,
            tool_call_id: msg.tool_call_id,
            ...(msg.name && { name: msg.name })
          };
        }

        return baseMessage;
      });

    // Create a confirmation context object based on pendingConfirmation
    const confirmationContext: ConfirmationContext | null = pendingConfirmation ? {
      entityId: pendingConfirmation.entityId,
      entityName: pendingConfirmation.entityName || 'Unknown',
      type: pendingConfirmation.type,
      actionType: pendingConfirmation.actionType,
      requiresFollowUp: pendingConfirmation.requiresFollowUp ?? false
    } : null;

    // Debug log confirmation context
    if (confirmationContext) {
      console.log('[assistantRouter] Sending confirmationContext:', JSON.stringify(confirmationContext, null, 2));
    }

    const requestBody = {
      messages: sanitizedMessages,
      confirmationContext,
      userTimezone
    };

    try {
      const response = await apiClient.post<typeof requestBody, ApiMessage>(
        '/assistant', // Always use unified assistant
        requestBody
      );

      // Sanitize the response message to ensure content is never null
      const sanitizedResponseMessage = {
        ...response,
        content: response.content ?? '',
        ...(response.tool_calls && { tool_calls: response.tool_calls })
      };

      // Check if the response indicates we should refresh contacts or calendar
      if (response && typeof response === 'object' && '_metadata' in response && response._metadata) {
        console.log('[assistantRouter] Response metadata received:', JSON.stringify(response._metadata));
        const metadata = response._metadata as { 
          should_refresh_contacts?: boolean; 
          should_refresh_calendar?: boolean;
          [key: string]: unknown 
        };
        
        if (metadata.should_refresh_contacts) {
          console.log('[assistantRouter] Contact operation successful, dispatching assistant-contact-refresh event NOW.');
          const refreshEvent = new CustomEvent('assistant-contact-refresh', {
            detail: {
              timestamp: new Date().toISOString(),
              source: 'assistant',
              metadata: response._metadata
            }
          });
          window.dispatchEvent(refreshEvent);
          console.log('[assistantRouter] assistant-contact-refresh event dispatched.');
        }
        
        if (metadata.should_refresh_calendar) {
          console.log('[assistantRouter] Calendar operation successful, dispatching assistant-calendar-refresh event NOW.');
          const refreshEvent = new CustomEvent('assistant-calendar-refresh', {
            detail: {
              timestamp: new Date().toISOString(),
              source: 'assistant',
              metadata: response._metadata
            }
          });
          window.dispatchEvent(refreshEvent);
          console.log('[assistantRouter] assistant-calendar-refresh event dispatched.');
        }
      }

      // Update context based on the new response from the assistant
      updateContextFromResponse(sanitizedResponseMessage);
      console.log('[assistantRouter] Current pendingConfirmation state after receiving response:', pendingConfirmation);

      return sanitizedResponseMessage;
    } catch (apiError) {
      console.error('[assistantRouter] Error in API call to unified assistant:', apiError);

      if (apiError instanceof Error) {
        console.error('[assistantRouter] API Error details:', {
          name: apiError.name,
          message: apiError.message,
          stack: apiError.stack
        });
      }

      throw apiError;
    }
  } catch (error) {
    console.error('[assistantRouter] Error in routeAssistantRequest:', error);
    const errorMessageContent = error instanceof Error ? error.message : 'An unknown routing error occurred.';

    console.error('[assistantRouter] Detailed error info:', {
      errorType: typeof error,
      errorString: String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace available'
    });

    return {
      role: 'assistant',
      content: `Error in assistant router: ${errorMessageContent}`,
    };
  }
}
