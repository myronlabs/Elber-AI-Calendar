// Settings-related hooks

// From usePrivacySettings.ts
export { useExistingPrivacySection } from './usePrivacySettings';
export { default as usePrivacySettings } from './usePrivacySettings';

// From useSettings.tsx
export { 
  usePrivacySettings as usePrivacySettingsNew,
  useNotificationSettings,
  useDisplaySettings 
} from './useSettings'; 