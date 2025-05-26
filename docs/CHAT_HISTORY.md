# Chat History System Architecture

This document details the architecture and implementation of the chat history system in the Elber platform.

## Overview

The chat history system provides a secure, user-specific way to persist conversation histories in the Elber assistant. It employs a database-backed approach with local caching to ensure data integrity and availability even in unstable network conditions.

## Key Components

### 1. Database Schema

The system uses the `conversation_history` table in the Supabase database:

```sql
CREATE TABLE IF NOT EXISTS public.conversation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- References an abstract user concept
    message_object JSONB NOT NULL, -- Stores the complete message object
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for efficient querying by user_id and creation time
CREATE INDEX IF NOT EXISTS idx_conversation_history_user_id_created_at 
ON public.conversation_history (user_id, created_at);

-- Enable Row Level Security
ALTER TABLE public.conversation_history ENABLE ROW LEVEL SECURITY;

-- Users can only access their own conversation history
CREATE POLICY "Users can manage their own conversation history"
  ON public.conversation_history FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow service_role to bypass RLS
CREATE POLICY "Allow service_role to bypass RLS"
  ON public.conversation_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

### 2. Message Types

The system supports two types of messages, both stored in the `message_object` JSONB column:

1. **Display Messages**: Messages shown in the UI to the user, containing:
   - `id`: Unique identifier (UUID)
   - `role`: Either 'user', 'assistant', or 'system'
   - `content`: The message text (supports markdown)
   - `timestamp`: ISO 8601 timestamp

2. **API Log Messages**: Messages used for conversation context with the AI but not necessarily displayed to the user:
   - `role`: Either 'user', 'assistant', or 'system'
   - `content`: The message text

These are wrapped in a `StoredChatMessage` type which includes a type discriminator:

```typescript
type StoredChatMessage = 
  | { type: 'display'; data: ChatMessage }
  | { type: 'api_log'; data: ApiLogMessage };
```

### 3. Backend API (`chat-history.ts`)

The `/api/chat-history` endpoint provides CRUD operations for chat history:

- **GET**: Fetches all chat messages for the authenticated user
- **POST**: Saves a new message to the database
- **DELETE**: Clears all chat history for the authenticated user

All endpoints are secured with authentication and Row Level Security to ensure users can only access their own data.

### 4. Frontend Integration

The chat history system integrates with the frontend through:

1. **`AssistantChatContext`**: React context that provides:
   - State management for display and API messages
   - Methods to add messages of both types
   - Database synchronization via direct fetch calls to `/api/chat-history`
   - Error handling and local storage fallback
   - Automatic history loading on user authentication

2. **Direct API Integration**: The context makes authenticated fetch calls directly to the backend endpoints for:
   - Loading chat history on login
   - Saving new messages in real-time
   - Clearing conversation history

## Security Considerations

1. **Authentication**: All API endpoints require a valid JWT token.
2. **Row Level Security**: Database policies ensure users can only access their own data.
3. **Input Validation**: Messages are validated on both client and server sides.
4. **Error Handling**: Proper error handling prevents information leakage.

## Data Flow

1. When a user logs in, their chat history is automatically loaded from the database.
2. New messages are saved to the database in real-time as they are created.
3. If database operations fail, the system falls back to localStorage for temporary persistence.
4. When a user refreshes the chat, all messages are deleted from the database.

## Fallbacks and Resilience

The system includes several mechanisms to ensure data integrity:

1. **Optimistic Updates**: UI updates immediately while database operations happen in the background.
2. **Error Recovery**: Failed operations are logged and don't break the user experience.
3. **Local Storage Backup**: Messages are also saved to localStorage as a backup.
4. **Consistent Response Format**: All API responses follow a consistent format with proper status codes.

## Future Improvements

Potential enhancements to consider:

1. **Pagination**: For users with extensive chat histories, implement pagination to improve performance.
2. **Offline Support**: Further enhance offline capabilities with service workers and better synchronization.
3. **Message Batching**: Batch message operations to reduce API calls.
4. **Conflict Resolution**: Implement more robust conflict resolution for multi-device scenarios.
5. **Message Archiving**: Add functionality to archive older conversations instead of just deleting them.

## Troubleshooting

Common issues and solutions:

1. **Missing Messages**: Check user authentication and Row Level Security policies.
2. **Slow Performance**: Consider indexing strategies and pagination for large histories.
3. **Network Errors**: The system will fall back to localStorage - check network connectivity.

## API Reference

The chat history API endpoints are available at `/.netlify/functions/chat-history`:

- **GET**: Fetch all messages for authenticated user
- **POST**: Save a new message (requires `StoredChatMessage` in body)
- **DELETE**: Clear all messages for authenticated user

All endpoints require Bearer token authentication.