// src/frontend/context/AssistantContext.tsx
import React, { createContext, useState, useContext, ReactNode, Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
// Ensure this path is correct based on your project structure.
// It assumes services/types.ts is in src/backend/functions/
import { ChatMessage, ApiLogMessage, StoredChatMessage } from '../../backend/functions/services/types';
import { v4 as uuidv4 } from 'uuid';

// Storage keys for local persistence
const LOCAL_DISPLAY_MESSAGES_KEY = 'elber_display_messages';
const LOCAL_API_MESSAGES_KEY = 'elber_api_messages';

// Export Message as an alias for use in other components
export type Message = { id: string; data: { content: string; sender: 'user' | 'bot' | 'system' } };

// --- Initial State Values ---
// No initial greeting - chat starts empty


// --- Context Type Definition ---
interface AssistantContextType {
  displayMessages: ChatMessage[];
  setDisplayMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  apiLogMessages: ApiLogMessage[];
  setApiLogMessages: Dispatch<SetStateAction<ApiLogMessage[]>>;
  addDisplayMessage: (_content: string, _role: 'user' | 'assistant' | 'system', _id?: string) => Promise<void>;
  addApiLogMessage: (_role: 'system' | 'user' | 'assistant', _content: string) => Promise<void>;
  refreshChat: () => Promise<void>;
  isLoadingHistory: boolean;
  errorHistory: string | null;
  restoreMessagesFromLocalStorage: () => boolean; // New function to restore from localStorage
}

// --- Create Context ---
const AssistantContext = createContext<AssistantContextType | undefined>(undefined);

// --- Context Provider Component ---
interface AssistantChatProviderProps {
  children: ReactNode;
}

export const AssistantChatProvider: React.FC<AssistantChatProviderProps> = ({ children }) => {
  const { user, session, isLoading: isAuthLoading } = useAuth();
  const [displayMessages, setDisplayMessages] = useState<ChatMessage[]>([]);
  const [apiLogMessages, setApiLogMessages] = useState<ApiLogMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [errorHistory, setErrorHistory] = useState<string | null>(null);
  const isFetchingHistoryRef = React.useRef(false);
  const hasFetchedInitialHistoryForSessionRef = React.useRef(false);

  // Helper function to save messages to localStorage
  const saveMessagesToLocalStorage = useCallback((displayMsgs: ChatMessage[], apiMsgs: ApiLogMessage[]) => {
    try {
      localStorage.setItem(LOCAL_DISPLAY_MESSAGES_KEY, JSON.stringify(displayMsgs));
      localStorage.setItem(LOCAL_API_MESSAGES_KEY, JSON.stringify(apiMsgs));
      console.log('[AssistantContext] Messages saved to localStorage successfully');
      return true;
    } catch (error) {
      console.error('[AssistantContext] Error saving messages to localStorage:', error);
      return false;
    }
  }, []);

  // Function to restore messages from localStorage
  const restoreMessagesFromLocalStorage = useCallback((): boolean => {
    try {
      const storedDisplayMessages = localStorage.getItem(LOCAL_DISPLAY_MESSAGES_KEY);
      const storedApiMessages = localStorage.getItem(LOCAL_API_MESSAGES_KEY);
      
      if (storedDisplayMessages) {
        const parsedDisplayMessages = JSON.parse(storedDisplayMessages) as ChatMessage[];
        setDisplayMessages(parsedDisplayMessages);
        console.log('[AssistantContext] Restored display messages from localStorage:', parsedDisplayMessages.length);
      }
      
      if (storedApiMessages) {
        const parsedApiMessages = JSON.parse(storedApiMessages) as ApiLogMessage[];
        setApiLogMessages(parsedApiMessages);
        console.log('[AssistantContext] Restored API messages from localStorage:', parsedApiMessages.length);
      }
      
      return (storedDisplayMessages !== null || storedApiMessages !== null);
    } catch (error) {
      console.error('[AssistantContext] Error restoring messages from localStorage:', error);
      return false;
    }
  }, []);

  const fetchChatHistory = useCallback(async (currentUserId: string, currentToken: string) => {
    if (isFetchingHistoryRef.current) {
      console.log('[AssistantContext] fetchChatHistory: Fetch already in progress, skipping.');
      return;
    }
    isFetchingHistoryRef.current = true;
    console.log(`[AssistantContext] fetchChatHistory: Starting chat history fetch for user: ${currentUserId}.`);
    setIsLoadingHistory(true);
    setErrorHistory(null);

    try {
      const response = await fetch('/.netlify/functions/chat-history', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${currentToken}` },
      });

      if (!response.ok) {
        if (response.status === 404) { // 404 means no history, which is not an "error" for this flow
          console.log('[AssistantContext] fetchChatHistory: No chat history found in DB (404).');
          
          // Try to restore from localStorage
          const hasLocalMessages = restoreMessagesFromLocalStorage();
          
          if (!hasLocalMessages) {
            // Always keep chat empty when no history is found
            console.log('[AssistantContext] fetchChatHistory: No history found. Keeping chat empty.');
            setDisplayMessages([]);
            setApiLogMessages([]);
          }
          sessionStorage.setItem('elber_welcome_handled_in_session', 'true');
        } else {
          throw new Error(`Failed to fetch chat history: ${response.status} ${response.statusText}`);
        }
      } else {
        const responseData = await response.json();
        const fetchedStoredMessages = responseData.success ? responseData.data : (responseData.messages || []);
        
        const newDisplayMessages: ChatMessage[] = [];
        const newApiLogMessages: ApiLogMessage[] = [];

        if (Array.isArray(fetchedStoredMessages)) {
          fetchedStoredMessages.forEach(msg => {
            if (msg && typeof msg === 'object' && msg.data) {
              if (msg.type === 'display' && msg.data.id && msg.data.role && typeof msg.data.content === 'string') {
                newDisplayMessages.push(msg.data as ChatMessage);
              } else if (msg.type === 'api_log' && msg.data.role && typeof msg.data.content === 'string') {
                newApiLogMessages.push(msg.data as ApiLogMessage);
              }
            }
          });
        }

        if (newDisplayMessages.length > 0) {
          console.log('[AssistantContext] fetchChatHistory: History found. Setting messages from database.');
          setDisplayMessages(newDisplayMessages);
          setApiLogMessages(newApiLogMessages.length > 0 ? newApiLogMessages : []);
          // Also save to localStorage as backup
          saveMessagesToLocalStorage(newDisplayMessages, newApiLogMessages);
          // If history is loaded, welcome is considered handled.
          sessionStorage.setItem('elber_welcome_handled_in_session', 'true');
        } else {
          // DB returned success but no messages (e.g., history was cleared)
          console.log('[AssistantContext] fetchChatHistory: DB returned success but no messages.');
          
          // Only restore from localStorage if the current displayMessages state is also empty.
          // This prevents overwriting volatile messages if the DB fetch is slightly behind.
          if (displayMessages.length === 0) {
            const hasLocalMessages = restoreMessagesFromLocalStorage();
            
            if (!hasLocalMessages) {
              // Always keep the chat empty - no initial greeting
              console.log('[AssistantContext] fetchChatHistory: No local messages found. Keeping chat empty.');
              setDisplayMessages([]);
              setApiLogMessages([]);
            }
            sessionStorage.setItem('elber_welcome_handled_in_session', 'true');
            // If hasLocalMessages was true, restoreMessagesFromLocalStorage already updated the state.
          } else {
            console.log('[AssistantContext] fetchChatHistory: DB returned no messages, but volatile displayMessages not empty. Preserving volatile state.');
          }
        }
      }
    } catch (err) {
      console.error('[AssistantContext] fetchChatHistory: Error fetching/processing chat history:', err);
      setErrorHistory(err instanceof Error ? err.message : String(err));
      
      // On fetch error, try to load from localStorage only if current displayMessages state is empty
      if (displayMessages.length === 0) {
        const hasLocalMessages = restoreMessagesFromLocalStorage();
        
        // Fallback if fetch fails catastrophically and no local storage data, and volatile is empty
        if (!hasLocalMessages) {
          // Keep the chat empty - don't show initial greeting
          setDisplayMessages([]);
          setApiLogMessages([]);
          sessionStorage.setItem('elber_welcome_handled_in_session', 'true');
        }
      } else {
         console.log('[AssistantContext] fetchChatHistory: Error fetching history, but volatile displayMessages not empty. Preserving volatile state.');
      }
    } finally {
      setIsLoadingHistory(false);
      isFetchingHistoryRef.current = false;
    }
  }, [restoreMessagesFromLocalStorage, saveMessagesToLocalStorage, displayMessages.length]); 

  useEffect(() => {
    if (isAuthLoading) {
      console.log('[AssistantContext] Auth is loading. Waiting for auth to complete.');
      hasFetchedInitialHistoryForSessionRef.current = false; 
      return;
    }

    if (user && user.id && session && session.access_token) {
      if (!hasFetchedInitialHistoryForSessionRef.current && !isFetchingHistoryRef.current) {
        console.log('[AssistantContext] Auth complete and session stable. Attempting initial chat history fetch.');
        hasFetchedInitialHistoryForSessionRef.current = true; 
        fetchChatHistory(user.id, session.access_token);
      } else if (hasFetchedInitialHistoryForSessionRef.current) {
        console.log('[AssistantContext] Auth state changed, but initial history already fetched/attempted for this session.');
      } else if (isFetchingHistoryRef.current) {
        console.log('[AssistantContext] Auth state changed, but a fetch is already in progress.');
      }
    } else { 
      console.log('[AssistantContext] No user/session, or session invalid. Checking localStorage for fallback.');
      
      // Try to restore from localStorage if available, otherwise clear messages
      if (!restoreMessagesFromLocalStorage()) {
        setDisplayMessages([]);
        setApiLogMessages([]);
        sessionStorage.removeItem('elber_welcome_handled_in_session');
      }
      hasFetchedInitialHistoryForSessionRef.current = false; 
    }
  }, [user, session, isAuthLoading, fetchChatHistory, restoreMessagesFromLocalStorage]);

  const refreshChat = useCallback(async (): Promise<void> => {
    console.log('[AssistantContext] refreshChat: Refreshing chat locally and in DB.');
    
    setDisplayMessages([]);
    setApiLogMessages([]);
    // Clear localStorage backup
    localStorage.removeItem(LOCAL_DISPLAY_MESSAGES_KEY);
    localStorage.removeItem(LOCAL_API_MESSAGES_KEY);
    
    // Set a specific flag to indicate chat was manually reset
    // This is different from the welcome handled flag and prevents welcome from showing after reset
    sessionStorage.setItem('elber_chat_manually_reset', 'true');
    // Keep the welcome handled flag to prevent welcome message after refresh
    sessionStorage.setItem('elber_welcome_handled_in_session', 'true');
    
    setIsLoadingHistory(true); 
    setErrorHistory(null);

    try {
      if (user && session?.access_token) { 
        try {
          const response = await fetch('/.netlify/functions/chat-history', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${session.access_token}` },
          });
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({})); // Safely parse error
            console.error('[AssistantContext] refreshChat: Failed to delete chat history from DB:', response.status, errorData.message || 'No error message');
            setErrorHistory(`Failed to clear history in DB: ${response.statusText} ${errorData.message || ''}`);
            throw new Error(`Failed to clear history: ${response.statusText}`);
          } else {
            console.log('[AssistantContext] refreshChat: Successfully cleared chat history from DB.');
          }
        } catch (err) {
          console.error('[AssistantContext] refreshChat: Error deleting chat history from DB:', err);
          setErrorHistory(err instanceof Error ? err.message : 'Error clearing history in DB.');
          throw err; // Re-throw to allow caller to handle
        }
      } else {
        console.log('[AssistantContext] refreshChat: No user/session to clear DB history.');
      }
      
      // Don't add initial greeting message after reset - this is intentional
      // We want a completely empty chat after reset
      
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [user, session]);

  const saveChatMessageToDb = async (message: StoredChatMessage) => {
    // ... (saveChatMessageToDb implementation - assumed to be largely okay but ensure it uses user.id and session.access_token from context) ...
    // This function should ideally be robust against no session, but core logic is outside this refactor's scope
    // For now, ensure it has access to user and session if it needs to make authenticated calls
    if (!user || !session?.access_token) {
      console.warn('[AssistantContext] saveChatMessageToDb: No user/session, cannot save to DB.');
      return;
    }
    try {
      // console.log('[AssistantContext] Attempting to save message to DB:', message);
      await fetch('/.netlify/functions/chat-history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(message),
      });
      // console.log('[AssistantContext] Message save response:', response.status);
    } catch (error) {
      console.error('[AssistantContext] Error saving chat message to DB:', error);
    }
  };

  const addDisplayMessage = async (content: string, role: 'user' | 'assistant' | 'system', id?: string) => {
    const newMessageId = id || uuidv4();
    const newMessage: ChatMessage = {
      id: newMessageId,
      role,
      content,
      timestamp: new Date().toISOString(),
    };
    
    // Update state
    setDisplayMessages(prev => {
      const updatedMessages = [...prev, newMessage];
      // Save to localStorage for persistence during session issues
      saveMessagesToLocalStorage(updatedMessages, apiLogMessages);
      return updatedMessages;
    });
    
    // Also save to server if session is available
    await saveChatMessageToDb({ type: 'display', data: newMessage });
    
    // When a message is added, welcome is considered handled.
    sessionStorage.setItem('elber_welcome_handled_in_session', 'true');
  };

  const addApiLogMessage = async (role: 'system' | 'user' | 'assistant', content: string) => {
    const newMessage: ApiLogMessage = {
      role,
      content,
    };
    
    // Update state
    setApiLogMessages(prev => {
      const updatedMessages = [...prev, newMessage];
      // Save to localStorage for persistence during session issues
      saveMessagesToLocalStorage(displayMessages, updatedMessages);
      return updatedMessages;
    });
    
    // Also save to server if session is available
    await saveChatMessageToDb({ type: 'api_log', data: newMessage });
  };

  return (
    <AssistantContext.Provider value={{
      displayMessages,
      setDisplayMessages,
      apiLogMessages,
      setApiLogMessages,
      addDisplayMessage,
      addApiLogMessage,
      refreshChat,
      isLoadingHistory,
      errorHistory,
      restoreMessagesFromLocalStorage
    }}>
      {children}
    </AssistantContext.Provider>
  );
};

// Custom hook to use the AssistantContext
export const useAssistantChat = (): AssistantContextType => {
  const context = useContext(AssistantContext);
  if (context === undefined) {
    throw new Error('useAssistantChat must be used within an AssistantChatProvider');
  }
  return context;
};
