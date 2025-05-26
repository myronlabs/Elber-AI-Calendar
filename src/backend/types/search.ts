// backend/types/search.ts
import { Contact } from './domain';

/**
 * Enhanced Contact interface with search-specific fields
 */
export interface RankedContact extends Contact {
  /**
   * Search relevance score (higher is better match)
   * This is calculated by the search_contacts_optimized database function
   */
  match_score: number;
}

/**
 * Parameters for contact search
 */
export interface ContactSearchParams {
  /**
   * User's query string (what they're searching for)
   */
  query: string;
  
  /**
   * Maximum number of results to return (default: 50)
   */
  limit?: number;
  
  /**
   * Number of results to skip (for pagination)
   */
  offset?: number;
  
  /**
   * Fields to return (default: all)
   */
  fields?: string[];
}

/**
 * Response format for contact search results
 */
export interface ContactSearchResponse {
  /**
   * Array of contacts matching the search
   */
  contacts: Contact[];
  
  /**
   * Total number of matching contacts (for pagination)
   */
  total: number;
  
  /**
   * Whether there are more results available
   */
  hasMore: boolean;
  
  /**
   * Whether this result came from cache
   */
  cached?: boolean;
}

/**
 * Enhanced search response with ranked contacts
 */
export interface RankedContactSearchResponse extends ContactSearchResponse {
  /**
   * Array of contacts with match scores
   */
  contacts: RankedContact[];
}

/**
 * Type guard to check if a contact has a match score
 */
export function isRankedContact(contact: Contact | RankedContact): contact is RankedContact {
  return 'match_score' in contact;
}

/**
 * Instant search result for frontend consumption
 */
export interface InstantSearchResult {
  /**
   * Formatted messages for display
   */
  messages: Array<{
    role: string;
    content: string;
  }>;
  
  /**
   * Structured data for UI rendering
   */
  structuredData?: {
    contacts: Contact[];
  };
  
  /**
   * Metadata about the search
   */
  searchMetadata: {
    totalFound: number;
    hasMore: boolean;
    cached: boolean;
  };
}

/**
 * Enum for search match types to improve type safety
 */
export enum SearchMatchType {
  EXACT_FULL_NAME = 'EXACT_FULL_NAME',
  EXACT_FIRST_NAME = 'EXACT_FIRST_NAME',
  EXACT_LAST_NAME = 'EXACT_LAST_NAME',
  PARTIAL_NAME = 'PARTIAL_NAME',
  CONTACT_INFO = 'CONTACT_INFO',
  COMPANY_INFO = 'COMPANY_INFO',
  GENERAL_INFO = 'GENERAL_INFO',
  NO_MATCH = 'NO_MATCH'
}

/**
 * Function to determine the match type between a contact and a query string
 */
export function determineMatchType(
  contact: Contact, 
  query: string
): SearchMatchType {
  if (!query) return SearchMatchType.NO_MATCH;
  
  const cleanQuery = query.trim().toLowerCase();
  const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim().toLowerCase();
  
  if (fullName === cleanQuery) {
    return SearchMatchType.EXACT_FULL_NAME;
  }
  
  if (contact.first_name?.toLowerCase() === cleanQuery) {
    return SearchMatchType.EXACT_FIRST_NAME;
  }
  
  if (contact.last_name?.toLowerCase() === cleanQuery) {
    return SearchMatchType.EXACT_LAST_NAME;
  }
  
  if (fullName.includes(cleanQuery) || 
      (contact.first_name?.toLowerCase().includes(cleanQuery)) || 
      (contact.last_name?.toLowerCase().includes(cleanQuery))) {
    return SearchMatchType.PARTIAL_NAME;
  }
  
  if ((contact.email?.toLowerCase().includes(cleanQuery)) || 
      (contact.phone?.includes(cleanQuery))) {
    return SearchMatchType.CONTACT_INFO;
  }
  
  if ((contact.company?.toLowerCase().includes(cleanQuery)) || 
      (contact.job_title?.toLowerCase().includes(cleanQuery))) {
    return SearchMatchType.COMPANY_INFO;
  }
  
  // Check address fields
  if ((contact.formatted_address?.toLowerCase().includes(cleanQuery)) || 
      (contact.street_address?.toLowerCase().includes(cleanQuery)) || 
      (contact.street_address_2?.toLowerCase().includes(cleanQuery)) || 
      (contact.city?.toLowerCase().includes(cleanQuery)) || 
      (contact.state_province?.toLowerCase().includes(cleanQuery)) || 
      (contact.postal_code?.toLowerCase().includes(cleanQuery)) || 
      (contact.country?.toLowerCase().includes(cleanQuery)) || 
      (contact.notes?.toLowerCase().includes(cleanQuery))) {
    return SearchMatchType.GENERAL_INFO;
  }
  
  return SearchMatchType.NO_MATCH;
}

/**
 * Groups contacts by their match type relative to a search query
 */
export function groupContactsByMatchType<T extends Contact>(
  contacts: T[],
  query: string
): Map<SearchMatchType, T[]> {
  const contactsByMatchType = new Map<SearchMatchType, T[]>();
  
  // Initialize all match type groups
  Object.values(SearchMatchType).forEach(matchType => {
    contactsByMatchType.set(matchType, []);
  });
  
  // Categorize each contact by match type
  contacts.forEach(contact => {
    const matchType = determineMatchType(contact, query);
    const matchGroup = contactsByMatchType.get(matchType) || [];
    matchGroup.push(contact);
    contactsByMatchType.set(matchType, matchGroup);
  });
  
  return contactsByMatchType;
}

/**
 * Prioritizes contacts based on match type relative to a search query
 * Returns a new array with contacts ordered by match type priority
 */
export function prioritizeContactsByMatchType<T extends Contact>(
  contacts: T[],
  query: string
): T[] {
  if (!query.trim() || contacts.length <= 1) return [...contacts];
  
  const contactsByMatchType = groupContactsByMatchType(contacts, query);
  
  // Build prioritized array based on match type order
  const prioritized: T[] = [];
  
  // Order by match type priority
  const priorityOrder: SearchMatchType[] = [
    SearchMatchType.EXACT_FULL_NAME,
    SearchMatchType.EXACT_FIRST_NAME,
    SearchMatchType.EXACT_LAST_NAME,
    SearchMatchType.PARTIAL_NAME,
    SearchMatchType.CONTACT_INFO,
    SearchMatchType.COMPANY_INFO,
    SearchMatchType.GENERAL_INFO,
    SearchMatchType.NO_MATCH
  ];
  
  // Add contacts in priority order
  priorityOrder.forEach(matchType => {
    const matchesForType = contactsByMatchType.get(matchType) || [];
    prioritized.push(...matchesForType);
  });
  
  return prioritized;
}