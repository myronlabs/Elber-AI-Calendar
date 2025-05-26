# Address Fields Implementation

## Overview
This document outlines the address fields added to the user profile in the Elber CRM platform.

## Database Fields
The following address fields were identified in the contacts table and added to the user profile:

| Field Name | Description | Type |
|------------|-------------|------|
| street_address | Primary street address | String |
| street_address_2 | Secondary address line (apt, suite, etc.) | String |
| city | City | String |
| state_province | State, province, or region | String |
| postal_code | ZIP or postal code | String |
| country | Country | String |
| formatted_address | Full formatted address (optional) | String |

## Implementation Details

### Backend Changes
Updated in `src/backend/functions/settings.ts`:
- Added address fields to `UpdateProfileDataPayload` interface
- Added address fields to `UserSupabaseMetadata` interface
- Backend endpoint now accepts and processes these fields

### Frontend Changes
Updated in `src/frontend/pages/SettingsPage.tsx`:
- Added address fields to `ProfileFormData` interface
- Updated form state initialization to include address fields
- Updated `useEffect` to populate form with address data from user metadata
- Updated `handleSubmit` function to include address fields in `attributesToUpdate`
- Updated API payload to include address fields
- Added UI form fields in a dedicated "Address Information" section

### UI Components Added
```tsx
<h3>Address Information</h3>
<div className="profile-form-grid">
  <div className="form-group">
    <label htmlFor="streetAddress">Street Address</label>
    <input type="text" id="streetAddress" name="streetAddress" value={formData.streetAddress} onChange={handleChange} />
  </div>
  <div className="form-group">
    <label htmlFor="streetAddress2">Address Line 2</label>
    <input type="text" id="streetAddress2" name="streetAddress2" value={formData.streetAddress2} onChange={handleChange} />
  </div>
  <div className="form-group">
    <label htmlFor="city">City</label>
    <input type="text" id="city" name="city" value={formData.city} onChange={handleChange} />
  </div>
  <div className="form-group">
    <label htmlFor="stateProvince">State/Province</label>
    <input type="text" id="stateProvince" name="stateProvince" value={formData.stateProvince} onChange={handleChange} />
  </div>
  <div className="form-group">
    <label htmlFor="postalCode">Postal Code</label>
    <input type="text" id="postalCode" name="postalCode" value={formData.postalCode} onChange={handleChange} />
  </div>
  <div className="form-group">
    <label htmlFor="country">Country</label>
    <input type="text" id="country" name="country" value={formData.country} onChange={handleChange} />
  </div>
</div>
```

### CSS Styling
Added to `src/frontend/styles/SettingsPage.scss`:
```scss
h3 {
  font-size: $font-size-md;
  color: $text-color-light;
  margin-top: $spacer-5;
  margin-bottom: $spacer-3;
  padding-bottom: $spacer-2;
  border-bottom: $base-border-width solid $dark-theme-border-color-subtle;
  font-weight: $font-weight-normal;
  
  @media (max-width: #{$breakpoint-md - 1px}) {
    font-size: $font-size-sm;
    margin-top: $spacer-4;
    margin-bottom: $spacer-2;
    padding-bottom: $spacer-1;
  }
}
```

## Data Flow
1. User metadata containing address fields is loaded into form state on component mount
2. User can view and edit address fields in the profile settings form
3. On form submission, address data is sent to the backend settings endpoint
4. Backend updates both Supabase user metadata and public profile data