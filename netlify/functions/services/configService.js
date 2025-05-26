"use strict";
/**
 * Configuration service for assistant functionality
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentConfig = getCurrentConfig;
exports.updateConfig = updateConfig;
exports.resetConfig = resetConfig;
// Default configuration
const DEFAULT_CONFIG = {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4-1106-preview',
    temperature: 0.7,
    maxTokens: 800,
    feedbackEnabled: true,
    logLevel: 'info'
};
// In-memory cache for config
let currentConfig = { ...DEFAULT_CONFIG };
/**
 * Get the current configuration
 */
async function getCurrentConfig() {
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
async function updateConfig(newConfig) {
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
async function resetConfig() {
    currentConfig = { ...DEFAULT_CONFIG };
    return currentConfig;
}
//# sourceMappingURL=configService.js.map