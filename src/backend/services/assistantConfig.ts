/**
 * Assistant Configuration
 * Controls behavior of AI assistants
 */

export interface AssistantConfig {
  // If true, bypass OpenAI for simple contact searches and use fast formatting
  fastContactSearchEnabled: boolean;
  
  // If true, use response caching for repeated queries
  responseCachingEnabled: boolean;
  
  // Maximum contacts to show before summarizing
  contactSummaryThreshold: number;
  
  // Maximum contacts a user can request to see when asking for more
  maxContactResults: number;
  
  // Cache TTL in milliseconds
  cacheTimeToLive: number;
  
  // Default number of days to look ahead for upcoming birthdays
  upcomingBirthdayDays: number;
}

// Default configuration
export const defaultAssistantConfig: AssistantConfig = {
  fastContactSearchEnabled: true,
  responseCachingEnabled: true,
  contactSummaryThreshold: 5,
  maxContactResults: 20,
  cacheTimeToLive: 5 * 60 * 1000, // 5 minutes
  upcomingBirthdayDays: 90 // Look ahead 90 days for birthdays by default
};

// Get configuration from environment variables
export function getAssistantConfig(): AssistantConfig {
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