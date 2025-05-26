// src/backend/functions/contacts-search.ts (unified search & instant search)
import type { Handler, HandlerEvent, HandlerContext, HandlerResponse } from "@netlify/functions";
import { getUserIdFromEvent } from './_shared/utils';
import { supabaseAdmin } from '../services/supabaseAdmin';
import { FastContactFormatter } from '@services/fastContactFormatter';
import type { Contact } from '../types/domain';
import {
  ContactSearchParams,
  ContactSearchResponse,
  SearchMatchType,
  determineMatchType,
  prioritizeContactsByMatchType
} from '../types/search';
import { getCacheTTL, CACHE_CLEANUP_CONFIG } from '../utils/cacheConfig';

// Constants using centralized config
const CACHE_TTL = getCacheTTL('search'); // Use centralized config for search operations
const QUERY_TIMEOUT_MS = CACHE_CLEANUP_CONFIG.QUERY_TIMEOUT_MS;
const COMMON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, max-age=0',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info'
};

// Extend ContactSearchParams for unified functionality
declare module '../types/search' {
  interface ContactSearchParams {
    forceRefresh?: boolean;
    currentUserEmail?: string | null;
    job_title_keywords?: string[] | null;
    // Unified search parameters
    format?: 'standard' | 'instant' | 'formatted';
    searchTerm?: string; // For instant search compatibility
  }
}

// Types
interface CacheEntry {
  data: Contact[];
  timestamp: number;
  total: number;
}

interface FallbackRankedContact extends Contact {
  match_score: number | null;
}

interface InstantSearchRequestBody {
  searchTerm: string;
}

type StandardSearchRequestBody = ContactSearchParams & {
  // Additional fields specific to standard search can be added here
}

type UnifiedSearchRequestBody = StandardSearchRequestBody | InstantSearchRequestBody;

interface InstantSearchResponse {
  messages: Array<{
    role: 'assistant';
    content: string;
  }>;
  structuredData: {
    contacts: Contact[];
  };
  searchMetadata: {
    totalFound: number;
    hasMore: boolean;
    cached: boolean;
  };
}

type UnifiedSearchResponse = ContactSearchResponse | InstantSearchResponse;

// Cache implementation
const searchCache = new Map<string, CacheEntry>();

function getCacheKey(userId: string, query: string, limit: number, offset: number): string {
  return `${userId}:${query}:${limit}:${offset}`;
}

function isValidCache(entry: CacheEntry | undefined): boolean {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL;
}

// Clear cache for a specific user - useful after contact updates
export function clearUserCache(userId: string): void {
  const keysToDelete: string[] = [];
  for (const key of searchCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => searchCache.delete(key));
  console.log(`[contacts-search] Cleared ${keysToDelete.length} cache entries for user ${userId}`);
}

function createTimeoutPromise(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

// Request type detection
function isInstantSearchRequest(body: UnifiedSearchRequestBody): body is InstantSearchRequestBody {
  return 'searchTerm' in body && typeof body.searchTerm === 'string';
}

// Import shared contact quality filters
import { applyContactQualityFilters } from '../utils/contactFilters';

// Core search logic
async function performContactSearch(
  userId: string,
  query: string,
  limit: number,
  offset: number,
  logPrefix: string,
  options: {
    forceRefresh?: boolean;
    currentUserEmail?: string | null;
    jobTitleKeywords?: string[] | null;
  } = {}
): Promise<{ contacts: Contact[]; total: number; cached: boolean }> {
  const { forceRefresh = false, currentUserEmail = null, jobTitleKeywords = null } = options;
  
  console.log(`${logPrefix} Performing search: query="${query}", limit=${limit}, offset=${offset}`);
  
  // Check cache first, unless forceRefresh or filtering parameters are present
  const cacheKey = getCacheKey(userId, query, limit, offset);
  const cachedEntry = searchCache.get(cacheKey);
  
  if (!forceRefresh && !currentUserEmail && !jobTitleKeywords && isValidCache(cachedEntry)) {
    console.log(`${logPrefix} Cache hit for query: "${query}"`);
    const cacheData = cachedEntry as CacheEntry;
    // Apply Google filter to cached data as well
    const filteredCachedContacts = applyContactQualityFilters(cacheData.data, logPrefix);
    return {
      contacts: filteredCachedContacts,
      total: cacheData.total,
      cached: true
    };
  }
  
  console.log(`${logPrefix} Cache ${forceRefresh ? 'bypassed' : (currentUserEmail || jobTitleKeywords ? 'bypassed (has filtering)' : 'miss')}, searching database`);
  
  // Create timeout for database operations
  const timeoutPromise = createTimeoutPromise(QUERY_TIMEOUT_MS);
  
  const searchOperation = async (): Promise<{ contacts: Contact[]; total: number; cached: boolean }> => {
    type OptimizedSearchResult = Contact & { match_score?: number };
    
    // Try optimized RPC first
    const { data: rpcResults, error: searchError } = await supabaseAdmin
      .rpc('search_contacts_optimized', {
        p_user_id: userId,
        p_query: query,
        p_limit: limit,
        p_offset: offset,
        p_job_title_keywords: jobTitleKeywords
      });
    
    let searchResults: OptimizedSearchResult[] = rpcResults || [];
    
    // Filter out current user if email is provided
    if (currentUserEmail && searchResults.length > 0) {
      searchResults = searchResults.filter(contact => 
        contact.email?.toLowerCase() !== currentUserEmail.toLowerCase()
      );
    }
    
    if (searchError) {
      console.error(`${logPrefix} Search error from RPC:`, searchError);
      
      // Fallback to basic search if RPC doesn't exist
      if (searchError.message.includes('function') && searchError.message.includes('does not exist')) {
        console.log(`${logPrefix} Optimized search function not found, using basic search`);
        
        let basicQuery = supabaseAdmin
          .from('contacts')
          .select('*', { count: 'exact' });
        
        basicQuery = basicQuery.eq('user_id', userId);
        
        if (currentUserEmail) {
          basicQuery = basicQuery.not('email', 'ilike', currentUserEmail);
        }
        
        if (query.trim()) {
          basicQuery = basicQuery.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,company.ilike.%${query}%,phone.ilike.%${query}%`);
        }
        
        // Add job title filtering for fallback
        if (jobTitleKeywords && jobTitleKeywords.length > 0) {
          const jobTitleCondition = jobTitleKeywords.map(keyword => `job_title.ilike.%${keyword}%`).join(',');
          basicQuery = basicQuery.or(jobTitleCondition);
        }
        
        const queryResponse = await basicQuery
          .order('updated_at', { ascending: false })
          .range(offset, offset + limit - 1);
        
        const basicContactsData = queryResponse.data as Contact[] | null;
        const basicError = queryResponse.error;
        const count = queryResponse.count;
        
        if (basicError) {
          console.error(`${logPrefix} Basic search error:`, basicError);
          throw new Error(`Search failed: ${basicError.message}`);
        }
        
        const contactsForRanking: Contact[] = basicContactsData || [];
        let rankedFallbackContacts: FallbackRankedContact[] = [];
        
        if (contactsForRanking.length > 0 && query.trim()) {
          rankedFallbackContacts = contactsForRanking.map((contact: Contact) => {
            const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim().toLowerCase();
            const queryLower = query.toLowerCase();
            let score = 0.1;
            if (fullName.includes(queryLower)) score = 0.8;
            else if (contact.email && contact.email.toLowerCase().includes(queryLower)) score = 0.6;
            else if (contact.phone && contact.phone.includes(queryLower)) score = 0.5;
            
            return { ...contact, match_score: score };
          });
          
          rankedFallbackContacts.sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
        } else if (contactsForRanking.length > 0) {
          rankedFallbackContacts = contactsForRanking.map(contact => ({ ...contact, match_score: null }));
        }
        
        // Filter out erroneous "Google" named contacts from fallback results
        let fallbackContacts = rankedFallbackContacts.map(({ match_score: _ms, ...contactFields }) => contactFields as Contact);
        fallbackContacts = applyContactQualityFilters(fallbackContacts, logPrefix);
        
        // Cache results if not filtering by currentUserEmail
        if (!currentUserEmail) {
          searchCache.set(cacheKey, {
            data: fallbackContacts,
            timestamp: Date.now(),
            total: count || 0
          });
        }
        
        return {
          contacts: fallbackContacts,
          total: count || 0,
          cached: false
        };
      }
      
      throw new Error(`Search failed: ${searchError.message}`);
    }
    
    // Apply enhanced sorting logic for RPC results
    const rankedContacts: OptimizedSearchResult[] = searchResults;
    
    if (rankedContacts.length > 0 && query.trim()) {
      console.log(`${logPrefix} Applying enhanced sorting to ${rankedContacts.length} results`);
      
      // Analyze match types for each contact
      const contactsWithMatchTypes = rankedContacts.map(contact => {
        const matchType = determineMatchType(contact, query);
        return { contact, matchType };
      });
      
      // Group contacts by match type priority
      const exactFullNameMatches = contactsWithMatchTypes
        .filter(item => item.matchType === SearchMatchType.EXACT_FULL_NAME)
        .map(item => item.contact);
        
      const exactFirstNameMatches = contactsWithMatchTypes
        .filter(item => item.matchType === SearchMatchType.EXACT_FIRST_NAME)
        .map(item => item.contact);
        
      const exactLastNameMatches = contactsWithMatchTypes
        .filter(item => item.matchType === SearchMatchType.EXACT_LAST_NAME)
        .map(item => item.contact);
        
      const partialNameMatches = contactsWithMatchTypes
        .filter(item => item.matchType === SearchMatchType.PARTIAL_NAME)
        .map(item => item.contact);
        
      const otherMatches = contactsWithMatchTypes
        .filter(item => [
          SearchMatchType.CONTACT_INFO,
          SearchMatchType.COMPANY_INFO,
          SearchMatchType.GENERAL_INFO,
          SearchMatchType.NO_MATCH
        ].includes(item.matchType))
        .map(item => item.contact);
      
      // Create final ordered list with exact matches prioritized
      const orderedRankedContacts = [
        ...exactFullNameMatches.sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0)),
        ...exactFirstNameMatches.sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0)),
        ...exactLastNameMatches.sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0)),
        ...partialNameMatches.sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0)),
        ...otherMatches.sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
      ];
      
      // If exact full name matches exist, prioritize only those
      if (exactFullNameMatches.length > 0) {
        console.log(`${logPrefix} Prioritizing ${exactFullNameMatches.length} exact full name match(es)`);
        rankedContacts.length = 0;
        rankedContacts.push(...exactFullNameMatches);
      } else {
        rankedContacts.length = 0;
        rankedContacts.push(...orderedRankedContacts);
      }
    } else {
      rankedContacts.sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
    }
    
    console.log(`${logPrefix} Total contacts found: ${rankedContacts.length}`);
    
    // Extract contacts without match_score for response
    let contacts: Contact[] = rankedContacts.map(({ match_score: _ignoredScore, ...contactFields }) => contactFields as Contact);
    
    // Filter out erroneous "Google" named contacts from import
    contacts = applyContactQualityFilters(contacts, logPrefix);
    
    // Get total count for pagination
    const countQuery = supabaseAdmin
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    if (query.trim()) {
      countQuery.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,company.ilike.%${query}%,phone.ilike.%${query}%`);
    }
    
    const { count: totalCountFromQuery } = await countQuery;
    const finalTotal = totalCountFromQuery || rankedContacts.length;
    
    // Cache successful results if not filtering by currentUserEmail
    if (!currentUserEmail) {
      searchCache.set(cacheKey, {
        data: contacts,
        timestamp: Date.now(),
        total: finalTotal
      });
    }
    
    // Clean up old cache entries periodically
    if (Math.random() < 0.1) {
      const now = Date.now();
      for (const [key, entry] of searchCache.entries()) {
        if (now - entry.timestamp > CACHE_TTL) {
          searchCache.delete(key);
        }
      }
    }
    
    return {
      contacts,
      total: finalTotal,
      cached: false
    };
  };
  
  // Race search operation against timeout
  return await Promise.race([searchOperation(), timeoutPromise]);
}

// Format response based on request type
function formatResponse(
  contacts: Contact[],
  total: number,
  cached: boolean,
  format: 'standard' | 'instant' | 'formatted',
  searchTerm: string,
  limit: number,
  offset: number
): UnifiedSearchResponse {
  if (format === 'instant' || format === 'formatted') {
    // Instant search response format
    const formattedResponse = FastContactFormatter.formatContactsForDisplay(contacts, searchTerm);
    
    return {
      messages: [{
        role: 'assistant',
        content: formattedResponse
      }],
      structuredData: {
        contacts: contacts.map(contact => ({
          contact_id: contact.contact_id,
          first_name: contact.first_name,
          last_name: contact.last_name,
          email: contact.email,
          phone: contact.phone,
          mobile_phone: contact.mobile_phone,
          work_phone: contact.work_phone,
          company: contact.company,
          job_title: contact.job_title,
          formatted_address: contact.formatted_address,
          street_address: contact.street_address,
          city: contact.city,
          state_province: contact.state_province,
          postal_code: contact.postal_code,
          country: contact.country,
          birthday: contact.birthday,
          notes: contact.notes
        }))
      },
      searchMetadata: {
        totalFound: contacts.length,
        hasMore: contacts.length < total,
        cached: cached
      }
    } as InstantSearchResponse;
  } else {
    // Standard search response format
    return {
      contacts,
      total,
      hasMore: offset + limit < total,
      cached
    } as ContactSearchResponse;
  }
}

// Main handler
export const handler: Handler = async (event: HandlerEvent, context: HandlerContext): Promise<HandlerResponse> => {
  const reqId = context.awsRequestId || `local-${Date.now()}`;
  const logPrefix = `[contacts-search-unified][${reqId}]`;
  
  console.log(`${logPrefix} Function invoked. HTTP Method: ${event?.httpMethod}. Path: ${event?.path}`);
  
  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: COMMON_HEADERS,
      body: ''
    };
  }
  
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
      headers: { ...COMMON_HEADERS, 'Allow': 'POST, OPTIONS' },
    };
  }
  
  // Authenticate the user
  const userId = getUserIdFromEvent(event, 'contacts-search-unified');
  if (!userId) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Authentication required' }),
      headers: COMMON_HEADERS,
    };
  }
  
  try {
    // Parse request body
    const body: UnifiedSearchRequestBody = JSON.parse(event.body || '{}');
    
    // Determine request type and extract parameters
    let query: string;
    let limit: number;
    let offset: number;
    let format: 'standard' | 'instant' | 'formatted';
    let forceRefresh: boolean;
    let currentUserEmail: string | null;
    let jobTitleKeywords: string[] | null;
    
    if (isInstantSearchRequest(body)) {
      // Instant search request
      const { searchTerm } = body;
      
      if (!searchTerm || typeof searchTerm !== 'string') {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Search term is required and must be a string' }),
          headers: COMMON_HEADERS,
        };
      }
      
      query = searchTerm;
      limit = 50;
      offset = 0;
      format = 'instant';
      forceRefresh = false;
      currentUserEmail = null;
      jobTitleKeywords = null;
      
      console.log(`${logPrefix} Instant search for: "${searchTerm}"`);
    } else {
      // Standard search request
      query = body.query || '';
      limit = Math.min(body.limit || 50, 100);
      offset = body.offset || 0;
      format = body.format || 'standard';
      forceRefresh = body.forceRefresh || false;
      currentUserEmail = body.currentUserEmail || null;
      jobTitleKeywords = body.job_title_keywords || null;
      
      console.log(`${logPrefix} Standard search: query="${query}", limit=${limit}, offset=${offset}, format=${format}`);
    }
    
    // Perform the search
    const timeoutPromise = createTimeoutPromise(QUERY_TIMEOUT_MS);
    const searchPromise = performContactSearch(userId, query, limit, offset, logPrefix, {
      forceRefresh,
      currentUserEmail,
      jobTitleKeywords
    });
    
    const { contacts, total, cached } = await Promise.race([searchPromise, timeoutPromise]);
    
    // Apply additional prioritization for instant search
    let finalContacts = contacts;
    if (format === 'instant' && contacts.length > 1 && query.trim()) {
      const prioritizedContacts = prioritizeContactsByMatchType(contacts, query.trim());
      
      // Check for exact full name matches and return only those
      if (prioritizedContacts.length > 0) {
        const cleanQuery = query.trim().toLowerCase();
        const exactFullNameMatches = prioritizedContacts.filter(contact => {
          const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim().toLowerCase();
          return fullName === cleanQuery;
        });
        
        if (exactFullNameMatches.length > 0) {
          console.log(`${logPrefix} Found ${exactFullNameMatches.length} exact full name matches for instant search`);
          finalContacts = exactFullNameMatches;
        } else {
          finalContacts = prioritizedContacts;
        }
      }
    }
    
    // Filter out erroneous "Google" named contacts from import
    finalContacts = applyContactQualityFilters(finalContacts, logPrefix);
    
    // Format and return response
    const response = formatResponse(finalContacts, total, cached, format, query, limit, offset);
    
    return {
      statusCode: 200,
      body: JSON.stringify(response),
      headers: COMMON_HEADERS,
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`${logPrefix} Error:`, error);
    
    return {
      statusCode: error instanceof Error && error.message.includes('timed out') ? 408 : 500,
      body: JSON.stringify({
        message: error instanceof Error && error.message.includes('timed out') ?
          'Search request timed out. Try a more specific search term.' :
          'Internal server error',
        error: errorMessage
      }),
      headers: COMMON_HEADERS,
    };
  }
};