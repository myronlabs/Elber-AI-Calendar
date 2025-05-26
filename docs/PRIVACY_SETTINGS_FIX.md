# Privacy Settings Persistence Fix

## Issue Description
Privacy settings were not persisting in Supabase after browser refresh. Users would change their privacy settings, but after reloading the page, the settings would revert to their previous values.

## Root Cause Analysis

### 1. Value Mismatch
The primary issue was a mismatch between frontend and backend values for profile visibility:
- **Frontend was using**: `'Public' | 'MyContactsOnly' | 'Private'`
- **Backend expected**: `'Everyone' | 'MyContactsOnly' | 'Private'`

### 2. Field Name Confusion
- **Database column**: `raw_user_meta_data` (with underscores)
- **Supabase JS client property**: `user.user_metadata` (different naming)
- **Backend handling**: Attempted to handle both but frontend wasn't aligned

### 3. Type Inconsistencies
Multiple components and interfaces had inconsistent type definitions, leading to confusion about which values were valid.

## Solution

### Changes Made

#### 1. Frontend Type Definitions
Updated all TypeScript interfaces to use the correct values:
```typescript
// Before
interface PrivacySettings {
  privacy_profile_visibility?: 'Public' | 'MyContactsOnly' | 'Private';
}

// After
interface PrivacySettings {
  privacy_profile_visibility?: 'Everyone' | 'MyContactsOnly' | 'Private';
}
```

#### 2. Component Updates
Fixed all components to use 'Everyone' instead of 'Public':
- `EnhancedPrivacySettings.tsx`: Updated dropdown options and form state
- `SettingsPage.tsx`: Fixed dropdown values and interface
- `usePrivacySettings.ts`: Updated hook interface and defaults
- `userSettingsService.ts`: Fixed type definitions and default values

#### 3. Help Text Updates
Changed user-facing text to reflect new terminology:
```typescript
// Before
case 'Public':
  return 'Your profile is visible to everyone using the platform.';

// After
case 'Everyone':
  return 'Your profile is visible to everyone using the platform.';
```

## Testing Guide

### Browser Console Test
Use this script to verify the fix:

```javascript
async function testPrivacyPersistence() {
  console.log('=== Testing Privacy Settings Persistence ===\n');
  
  // Get current values
  const session = await window.supabase.auth.getSession();
  const token = session.data.session?.access_token;
  
  // Show initial state
  const { data: { user: initialUser } } = await window.supabase.auth.getUser();
  console.log('Initial state:');
  console.log('- localStorage:', JSON.parse(localStorage.getItem('elber_privacy_settings') || '{}'));
  console.log('- user_metadata:', initialUser.user_metadata?.privacy_profile_visibility);
  
  // Make API call to update
  const response = await fetch('/.netlify/functions/settings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      action: 'update_privacy_settings',
      settings: {
        profile_visibility: 'MyContactsOnly',
        share_activity_with_contacts: false,
        allow_contact_requests: true
      }
    })
  });
  
  const result = await response.json();
  console.log('\nAPI Response:', result);
  
  // Check after update
  const { data: { user: updatedUser } } = await window.supabase.auth.getUser();
  console.log('\nAfter update:');
  console.log('- localStorage:', JSON.parse(localStorage.getItem('elber_privacy_settings') || '{}'));
  console.log('- user_metadata:', updatedUser.user_metadata?.privacy_profile_visibility);
  
  console.log('\nPersistence test: Refresh the page and run this again to verify persistence.');
}

// Run the test
testPrivacyPersistence();
```

### Manual Testing Steps
1. Navigate to Settings > Privacy
2. Change "Profile Visibility" to a different value
3. Click Save
4. Refresh the browser
5. Check that the setting persists

## Files Modified

1. **Frontend Services**
   - `src/frontend/services/userSettingsService.ts`
   - Fixed type definitions and mapping logic

2. **React Hooks**
   - `src/frontend/hooks/usePrivacySettings.ts`
   - `src/frontend/hooks/useSettings.tsx`
   - Updated interfaces and default values

3. **React Components**
   - `src/frontend/components/EnhancedPrivacySettings.tsx`
   - `src/frontend/pages/SettingsPage.tsx`
   - Fixed dropdown options and state management

## Technical Notes

### Backend Mapping
The backend correctly maps client values to database fields:
```typescript
// Client sends
{ profile_visibility: 'Everyone' }

// Backend maps to both
{
  privacy_profile_visibility: 'Everyone',  // Prefixed version
  profile_visibility: 'Everyone'          // Legacy version
}
```

### Frontend-Backend Data Flow
1. User changes setting in UI
2. Frontend sends `profile_visibility` value to backend
3. Backend maps to both prefixed and unprefixed fields
4. Database stores in `raw_user_meta_data` column
5. JS client accesses via `user.user_metadata` property
6. Frontend reads and displays the persisted value

## Backward Compatibility
The backend maintains both prefixed and unprefixed versions of fields to ensure backward compatibility with any existing data or legacy code that might reference the old field names.

## Future Improvements
1. Consider standardizing on a single field naming convention
2. Add automated tests for settings persistence
3. Implement real-time sync across browser tabs
4. Add validation to ensure only valid enum values are accepted

## Related Issues
- User metadata field naming inconsistency between database and JS client
- Need for better TypeScript typing for Supabase user metadata
- Consider using a dedicated settings table instead of user metadata