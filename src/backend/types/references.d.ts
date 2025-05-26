/**
 * Module declarations to help TypeScript resolve modules
 */

// Declare the _shared modules
declare module '@shared/openai-helpers' {
  export function callOpenAI(
    messages: Array<Record<string, unknown>>,
    systemPrompt: string, 
    apiKey: string,
    model?: string
  ): Promise<string>;
  
  export function getSystemPromptFromEnvironmentOrDefault(
    envVarName: string,
    defaultPrompt: string
  ): string;
  
  export function enrichPrompt(
    prompt: string,
    context: Record<string, string>
  ): string;
  
  export function extractIntentionFromResponse(
    userMessage: string,
    response: string
  ): {
    action: string;
    data?: unknown;
    identifiers?: {
      alertId?: string;
      contactId?: string;
      eventId?: string;
    };
  };
  
  export function makeOpenAIRequest(
    messages: Array<Record<string, unknown>>,
    systemPrompt: string,
    apiKey: string,
    model?: string
  ): Promise<string>;
}

// Declare the feedback module
declare module '@shared/feedback' {
  export function processFeedback(
    feedback: Record<string, unknown>,
    source?: string
  ): Promise<boolean>;
}

// Declare the configService module
declare module '@services/configService' {
  export interface Config {
    openaiApiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    feedbackEnabled: boolean;
    logLevel: string;
  }
  
  export function getCurrentConfig(): Promise<Config>;
  export function updateConfig(newConfig: Partial<Config>): Promise<Config>;
  export function resetConfig(): Promise<Config>;
} 