// src/frontend/hooks/index.ts
// Re-export all hooks from this folder for easier imports

// Main hooks index file
// Export all hooks from subdirectories for easy importing

// Form hooks
export { useFormValidation } from './forms/useFormValidation';

// Settings hooks
export { useExistingPrivacySection } from './settings/usePrivacySettings';
export { default as usePrivacySettings } from './settings/usePrivacySettings';
export { 
  usePrivacySettings as usePrivacySettingsNew,
  useNotificationSettings,
  useDisplaySettings 
} from './settings/useSettings';

// Table hooks
export { useSortableTable } from './table/useSortableTable';

// Re-export useCalendar from the CalendarContext
export { useCalendar } from '../context/CalendarContext';