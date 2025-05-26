"use strict";
/**
 * Assistant Configuration
 * Controls behavior of AI assistants
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultAssistantConfig = void 0;
exports.getAssistantConfig = getAssistantConfig;
// Default configuration
exports.defaultAssistantConfig = {
    fastContactSearchEnabled: true,
    responseCachingEnabled: true,
    contactSummaryThreshold: 5,
    maxContactResults: 20,
    cacheTimeToLive: 5 * 60 * 1000, // 5 minutes
    upcomingBirthdayDays: 90 // Look ahead 90 days for birthdays by default
};
// Get configuration from environment variables
function getAssistantConfig() {
    // Default to true unless explicitly disabled
    const fastSearchEnabled = process.env.FAST_CONTACT_SEARCH_ENABLED ?
        process.env.FAST_CONTACT_SEARCH_ENABLED.toLowerCase() !== 'false' :
        true;
    return {
        fastContactSearchEnabled: fastSearchEnabled,
        responseCachingEnabled: process.env.RESPONSE_CACHING_ENABLED !== 'false',
        contactSummaryThreshold: parseInt(process.env.CONTACT_SUMMARY_THRESHOLD || '5', 10),
        maxContactResults: parseInt(process.env.MAX_CONTACT_RESULTS || '20', 10),
        cacheTimeToLive: parseInt(process.env.CACHE_TIME_TO_LIVE || String(5 * 60 * 1000), 10),
        upcomingBirthdayDays: parseInt(process.env.UPCOMING_BIRTHDAY_DAYS || '90', 10)
    };
}
//# sourceMappingURL=assistantConfig.js.map