/**
 * Configuration settings for the AI assistant.
 */

interface AssistantConfig {
  contactSummaryThreshold: number;
  upcomingBirthdayDays: number; // Number of days to look ahead for upcoming birthdays
  // Add other assistant-related configurations here as needed
}

const defaultConfig: AssistantConfig = {
  contactSummaryThreshold: 10, // Max contacts to show in a summary list before just giving a count
  upcomingBirthdayDays: 60, // Default to 60 days (approx. 2 months)
};

// Function to get the current assistant configuration
// This can be expanded later to fetch from a dynamic source if needed
export function getAssistantConfig(): AssistantConfig {
  // For now, return the default static config
  // In the future, this could fetch from user settings, environment variables, etc.
  return defaultConfig;
} 