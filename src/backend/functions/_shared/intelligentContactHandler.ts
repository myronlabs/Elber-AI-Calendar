/**
 * Intelligent Contact Handler - Implements smart contact management following OpenAI best practices
 * Handles complete workflows in single operations, understands user intent naturally
 * 
 * Returns structured objects (not JSON strings) for OpenAI to format into natural language
 */

import { supabaseAdmin } from '@services/supabaseAdmin';
import { contactService } from '@services/contactService';
import type { Contact } from '../../types/domain';
import { clearUserCache } from '../contacts-search';

export interface IntelligentContactArgs {
  user_request: string;
  intended_action: 'search' | 'create' | 'update' | 'delete' | 'merge';
  search_term: string | null;
  contact_updates: {
    // Personal Information
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    nickname: string | null;
    
    // Contact Information
    email: string | null;
    phone: string | null;
    mobile_phone: string | null;
    work_phone: string | null;
    website: string | null;
    
    // Professional Information
    company: string | null;
    job_title: string | null;
    department: string | null;
    
    // Address Information
    street_address: string | null;
    street_address_2: string | null;
    city: string | null;
    state_province: string | null;
    postal_code: string | null;
    country: string | null;
    formatted_address: string | null;
    
    // Social Media
    social_linkedin: string | null;
    social_twitter: string | null;
    
    // Preferences and Metadata
    tags: string[] | null;
    preferred_contact_method: string | null;
    timezone: string | null;
    language: string | null;
    
    // Other Information
    birthday: string | null;
    notes: string | null;
    
    // Import tracking (for updates only, not creation)
    import_source: string | null;
    google_contact_id: string | null;
  } | null;
  confirmation_provided: boolean;
}

export interface ContactHandlerContext {
  supabaseAdmin: typeof supabaseAdmin;
  internalApiBaseUrl: string;
  internalHeaders: Record<string, string>;
  config: {
    contactSummaryThreshold: number;
    maxContactResults: number;
    upcomingBirthdayDays: number;
  };
  currentUserEmail?: string | null;
  logPrefix: string;
  contactSummaryThreshold: number;
}

// Define structured response types for OpenAI to process
export interface ContactOperationResult {
  success: boolean;
  operation: string;
  user_request: string;
  message: string;
  error?: string;
  contacts?: Contact[];
  total_found?: number;
  contact?: Contact | {
    contact_id: string;
    name: string;
    email?: string;
    phone?: string;
    company?: string;
  };
  results?: Array<{
    contact_id: string;
    name: string;
    updated: boolean;
    changes?: string[];
    message?: string;
    error?: string;
    contact_data?: Contact;
  }>;
  total_contacts?: number;
  updated_contacts?: number;
  triggerRefresh?: boolean;
  contact_id?: string;
  matches?: Array<{
    contact_id: string;
    name: string;
    email?: string;
    phone?: string;
    company?: string;
  }>;
  primary_contact?: string;
  merged_contacts?: number;
}

/**
 * Detects if a search query is too vague and needs clarification
 */
function isVagueSearchQuery(userRequest: string, searchTerm: string): boolean {
  const request = userRequest.toLowerCase().trim();
  const term = searchTerm.toLowerCase().trim();
  
  // Very short search terms (1-2 characters) are usually too vague
  if (term.length <= 2) {
    return true;
  }
  
  // Common vague search patterns
  const vaguePatterns = [
    // Generic requests without specific identifiers
    /^(find|search|show|get|list)?\s*(a\s+)?contact/i,
    /^(find|search|show|get|list)?\s*(my\s+)?contacts?$/i,
    /^(find|search|show|get|list)?\s*contact\s+(by\s+)?(name|email|phone)/i,
    /^(find|search|show|get|list)?\s*someone/i,
    /^(find|search|show|get|list)?\s*person/i,
    /^(find|search|show|get|list)?\s*client/i,
    /^(find|search|show|get|list)?\s*customer/i,
    
    // Generic terms that don't identify specific contacts
    /^(all|any|some)\s+contacts?/i,
    /^contacts?\s+(with|having|that\s+have)/i,
    /^who\s+is/i,
    /^what\s+contact/i,
    /^which\s+contact/i,
  ];
  
  // Check if the request matches any vague pattern
  for (const pattern of vaguePatterns) {
    if (pattern.test(request)) {
      return true;
    }
  }
  
  // Generic single words that are too broad
  const vagueTerms = [
    'contact', 'contacts', 'person', 'people', 'someone', 'anyone', 'client', 
    'customer', 'user', 'employee', 'colleague', 'friend', 'family'
  ];
  
  if (vagueTerms.includes(term)) {
    return true;
  }
  
  // Common generic phrases in search terms
  const vagueSearchTerms = [
    'find contact', 'search contact', 'show contact', 'get contact',
    'find person', 'search person', 'show person', 'get person',
    'by name', 'by email', 'by phone', 'contact info'
  ];
  
  for (const vagueTerm of vagueSearchTerms) {
    if (term.includes(vagueTerm)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Validates CRUD operation arguments for completeness and correctness
 */
function validateCRUDOperation(args: IntelligentContactArgs): { isValid: boolean; error?: string } {
  // Validate intended_action
  const validActions = ['search', 'create', 'update', 'delete', 'merge'];
  if (!validActions.includes(args.intended_action)) {
    return { isValid: false, error: `Invalid action: ${args.intended_action}. Must be one of: ${validActions.join(', ')}` };
  }

  // Validate action-specific requirements
  switch (args.intended_action) {
    case 'search':
      if (!args.search_term || args.search_term.trim() === '') {
        return { isValid: false, error: 'Search operations require a non-empty search_term' };
      }
      break;

    case 'create':
      if (!args.contact_updates) {
        return { isValid: false, error: 'Create operations require contact_updates' };
      }
      if (!args.contact_updates.first_name || !args.contact_updates.last_name) {
        return { isValid: false, error: 'Create operations require first_name and last_name' };
      }
      break;

    case 'update':
      if (!args.search_term || args.search_term.trim() === '') {
        return { isValid: false, error: 'Update operations require a non-empty search_term to identify contacts' };
      }
      if (!args.contact_updates) {
        // Special case: phone-to-mobile conversion doesn't require explicit contact_updates
        const isPhoneToMobileOperation = args.user_request.toLowerCase().includes('move') && 
                                         args.user_request.toLowerCase().includes('phone') && 
                                         args.user_request.toLowerCase().includes('mobile');
        if (!isPhoneToMobileOperation) {
          return { isValid: false, error: 'Update operations require contact_updates (unless moving phone to mobile)' };
        }
      }
      break;

    case 'delete':
      if (!args.search_term || args.search_term.trim() === '') {
        return { isValid: false, error: 'Delete operations require a non-empty search_term to identify contacts' };
      }
      break;

    case 'merge':
      if (!args.search_term || args.search_term.trim() === '') {
        return { isValid: false, error: 'Merge operations require a non-empty search_term to identify duplicate contacts' };
      }
      break;
  }

  return { isValid: true };
}

/**
 * Intelligent Contact Handler - One function that handles all contact operations intelligently
 * Following OpenAI best practices: handles complete workflows, understands intent, no sequential calls
 * 
 * Returns structured objects for OpenAI to format into natural language responses
 * 
 * CRUD OPERATIONS SUPPORTED:
 * - CREATE: Add new contacts with full field support
 * - READ: Search and retrieve contacts by any criteria
 * - UPDATE: Modify existing contacts, handles duplicates intelligently
 * - DELETE: Remove contacts with appropriate confirmation
 */
export async function handleIntelligentContactOperation(
  args: IntelligentContactArgs,
  userId: string,
  context: ContactHandlerContext
): Promise<ContactOperationResult> {
  const { logPrefix } = context;
  console.log(`${logPrefix} Intelligent contact operation: ${args.intended_action} - "${args.user_request}"`);

  // Validate CRUD operation
  const validation = validateCRUDOperation(args);
  if (!validation.isValid) {
    console.error(`${logPrefix} CRUD validation failed:`, validation.error);
    return {
      success: false,
      operation: args.intended_action,
      user_request: args.user_request,
      error: "ValidationError",
      message: validation.error || "Validation failed"
    };
  }

  try {
    switch (args.intended_action) {
      case 'search':
        return await handleIntelligentSearch(args, userId, context);
      case 'create':
        return await handleIntelligentCreate(args, userId, context);
      case 'update':
        return await handleIntelligentUpdate(args, userId, context);
      case 'delete':
        return await handleIntelligentDelete(args, userId, context);
      case 'merge':
        return await handleIntelligentMerge(args, userId, context);
      default:
        return {
          success: false,
          operation: args.intended_action,
          user_request: args.user_request,
          error: "InvalidAction",
          message: `Unknown action: ${args.intended_action}`
        };
    }
  } catch (error) {
    console.error(`${logPrefix} Intelligent contact operation error:`, error);
    return {
      success: false,
      operation: args.intended_action,
      user_request: args.user_request,
      error: "UnexpectedError",
      message: `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Intelligent search using optimized contact search API
 */
async function handleIntelligentSearch(
  args: IntelligentContactArgs,
  userId: string,
  context: ContactHandlerContext
): Promise<ContactOperationResult> {
  const { logPrefix } = context;
  
  if (!args.search_term) {
    return {
      success: false,
      operation: "search",
      user_request: args.user_request,
      error: "InvalidSearch",
      message: "No search criteria provided in the request."
    };
  }

  // Check if the query is too vague and needs clarification
  if (isVagueSearchQuery(args.user_request, args.search_term)) {
    return {
      success: false,
      operation: "search",
      user_request: args.user_request,
      error: "VagueQuery",
      message: "I need more specific information to find the right contact. Could you please provide:\n\n• A person's name (e.g., \"John Smith\" or \"Jane Smith\")\n• An email address (e.g., \"john@company.com\")\n• A phone number\n• A company name and role (e.g., \"CEO at Acme Corp\")\n• Or any other specific identifier\n\nFor example: \"Find John Smith\", \"Search for jane@email.com\", or \"Show contacts at Google\""
    };
  }

  console.log(`${logPrefix} Searching contacts: "${args.search_term}"`);

  const searchResponse = await fetch(`${context.internalApiBaseUrl}/.netlify/functions/contacts-search`, {
    method: 'POST',
    headers: context.internalHeaders,
    body: JSON.stringify({
      query: args.search_term,
      max_results: 20
    })
  });

  if (!searchResponse.ok) {
    console.error(`${logPrefix} Search API error:`, searchResponse.status);
    return {
      success: false,
      operation: "search",
      user_request: args.user_request,
      error: "SearchError",
      message: "Failed to search contacts."
    };
  }

  const searchData = await searchResponse.json();
  const contacts = searchData.contacts || [];

  return {
    success: true,
    operation: "search",
    user_request: args.user_request,
    contacts: contacts,
    total_found: contacts.length,
    message: contacts.length > 0 
      ? `Found ${contacts.length} contact${contacts.length > 1 ? 's' : ''} matching "${args.search_term}"`
      : `No contacts found matching "${args.search_term}"`
  };
}

/**
 * Intelligent contact creation
 */
async function handleIntelligentCreate(
  args: IntelligentContactArgs,
  userId: string,
  context: ContactHandlerContext
): Promise<ContactOperationResult> {
  const { logPrefix } = context;

  if (!args.contact_updates?.first_name || !args.contact_updates?.last_name) {
    return {
      success: false,
      operation: "create",
      user_request: args.user_request,
      error: "InvalidData",
      message: "First name and last name are required to create a contact."
    };
  }

  console.log(`${logPrefix} Creating contact: ${args.contact_updates.first_name} ${args.contact_updates.last_name}`);

  // Build contact data from non-null fields
  const createData: Record<string, unknown> = { user_id: userId };
  for (const [key, value] of Object.entries(args.contact_updates)) {
    if (value !== null && value !== undefined) {
      // Handle array fields (like tags) differently from string fields
      if (Array.isArray(value)) {
        if (value.length > 0) {
          createData[key] = value;
        }
      } else if (typeof value === 'string' && value.trim() !== '') {
      createData[key] = value;
      }
    }
  }

  const { data: newContact, error } = await supabaseAdmin
    .from('contacts')
    .insert(createData)
    .select()
    .single();

  if (error) {
    console.error(`${logPrefix} Create error:`, error);
    return {
      success: false,
      operation: "create",
      user_request: args.user_request,
      error: "CreateError",
      message: `Failed to create contact: ${error.message}`
    };
  }

  // Clear the search cache after creating a contact
  clearUserCache(userId);
  console.log(`${logPrefix} Cleared search cache after creating contact`);

  return {
    success: true,
    operation: "create",
    user_request: args.user_request,
    contact: newContact,
    message: `Successfully created contact: ${newContact.first_name} ${newContact.last_name}`
  };
}

/**
 * Intelligent update - handles duplicates automatically based on user intent
 */
async function handleIntelligentUpdate(
  args: IntelligentContactArgs,
  userId: string,
  context: ContactHandlerContext
): Promise<ContactOperationResult> {
  const { logPrefix } = context;
  console.log(`${logPrefix} handleIntelligentUpdate RAW ARGS: user_request: "${args.user_request}", search_term: "${args.search_term}", intended_action: "${args.intended_action}"`);
  console.log(`${logPrefix} handleIntelligentUpdate CONTACT_UPDATES FROM AI:`, JSON.stringify(args.contact_updates, null, 2));

  // Intelligent phone field detection based on user request
  const userRequest = args.user_request.toLowerCase();
  const phoneFieldMapping = detectPhoneFieldIntent(userRequest, args.contact_updates);
  console.log(`${logPrefix} handleIntelligentUpdate DETECTED PHONE FIELD MAPPING:`, JSON.stringify(phoneFieldMapping, null, 2));

  if (!args.search_term) {
    return {
      success: false,
      operation: "update_contact",
      user_request: args.user_request,
      error: "InvalidRequest",
      message: "Search term is required for update operations."
    };
  }

  // Find contacts using optimized search
  console.log(`${logPrefix} Finding contacts to update: "${args.search_term}"`);
  
  const searchResponse = await fetch(`${context.internalApiBaseUrl}/.netlify/functions/contacts-search`, {
    method: 'POST',
    headers: context.internalHeaders,
    body: JSON.stringify({
      query: args.search_term,
      max_results: 10
    })
  });

  if (!searchResponse.ok) {
    console.error(`${logPrefix} Search API error:`, searchResponse.status);
    return {
      success: false,
      operation: "update_contact",
      user_request: args.user_request,
      error: "SearchError",
      message: "Failed to search for contacts to update."
    };
  }

  const searchData = await searchResponse.json();
  const contacts = searchData.contacts || [];

  if (!contacts || contacts.length === 0) {
    return {
      success: false,
      operation: "update_contact",
      user_request: args.user_request,
      error: "NotFound",
      message: `No contacts found matching "${args.search_term}" to update.`
    };
  }

  // Intelligent duplicate handling based on user intent
  // For "update John Smith phone" → update all John Smith contacts
  // This follows OpenAI best practices: understand intent, complete workflow in one call
  
  console.log(`${logPrefix} Found ${contacts.length} contacts - updating all matches intelligently`);

  // Apply phone field corrections if detected
  const updateData: Record<string, unknown> = {};
  let hasChanges = false;

  if (args.contact_updates) {
    for (const [field, newValue] of Object.entries(args.contact_updates)) {
      // Skip null and undefined values, but allow empty strings for clearing fields
      if (newValue === null || newValue === undefined) {
        continue;
      }
      
      // Apply phone field corrections if this is a phone field
      const correctedField = phoneFieldMapping[field] || field;
      
      // Handle array fields (like tags) differently from string fields
      if (Array.isArray(newValue)) {
        if (newValue.length > 0) {
          updateData[correctedField] = newValue;
          hasChanges = true;
        }
      } else if (typeof newValue === 'string') {
        // Allow empty strings for clearing fields, but require non-empty strings for updates
        if (newValue.trim() !== '') {
          updateData[correctedField] = newValue;
          hasChanges = true;
        }
      } else {
        // Handle other data types (boolean, number, etc.)
        updateData[correctedField] = newValue;
        hasChanges = true;
      }
    }
  }

  // Special handling for phone → mobile conversion based on user request intent
  const shouldMovePhoneToMobile = userRequest.includes('move') &&
                                   userRequest.includes('phone') && 
                                   (userRequest.includes('mobile') || userRequest.includes('cell'));

  if (shouldMovePhoneToMobile) {
    console.log(`${logPrefix} User wants to move phone to mobile for all contacts`);
  }

  // Check if user wants to move phone to mobile even without explicit field updates
  if (!hasChanges && !shouldMovePhoneToMobile) {
    return {
      success: true,
      operation: "update_contact",
      user_request: args.user_request,
      message: `No changes specified for the ${contacts.length} matching contact${contacts.length > 1 ? 's' : ''}.`,
      total_found: contacts.length
    };
  }

  // Update all matching contacts - this is the intelligent behavior the user expects
  const updateResults = [];
  
  for (const contact of contacts) {
    // Check if this contact actually needs changes
    let contactNeedsUpdate = false;
    const contactUpdateData: Record<string, unknown> = {};

    // Handle regular field updates
    for (const [field, newValue] of Object.entries(updateData)) {
      if (newValue !== contact[field]) {
        contactUpdateData[field] = newValue;
        contactNeedsUpdate = true;
      }
    }

    // Handle phone → mobile conversion if requested
    if (shouldMovePhoneToMobile && contact.phone && contact.phone.trim() !== '') {
      console.log(`${logPrefix} Moving phone "${contact.phone}" to mobile_phone for contact ${contact.contact_id}`);
      contactUpdateData['mobile_phone'] = contact.phone;
      contactUpdateData['phone'] = null; // Clear the phone field after moving to mobile
      contactNeedsUpdate = true;
    }

    if (!contactNeedsUpdate) {
      updateResults.push({
        contact_id: contact.contact_id,
        name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
        updated: false,
        message: shouldMovePhoneToMobile && (!contact.phone || contact.phone.trim() === '') 
          ? "No phone number to move to mobile" 
          : "No changes needed"
      });
      console.log(`${logPrefix} Contact ${contact.contact_id} (${contact.first_name} ${contact.last_name}) - No actual DB update needed. UpdateData was:`, JSON.stringify(updateData), `Existing contact values: mobile_phone=${contact.mobile_phone}, work_phone=${contact.work_phone}, phone=${contact.phone}`);
      continue;
    }

    console.log(`${logPrefix} Attempting DB update for contact ${contact.contact_id} (${contact.first_name} ${contact.last_name}). contactUpdateData:`, JSON.stringify(contactUpdateData));
    
    // Log the exact values being sent to Supabase
    console.log(`${logPrefix} Raw contactUpdateData keys:`, Object.keys(contactUpdateData));
    console.log(`${logPrefix} Raw contactUpdateData values:`, Object.values(contactUpdateData));
    console.log(`${logPrefix} Mobile phone value specifically:`, contactUpdateData.mobile_phone);
    
    // Perform update
    const { data: supabaseResponseData, error: updateError } = await supabaseAdmin
      .from('contacts')
      .update(contactUpdateData)
      .eq('contact_id', contact.contact_id)
      .eq('user_id', userId);

    console.log(`${logPrefix} Supabase update response - data:`, supabaseResponseData);
    console.log(`${logPrefix} Supabase update response - error:`, updateError);

    if (updateError) {
      console.error(`${logPrefix} Update error for ${contact.contact_id}:`, updateError);
      updateResults.push({
        contact_id: contact.contact_id,
        name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
        updated: false,
        error: updateError.message
      });
    } else {
      updateResults.push({
        contact_id: contact.contact_id,
        name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
        updated: true,
        changes: Object.keys(contactUpdateData),
        message: `Updated: ${Object.keys(contactUpdateData).join(', ')}`,
        contact_data: contact // Include full contact data for frontend
      });
    }
  }

  const successCount = updateResults.filter(r => r.updated).length;
  const totalCount = updateResults.length;

  // Clear the search cache if any contacts were updated
  if (successCount > 0) {
    clearUserCache(userId);
    console.log(`${logPrefix} Cleared search cache after updating ${successCount} contacts`);
  }

  return {
    success: true,
    operation: "update_contact",
    user_request: args.user_request,
    message: successCount > 0 
      ? `Successfully updated ${successCount} of ${totalCount} contacts matching "${args.search_term}".`
      : `Found ${totalCount} contacts but no updates were needed.`,
    results: updateResults,
    total_contacts: totalCount,
    updated_contacts: successCount
  };
}

/**
 * Intelligent phone field detection based on user intent
 * Maps provided phone field to the correct target field based on user language
 */
function detectPhoneFieldIntent(userRequest: string, contactUpdates: IntelligentContactArgs['contact_updates']): Record<string, string> {
  const mapping: Record<string, string> = {};
  
  if (!contactUpdates) return mapping;
  
  // Check if user mentioned specific phone types
  const request = userRequest.toLowerCase();
  
  // Mobile/Cell phone patterns
  const isMobileRequest = request.includes('mobile') || 
                         request.includes('cell') || 
                         request.includes('cellular');
  
  // Work phone patterns  
  const isWorkRequest = request.includes('work') || 
                       request.includes('office') || 
                       request.includes('business');
  
  console.log('[Phone Field Detection] Request analysis:', {
    userRequest: request,
    isMobileRequest,
    isWorkRequest,
    contactUpdates: Object.keys(contactUpdates).filter(k => k.includes('phone'))
  });
  
  // If user provided a phone value, determine the correct field
  if (contactUpdates.phone !== null && contactUpdates.phone !== undefined) {
    if (isMobileRequest) {
      console.log('[Phone Field Detection] User mentioned mobile/cell, routing phone to mobile_phone field');
      mapping['phone'] = 'mobile_phone';
    } else if (isWorkRequest) {
      console.log('[Phone Field Detection] User mentioned work, routing phone to work_phone field');
      mapping['phone'] = 'work_phone';
    }
    // Otherwise keep as 'phone' field (default)
  }
  
  // Handle direct mobile_phone requests
  if (contactUpdates.mobile_phone !== null && contactUpdates.mobile_phone !== undefined) {
    // If user said "phone" but meant mobile, and they provided mobile_phone value
    if (request.includes('phone') && isMobileRequest) {
      console.log('[Phone Field Detection] User said mobile phone, confirmed mobile_phone field');
    }
  }
  
  // Handle direct work_phone requests  
  if (contactUpdates.work_phone !== null && contactUpdates.work_phone !== undefined) {
    if (request.includes('phone') && isWorkRequest) {
      console.log('[Phone Field Detection] User said work phone, confirmed work_phone field');
    }
  }
  
  console.log('[Phone Field Detection] Final mapping:', mapping);
  
  return mapping;
}

/**
 * Intelligent delete with appropriate confirmation workflow
 */
async function handleIntelligentDelete(
  args: IntelligentContactArgs,
  userId: string,
  context: ContactHandlerContext
): Promise<ContactOperationResult> {
  const { logPrefix } = context;
  
  if (!args.search_term) {
    return {
      success: false,
      operation: "delete",
      user_request: args.user_request,
      error: "InvalidRequest",
      message: "Search term is required for delete operations."
    };
  }

  if (!args.confirmation_provided) {
    // First phase: find contact and request confirmation
    const searchResponse = await fetch(`${context.internalApiBaseUrl}/.netlify/functions/contacts-search`, {
      method: 'POST',
      headers: context.internalHeaders,
      body: JSON.stringify({
        query: args.search_term,
        max_results: 5
      })
    });

    if (!searchResponse.ok) {
      return {
        success: false,
        operation: "delete",
        user_request: args.user_request,
        error: "SearchError",
        message: "Failed to search for contacts to delete."
      };
    }

    const searchData = await searchResponse.json();
    const contacts = searchData.contacts || [];

    if (!contacts || contacts.length === 0) {
      return {
        success: false,
        operation: "delete",
        user_request: args.user_request,
        error: "NotFound",
        message: `No contacts found matching "${args.search_term}" to delete.`
      };
    }

    if (contacts.length > 1) {
      return {
        success: false,
        operation: "delete",
        user_request: args.user_request,
        error: "MultipleMatches",
        message: `Found ${contacts.length} contacts matching "${args.search_term}". Please be more specific about which contact to delete.`,
        matches: contacts.map((c: Contact) => ({
          contact_id: c.contact_id,
          name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
          email: c.email,
          phone: c.phone,
          company: c.company
        }))
      };
    }

    const contact = contacts[0];
    const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();

    return {
      success: false,
      operation: "delete",
      user_request: args.user_request,
      error: "ConfirmationRequired",
      message: `Found contact "${contactName}". Are you sure you want to delete this contact? Please confirm to proceed.`,
      contact: {
        contact_id: contact.contact_id,
        name: contactName,
        email: contact.email,
        phone: contact.phone,
        company: contact.company
      }
    };
  }

  // Second phase: confirmed deletion
  const deleteResult = await contactService.deleteContact(userId, { 
    type: 'name', 
    name: args.search_term 
  });

  if (!deleteResult.success) {
    return {
      success: false,
      operation: "delete",
      user_request: args.user_request,
      error: deleteResult.error?.code || "DeletionFailed",
      message: deleteResult.error?.message || "Failed to delete contact."
    };
  }

  // Clear the search cache after deleting a contact
  clearUserCache(userId);
  console.log(`${logPrefix} Cleared search cache after deleting contact`);

  return {
    success: true,
    operation: "delete",
    user_request: args.user_request,
    message: `Contact "${deleteResult.data?.name || args.search_term}" has been deleted successfully.`,
    contact_id: deleteResult.data?.contact_id,
    triggerRefresh: true // Trigger frontend refresh after deletion
  };
}

/**
 * Intelligent merge - finds and combines duplicate contacts
 */
async function handleIntelligentMerge(
  args: IntelligentContactArgs,
  userId: string,
  context: ContactHandlerContext
): Promise<ContactOperationResult> {
  const { logPrefix } = context;
  
  if (!args.search_term) {
    return {
      success: false,
      operation: "merge",
      user_request: args.user_request,
      error: "InvalidRequest",
      message: "Search term is required for merge operations."
    };
  }

  console.log(`${logPrefix} Finding duplicate contacts to merge: "${args.search_term}"`);
  
  // First, find contacts matching the search term
  const searchResponse = await fetch(`${context.internalApiBaseUrl}/.netlify/functions/contacts-search`, {
    method: 'POST',
    headers: context.internalHeaders,
    body: JSON.stringify({
      query: args.search_term,
      max_results: 10
    })
  });

  if (!searchResponse.ok) {
    console.error(`${logPrefix} Search API error:`, searchResponse.status);
    return {
      success: false,
      operation: "merge",
      user_request: args.user_request,
      error: "SearchError",
      message: "Failed to search for contacts to merge."
    };
  }

  const searchData = await searchResponse.json();
  const contacts = searchData.contacts || [];

  if (!contacts || contacts.length < 2) {
    return {
      success: false,
      operation: "merge",
      user_request: args.user_request,
      error: "InsufficientContacts",
      message: contacts.length === 0 
        ? `No contacts found matching "${args.search_term}" to merge.`
        : `Only found 1 contact matching "${args.search_term}". Need at least 2 contacts to merge.`
    };
  }

  console.log(`${logPrefix} Found ${contacts.length} contacts to merge - combining data intelligently`);

  // Intelligent merge logic: 
  // 1. Keep the contact with the most complete information as the primary
  // 2. Merge data from other contacts, preferring non-empty values
  // 3. Delete the duplicate contacts after merging
  
  // Find the "best" contact (most complete data) to keep as primary
  const primaryContact = contacts.reduce((best: Contact, current: Contact) => {
    const bestScore = calculateCompletenessScore(best);
    const currentScore = calculateCompletenessScore(current);
    return currentScore > bestScore ? current : best;
  });

  // Merge data from all other contacts into the primary
  const mergedData: Record<string, unknown> = {};
  let hasChanges = false;

  for (const contact of contacts) {
    if (contact.contact_id === primaryContact.contact_id) continue;

    // Merge non-empty fields, preserving existing data in primary contact
    const contactRecord = contact as Record<string, unknown>;
    const primaryRecord = primaryContact as Record<string, unknown>;
    
    for (const [field, value] of Object.entries(contactRecord)) {
      if (field === 'contact_id' || field === 'user_id' || field === 'created_at' || field === 'updated_at') {
        continue; // Skip system fields
      }
      
      const primaryValue = primaryRecord[field];
      
      if (value && value !== '' && (!primaryValue || primaryValue === '')) {
        mergedData[field] = value;
        hasChanges = true;
      }
    }
  }

  // Update the primary contact with merged data if there are changes
  if (hasChanges) {
    const { error: updateError } = await supabaseAdmin
      .from('contacts')
      .update(mergedData)
      .eq('contact_id', primaryContact.contact_id)
      .eq('user_id', userId);

    if (updateError) {
      console.error(`${logPrefix} Error updating primary contact:`, updateError);
      return {
        success: false,
        operation: "merge",
        user_request: args.user_request,
        error: "MergeUpdateError",
        message: `Failed to update primary contact during merge: ${updateError.message}`
      };
    }
  }

  // Delete the duplicate contacts
  const duplicateIds = contacts
    .filter((c: Contact) => c.contact_id !== primaryContact.contact_id)
    .map((c: Contact) => c.contact_id);

  if (duplicateIds.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from('contacts')
      .delete()
      .eq('user_id', userId)
      .in('contact_id', duplicateIds);

    if (deleteError) {
      console.error(`${logPrefix} Error deleting duplicate contacts:`, deleteError);
      return {
        success: false,
        operation: "merge",
        user_request: args.user_request,
        error: "MergeDeleteError",
        message: `Failed to delete duplicate contacts during merge: ${deleteError.message}`
      };
    }
  }

  // Clear the search cache after merging contacts
  clearUserCache(userId);
  console.log(`${logPrefix} Cleared search cache after merging ${contacts.length} contacts`);

  const primaryName = `${primaryContact.first_name || ''} ${primaryContact.last_name || ''}`.trim();
  
  return {
    success: true,
    operation: "merge",
    user_request: args.user_request,
    message: `Successfully merged ${contacts.length} duplicate contacts for "${primaryName}". Kept the most complete contact and combined data from ${duplicateIds.length} others.`,
    primary_contact: primaryContact.contact_id,
    merged_contacts: duplicateIds.length,
    total_contacts: contacts.length,
    triggerRefresh: true // Trigger frontend refresh after merge
  };
}

/**
 * Calculate a completeness score for a contact (higher = more complete)
 */
function calculateCompletenessScore(contact: Contact): number {
  let score = 0;
  const importantFields: (keyof Contact)[] = ['first_name', 'last_name', 'email', 'phone', 'mobile_phone', 'company', 'job_title'];
  
  for (const field of importantFields) {
    const value = contact[field];
    if (value && typeof value === 'string' && value.trim() !== '') {
      score += 1;
    }
  }
  
  return score;
}