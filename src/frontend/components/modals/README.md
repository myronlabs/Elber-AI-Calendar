# Modal System Documentation

## Overview

This modal system provides a comprehensive, type-safe, and highly customizable modal architecture built with React and TypeScript. It fully utilizes the global SCSS variables for consistent styling and includes glassmorphic effects for a premium user experience.

## Architecture

### Base Components

- **Modal**: Core modal wrapper with portal rendering, focus management, and scroll locking
- **ModalHeader**: Reusable header with title, subtitle, and close button
- **ModalBody**: Content area with custom scrollbar and form styling
- **ModalFooter**: Action area with flexible button alignment

### Specialized Components

- **CalendarEventDetailsModal**: Event details display and management
- **ContactFormModal**: Comprehensive contact form with validation
- **ConfirmModal**: Confirmation dialogs with different types

## Features

✅ **100% Type Safe** - No `any` types, full TypeScript support  
✅ **Glassmorphic Design** - Premium visual effects using global variables  
✅ **Mobile First** - Responsive design with mobile optimization  
✅ **Accessibility** - Focus management, keyboard navigation, ARIA labels  
✅ **Portal Rendering** - Proper z-index management  
✅ **Composable** - Mix and match components as needed  
✅ **Consistent Styling** - Uses global SCSS variables throughout  

## Usage Examples

### Basic Modal

```tsx
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../modals';
import Button from '../common/Button';

const MyModal = ({ isOpen, onClose }) => (
  <Modal isOpen={isOpen} onClose={onClose}>
    <ModalHeader title="My Modal" onClose={onClose} />
    <ModalBody>
      <p>Modal content goes here</p>
    </ModalBody>
    <ModalFooter>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" onClick={handleSave}>Save</Button>
    </ModalFooter>
  </Modal>
);
```

### Confirmation Modal

```tsx
import { ConfirmModal } from '../modals';

const DeleteConfirmation = ({ isOpen, onClose, onConfirm }) => (
  <ConfirmModal
    isOpen={isOpen}
    onClose={onClose}
    onConfirm={onConfirm}
    title="Delete Item"
    message="Are you sure you want to delete this item? This action cannot be undone."
    confirmText="Delete"
    cancelText="Cancel"
    type="warning"
    destructive={true}
  />
);
```

### Contact Form Modal

```tsx
import { ContactFormModal } from '../modals';

const EditContact = ({ isOpen, onClose, contact }) => (
  <ContactFormModal
    isOpen={isOpen}
    onClose={onClose}
    onSave={handleSave}
    initialData={contact}
    title="Edit Contact"
    isLoading={isSaving}
  />
);
```

## Modal Sizes

```tsx
// Available sizes
<Modal className="modal-size-small">   {/* 640px max-width */}
<Modal className="modal-size-medium">  {/* 768px max-width */}
<Modal className="modal-size-large">   {/* 1024px max-width */}
<Modal className="modal-size-xl">      {/* 1280px max-width */}
```

## Modal Types (Visual Variants)

```tsx
// Semantic styling with colored borders and glows
<Modal className="modal-success">  {/* Green accent */}
<Modal className="modal-warning">  {/* Amber accent */}
<Modal className="modal-error">    {/* Red accent */}
<Modal className="modal-info">     {/* Blue accent */}
```

## Footer Alignment Options

```tsx
<ModalFooter align="left">          {/* Left-aligned buttons */}
<ModalFooter align="center">        {/* Center-aligned buttons */}
<ModalFooter align="right">         {/* Right-aligned buttons (default) */}
<ModalFooter align="space-between"> {/* Cancel left, actions right */}
```

## Styling Integration

The modal system fully utilizes the global SCSS variables:

- **Colors**: Uses `$surface-*`, `$text-*`, `$border-*`, and `$brand-*` variables
- **Spacing**: Uses `$space-*` variables for consistent spacing
- **Typography**: Uses `$font-*` variables for consistent text styling
- **Shadows**: Uses `$shadow-*` variables for depth and elevation
- **Borders**: Uses `$radius-*` variables for consistent border radius
- **Animations**: Uses `$transition-*` variables for smooth interactions

## Form Styling

The modal body includes comprehensive form styling:

```scss
.form-section {
  // Section grouping with title
  .section-title { /* Styled section headers */ }
  
  .form-row {
    // Responsive grid layout
    // 2 columns on desktop, 1 on mobile
  }
  
  .form-field {
    .field-label { /* Consistent label styling */ }
    .field-input { /* Input/select styling with focus states */ }
  }
}
```

## Accessibility Features

- **Focus Management**: Traps focus within modal when open
- **Keyboard Navigation**: ESC key closes modal
- **ARIA Labels**: Proper labeling for screen readers
- **Backdrop Click**: Click outside to close (can be disabled)
- **Scroll Locking**: Prevents background scroll when modal is open

## Performance Optimizations

- **Portal Rendering**: Renders outside component tree for better performance
- **Conditional Rendering**: Only renders when `isOpen` is true
- **Smooth Animations**: Hardware-accelerated CSS animations
- **Custom Scrollbars**: Styled scrollbars for better UX

## Best Practices

1. **Always provide onClose**: Even if you don't want backdrop/ESC closing
2. **Use semantic types**: Apply appropriate modal types for visual feedback
3. **Handle loading states**: Show loading indicators during async operations
4. **Validate forms**: Disable save buttons until form is valid
5. **Reset form data**: Clear form state when modal closes
6. **Use appropriate sizes**: Choose modal size based on content needs

## Migration from Old Modals

The new system is designed to be a drop-in replacement. Update imports:

```tsx
// Old
import SomeModal from '../SomeModal';

// New
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../modals';
```

## Browser Support

- Modern browsers with CSS Grid support
- Backdrop-filter support for glassmorphic effects
- CSS custom properties support
- ES6+ JavaScript features 