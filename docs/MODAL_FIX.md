# Modal Event Propagation Fix

## Issue Description

The modals in the application (Add Contact, Import Contacts, etc.) were flashing and immediately disappearing when clicked. This was due to an event propagation issue where the click event from the button that opened the modal was bubbling up to the modal overlay, which then triggered the close handler.

## Root Cause

The modal overlay components had click handlers that unconditionally closed the modal:

```jsx
<div className="modal-overlay" onClick={onClose}>
```

When a button was clicked to open a modal, the click event would:
1. Trigger the button's click handler, which opened the modal
2. Continue propagating (bubbling) up to the newly rendered modal overlay
3. Trigger the modal's close handler immediately

## Solution Applied

We modified all modal components to only close when the click occurs directly on the overlay background, not when the event bubbles up from a child element (like the button that opened it):

```jsx
<div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
```

This pattern:
1. Checks if the click event's target (the element that was actually clicked) matches the currentTarget (the overlay div itself)
2. Only calls the close handler if they match
3. Prevents the modal from closing when clicks bubble up from children

## Components Modified

The following components were updated with this fix:

1. `ContactFormModal.tsx`
2. `ImportContactsModal.tsx`
3. `GoogleContactsImport.tsx`
4. `DeleteConfirmationModal.tsx`
5. `ImportSourceSelectionModal.tsx`
6. `ViewContactModal.tsx`

Note: The `Modal.tsx` component (reusable base modal) already had proper event handling in place with its `handleOverlayClick` function.

## Testing

After applying these changes, the modals should:
1. Open and stay open when their trigger buttons are clicked
2. Close only when clicking directly on the overlay background (outside the modal content)
3. Close when clicking the explicit close button (×)

## Future Recommendations

For future modal implementations, consider:
1. Using the reusable `Modal.tsx` component which already has proper event handling
2. Always checking `e.target === e.currentTarget` in overlay click handlers
3. Using a preventative pattern where stopPropagation is called on buttons that open modals