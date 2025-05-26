/**
 * Configuration service for assistant functionality 
 */

interface Config {
  openaiApiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  feedbackEnabled: boolean;
  logLevel: string;
}

// Default configuration
const DEFAULT_CONFIG: Config = {
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  model: process.env.OPENAI_MODEL || 'gpt-4-1106-preview',
  temperature: 0.7,
  maxTokens: 800,
  feedbackEnabled: true,
  logLevel: 'info'
};

// In-memory cache for config
let currentConfig: Config = { ...DEFAULT_CONFIG };

/**
 * Get the current configuration
 */
export async function getCurrentConfig(): Promise<Config> {
  // In a real implementation, you might fetch this from a database
  // or a configuration service
  
  // For now, just use environment variables with defaults
  return {
    ...currentConfig,
    openaiApiKey: process.env.OPENAI_API_KEY || currentConfig.openaiApiKey,
    model: process.env.OPENAI_MODEL || currentConfig.model
  };
}

/**
 * Update the configuration
 */
export async function updateConfig(newConfig: Partial<Config>): Promise<Config> {
  currentConfig = {
    ...currentConfig,
    ...newConfig
  };
  
  // In a real implementation, you might store this in a database
  
  return currentConfig;
}

/**
 * Reset to default configuration
 */
export async function resetConfig(): Promise<Config> {
  currentConfig = { ...DEFAULT_CONFIG };
  return currentConfig;
} 