// src/frontend/services/confirmationService.ts
import { apiClient } from '../utils/api';
import { PendingConfirmation, PROCEED_MESSAGE_PATTERNS } from '../types/assistantShared';

/**
 * Result of a confirmation analysis
 */
export interface ConfirmationAnalysisResult {
  /**
   * Whether the message was confirmed
   */
  confirmed: boolean;
  
  /**
   * Confidence in the result (0.0 to 1.0)
   */
  confidence: number;
  
  /**
   * Explanation of the reasoning
   */
  reasoning: string;
}

/**
 * Analyzes a user message to determine if it represents a confirmation
 * for a pending action. Uses the backend confirmationAnalyzer service
 * which leverages OpenAI for natural language understanding.
 * 
 * @param userMessage The message from the user to analyze
 * @param pendingConfirmation The current pending confirmation context
 * @returns A promise resolving to a confirmation analysis result
 */
export async function analyzeConfirmation(
  userMessage: string,
  pendingConfirmation: PendingConfirmation
): Promise<ConfirmationAnalysisResult> {
  try {
    // Call the backend confirmation analyzer service
    const response = await apiClient.post<{
      message: string;
      context: {
        actionType: string;
        itemName: string;
        entityType: 'calendar' | 'contact';
      }
    }, {
      status: string;
      confidence?: number;
      reasoning?: string;
    }>('/analyze-confirmation', {
      message: userMessage,
      context: {
        actionType: pendingConfirmation.actionType,
        itemName: pendingConfirmation.entityName,
        entityType: pendingConfirmation.type
      }
    });

    if (response) {
      return {
        confirmed: response.status === 'confirmed',
        confidence: response.confidence || 0.5,
        reasoning: response.reasoning || `Message analyzed as ${response.status}`
      };
    }
    
    // Fallback in case of empty or invalid response
    return {
      confirmed: false,
      confidence: 0,
      reasoning: 'Failed to analyze confirmation: Invalid response'
    };
  } catch (error) {
    console.error('[confirmationService] Error analyzing confirmation:', error);
    
    // Fallback: Use basic regex patterns in case the service is unavailable
    console.log('[confirmationService] Using fallback pattern matching for confirmation');
    
    // Use statically imported PROCEED_MESSAGE_PATTERNS
    // Check if the message matches any confirmation pattern
    const isConfirmed = PROCEED_MESSAGE_PATTERNS.some(pattern => 
      pattern.test(userMessage.trim())
    );
    
    return {
      confirmed: isConfirmed,
      confidence: isConfirmed ? 0.7 : 0.3,
      reasoning: `Fallback pattern matching ${isConfirmed ? 'detected' : 'did not detect'} confirmation`
    };
  }
}

// Create a singleton instance
export const confirmationService = {
  analyzeConfirmation
};