# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Elber is an AI-Powered Customer Relationship Management (CRM) platform with core features:
- AI Assistant with intelligent message routing using OpenAI function calling
- Calendar Management with recurring events support
- Contacts Management with bulk import capabilities
- User Authentication with enhanced security and email verification
- Privacy Settings and Display Preferences

### Recent Performance Optimizations
- Contact search optimization: 25-30x improvement (< 200ms response time)
- Implemented smart routing for direct database queries on simple searches
- See `CONTACT_SEARCH_PERFORMANCE_SOLUTION.md` for details

### MAJOR ARCHITECTURAL OVERHAUL (2025-01)

#### 🔄 Complete Assistant System Rewrite
- **DELETED**: 7 specialized assistant functions (`assistant-alerts.ts`, `assistant-calendar.ts`, `assistant-contacts.ts`, `assistant-fast.ts`, `assistant-general.ts`, `assistant-settings.ts`, `assistant-unified-router.ts`)
- **NEW**: Single unified `assistant.ts` (1,920+ lines) with:
  - Universal `execute_operation` tool handling ALL CRM operations
  - Built-in conversation state management and OpenAI API integration
  - Comprehensive system prompt with Elber personality and extensive operation rules
  - Timezone-aware event handling and date validation
  - Automatic duplicate detection and management workflows

#### 🎨 Complete Frontend Reorganization
- **DELETED**: Flat component structure (25+ individual component files)
- **NEW**: Organized component architecture:
  - `components/auth/`, `components/calendar/`, `components/common/`, `components/contacts/`
  - `components/forms/`, `components/import/`, `components/layout/`, `components/modals/`, `components/settings/`
  - `pages/auth/`, `pages/main/`, `pages/settings/`
  - `hooks/calendar/`, `hooks/contacts/`, `hooks/forms/`, `hooks/settings/`, `hooks/table/`

#### 🎨 SCSS Architecture Overhaul
- **DELETED**: 30+ individual SCSS files
- **NEW**: Professional SCSS architecture:
  - `styles/abstracts/` (variables, mixins)
  - `styles/base/` (reset, typography)
  - `styles/components/` (component-specific styles)
  - `styles/layouts/` (layout structures)
  - `styles/pages/` (page-specific styles)
  - `styles/themes/` (theme variants)
  - `styles/utils/` (utility classes)

#### 🔧 New Service Layer
- **NEW Services**: `calendarQuickActions.ts`, `calendarSmartRouter.ts`, `contactsSmartRouter.ts`, `memoryManager.ts`
- **NEW Utilities**: `badgeHelpers.ts`, `countryLocaleMapping.ts`, `contactFilters.ts`, `timezoneUtils.ts`
- **NEW Context**: `AlertsContext.tsx`, `AssistantContext.tsx` (replaced `AssistantChatContext.tsx`)
- **NEW Function**: `google-calendar.ts` for enhanced calendar integration

#### 🕐 Alerts & Timezone Management (Recently Implemented)
- **NEW**: Complete alerts management system with full CRUD operations
- **NEW**: Enhanced timezone utilities addressing UTC display issues
- **NEW**: Smart time display with "Today", "Tomorrow", relative times
- **NEW**: Timezone-aware datetime inputs and conversions
- See `docs/FRONTEND_IMPLEMENTATION.md` for detailed implementation guide

## Build/Test Commands

### Development
```bash
# Frontend development server
npm run dev --prefix src/frontend

# Backend (Netlify Functions) - primary for full-stack development
netlify dev

# Backend with debug logs
npm run dev:debug
# or
NETLIFY_FUNCTIONS_LOG_LEVEL=debug netlify dev

# View function logs
npm run logs:all
npm run logs:login
npm run logs:settings
npm run logs:contacts-management
npm run logs:assistant-calendar
```

### Building & Deployment
```bash
# Build everything
npm run build

# Frontend only
npm run build:frontend

# Backend only
npm run build:backend

# Full deploy (build + Netlify + Supabase)
npm run netlify:deploy

# Build without deploy
npm run netlify:build
```

### Linting & Type Checking
```bash
# Frontend
npm run lint --prefix src/frontend
# or 
npm run lint:frontend
tsc --noEmit --project src/frontend/tsconfig.json

# Backend
npm run lint --prefix src/backend
# or
npm run lint:backend
tsc --noEmit --project src/backend/tsconfig.json

# Both frontend and backend
npm run lint
```

### Testing

#### Frontend Testing (Configured)
- **Framework**: Vitest + React Testing Library
- **Test setup**: `src/frontend/src/test-setup.ts` (comprehensive mocking setup)
- **Coverage**: V8 provider with 70% thresholds
- **Existing tests**: `src/frontend/utils/SearchMatchType.test.ts`
- **Config Location**: Vitest config is in `src/frontend/vite.config.ts` (integrated)

```bash
# Frontend tests (must run from src/frontend directory or use --prefix)
npm run test --prefix src/frontend          # Watch mode
npm run test:run --prefix src/frontend      # Single run
npm run test:coverage --prefix src/frontend # With coverage
npm run test:ui --prefix src/frontend       # UI mode
npm run test:watch --prefix src/frontend    # Alternative watch mode
```

#### Backend Testing (TODO)
- **⚠️ No backend tests configured yet**
- Proposed: Jest for Netlify Functions
- Proposed: E2E tests with Playwright for critical user journeys

## Architecture

### Tech Stack
- **Frontend**: React 18, TypeScript 5, Vite 5, SCSS (Mobile-first)
- **Backend**: Node.js, TypeScript 5 (Serverless Netlify Functions)
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Authentication**: Supabase Auth with custom email verification
- **AI Services**: OpenAI API (gpt-4o-mini default)
- **Deployment**: Netlify (frontend + functions), Supabase (database + edge functions)

### Monorepo Structure
```text
/
├── src/frontend/        # React frontend (builds to src/frontend/dist/)
├── src/backend/         # TypeScript functions (builds to netlify/functions/)
├── supabase/functions/  # Supabase Edge Functions
├── netlify/functions/   # Compiled backend functions (generated)
├── scripts/            # Deployment and utility scripts
├── netlify.toml        # Netlify configuration
└── package.json        # Root package with npm workspaces
```

### NPM Workspaces
The project uses npm workspaces to manage frontend and backend packages:
- Root `package.json` defines workspaces: `["src/frontend", "src/backend"]`
- Dependencies are hoisted to root `node_modules` where possible
- Run `npm install` from root to install all dependencies
- **Important**: Always install dependencies from the root directory to maintain workspace consistency

## Critical System Architecture

### Assistant System (Unified Architecture)

The application uses a unified assistant architecture for AI operations:

#### Frontend Router (`src/frontend/utils/assistantRouter.ts`)
- Simplified router that always routes to the unified assistant endpoint
- Tracks conversation state and pending confirmations
- Sanitizes messages for OpenAI API compatibility
- Handles `pendingConfirmation` object for confirmation workflows

#### Unified Backend Function (`src/backend/functions/assistant.ts`)
- **MASSIVE 1,920+ line function** that replaced 7 specialized assistant functions
- Single `execute_operation` tool with comprehensive universal parameter schema
- **Built-in conversation state management** with in-memory state storage and cleanup
- **Complete operation types**:
  - `contact` (create, read, update, delete, search with intelligent duplicate detection)
  - `calendar` (create, read, update, delete with timezone validation and past-event prevention)
  - `alert` (create, search, list with priority management)
  - `settings` (read, update user preferences)
  - `duplicate_management` (analyze, delete with smart field counting)
  - `general` (help and information)
- **Advanced Features**:
  - Automatic timezone handling and date validation
  - Smart duplicate detection triggered on multiple contact matches
  - Elber personality system with 500+ line system prompt
  - Built-in confirmation workflows for destructive operations
  - Advanced search patterns with full-name vs single-word detection

#### Tool Call Processing Flow
1. User message → `AssistantPage` → `assistantRouter.ts`
2. Always routes to `/assistant` endpoint
3. OpenAI calls `execute_operation` tool with universal parameters
4. Backend internally dispatches to appropriate operation handler
5. Tool results sent back to OpenAI
6. Final response with markdown rendering

### Contact Search Architecture
The application features a highly optimized contact search system with a 25-30x performance improvement:

1. **Smart Router** (`src/frontend/services/contactsSmartRouter.ts`)
   - Analyzes user queries to determine execution path
   - Routes simple searches directly to optimized backend
   - Handles complex queries through full AI pipeline

2. **Unified Search Function** (`src/backend/functions/contacts-search.ts`)
   - Handles both instant and AI-powered search in single endpoint
   - Direct database queries for simple searches
   - < 200ms response time vs 5-6 seconds previously

3. **Fast Formatting Layer** (`src/backend/services/fastContactFormatter.ts`)
   - Consistent markdown formatting for contact data
   - No AI processing required for standard responses
   - Provides uniform output regardless of search path

4. **AI Integration** (For complex queries)
   - Routes complex queries through the unified assistant system
   - Maintains full AI capabilities when needed
   - Seamless fallback for queries requiring natural language understanding

### Database Schema & Security
- **Core Tables**: profiles, calendar_events, contacts, conversation_history, verification_codes, rate_limit_attempts
- **RLS Policies**: All tables enforce `is_custom_verified = true` in profiles
- **Email Verification**: Required for all user data access
- **Indexing**: Optimized for user_id lookups and timestamp ordering
- **Rate Limiting**: Progressive rate limiting with service_role access for administrative functions

## Code Standards

### TypeScript Requirements
- **Strict mode enabled**: NO `any` types allowed - 100% type coverage
- **All props**: Must have TypeScript interfaces
- **Import order**:
  1. React/external libraries
  2. Internal modules (@services/*, @types/*)
  3. Local/relative imports
- **Path aliases**: Backend uses @services/* and @types/*
- **Type safety**: MUST achieve 100% type-safe status

### ESLint Configuration
- Frontend: React rules, warns on unused vars with `_` prefix
- Backend: Strict TypeScript, explicit return types required
- Both: No non-null assertions, prefer const

### Component Structure (REORGANIZED)
- **Functional components only** with TypeScript interfaces for all props
- **Organized by domain**:
  - `auth/` - Authentication-related components (ProtectedRoute, RouterChangeListener)
  - `calendar/` - Calendar-specific components (CalendarGrid, EventsList)
  - `common/` - Shared/reusable components (Button, Spinner, Badge, etc.)
  - `contacts/` - Contact management components (ContactsHeader, ContactsList, etc.)
  - `forms/` - Form-related components (FormField, EventFormFields, etc.)
  - `import/` - Import functionality (ContactManagementPanel, GoogleContactsImport)
  - `layout/` - Layout components (Header)
  - `modals/` - All modal components centralized (AssistantResponseModal, etc.)
  - `settings/` - Settings-specific components (DisplayPreferencesSection, etc.)
- **SCSS Architecture**: Professional structure with abstracts, base, components, layouts, pages, themes, utils
- **Dark theme UI** (dark blue/charcoal with pink accents)

## Key Implementation Patterns

### OpenAI Message Sanitization
Always ensure message content is never null:
```typescript
// Required pattern for OpenAI API
const sanitizedMessage = {
  ...message,
  content: message.content ?? '',  // Convert null to empty string
  ...(message.tool_calls && { tool_calls: message.tool_calls })
};
```

### Confirmation Workflows
Critical for delete operations:
```typescript
// Define confirmation context
const confirmationContext: ConfirmationContext | null = pendingConfirmation ? {
  entityId: pendingConfirmation.entityId,
  entityName: pendingConfirmation.entityName || 'Unknown',
  type: pendingConfirmation.type,
  actionType: pendingConfirmation.actionType
} : null;
```

### OpenAI-Based Confirmation Analysis
NEVER use regex patterns or hard-coded word lists for confirmation detection:
```typescript
// Use OpenAI's language understanding for confirmation analysis
async function analyzeConfirmation(
  userMessage: string,
  context: { actionType: string; itemName: string }
): Promise<ConfirmationStatus> {
  // OpenAI API call to analyze confirmation intent
  // Returns 'confirmed', 'denied', or 'ambiguous'
}
```

### Supabase User Metadata Updates
Handle version compatibility with fallback:
```typescript
// Try different parameter formats
try {
  await updateUser({ meta: updatedMetadata });         // Newer versions
} catch {
  try {
    await updateUser({ user_metadata: updatedMetadata }); // Some versions
  } catch {
    await updateUser({ data: updatedMetadata });        // Older versions
  }
}
```

### API Request Patterns
All API calls should include proper error handling:
```typescript
try {
  const response = await fetch(`/.netlify/functions/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
  
  return await response.json();
} catch (error) {
  console.error(`Error calling ${functionName}:`, error);
  throw error;
}
```

### State Management Best Practices
Based on lessons learned from `SETTINGS_SYNC_DEBUG_NOTES.md`:

#### Single Source of Truth
- Use dedicated service functions (e.g., `userSettingsService.getPrivacySettings()`) as the primary source for initialization
- The same function should handle refresh/synchronization events

#### Event-Driven Updates
Use custom DOM events for state synchronization:
```typescript
// Dispatch from service layer
window.dispatchEvent(new CustomEvent('settings-refreshed', { detail: newSettings }));

// Listen in components/hooks
useEffect(() => {
  const handleRefresh = (event: CustomEvent) => {
    setState(event.detail);
  };
  window.addEventListener('settings-refreshed', handleRefresh);
  return () => window.removeEventListener('settings-refreshed', handleRefresh);
}, []);
```

## Environment Variables

Required in `.env`:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: "gpt-4o-mini")
- `FRONTEND_URL`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `REDIRECT_URI`

Optional for deployment:
- `NETLIFY_SITE_ID`
- `NETLIFY_AUTH_TOKEN`
- `SUPABASE_ACCESS_TOKEN` (required for edge function deployment)

Performance optimization:
- `FAST_CONTACT_SEARCH_ENABLED` (default: true)
- `RESPONSE_CACHING_ENABLED` (default: true)
- `CONTACT_SUMMARY_THRESHOLD` (default: 5)
- `CACHE_TIME_TO_LIVE` (default: 300000)

## Development Workflow

### Netlify Functions Development
1. Functions source in `src/backend/functions/`
2. TypeScript compiles to `netlify/functions/`
3. `fix-import-paths.js` resolves path aliases post-build
4. Each function exports typed `handler`
5. Always validate request body with TypeScript interfaces

### Build Process
1. Frontend: Vite → `src/frontend/dist/`
2. Backend: TypeScript → `netlify/functions/`
3. Path alias resolution: @services/*, @types/* (fixed by `fix-import-paths.js` post-build)
4. Netlify serves both static files and functions
5. **Build Script Safety**: The `netlify_build_and_deploy.sh` script includes recursive execution prevention using a flag file

### Debugging
- Function logs: `npm run logs:<function-name>`
- All logs: `npm run logs:all`
- Debug mode: `NETLIFY_FUNCTIONS_LOG_LEVEL=debug netlify dev`
- Frontend: Browser DevTools with Vite HMR

### Testing Contact Search Performance
To verify the contact search optimization is working:
1. Enter a simple contact search in the Assistant UI (e.g., "find John Doe")
2. Check browser console for smart routing logs
3. Observe response time < 200ms (vs 5-6 seconds previously)
4. For more details, see `CONTACT_SEARCH_PERFORMANCE_SOLUTION.md`

## Common Issues & Solutions

### "content must be string" error
Ensure all message content is string:
```typescript
content: msg.content ?? ''
```

### Missing function parameters
Check tool schemas match TypeScript interfaces and include all required fields.

### Supabase metadata compatibility
Use fallback pattern for different Supabase versions (see patterns above).

### Function call validation errors
Ensure all required parameters are included in tool calls:
```typescript
// Always include all required parameters
JSON.stringify({
  contact_id: contactId,
  confirm: true,
  contact_name: contactName || 'unknown contact'
})
```

### Tool Schema and Type Consistency
When working with OpenAI function calling, ensure complete consistency between:
1. JSON Schema Definition (sent to OpenAI API)
2. TypeScript Interface definitions
3. Tool implementations
4. Tool call construction code

All required parameters must be consistently defined and included.

### Recursive Build Script
The `netlify_build_and_deploy.sh` script uses a flag file to prevent recursive execution:
```bash
FLAG_FILE="/tmp/netlify_build_running.flag"
if [ -f "$FLAG_FILE" ]; then
  echo "⚠️ Build script detected recursive execution. Skipping duplicate run."
  exit 0
fi
```

### Confirmation Flow Error (Schema Mismatch)
If you encounter a 400 error with "Missing 'contact_name'" when confirming deletions:
1. Ensure all confirmation tools include all required parameters
2. Check that tool schemas and TypeScript interfaces are in sync
3. Verify tool call construction includes all required fields
4. See `NEXT_STEPS.md` for the complete fix pattern

## Security Considerations

### Authentication Security
- Custom email verification required
- Generic error messages prevent enumeration
- Timing attack prevention
- RLS policies enforce verification

### Row Level Security
All user tables require:
```sql
EXISTS (
  SELECT 1 FROM profiles 
  WHERE id = auth.uid() AND is_custom_verified = true
)
```

### User Enumeration Prevention
- Signup with existing email redirects to forgot password
- Consistent timing for all auth operations
- Generic success messages ("If an account exists...")

### Rate Limiting Implementation
Recent additions include:
- Service role RLS policy for rate limit table
- Progressive blocking for repeated violations
- Security definer functions for administrative access
- See `supabase/migrations/20250521000000_add_service_role_rls_for_rate_limit.sql`

## Critical TODOs (Priority Order)

### 1. Testing Coverage Expansion (HIGH PRIORITY)
- ✅ Frontend testing framework configured (Vitest + React Testing Library)
- ✅ Basic tests exist with 70% coverage thresholds
- ❌ Backend testing framework not configured (Jest needed for Netlify Functions)
- ❌ E2E testing not configured (Playwright proposed for critical user journeys)
- Current coverage: Minimal (only utility tests exist)
- Target: 80%+ code coverage across all components and services
- **Note**: See `TODO.md` for detailed testing implementation plan

### 2. Authentication Security
- Add rate limiting on auth endpoints
- Implement stronger password requirements
- Add multi-factor authentication
- Implement CSRF protection

### 3. Performance Optimization
- ✅ Contact search optimization (COMPLETED - 25-30x improvement)
- Implement request batching
- Add code splitting (partial implementation in vite.config.ts with manual chunks)
- Reduce bundle size (current config: manual chunks for vendor, supabase, ui, utils)

### 4. Error Handling
- Add React error boundaries
- Improve error recovery
- Prevent app-wide crashes

### 5. Scalability Issues
- Add pagination for history
- Remove source maps in production
- Implement lazy loading
- Add message compression

## Key Codebase Locations

### Core Architecture
- **Assistant System**: `src/frontend/utils/assistantRouter.ts`, `src/backend/functions/assistant.ts`
- **Universal Tool**: Single `execute_operation` tool defined in assistant function
- **Authentication**: `src/backend/functions/login.ts`, `src/backend/functions/signup.ts`

### Database & Persistence
- **Database Migrations**: `src/backend/database/migrations/`
- **Supabase Admin**: `src/backend/services/supabaseAdmin.ts`

### Services
- **Email Service**: `src/backend/services/emailService.ts`
- **Rate Limiter**: `src/backend/services/rateLimiter.ts`
- **Performance Solutions**: `src/backend/services/fastContactFormatter.ts`, `src/frontend/services/contactsSmartRouter.ts`

### Frontend Components (REORGANIZED)
- **Assistant Chat UI**: `src/frontend/pages/main/AssistantPage.tsx`
- **Contact Management**: `src/frontend/pages/main/ContactsPage.tsx`, `src/frontend/components/import/ContactManagementPanel.tsx`
- **Calendar Interface**: `src/frontend/pages/main/CalendarPage.tsx`
- **Settings**: `src/frontend/pages/settings/SettingsPage.tsx`
- **Authentication**: `src/frontend/pages/auth/` (LoginPage, SignupPage, ForgotPasswordPage, etc.)
- **Common Components**: `src/frontend/components/common/` (Button, Spinner, Modal, etc.)
- **Modals**: `src/frontend/components/modals/` (all modal components centralized)

## Development Best Practices

### Core Development Rules
1. **NEVER use `any` type** - maintain 100% type safety
2. **NEVER use hardcoded confirmation patterns** - use OpenAI API for NLU
3. **Always add type safety** for all function parameters and returns
4. **Follow existing code patterns** - check similar files before implementing
5. **Test all edge cases** manually until testing framework is implemented
6. **Handle errors gracefully** with user-friendly messages
7. **Log appropriately** for debugging without exposing sensitive data
8. **Maintain RLS consistency** - all queries must respect verification status
9. **Use npm workspaces** - install dependencies from root, not individual packages
10. **Check imports** - ensure path aliases resolve correctly after builds
11. **Commit early and often** - break down large tasks into logical milestones
12. **Performance focus** - utilize optimized contact search flow for simple queries
13. **Security first** - follow user enumeration prevention patterns in authentication flows

### NEW Component Organization Rules (Post-Reorganization)
14. **Place components in correct domain folders** - don't create new flat files in `components/`
15. **Follow the organized import patterns** - use proper relative paths based on folder structure
16. **Reuse common components** - check `components/common/` before creating duplicates
17. **Centralize modals** - all modal components go in `components/modals/`
18. **Keep SCSS organized** - use the new abstracts/base/components/layouts/pages/themes/utils structure
19. **Use the unified assistant system** - ALL AI operations go through single `/assistant` endpoint

### Assistant System Rules (Post-Consolidation)
20. **Single assistant endpoint** - Never create new specialized assistant functions
21. **Use universal tool schema** - All operations use `execute_operation` with proper `operation_type`
22. **Leverage built-in duplicate detection** - Don't bypass the automatic duplicate analysis
23. **Follow timezone patterns** - Use the built-in timezone validation for calendar operations
24. **Respect conversation state** - The system manages conversation context automatically

## Quick Reference

### Frontend Path Alias & Import Patterns
```typescript
// vite.config.ts not configured for path aliases
// Use relative imports with organized structure:

// From pages/main/ importing contexts:
import { AuthContext } from '../../context/AuthContext';

// From components/common/ importing other components:
import Button from './Button';
import Modal from '../modals/Modal';

// From pages/ importing components:
import Button from '../../components/common/Button';
import ContactsHeader from '../../components/contacts/ContactsHeader';
```

### Backend Path Aliases
```typescript
// tsconfig.json configured with:
"@services/*": ["services/*"]
"@types/*": ["types/*"]
"@utils/*": ["utils/*"]
"@functions/*": ["functions/*"]
"@shared/*": ["functions/_shared/*"]

// Example usage:
import { supabaseAdmin } from '@services/supabaseAdmin';
import { Contact } from '@types/domain';
import { validateEmail } from '@utils/validation';
import { intelligentContactTool } from '@shared/intelligentContactTool';
```

### Common Errors and Solutions

#### "Cannot find module '@services/...'"
Solution: Run `npm run build:backend` to compile TypeScript and fix import paths

#### "content must be string" (OpenAI API)
Solution: Use `content: message.content ?? ''` to handle null values

#### Build fails with TypeScript errors
Solution: Check that all workspaces have their dependencies installed: `npm install` from root

#### Function logs not showing
Solution: Use `npm run logs:<function-name>` or check Netlify dashboard

#### Schema/Type mismatch with OpenAI function calls
Solution: Ensure consistency between JSON schemas, TypeScript interfaces, and tool implementations

## Troubleshooting State Management Issues

When dealing with state management issues (especially in settings):

1. **Check for multiple sources of truth**: Look for conflicts between local state, hooks, `localStorage` and server data
2. **Use centralized service functions**: All core data fetch/save logic should live in a dedicated service
3. **Implement event-driven updates**: Use custom DOM events for state synchronization
4. **Simplify effect dependencies**: Reduce complex dependencies in useEffect hooks
5. **Add logging with prefixes**: Use descriptive prefixes (e.g., "[UserSettingsService]") for easier debugging
6. **Look for race conditions**: Check if async operations are completing out of order

For more details, see `docs/SETTINGS_SYNC_DEBUG_NOTES.md`