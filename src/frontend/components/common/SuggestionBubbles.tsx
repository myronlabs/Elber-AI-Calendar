import { useState, forwardRef, useImperativeHandle, useRef, useEffect, useCallback } from 'react';
import '../../styles/components/_suggestion-bubbles.scss';

interface SuggestionItem {
  id: string;
  text: string;
  children?: SuggestionItem[];
}

interface SuggestionBubblesProps {
  onSuggestionClick: (_suggestionText: string) => void;
  isLoading: boolean;
  onMenuCollapse?: (_shouldRefocus?: boolean) => void; // Callback when menu collapses with optional refocus param
}

export interface SuggestionBubblesRef {
  resetSuggestions: () => void;
}

const SuggestionBubbles = forwardRef<SuggestionBubblesRef, SuggestionBubblesProps>((
  { onSuggestionClick, isLoading, onMenuCollapse }, 
  ref
) => {
  // Keep track of the currently expanded categories
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [expandedSubCategoryId, setExpandedSubCategoryId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null); // Ref for the main container
  const collapseTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Added for managing collapse timeout

  // Expose a function to reset the expanded states
  useImperativeHandle(ref, () => ({
    resetSuggestions: () => {
      setExpandedCategoryId(null);
      setExpandedSubCategoryId(null);
    }
  }));

  // Helper function to collapse menu and notify parent
  const collapseMenu = useCallback((shouldRefocus: boolean = true) => {
    if (collapseTimeoutRef.current) { // Clear existing timeout
      clearTimeout(collapseTimeoutRef.current);
    }
    setExpandedCategoryId(null);
    setExpandedSubCategoryId(null);
    if (onMenuCollapse) {
      // Small delay to allow the menu to finish collapsing before refocusing
      collapseTimeoutRef.current = setTimeout(() => { // Store new timeout
        onMenuCollapse(shouldRefocus);
        collapseTimeoutRef.current = null; // Clear ref after execution
      }, 100);
    }
  }, [onMenuCollapse]);

  // Effect to handle clicks outside the component to close bubbles
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        // Only collapse if something is expanded
        if (expandedCategoryId || expandedSubCategoryId) {
          // Refocus the textarea when clicking outside the suggestion bubbles
          // This improves UX by allowing users to immediately start typing
          collapseMenu(true);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [expandedCategoryId, expandedSubCategoryId, collapseMenu]); // Include collapseMenu dependency

  // Effect to clear timeout on unmount
  useEffect(() => {
    return () => {
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
      }
    };
  }, [collapseMenu]); // Include collapseMenu dependency

  // Define the suggestion categories based on Elber's actual capabilities
  const suggestionCategories: SuggestionItem[] = [
    {
      id: 'contacts',
      text: 'Contacts',
      children: [
        {
          id: 'contacts-create',
          text: 'Create',
          children: [
            { id: 'contacts-create-1', text: 'Add John Smith from ABC Corp as Sales Manager' },
            { id: 'contacts-create-2', text: 'Create a personal contact for Jane Doe' },
            { id: 'contacts-create-3', text: 'Add contact with email john@company.com' }
          ]
        },
        {
          id: 'contacts-search',
          text: 'Search',
          children: [
            { id: 'contacts-search-1', text: 'Find John Smith' },
            { id: 'contacts-search-2', text: 'Show all contacts from Microsoft' },
            { id: 'contacts-search-3', text: 'List all contacts' },
            { id: 'contacts-search-4', text: 'Find contacts with upcoming birthdays' }
          ]
        },
        {
          id: 'contacts-update',
          text: 'Update',
          children: [
            { id: 'contacts-update-1', text: 'Change John Smith\'s phone to 555-123-4567' },
            { id: 'contacts-update-2', text: 'Update Jane\'s email to jane@newcompany.com' },
            { id: 'contacts-update-3', text: 'Update John Smith\'s company to ABC Corp' }
          ]
        },
        {
          id: 'contacts-duplicates',
          text: 'Duplicates',
          children: [
            { id: 'contacts-duplicates-1', text: 'Find duplicate contacts' },
            { id: 'contacts-duplicates-2', text: 'Check for duplicate John Smith contacts' },
            { id: 'contacts-duplicates-3', text: 'Show me all John Smith entries' }
          ]
        },
        {
          id: 'contacts-delete',
          text: 'Delete',
          children: [
            { id: 'contacts-delete-1', text: 'Delete John Smith contact' },
            { id: 'contacts-delete-2', text: 'Remove contact with email john@example.com' },
            { id: 'contacts-delete-3', text: 'Delete contact from ABC Corp' }
          ]
        }
      ]
    },
    {
      id: 'calendar',
      text: 'Calendar',
      children: [
        {
          id: 'calendar-create',
          text: 'Create',
          children: [
            { id: 'calendar-create-1', text: 'Create a new calendar event for tomorrow at 2pm' },
            { id: 'calendar-create-2', text: 'Schedule team meeting for Friday 10am' },
            { id: 'calendar-create-3', text: 'Add lunch appointment with client next week' }
          ]
        },
        {
          id: 'calendar-search',
          text: 'Search',
          children: [
            { id: 'calendar-search-1', text: 'Show events for this week' },
            { id: 'calendar-search-2', text: 'What\'s on my calendar today?' },
            { id: 'calendar-search-3', text: 'Find team meeting events' },
            { id: 'calendar-search-4', text: 'Show upcoming events' }
          ]
        },
        {
          id: 'calendar-update',
          text: 'Update',
          children: [
            { id: 'calendar-update-1', text: 'Update team meeting description' },
            { id: 'calendar-update-2', text: 'Change meeting location to Conference Room B' },
            { id: 'calendar-update-3', text: 'Reschedule client call to 3pm' }
          ]
        },
        {
          id: 'calendar-delete',
          text: 'Delete',
          children: [
            { id: 'calendar-delete-1', text: 'Delete team meeting' },
            { id: 'calendar-delete-2', text: 'Cancel client call' },
            { id: 'calendar-delete-3', text: 'Remove lunch appointment' }
          ]
        }
      ]
    },
    {
      id: 'alerts',
      text: 'Alerts',
      children: [
        {
          id: 'alerts-create',
          text: 'Create',
          children: [
            { id: 'alerts-create-1', text: 'Create high priority follow-up reminder' },
            { id: 'alerts-create-2', text: 'Set meeting reminder for tomorrow' },
            { id: 'alerts-create-3', text: 'Add task reminder for project deadline' }
          ]
        },
        {
          id: 'alerts-search',
          text: 'Search',
          children: [
            { id: 'alerts-search-1', text: 'Show upcoming alerts' },
            { id: 'alerts-search-2', text: 'List high priority alerts' },
            { id: 'alerts-search-3', text: 'Find pending reminders' }
          ]
        }
      ]
    },
    {
      id: 'settings',
      text: 'Settings',
      children: [
        {
          id: 'settings-profile',
          text: 'Profile',
          children: [
            { id: 'settings-profile-1', text: 'Show my profile settings' },
            { id: 'settings-profile-2', text: 'Update my display name' },
            { id: 'settings-profile-3', text: 'Change my timezone settings' }
          ]
        },
        {
          id: 'settings-preferences',
          text: 'Preferences',
          children: [
            { id: 'settings-preferences-1', text: 'Update email notifications setting' },
            { id: 'settings-preferences-2', text: 'Change theme preference' },
            { id: 'settings-preferences-3', text: 'Set date format to MM/DD/YYYY' }
          ]
        }
      ]
    },
    {
      id: 'help',
      text: 'Help',
      children: [
        { id: 'help-1', text: 'What can you help me with?' },
        { id: 'help-2', text: 'How do I manage my contacts?' },
        { id: 'help-3', text: 'Show me calendar features' },
        { id: 'help-4', text: 'How do I set up alerts?' },
        { id: 'help-5', text: 'What is your name?' },
        { id: 'help-6', text: 'Tell me about Elber CRM' }
      ]
    }
  ];

  // Function to handle clicking on a top-level category
  const handleCategoryClick = (category: SuggestionItem) => {
    if (isLoading) return;
    
    // If this is the currently expanded category, collapse it
    if (expandedCategoryId === category.id) {
      collapseMenu(true); // Refocus when collapsing via user interaction
    } else {
      // Otherwise, expand this category and collapse any subcategory
      setExpandedCategoryId(category.id);
      setExpandedSubCategoryId(null);
    }
  };
  
  // Function to handle clicking on a second-level category (CRUD operations)
  const handleSubCategoryClick = (subCategory: SuggestionItem) => {
    if (isLoading) return;
    
    // If this subcategory has children, toggle its expansion
    if (subCategory.children && subCategory.children.length > 0) {
      if (expandedSubCategoryId === subCategory.id) {
        setExpandedSubCategoryId(null); // Collapse if already expanded
      } else {
        setExpandedSubCategoryId(subCategory.id); // Expand this subcategory
      }
    } else {
      // If it's a leaf node (no children), send as a suggestion
      onSuggestionClick(subCategory.text);
      // Reset expansion state
      setExpandedCategoryId(null);
      setExpandedSubCategoryId(null);
    }
  };

  // Function to handle clicking on a leaf suggestion
  const handleLeafSuggestionClick = (suggestion: SuggestionItem) => {
    if (isLoading) return;
    onSuggestionClick(suggestion.text);
    // Reset expansion state
    setExpandedCategoryId(null);
    setExpandedSubCategoryId(null);
  };

  // Find the expanded category data
  const expandedCategory = expandedCategoryId
    ? suggestionCategories.find(cat => cat.id === expandedCategoryId) 
    : null;

  return (
    <div className="dynamic-suggestion-container" ref={containerRef}>
      {/* First level - Main categories */}
      <div className="suggestion-level suggestion-level-1">
        {suggestionCategories.map((category) => (
          <button 
            key={category.id} 
            className={`suggestion-bubble ${expandedCategoryId === category.id ? 'expanded' : ''}`}
            onClick={() => handleCategoryClick(category)}
            onMouseDown={(e) => e.preventDefault()} // Prevent focus loss
            disabled={isLoading}
          >
            {category.text}
          </button>
        ))}
      </div>

      {/* Second level - Sub-categories (CRUD operations) */}
      {expandedCategory && expandedCategory.children && (
        <div className="suggestion-level suggestion-level-2">
          {expandedCategory.children.map((subCategory) => (
            <button 
              key={subCategory.id} 
              className={`suggestion-bubble ${expandedSubCategoryId === subCategory.id ? 'expanded' : ''}`}
              onClick={() => handleSubCategoryClick(subCategory)}
              onMouseDown={(e) => e.preventDefault()} // Prevent focus loss
              disabled={isLoading}
            >
              {subCategory.text}
            </button>
          ))}
        </div>
      )}

      {/* Third level - Specific actions */}
      {expandedSubCategoryId && expandedCategory && expandedCategory.children && (
        <div className="suggestion-level suggestion-level-3">
          {expandedCategory.children
            .find(subCat => subCat.id === expandedSubCategoryId)
            ?.children?.map((actionItem) => (
              <button 
                key={actionItem.id} 
                className="suggestion-bubble"
                onClick={() => handleLeafSuggestionClick(actionItem)}
                onMouseDown={(e) => e.preventDefault()} // Prevent focus loss
                disabled={isLoading}
              >
                {actionItem.text}
              </button>
            ))
          }
        </div>
      )}
    </div>
  );
});

SuggestionBubbles.displayName = 'SuggestionBubbles';

export default SuggestionBubbles; 