# Contact Search Optimization Guide

## Issue: Contact Search Taking Too Long

If the contact search is taking too long to return results, follow this troubleshooting guide.

## Quick Solution

The system now includes instant search for simple contact queries. This bypasses OpenAI and returns results in < 200ms.

### Enable Instant Search

1. Set environment variable: `FAST_CONTACT_SEARCH_ENABLED=true`
2. Instant search automatically handles queries like:
   - "find John Doe"
   - "look up contact info for Sarah"
   - "who is Mike Johnson"
   
### Database Optimization (if needed)

If the database itself is slow:

1. Go to your Supabase SQL Editor
2. Run the script in `apply_contact_search_optimization.sql`
3. This will create the optimized search function and all necessary indexes

## Architecture Overview

The optimized contact search uses:
1. PostgreSQL Full-Text Search (FTS) with GIN indexes
2. Trigram indexes for fuzzy matching
3. In-memory caching in the serverless function
4. Pagination with infinite scroll
5. Debounced search to reduce API calls

## Components

### Database Level
- **Function**: `search_contacts_optimized` - Returns complete contact records with match scores
- **Indexes**: 
  - `idx_contacts_fts` - GIN index on `fts_document` column
  - Trigram indexes for fuzzy matching
  - Compound index on `user_id` and `updated_at`

### Backend Level
- **Function**: `contacts-search.ts` - Handles search with caching
- **Cache**: 5-minute TTL in-memory cache
- **Pagination**: Limits results to 50-100 per request

### Frontend Level
- **Component**: `ContactsPageOptimized.tsx` - Uses search context
- **Context**: `ContactsSearchContext.tsx` - Manages search state
- **API**: `contactSearchApi.ts` - Debounced search utility
- **Features**: Infinite scroll, 300ms search debounce

## Performance Troubleshooting

### 1. Check Database Function
```sql
-- Verify the function exists
SELECT proname FROM pg_proc WHERE proname = 'search_contacts_optimized';

-- Test the function directly
SELECT * FROM search_contacts_optimized(
  'YOUR_USER_ID_HERE'::uuid,
  'rose hollis',
  50,
  0
);
```

### 2. Check Indexes
```sql
-- Check if FTS index exists
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'contacts' 
AND indexname LIKE '%fts%';

-- Check index usage
EXPLAIN ANALYZE 
SELECT * FROM contacts 
WHERE user_id = 'YOUR_USER_ID' 
AND fts_document @@ plainto_tsquery('english', 'rose hollis');
```

### 3. Backend Investigation

Check the logs for timing issues:
```bash
npm run logs:contacts-search
```

Common issues:
- Missing FTS indexes (should be created by migration)
- Fallback to basic search if optimized function missing
- Cache misses on first search

### 4. Frontend Investigation

Check browser console for:
- Network timing for `/contacts-search` endpoint
- Search debouncing working (300ms delay)
- Infinite scroll triggering properly

### 5. Quick Fixes

1. **Rebuild FTS indexes**:
```sql
-- Force rebuild of FTS document
UPDATE contacts SET fts_document = to_tsvector('english',
  coalesce(first_name, '') || ' ' ||
  coalesce(last_name, '') || ' ' ||
  coalesce(email, '') || ' ' ||
  coalesce(phone, '') || ' ' ||
  coalesce(company, '') || ' ' ||
  coalesce(job_title, '') || ' ' ||
  coalesce(notes, '')
);

-- REINDEX
REINDEX INDEX idx_contacts_fts;
```

2. **Clear cache**: The in-memory cache has a 5-minute TTL. Wait or restart the function.

3. **Check component usage**: Ensure the app is using `ContactsPageOptimized` not the original `ContactsPage`.

## Performance Expectations

With optimization:
- First search: 200-500ms (cache miss)
- Subsequent searches: 50-100ms (cache hit)
- Pagination: <100ms per page
- UI should feel instant with debouncing

## Migration Verification

Ensure all migrations are applied:
```sql
-- Check if the FTS column exists
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'contacts' 
AND column_name = 'fts_document';

-- Check if triggers exist for auto-updating FTS
SELECT trigger_name 
FROM information_schema.triggers 
WHERE event_object_table = 'contacts';
```

## Next Steps

If issues persist:
1. Add query performance monitoring (TODO)
2. Consider implementing connection pooling (TODO)
3. Evaluate moving to a dedicated search service for very large datasets

## Related Files

- Database migration: `src/backend/database/migrations/11_optimize_contact_search.sql`
- Backend function: `src/backend/functions/contacts-search.ts`
- Frontend page: `src/frontend/pages/ContactsPageOptimized.tsx`
- Search context: `src/frontend/context/ContactsSearchContext.tsx`
- Search API: `src/frontend/utils/contactSearchApi.ts`