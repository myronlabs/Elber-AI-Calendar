# Global Color System

This directory contains the global design system variables that should be used throughout the application.

## Color Hierarchy

### Surface Colors (Backgrounds) - Minimalist Blue-Grey Theme
- `$surface-background` - Main page background (#2c3e50) - Elegant blue-grey
- `$surface-primary` - Cards, panels (#34495e) - Soft slate
- `$surface-secondary` - Elevated cards (#3d566e) - Lighter blue-grey
- `$surface-tertiary` - Modals, overlays (#4a6278) - Even lighter
- `$surface-interactive` - Hover states (#5a7a8f) - Soft blue

### Text Colors - Soft, Readable Typography
- `$text-primary` - Main text (#ecf0f1) - Soft white, easier on eyes
- `$text-secondary` - Secondary text (#bdc3c7) - Warm grey
- `$text-tertiary` - Muted text (#95a5a6) - Muted blue-grey
- `$text-disabled` - Disabled text (#7f8c8d) - Soft grey

### Brand Colors - Harmonious with Blue-Grey Theme
- `$brand-primary` - Soft harmonious blue (#3498db)
- `$brand-primary-dark` - Darker blue (#2980b9)
- `$brand-primary-light` - Lighter blue (#5dade2)

### Semantic Colors - Soft, Harmonious Status Colors
- `$status-success` - Soft emerald (#27ae60)
- `$status-warning` - Soft amber (#f39c12)
- `$status-error` - Soft coral (#e74c3c)
- `$status-info` - Harmonious blue (#3498db)

## Usage

Import the variables in your SCSS files:

```scss
@use '../abstracts/variables' as *;

.my-component {
  background-color: $surface-primary;
  color: $text-primary;
  border: 1px solid $border-primary;
}
```

## Legacy Support

The file includes legacy aliases for backward compatibility:
- `$dark-theme-*` variables map to the new surface system
- `$primary-color`, `$success-color`, etc. map to semantic colors

## Single Source of Truth

All colors are defined once in `_variables.scss`. Do not define colors elsewhere in the codebase. If you need a new color, add it to the appropriate section in the variables file. 