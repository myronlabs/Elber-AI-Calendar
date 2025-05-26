// src/frontend/pages/AssistantPage.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import '../../styles/pages/_assistant.scss';
import MarkdownIt from 'markdown-it';
import { useAuth } from '../../context/AuthContext';
import { useCalendar } from '../../hooks';
import { routeAssistantRequest } from '../../utils/assistantRouter';
import { ApiMessage } from '../../types/assistantShared';
import { Message, useAssistantChat } from '../../context/AssistantContext';
import SuggestionBubbles, { SuggestionBubblesRef } from '../../components/common/SuggestionBubbles';
import { useLoading } from '../../context/LoadingContext';
import Button from '../../components/common/Button';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * AssistantPage Component
 * 
 * Main chat interface for AI assistant interactions.
 * Handles message routing and tool execution.
 */

// Define ChatMessage type used for interaction with AssistantContext
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

// Component to handle bot messages with proper text selection support
interface BotMessageProps {
  content: string;
  md: MarkdownIt;
  processRenderedHTML: (_html: string) => string;
}

const BotMessage: React.FC<BotMessageProps> = ({ content, md, processRenderedHTML }) => {
  // Rely more on SCSS classes for user-select, cursor, and pointer-events.
  // Keep position: relative and zIndex for specific layering control if needed, or move to SCSS.
  
  // Preprocess content to replace <br> tags with newlines for correct Markdown rendering
  const processedContent = content.replace(/<br\s*\/?>/gi, '\n');
  
  return (
    <div
      className="markdown-content selectable-text"
      style={{
        position: 'relative', // Necessary for z-index to take effect within the stacking context
        // zIndex: 20, // This will be moved to SCSS with a more conservative value
      }}
      dangerouslySetInnerHTML={{
        __html: processRenderedHTML(md.render(processedContent))
      }}
    />
  );
};

const AssistantPage: React.FC = () => {
  // Local state for this page specifically (input, loading status)
  const [inputText, setInputText] = useState<string>('');
  const [isLocalLoading, setIsLocalLoading] = useState<boolean>(false); // Renamed for clarity
  const [isContentReady, setIsContentReady] = useState<boolean>(false);
  const [isResettingChat, setIsResettingChat] = useState<boolean>(false); // Track reset operation state
  const [shouldFocusInput, setShouldFocusInput] = useState<boolean>(false); // Track when to focus input
  const [initialQueryProcessed, setInitialQueryProcessed] = useState<boolean>(false); // Track if initial URL query was processed
  const messageListRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionBubblesRef = useRef<SuggestionBubblesRef>(null); // Ref for suggestion bubbles
  const { session, refreshSession } = useAuth();
  const { setLoading } = useLoading(); // Use global loading context
  const {
    fetchEvents: calendarFetchEventsFromContext,
  } = useCalendar();
  const location = useLocation(); // Added to get URL params
  const navigate = useNavigate(); // Added to optionally clear URL params

  // --- Use Assistant Chat Context ---
  const {
    displayMessages, // For reading existing messages
    apiLogMessages, // For reading existing API history
    setDisplayMessages, // For updating display messages
    setApiLogMessages, // For updating API call history
    refreshChat,
  } = useAssistantChat();

  // Create state for UI display messages with Message type
  const [messages, setMessages] = useState<Message[]>([]);
  const [apiConversationHistory, setApiConversationHistory] = useState<ApiMessage[]>([]);

  // Effect to auto-refresh session to prevent chat responses from disappearing
  useEffect(() => {
    const checkAndRefreshSession = async () => {
      // Only attempt refresh if we have a session
      if (session) {
        console.log('[AssistantPage] Interval/Visibility: Performing session validity check');
        
        try {
          await refreshSession();
          console.log('[AssistantPage] Interval/Visibility: Session refreshed');
        } catch (err) {
          console.error('[AssistantPage] Interval/Visibility: Failed to refresh session:', err);
        }
      }
    };
    
    // Set up interval for regular checks while component is mounted
    const sessionCheckInterval = setInterval(checkAndRefreshSession, 5 * 60 * 1000); // Changed to 5 minutes (was 3)
    
    // Setup a visibility change event to refresh session when user returns to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[AssistantPage] Page became visible, refreshing session');
        checkAndRefreshSession();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(sessionCheckInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session, refreshSession]);

  // Sync context data to local state on mount and changes
  useEffect(() => {
    const convertToUIMessages = () => {
      return displayMessages.map(chatMsg => ({
        id: chatMsg.id,
        data: {
          content: chatMsg.content,
          sender: chatMsg.role === 'user' ? 'user' : chatMsg.role === 'assistant' ? 'bot' : 'system'
        }
      } as Message));
    };

    // Convert ChatMessage[] to Message[]
    setMessages(convertToUIMessages());
  }, [displayMessages]);

  // Sync API messages
  useEffect(() => {
    setApiConversationHistory(apiLogMessages.map(logMsg => ({
      role: logMsg.role,
      content: logMsg.content
    } as ApiMessage)));
  }, [apiLogMessages]);

  // --- Autofocus on textarea on page load and refresh ---
  useEffect(() => {
    // Removed immediate and delayed focus from here.
    // This effect now primarily handles refocusing on tab visibility change and window regain focus.

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && textareaRef.current) {
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 100);
      }
    };

    const handleWindowFocus = () => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []); // Empty dependency array: runs on mount, sets up listeners.

  // Scroll to bottom when messages change
  useEffect(() => {
    // Handle scrolling to bottom when new messages arrive
    if (messages.length > 0 && messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]); // Re-run when messages change
  
  // Dedicated effect for managing input focus
  useEffect(() => {
    if (shouldFocusInput && !isLocalLoading && textareaRef.current) {
      // Use a short delay to ensure UI updates are complete
      const focusTimer = setTimeout(() => {
        if (textareaRef.current) {
          console.log('[AssistantPage] Auto-focusing input field after state change');
          textareaRef.current.focus();
        }
        // Reset the flag after focusing
        setShouldFocusInput(false);
      }, 100);
      
      return () => clearTimeout(focusTimer);
    }
  }, [shouldFocusInput, isLocalLoading]); // Only re-run when these dependencies change

  // Content initialization effect - simplified for reliability
  useEffect(() => {
    const instanceId = `assistant-page-${Date.now()}`;
    console.log(`[AssistantPage ${instanceId}] Initializing content`);

    // Set content ready with a small delay to ensure component is properly mounted
    const contentReadyTimer = setTimeout(() => {
      console.log(`[AssistantPage ${instanceId}] Setting content ready`);
      setIsContentReady(true);

      // Force cleanup any global loading state
      // Global loading should only be used for page navigation, not for assistant queries
      setLoading(false);

      // Focus on the input field after content is ready
      if (textareaRef.current) {
        console.log(`[AssistantPage ${instanceId}] Attempting to focus textarea after content ready.`);
        // This is now the primary point for initial focus on load/refresh.
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            console.log(`[AssistantPage ${instanceId}] Textarea focus attempt executed post content ready.`);
          }
        }, 150); // Delay to ensure rendering is complete and browser is settled.
      }
    }, 300);

    return () => {
      console.log(`[AssistantPage ${instanceId}] Unmounting`);
      clearTimeout(contentReadyTimer);

      // Ensure loading is reset when component unmounts
      setLoading(false);
    };
  }, [setLoading]); // Include setLoading dependency

  // --- Auto-adjust Textarea Height with enhanced precision ---
  useEffect(() => {
    const adjustTextareaHeight = (): void => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      // Get line height from computed styles for accurate calculations
      const computedStyle = getComputedStyle(textarea);
      const lineHeight = parseFloat(computedStyle.lineHeight) || 1.5 * parseFloat(computedStyle.fontSize);

      // Reset height to a single line - more accurate than 'auto' across browsers
      textarea.style.height = `${lineHeight + parseFloat(computedStyle.paddingTop) + parseFloat(computedStyle.paddingBottom)}px`;

      // Measure content height
      const contentHeight = textarea.scrollHeight;

      // Get max height from computed style
      const maxHeightString = computedStyle.maxHeight;
      const maxHeight = maxHeightString && maxHeightString !== 'none'
        ? parseFloat(maxHeightString)
        : lineHeight * 4 + parseFloat(computedStyle.paddingTop) + parseFloat(computedStyle.paddingBottom);

      // Set new height based on content
      if (contentHeight > maxHeight) {
        textarea.style.height = `${maxHeight}px`;
        textarea.style.overflowY = 'auto'; // Enable scrolling when content exceeds max height
      } else {
        textarea.style.height = `${contentHeight}px`;
        textarea.style.overflowY = 'hidden'; // Hide scrollbar when not needed
      }
    };

    // Initial adjustment
    adjustTextareaHeight();

    // Adjust on window resize to handle font size changes or container width changes
    window.addEventListener('resize', adjustTextareaHeight);

    return () => {
      window.removeEventListener('resize', adjustTextareaHeight);
    };
  }, [inputText]); // Re-run when inputText changes

  // Initialize markdown-it renderer based on OpenAI documentation style
  const md: MarkdownIt = new MarkdownIt({
    html: false,        // Disable HTML tags in source for security (HTML is not rendered)
    xhtmlOut: false,    // Use '/' to close single tags for HTML5 compatibility
    breaks: true,       // Convert '\n' in paragraphs into <br> for chat interface
    linkify: true,      // Autoconvert URL-like text to links
    typographer: true,  // Enable smart quotes and other typographic replacements
    quotes: '""\'\'',   // Double + single quotes replacement pairs
    highlight: (str: string, lang: string): string => {
      // Enhanced code highlighting
      if (lang) {
        try {
          return `<pre class="language-${lang}"><code class="language-${lang}">${md.utils.escapeHtml(str)}</code></pre>`;
        } catch (_error) { void _error; }
      }
      return `<pre><code>${md.utils.escapeHtml(str)}</code></pre>`;
    }
  });

  // Configure linkify-it behavior for better control
  md.linkify.set({ 
    fuzzyEmail: false,
    fuzzyLink: true,
    fuzzyIP: false
  });
  
  // Add special rendering for lists to make them more visually appealing
  const defaultRender = md.renderer.rules.list_item_open || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };
  
  md.renderer.rules.list_item_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    // Add a special class for list items to style them better
    token.attrJoin('class', 'markdown-list-item');
    return defaultRender(tokens, idx, options, env, self);
  };

  // Function to format ISO date strings into human-readable format
  const formatISODateString = (text: string): string => {
    // More comprehensive ISO date detection, including timezone suffixes
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:?\d{2}|Z)?$/;
    if (isoDateRegex.test(text)) {
      try {
        const date = new Date(text);
        if (!isNaN(date.getTime())) {
          // Format the date to a human-readable string WITHOUT timezone
          // since timezone is now displayed separately in our new format
          const formattedDate = date.toLocaleString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
            // timeZoneName is intentionally removed as it's now a separate field
          });

          // For fields that are known to be part of event display in tables
          if (text.includes('+00:00') || text.endsWith('Z')) {
            // For UTC times, we still note the conversion but without duplication
            return `${formattedDate}`;
          }

          return formattedDate;
        }
      } catch (e) {
        // If parsing fails, return the original text
        console.error("Error parsing date:", e);
      }
    }
    return text; // Return original text if it's not an ISO date or can't be parsed
  };

  // Custom post-processing function to format dates in HTML after markdown rendering
  const processRenderedHTML = (html: string): string => {
    // Then, strip any HTML comment-like ID tags
    // This regex matches <!-- ID: any characters until -->
    const strippedHtml = html.replace(/<!--\s*ID:[^-->]*-->/g, '');

    // Special case: Format the End Time field in calendar event tables
    let processed = strippedHtml.replace(
      /<tr>\s*<td[^>]*>End Time<\/td>\s*<td[^>]*>([\d]{4}-[\d]{2}-[\d]{2}T[\d]{2}:[\d]{2}:[\d]{2}(?:\.\d+)?(?:[+-]\d{2}:?\d{2}|Z)?)<\/td>\s*<\/tr>/g,
      (match, dateText) => {
        // Format without timezone since it's now displayed separately
        const date = new Date(dateText);
        if (!isNaN(date.getTime())) {
          const formattedDate = date.toLocaleString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            // Removed timeZoneName from here since it's now a separate field
          });
          return match.replace(dateText, formattedDate);
        } else {
          const formattedDate = formatISODateString(dateText);
          return match.replace(dateText, formattedDate);
        }
      }
    );
    
    // Special case: Format the Start Time field in calendar event tables
    processed = processed.replace(
      /<tr>\s*<td[^>]*>Start Time<\/td>\s*<td[^>]*>([\d]{4}-[\d]{2}-[\d]{2}T[\d]{2}:[\d]{2}:[\d]{2}(?:\.\d+)?(?:[+-]\d{2}:?\d{2}|Z)?)<\/td>\s*<\/tr>/g,
      (match, dateText) => {
        // Format without timezone since it's now displayed separately
        const date = new Date(dateText);
        if (!isNaN(date.getTime())) {
          const formattedDate = date.toLocaleString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            // Removed timeZoneName from here since it's now a separate field
          });
          return match.replace(dateText, formattedDate);
        } else {
          const formattedDate = formatISODateString(dateText);
          return match.replace(dateText, formattedDate);
        }
      }
    );
    
    // Handle all other ISO dates in table cells
    processed = processed.replace(
      /(<td[^>]*>)([\d]{4}-[\d]{2}-[\d]{2}T[\d]{2}:[\d]{2}:[\d]{2}(?:\.\d+)?(?:[+-]\d{2}:?\d{2}|Z)?)<\/td>/g, 
      (_match, tdOpen, dateText) => {
        return `${tdOpen}${formatISODateString(dateText)}</td>`;
      }
    );
    
    // Replace ISO dates in JSON format within table cells (e.g., "start_time": "2025-05-14T19:00:00+00:00")
    processed = processed.replace(
      /("(?:start_time|end_time|created_at|updated_at)":\s*")([\d]{4}-[\d]{2}-[\d]{2}T[\d]{2}:[\d]{2}:[\d]{2}(?:\.\d+)?(?:[+-]\d{2}:?\d{2}|Z)?)(")/g,
      (_match, prefix, dateText, suffix) => {
        return `${prefix}${formatISODateString(dateText)}${suffix}`;
      }
    );
    
    // Then replace ISO dates in regular text (like paragraphs)
    processed = processed.replace(
      /(\s|>|^)([\d]{4}-[\d]{2}-[\d]{2}T[\d]{2}:[\d]{2}:[\d]{2}(?:\.\d+)?(?:[+-]\d{2}:?\d{2}|Z)?)(\s|<|$)/g,
      (_match, prefix, dateText, suffix) => {
        return `${prefix}${formatISODateString(dateText)}${suffix}`;
      }
    );
    
    return processed;
  };

  // Enable better table rendering
  const defaultTableRender = md.renderer.rules.table_open || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };
  
  md.renderer.rules.table_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    // Add a wrapper div for tables to enable horizontal scrolling
    token.attrJoin('class', 'table-responsive');
    return '<div class="table-container">' + defaultTableRender(tokens, idx, options, env, self);
  };
  
  md.renderer.rules.table_close = function (_tokens, _idx, _options, _env, _self) {
    return '</table></div>';
  };

  // Helper function to process assistant responses, potentially recursively for tool calls
  const processAssistantResponseLoop = useCallback(async (
    assistantApiResponse: ApiMessage,
    currentTurnHistory: ApiMessage[] // The history leading up to assistantApiResponse
  ): Promise<void> => {
    console.log('[AssistantPage] processAssistantResponseLoop: Processing:', assistantApiResponse);

    // Check if the response indicates we should refresh contacts or calendar
    if (assistantApiResponse && typeof assistantApiResponse === 'object' && '_metadata' in assistantApiResponse && assistantApiResponse._metadata) {
      console.log('[AssistantPage] Response metadata received:', JSON.stringify(assistantApiResponse._metadata));
      // Type assertion is safe here because we checked for _metadata's existence
      const metadata = assistantApiResponse._metadata as { 
        should_refresh_contacts?: boolean; 
        should_refresh_calendar?: boolean;
        [key: string]: unknown 
      };
      
      if (metadata.should_refresh_contacts) {
        console.log('[AssistantPage] Contact operation successful, dispatching assistant-contact-refresh event NOW.');
        const refreshEvent = new CustomEvent('assistant-contact-refresh', {
          detail: {
            timestamp: new Date().toISOString(),
            source: 'assistant-page-direct',
            metadata: assistantApiResponse._metadata // Pass metadata for debugging on receiving end
          }
        });
        window.dispatchEvent(refreshEvent);
        console.log('[AssistantPage] assistant-contact-refresh event dispatched.');
      }
      
      if (metadata.should_refresh_calendar) {
        console.log('[AssistantPage] Calendar operation successful, dispatching assistant-calendar-refresh event NOW.');
        const refreshEvent = new CustomEvent('assistant-calendar-refresh', {
          detail: {
            timestamp: new Date().toISOString(),
            source: 'assistant-page-direct',
            metadata: assistantApiResponse._metadata // Pass metadata for debugging on receiving end
          }
        });
        window.dispatchEvent(refreshEvent);
        console.log('[AssistantPage] assistant-calendar-refresh event dispatched.');
        
        // Also refresh calendar in the assistant page context
        try {
          await calendarFetchEventsFromContext();
          console.log('[AssistantPage] Calendar refresh completed successfully.');
        } catch (error) {
          console.error('[AssistantPage] Error refreshing calendar after operation:', error);
        }
      }
    }

    if (assistantApiResponse.role === 'assistant' && assistantApiResponse.content) {
      // Create display message for UI
      const botDisplayMessage: Message = {
        id: String(Date.now() + '_bot_text'),
        data: { content: assistantApiResponse.content, sender: 'bot' }
      };

      // Add to local UI state
      setMessages(prevMessages => [...prevMessages, botDisplayMessage]);

      // Also update persistent context
      const chatMessage: ChatMessage = {
        id: botDisplayMessage.id,
        role: 'assistant',
        content: assistantApiResponse.content,
        timestamp: new Date().toISOString()
      };

      // This will trigger database save
      setDisplayMessages(prevDisplayMessages => [...prevDisplayMessages, chatMessage]);
    }

    // All assistant responses are final since tool execution happens on the backend
    console.log('[AssistantPage] processAssistantResponseLoop: Response processed, updating conversation history');
    const historyWithResponse = [...currentTurnHistory, assistantApiResponse];

    // Update local state
    setApiConversationHistory(historyWithResponse);

    // Update persistent context
    const apiLogUpdates = historyWithResponse
      .filter(msg => msg.role !== 'tool') // Filter out tool messages since they're handled by backend
      .map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content || ''
      }));
    setApiLogMessages(apiLogUpdates);
    setIsLocalLoading(false);
    setShouldFocusInput(true); // Signal that we should focus the input
    suggestionBubblesRef.current?.resetSuggestions(); // Reset suggestions
  }, [calendarFetchEventsFromContext, setMessages, setDisplayMessages, setApiConversationHistory, setApiLogMessages, setIsLocalLoading, setShouldFocusInput]);

  // Send message to backend with improved error handling and loading state management
  const sendMessageToBackend = useCallback(async (messageContent: string, shouldAddToDisplay = true) => {
    if (!session) {
      console.error('[AssistantPage] No user session found. Cannot send message.');
      return;
    }

    // Generate a unique ID for this message operation
    const operationId = `msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    console.log(`[AssistantPage] ${operationId}: Starting message send`);
    
    // Simplified logging for message operations
    console.log(`[AssistantPage] ${operationId}: Starting message send (${messageContent.length} chars)`);

    // Clear loading states to start fresh
    setIsLocalLoading(false);
    // Do NOT set global loading state for regular assistant interactions
    // setLoading(false);

    try {
      // Set only local loading state for assistant operations
      console.log(`[AssistantPage] ${operationId}: Setting local loading state`);
      setIsLocalLoading(true);
      // Do NOT use global loading for regular assistant interactions
      // setLoading(true);

      // Add user message to display if requested
      if (shouldAddToDisplay) {
        const userDisplayMessage: Message = {
          id: `${Date.now()}_user`,
          data: { content: messageContent, sender: 'user' }
        };

        // Add to local UI state for immediate display
        setMessages(prevMessages => [...prevMessages, userDisplayMessage]);

        // Also update the persistent context
        const chatMessage: ChatMessage = {
          id: userDisplayMessage.id,
          role: 'user',
          content: messageContent,
          timestamp: new Date().toISOString()
        };

        // This will trigger database save
        setDisplayMessages(prevDisplayMessages => [...prevDisplayMessages, chatMessage]);
      }
      // All requests now go through the unified assistant router for consistent handling

      // Create API message
      const currentUserMessageForApi: ApiMessage = {
        role: 'user',
        content: messageContent
      };

      // Build conversation history for this turn
      const historyForThisTurn = [
        ...apiConversationHistory,
        currentUserMessageForApi
      ];

      // Send request through router
      console.log(`[AssistantPage] ${operationId}: Sending request to assistant router`);
      const initialAssistantResponse = await routeAssistantRequest(historyForThisTurn);
      console.log(`[AssistantPage] ${operationId}: Received initial response`);

      // Process response and any needed tool calls
      await processAssistantResponseLoop(initialAssistantResponse, historyForThisTurn);
      
      // Mark operation as successful
      console.log(`[AssistantPage] ${operationId}: Message processing completed successfully`);
    } catch (error) {
      // Handle errors
      console.error(`[AssistantPage] ${operationId}: Error:`, error);
      
      // Log operation failure
      console.error(`[AssistantPage] ${operationId}: Operation failed:`, error instanceof Error ? error.message : 'Unknown error');

      // Create user-friendly error message for UI
      const errorMessage: Message = {
        id: `${Date.now()}_error`,
        data: {
          content: 'Sorry, I encountered an error while processing your request. Please try again.',
          sender: 'bot'
        }
      };

      // Add error to local UI state
      setMessages(prevMessages => [...prevMessages, errorMessage]);

      // Also update persistent context
      const chatMessage: ChatMessage = {
        id: errorMessage.id,
        role: 'assistant',
        content: errorMessage.data.content,
        timestamp: new Date().toISOString()
      };

      // This will trigger database save
      setDisplayMessages(prevDisplayMessages => [...prevDisplayMessages, chatMessage]);
    } finally {
      // Guaranteed cleanup of loading states
      console.log(`[AssistantPage] ${operationId}: Cleanup - turning off local loading state`);
      setIsLocalLoading(false);
      setShouldFocusInput(true); // Signal that we should focus the input
      suggestionBubblesRef.current?.resetSuggestions(); // Reset suggestions here too, after user sends a message
      
      // Do NOT reset global loading state for regular assistant operations
      // setLoading(false);
    }
  }, [session, apiConversationHistory, setMessages, setDisplayMessages, processAssistantResponseLoop, setIsLocalLoading, setShouldFocusInput]);

  // Effect to process initial query from URL (moved after sendMessageToBackend)
  useEffect(() => {
    // Only run if not processed and user is authenticated
    if (!initialQueryProcessed && session) { 
      const searchParams = new URLSearchParams(location.search);
      const queryFromUrl = searchParams.get('query');

      if (queryFromUrl) {
        console.log(`[AssistantPage] Found initial query from URL: "${queryFromUrl}"`);
        // Send the message to the backend.
        // The `sendMessageToBackend` function already handles adding it to displayMessages and apiConversationHistory.
        sendMessageToBackend(queryFromUrl, true);
        setInitialQueryProcessed(true); // Mark as processed

        // Clear the query from URL to prevent re-processing on refresh
        navigate(location.pathname, { replace: true });
      } else {
        // No query in URL, mark as processed to prevent re-checks
        setInitialQueryProcessed(true);
      }
    }
  }, [location.search, location.pathname, initialQueryProcessed, sendMessageToBackend, navigate, session]);

  // Add a dedicated function to clear input with multiple approaches to ensure it works
  const clearInput = (): void => {
    console.log('[AssistantPage] clearInput called');
    // Just update React state - let React handle the DOM updates
    setInputText('');
    
    // Simple DOM reset if needed, but don't dispatch events that could cause loops
    if (textareaRef.current) {
      textareaRef.current.value = '';
      textareaRef.current.style.height = ''; // Reset height to auto-calculated
    }
  };

  const handleSuggestionClick = async (suggestion: string) => {
    // Don't set inputText first - just directly add the message and send it
    console.log('[AssistantPage] handleSuggestionClick called with:', suggestion);
    
    // Add the suggestion as a user message to the display immediately
    const userDisplayMessage: Message = { 
      id: String(Date.now()) + '_user_suggestion', 
      data: { content: suggestion, sender: 'user' } 
    };

    // Add to local UI state
    setMessages(prevMessages => [...prevMessages, userDisplayMessage]);

    // Also update persistent context
    const chatMessage: ChatMessage = {
      id: userDisplayMessage.id,
      role: 'user',
      content: suggestion,
      timestamp: new Date().toISOString()
    };

    // This will trigger database save
    setDisplayMessages(prevDisplayMessages => [...prevDisplayMessages, chatMessage]);
    
    // Send message to backend - don't add to display again since we already did it
    await sendMessageToBackend(suggestion, false);
  };

  const handleSendMessage = async () => {
    console.log('[AssistantPage] handleSendMessage: Called. Current inputText:', inputText);
    if (inputText.trim() === '') {
      console.log('[AssistantPage] handleSendMessage: inputText is empty, returning.');
      return;
    }
    const currentInput = inputText;
    
    // Clear input immediately
    clearInput();
    
    console.log('[AssistantPage] handleSendMessage: inputText cleared. Calling sendMessageToBackend with:', currentInput);
    await sendMessageToBackend(currentInput);
  };

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  if (!isContentReady) {
    return (
      <div className="page-loader-overlay">
        <div className="page-loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="assistant-page">
      <header className="assistant-header">
        <h1>AI Assistant</h1>
        <Button
          className="reset-chat-button"
          variant="ghost"
          size="small"
          isLoading={isResettingChat}
          disabled={isResettingChat || isLocalLoading}
          onClick={async () => {
            try {
              console.log("[AssistantPage] Reset Chat button clicked - clearing chat history");
              setIsResettingChat(true);
              
              // Immediately clear local messages for instant UI update
              setMessages([]);

              // Clear any URL query parameters (like pre-typed queries)
              const searchParams = new URLSearchParams(location.search);
              if (searchParams.has('query')) {
                console.log("[AssistantPage] Clearing URL query parameters");
                navigate(location.pathname, { replace: true });
                setInitialQueryProcessed(false); // Reset this flag so new queries can be processed
              }

              // Check if session is valid before attempting to refresh
              if (!session || !session.access_token) {
                // Add a system message about the session issue
                setMessages([{
                  id: `${Date.now()}_system_auth_error`,
                  data: {
                    content: "Your session appears to have expired. Please refresh the page or log out and back in.",
                    sender: 'system'
                  }
                }]);
                return;
              }

              // Then refresh the context data
              await refreshChat();
              console.log("[AssistantPage] Chat history reset successfully");
              
              // Focus the input after reset
              setShouldFocusInput(true);
            } catch (error) {
              console.error("[AssistantPage] Error resetting chat:", error);
              // Display error message to user
              setMessages([{
                id: `${Date.now()}_system_error`,
                data: {
                  content: "There was an error resetting the chat. Please try again or refresh the page.",
                  sender: 'system'
                }
              }]);
            } finally {
              setIsResettingChat(false);
            }
          }}
          aria-label="Reset chat conversation"
        >
          Reset Chat
        </Button>
      </header>

      <div className="chat-container">
        <div className="chat-messages" ref={messageListRef}>
          {messages.map((msg) => {
              // Check if message contains a table (looking for markdown table patterns)
              const containsTable = msg.data.sender === 'bot' && 
                (msg.data.content.includes('|') && msg.data.content.includes('---') ||
                 msg.data.content.includes('<table') ||
                 msg.data.content.includes('<tr>'));
              
              return (
                <div
                  key={msg.id}
                  className={`message ${msg.data.sender === 'user' ? 'user-message' : 'assistant-message'} ${containsTable ? 'message-with-table' : ''}`}
                >
                  <div className="message-bubble">
                    {msg.data.sender === 'bot' ? (
                      <BotMessage content={msg.data.content} md={md} processRenderedHTML={processRenderedHTML} />
                    ) : (
                      <div className="selectable-text" style={{ whiteSpace: 'pre-wrap' }}>{msg.data.content}</div>
                    )}
                  </div>
                  <div className="message-meta">
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            })}
        </div>

        <div className="quick-actions">
          <SuggestionBubbles
            ref={suggestionBubblesRef}
            onSuggestionClick={handleSuggestionClick}
            isLoading={isLocalLoading}
            onMenuCollapse={(shouldRefocus = true) => {
              // Only refocus the textarea if shouldRefocus is true
              if (shouldRefocus && textareaRef.current) {
                textareaRef.current.focus();
              }
            }}
          />
        </div>

        <div className="chat-input-area">
          <div className="chat-input-container">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                // Reset suggestion bubbles when user types
                if (suggestionBubblesRef.current) {
                  suggestionBubblesRef.current.resetSuggestions();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isLocalLoading) {
                  e.preventDefault(); // Prevent newline in textarea before sending

                  // Store current input value
                  const currentInput = inputText;
                  if (currentInput.trim() === '') return;

                  // Clear input field immediately
                  clearInput();

                  // Send message to backend
                  sendMessageToBackend(currentInput);
                }
                // For Shift+Enter, default behavior (inserting a newline) is allowed
              }}
              placeholder="Ask Elber anything... (Shift+Enter for new line)"
              rows={1} // Start with a single row, JS will handle height
              disabled={isLocalLoading}
              className="chat-input"
            />
            <button 
              onClick={handleSendMessage} 
              disabled={isLocalLoading || !inputText.trim()}
              className="send-button"
            >
              {isLocalLoading ? '⏳' : '➤'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssistantPage;
