import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { supabaseAdmin } from '../services';
import type { PostgrestError } from '@supabase/supabase-js';
import type { ContactCreatePayload, ContactUpdatePayload, ContactDeletePayload } from './services/types';
import type { Contact } from '../types/domain';
import { contactService } from '../services/contactService';
import type { ContactIdentifier } from '../types/domain'; 

const TABLE_NAME = 'contacts';
const COMMON_HEADERS = { 'Content-Type': 'application/json' };

// Import shared contact quality filters
import { applyContactQualityFilters } from '../utils/contactFilters';

// Helper function to get authenticated user ID
export const getAuthenticatedUserId = (event: HandlerEvent, context: HandlerContext): string | null => {
  // First, try to get user from the clientContext (direct browser calls via Netlify Identity)
  const { user: clientContextUser } = context.clientContext || {};
  if (clientContextUser && clientContextUser.sub) {
    console.log("[authHelper] Authenticated user ID from context.clientContext:", clientContextUser.sub);
    return clientContextUser.sub;
  }

  // If clientContext auth fails, check for Authorization header (when called from another function or frontend)
  const authHeader = event.headers.authorization; // Netlify normalizes to lowercase

  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const parts = token.split('.');
        if (parts.length !== 3) {
          console.warn("[authHelper] Invalid JWT format in Authorization header (expected 3 parts). Token was:", authHeader);
          return null;
        }
        const payloadBase64 = parts[1]; // Correctly get the second part (payload)

        if (!payloadBase64) {
          console.warn("[authHelper] Invalid JWT format in Authorization header (missing payload part). Token was:", authHeader);
          return null;
        }
        // Decode the Base64URL encoded payload
        const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
        const payload = JSON.parse(payloadJson);

        if (payload && payload.sub) {
          console.log("[authHelper] Authenticated user ID from Authorization header:", payload.sub);
          return payload.sub;
        } else {
          console.warn("[authHelper] User ID (sub) missing in JWT payload from Authorization header. Payload:", payloadJson);
          return null;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("[authHelper] Error parsing JWT from Authorization header:", errorMessage, "Token was:", authHeader);
        return null;
      }
    } else {
      console.warn("[authHelper] Authorization header present but not a Bearer token. Header:", authHeader);
    }
  } else {
    // Log available headers if Authorization header is missing, to help debug
    const availableHeaders = Object.keys(event.headers).join(', ');
    console.warn(`[authHelper] Authorization header is missing. Available headers: ${availableHeaders}`);
  }

  console.warn("[authHelper] No valid authentication method found (clientContext or Bearer token in Authorization header).");
  return null;
};

// Function to generate a display name for a contact
export const generateDisplayName = (contact: Partial<Contact>): string => {
  if (!contact) return 'Unknown Contact';

  let displayName = '';

  // 1. Prioritize Nickname
  if (contact.nickname && contact.nickname.trim() !== '') {
    displayName = contact.nickname.trim();
  } else {
    // 2. Construct Full Name (First, Middle, Last)
    const nameParts = [];
    if (contact.first_name && contact.first_name.trim() !== '') nameParts.push(contact.first_name.trim());
    if (contact.middle_name && contact.middle_name.trim() !== '') nameParts.push(contact.middle_name.trim());
    if (contact.last_name && contact.last_name.trim() !== '') nameParts.push(contact.last_name.trim());
    if (nameParts.length > 0) {
      displayName = nameParts.join(' ');
    }
  }
  
  // 3. Fallback to Professional Identity: Company + Job Title + Department
  if (!displayName) {
    const orgParts = [];
    if (contact.company && contact.company.trim() !== '') orgParts.push(contact.company.trim());
    if (contact.job_title && contact.job_title.trim() !== '') orgParts.push(contact.job_title.trim());
    if (contact.department && contact.department.trim() !== '') orgParts.push(contact.department.trim());
    
    if (orgParts.length > 0) {
      displayName = orgParts.join(' - ');
    }
  }

  // 4. Fallback to Contact Information
  if (!displayName && contact.email && contact.email.trim() !== '') {
    displayName = contact.email.trim();
  }

  if (!displayName && contact.phone && contact.phone.trim() !== '') {
    displayName = contact.phone.trim();
  }

  if (!displayName && contact.mobile_phone && contact.mobile_phone.trim() !== '') {
    displayName = contact.mobile_phone.trim();
  }

  if (!displayName && contact.work_phone && contact.work_phone.trim() !== '') {
    displayName = contact.work_phone.trim();
  }

  // 5. Fallback to Preferred Contact Method
  if (!displayName && contact.preferred_contact_method && contact.preferred_contact_method.trim() !== '') {
    displayName = `Via ${contact.preferred_contact_method.trim()}`;
  }
  
  // 6. Fallback to Social Media
  if (!displayName && contact.social_linkedin && contact.social_linkedin.trim() !== '') {
    displayName = `LinkedIn: ${contact.social_linkedin.trim()}`;
  }
  
  if (!displayName && contact.social_twitter && contact.social_twitter.trim() !== '') {
    displayName = `Twitter: ${contact.social_twitter.trim()}`;
  }
  
  // 7. Fallback to Website
  if (!displayName && contact.website && contact.website.trim() !== '') {
    displayName = contact.website.trim();
  }
  
  // 8. Fallback to Physical Address
  if (!displayName) {
    if (contact.formatted_address && contact.formatted_address.trim() !== '') {
      // Use the pre-formatted address if available
      displayName = `Address: ${contact.formatted_address.trim().split('\n')[0]}`; // Just the first line
    } else {
      // Try to construct a brief address
      const addressParts = [];
      
      if (contact.street_address && contact.street_address.trim() !== '') {
        addressParts.push(contact.street_address.trim());
      }
      
      if (contact.street_address_2 && contact.street_address_2.trim() !== '') {
        addressParts.push(contact.street_address_2.trim());
      }
      
      if (contact.city && contact.city.trim() !== '') {
        addressParts.push(contact.city.trim());
      }
      
      if (contact.state_province && contact.state_province.trim() !== '') {
        addressParts.push(contact.state_province.trim());
      }
      
      if (contact.postal_code && contact.postal_code.trim() !== '') {
        addressParts.push(contact.postal_code.trim());
      }
      
      if (contact.country && contact.country.trim() !== '') {
        addressParts.push(contact.country.trim());
      }
      
      if (addressParts.length > 0) {
        displayName = `Address: ${addressParts.join(', ')}`;
      }
    }
  }

  // 9. Fallback to Birthday if somehow that's all we have
  if (!displayName && contact.birthday && contact.birthday.trim() !== '') {
    displayName = `Birthday: ${contact.birthday.trim()}`;
  }
  
  // 10. Fallback to Tags
  if (!displayName && contact.tags && Array.isArray(contact.tags) && contact.tags.length > 0) {
    displayName = `Contact tagged: ${contact.tags.join(', ')}`;
  } else if (!displayName && contact.tags && typeof contact.tags === 'string' && (contact.tags as string).trim() !== '') {
    displayName = `Contact tagged: ${(contact.tags as string).trim()}`;
  }
  
  // 11. Fallback to Language/Timezone
  if (!displayName && contact.language && contact.language.trim() !== '') {
    displayName = `${contact.language.trim()} speaker`;
  }
  
  if (!displayName && contact.timezone && contact.timezone.trim() !== '') {
    displayName = `Contact in ${contact.timezone.trim()}`;
  }
  
  // 12. Fallback to Notes (just the beginning if available)
  if (!displayName && contact.notes && contact.notes.trim() !== '') {
    const notePreview = contact.notes.trim().substring(0, 30);
    displayName = `Contact with note: "${notePreview}${notePreview.length < contact.notes.trim().length ? '...' : ''}"`;
  }
  
  // 13. Absolute Fallback - Use Contact ID or Unknown
  if (!displayName) {
    if (contact.contact_id) {
      displayName = `Contact #${contact.contact_id.substring(0, 8)}`;
    } else {
      displayName = 'Unknown Contact';
    }
  }

  return displayName;
};

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const { httpMethod, path, queryStringParameters, body: eventBodyString } = event;
  const logPrefix = `[contacts.ts:${httpMethod}:${path}]`;

  console.log(`${logPrefix} Invoked. Query: ${JSON.stringify(queryStringParameters || {})}. Body (first 100 chars): ${eventBodyString ? eventBodyString.substring(0, 100) : 'N/A'}`);

  // --- Handle POST for creating a new contact or handling emulated DELETE ---
  if (httpMethod === "POST") {
    console.log(`${logPrefix} POST request received.`);
    // 1. Authentication & Authorization
    const userId = getAuthenticatedUserId(event, context);
    if (!userId) {
      console.error(`${logPrefix} POST error: User not authenticated.`);
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Authentication required to create contact." }),
        headers: COMMON_HEADERS,
      };
    }
    console.log(`${logPrefix} Authenticated user ID for POST: ${userId}`);

    let requestBody: ContactCreatePayload | ContactDeletePayload;
    // 2. Parse Request Body
    try {
      if (!eventBodyString) {
        console.warn(`${logPrefix} POST error: Request body is missing.`);
        throw new Error("Request body is missing.");
      }

      // Parse the request body first as a generic object
      const parsedBody = JSON.parse(eventBodyString);

      // If _method is DELETE, treat it as a ContactDeletePayload
      if (parsedBody._method === 'DELETE' && parsedBody.contact_id) {
        requestBody = parsedBody as ContactDeletePayload;
        console.log(`${logPrefix} Parsed request body for POST: ${JSON.stringify(requestBody)}`);

        // Check if this is actually a DELETE request being emulated through POST
        console.log(`${logPrefix} POST request with _method=DELETE detected. Emulating DELETE operation for contact_id: ${requestBody.contact_id}`);

        // Forward to DELETE handler logic with the contact_id
        try {
          const contactIdToDelete = requestBody.contact_id;

          console.log(`${logPrefix} Attempting to delete contact_id: ${contactIdToDelete}`);

          // Perform delete in Supabase
          const { data, error: deleteError } = await supabaseAdmin
            .from(TABLE_NAME)
            .delete()
            .eq('contact_id', contactIdToDelete)
            .eq('user_id', userId) // Double-check user ownership
            .select(); // To confirm deletion

          if (deleteError) {
            console.error(`${logPrefix} Supabase delete error:`, deleteError.message);
            return {
              statusCode: 500,
              body: JSON.stringify({ message: `Failed to delete contact: ${deleteError.message}` }),
              headers: COMMON_HEADERS,
            };
          }

          if (!data || data.length === 0) {
            console.log(`${logPrefix} No contact found with id ${contactIdToDelete} for user ${userId} to delete.`);
            return {
              statusCode: 404,
              body: JSON.stringify({ message: `Contact with id ${contactIdToDelete} not found or became unavailable during deletion.` }),
              headers: COMMON_HEADERS,
            };
          }

          console.log(`${logPrefix} Successfully deleted contact: ${contactIdToDelete}`);
          return {
            statusCode: 200,
            body: JSON.stringify({ message: `Successfully deleted contact: ${contactIdToDelete}` }),
            headers: COMMON_HEADERS,
          };
        } catch (error) {
          console.error(`${logPrefix} Unexpected error in emulated DELETE handler:`, error);
          return {
            statusCode: 500,
            body: JSON.stringify({ message: "An unexpected error occurred while deleting the contact." }),
            headers: COMMON_HEADERS,
          };
        }
      } else {
        // Regular POST request to create a contact
        requestBody = parsedBody as ContactCreatePayload;
        console.log(`${logPrefix} Parsed request body for contact creation: ${JSON.stringify(requestBody)}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`${logPrefix} POST error: Failed to parse request body. Error: ${errorMessage}. Body received: ${eventBodyString ? eventBodyString.substring(0, 200) : 'N/A'}`);
      return {
        statusCode: 400,
        body: JSON.stringify({ message: `Invalid request body: ${errorMessage}` }),
        headers: COMMON_HEADERS,
      };
    }

    // 3. Input Validation
    console.log(`${logPrefix} Validating payload for POST...`);
    if (!requestBody.first_name || typeof requestBody.first_name !== 'string' || requestBody.first_name.trim() === '') {
      console.error(`${logPrefix} Validation error: first_name is required.`);
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Validation error: 'first_name' is required and must be a non-empty string." }),
        headers: COMMON_HEADERS,
      };
    }
    
    // Last name can be empty but must be a string if provided
    if (requestBody.last_name !== undefined && (typeof requestBody.last_name !== 'string')) {
      console.error(`${logPrefix} Validation error: last_name must be a string.`);
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Validation error: 'last_name' must be a string." }),
        headers: COMMON_HEADERS,
      };
    }

    // Validate email format if provided
    if (requestBody.email && typeof requestBody.email === 'string' && requestBody.email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(requestBody.email.trim())) {
        console.error(`${logPrefix} Validation error: Invalid email format.`);
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Validation error: 'email' has an invalid format." }),
          headers: COMMON_HEADERS,
        };
      }
    }

    // Validate phone number format if provided
    if (requestBody.phone && typeof requestBody.phone === 'string' && requestBody.phone.trim() !== '') {
      // More permissive regex for phone numbers
      const phoneRegex = /^[+]?([0-9\s-().ext]{3,30})$/; 
      if (!phoneRegex.test(requestBody.phone.trim())) {
        console.error(`${logPrefix} Validation error: Invalid phone number format.`);
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Validation error: 'phone' has an invalid format. Please use numbers and common phone characters (e.g., (), -, . ext)." }),
          headers: COMMON_HEADERS,
        };
      }
    }

    // Validate website format if provided
    if (requestBody.website && typeof requestBody.website === 'string' && requestBody.website.trim() !== '') {
      try {
        // Use URL constructor for validation (throws error if invalid)
        new URL(requestBody.website.trim());
      } catch {
        console.error(`${logPrefix} Validation error: Invalid website URL format.`);
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Validation error: 'website' has an invalid URL format. Please include http:// or https:// prefix." }),
          headers: COMMON_HEADERS,
        };
      }
    }

    // Validate birthday format if provided
    if (requestBody.birthday && typeof requestBody.birthday === 'string' && requestBody.birthday.trim() !== '') {
      let birthdayValue = requestBody.birthday.trim();

      // Normalize the birthday by removing extra spaces
      birthdayValue = birthdayValue.replace(/\s+/g, '');

      // Backend expects ISO format (YYYY-MM-DD)
      const isoPattern = /^\d{4}-\d{2}-\d{2}$/;

      // More flexible patterns for various input formats
      const mdyPattern = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/; // MM-DD-YYYY or M-D-YYYY
      const dmyPattern = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/; // DD-MM-YYYY or D-M-YYYY
      const ymdPattern = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/; // YYYY-MM-DD or YYYY-M-D

      let validFormat = isoPattern.test(birthdayValue);

      // Try MDY pattern (US format)
      if (!validFormat && mdyPattern.test(birthdayValue)) {
        const matches = birthdayValue.match(mdyPattern);
        if (matches) {
          const [, month, day, year] = matches;
          const paddedMonth = month.padStart(2, '0');
          const paddedDay = day.padStart(2, '0');
          requestBody.birthday = `${year}-${paddedMonth}-${paddedDay}`;
          validFormat = true;
        }
      }

      // Try DMY pattern (European format)
      if (!validFormat && dmyPattern.test(birthdayValue)) {
        const matches = birthdayValue.match(dmyPattern);
        if (matches) {
          const [, day, month, year] = matches;
          const paddedMonth = month.padStart(2, '0');
          const paddedDay = day.padStart(2, '0');
          requestBody.birthday = `${year}-${paddedMonth}-${paddedDay}`;
          validFormat = true;
        }
      }

      // Try YMD pattern (ISO-like format with possible missing padding)
      if (!validFormat && ymdPattern.test(birthdayValue)) {
        const matches = birthdayValue.match(ymdPattern);
        if (matches) {
          const [, year, month, day] = matches;
          const paddedMonth = month.padStart(2, '0');
          const paddedDay = day.padStart(2, '0');
          requestBody.birthday = `${year}-${paddedMonth}-${paddedDay}`;
          validFormat = true;
        }
      }

      // Final validation check
      if (!validFormat || isNaN(Date.parse(requestBody.birthday))) {
        console.error(`${logPrefix} Validation error: Invalid birthday format.`);
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Validation error: 'birthday' should be in a standard date format (YYYY-MM-DD, MM-DD-YYYY, or DD-MM-YYYY)." }),
          headers: COMMON_HEADERS,
        };
      }

      console.log(`${logPrefix} Successfully parsed birthday input "${birthdayValue}" to ISO format: ${requestBody.birthday}`);
    }

    console.log(`${logPrefix} Payload validation for POST passed.`);

    // 4. Check for Duplicate Contact
    console.log(`${logPrefix} Checking for duplicate contact...`);
    try {
      let duplicateCheckQuery = supabaseAdmin
        .from(TABLE_NAME)
        .select('contact_id, first_name, last_name, email, phone, company, job_title') // Select a few fields for the response
        .eq('user_id', userId);

      // Define fields to check for exact match, including nulls
      const fieldsToCompare: (keyof ContactCreatePayload)[] = [
        'first_name',
        'middle_name',
        'last_name',
        'nickname',
        'email',
        'phone',
        'company',
        'job_title',
        'street_address', 'street_address_2', 'city', 'state_province', 'postal_code', 'country',
        'website',
        'birthday',
        'notes'
      ];

      for (const field of fieldsToCompare) {
        const value = requestBody[field];
        if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
          // Treat undefined, null, or empty string in payload as needing to match NULL in DB
          duplicateCheckQuery = duplicateCheckQuery.is(field, null);
        } else if (typeof value === 'string') {
          duplicateCheckQuery = duplicateCheckQuery.eq(field, value.trim());
        } else {
          // Since ContactCreatePayload defines all fields as string | null | undefined,
          // this case should never occur. We'll throw an error for type safety.
          throw new Error(`${logPrefix} Duplicate check: Field '${field}' has unexpected type: ${typeof value}`);
        }
      }

      const { data: existingContacts, error: duplicateCheckError } = await duplicateCheckQuery;

      if (duplicateCheckError) {
        console.error(`${logPrefix} Supabase error during duplicate check:`, duplicateCheckError.message);
        // Proceed with creation if duplicate check itself fails, or handle error differently
        // For now, let's log and proceed, assuming it's safer to create than to block due to a check error.
        // Consider returning 500 if this check is critical and must not fail.
      } else if (existingContacts && existingContacts.length > 0) {
        console.warn(`${logPrefix} Duplicate contact found for user ${userId}. Details:`, existingContacts);
        return {
          statusCode: 409, // Conflict
          body: JSON.stringify({
            message: "A contact with these exact details already exists.",
            existingContact: existingContacts[0] // Return the first found duplicate
          }),
          headers: COMMON_HEADERS,
        };
      }
      console.log(`${logPrefix} No duplicate contact found. Proceeding with creation.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`${logPrefix} Error during duplicate contact check: ${errorMessage}`);
      // Optional: Decide if this error should prevent contact creation or just be logged
      // For now, proceeding with creation to avoid blocking valid requests due to check issues.
      // return { statusCode: 500, body: JSON.stringify({ message: `Error checking for duplicate contact: ${errorMessage}` }), headers: COMMON_HEADERS };
    }

    // 5. Prepare data for Supabase (aligns with schema.sql and backend/types.ts)
    const firstName = requestBody.first_name.trim();
    const lastName = requestBody.last_name ? requestBody.last_name.trim() : '';

    // Generate formatted address from components if possible
    let formattedAddress: string | null = null;
    if (requestBody.street_address) {
      const addressParts: string[] = [];
      
      // Add street address
      addressParts.push(requestBody.street_address.trim());
      
      // Add second line if present
      if (requestBody.street_address_2) {
        addressParts.push(requestBody.street_address_2.trim());
      }
      
      // Format city, state/province, and postal code on one line
      const cityStatePostal: string[] = [];
      if (requestBody.city) cityStatePostal.push(requestBody.city.trim());
      
      // Add state/province and postal code if present (now optional - no longer required)
      // Only include non-empty values
      if ((requestBody.state_province && requestBody.state_province.trim() !== '') || 
          (requestBody.postal_code && requestBody.postal_code.trim() !== '')) {
        const statePostal: string[] = [];
        if (requestBody.state_province && requestBody.state_province.trim() !== '') 
          statePostal.push(requestBody.state_province.trim());
        if (requestBody.postal_code && requestBody.postal_code.trim() !== '') 
          statePostal.push(requestBody.postal_code.trim());
        
        if (statePostal.length > 0) {
          if (cityStatePostal.length > 0) {
            cityStatePostal[0] += `, ${statePostal.join(' ')}`;
          } else {
            cityStatePostal.push(statePostal.join(' '));
          }
        }
      }
      
      if (cityStatePostal.length > 0) {
        addressParts.push(cityStatePostal.join(', '));
      }
      
      // Add country if present
      if (requestBody.country) {
        addressParts.push(requestBody.country.trim());
      }
      
      // Join all parts with newlines to create formatted address
      formattedAddress = addressParts.join('\n').trim();
    }
    
    // Define the shape we need for the contact insert
const contactToInsert = {
      user_id: userId,
      // Personal information
      first_name: firstName, // Use from request
      middle_name: requestBody.middle_name?.trim() || null,
      last_name: lastName,   // Use from request
      nickname: requestBody.nickname?.trim() || null,
      birthday: requestBody.birthday?.trim() || null,
      
      // Contact information
      email: requestBody.email?.trim() || null,
      phone: requestBody.phone?.trim() || null,
      mobile_phone: requestBody.mobile_phone?.trim() || null,
      work_phone: requestBody.work_phone?.trim() || null,
      website: requestBody.website?.trim() || null,
      
      // Address fields
      street_address: requestBody.street_address?.trim() || null,
      street_address_2: requestBody.street_address_2?.trim() || null,
      city: requestBody.city?.trim() || null,
      state_province: requestBody.state_province?.trim() || null,
      postal_code: requestBody.postal_code?.trim() || null,
      country: requestBody.country?.trim() || null,
      formatted_address: formattedAddress,
      
      // Professional information
      company: requestBody.company?.trim() || null,
      job_title: requestBody.job_title?.trim() || null,
      department: requestBody.department?.trim() || null,
      
      // Social media fields
      social_linkedin: requestBody.social_linkedin?.trim() || null,
      social_twitter: requestBody.social_twitter?.trim() || null,
      
      // Tags and preferences 
      tags: requestBody.tags || null,
      preferred_contact_method: requestBody.preferred_contact_method?.trim() || null,
      timezone: requestBody.timezone?.trim() || null,
      language: requestBody.language?.trim() || null,
      
      // Additional information
      notes: requestBody.notes?.trim() || null,
    };

    console.log(`${logPrefix} Prepared contact data for Supabase insert: ${JSON.stringify(contactToInsert)}`);

    // 5. Supabase Interaction
    try {
      console.log(`${logPrefix} Attempting to insert contact into Supabase...`);
      const { data, error: insertError } = await supabaseAdmin
        .from(TABLE_NAME)
        .insert(contactToInsert)
        .select() // Return the inserted row(s)
        .single(); // Expecting a single row to be inserted and returned

      if (insertError) {
        console.error(`${logPrefix} Supabase insert error: ${insertError.message}. Details: ${JSON.stringify(insertError)}`);
        if ((insertError as PostgrestError).code === '23505') { // Unique violation
           return {
            statusCode: 409, // Conflict
            body: JSON.stringify({ message: `Failed to create contact: ${insertError.message}. A similar contact might already exist.` }),
            headers: COMMON_HEADERS,
          };
        }
        return {
          statusCode: 500,
          body: JSON.stringify({ message: `Failed to create contact: ${insertError.message}` }),
          headers: COMMON_HEADERS,
        };
      }

      if (!data) {
          console.error(`${logPrefix} Supabase insert error: No data returned after insert.`);
          return {
              statusCode: 500,
              body: JSON.stringify({ message: "Failed to create contact: No data returned from database." }),
              headers: COMMON_HEADERS,
          };
      }

      const createdContact = data as Contact;
      console.log(`${logPrefix} Successfully created contact. Response data: ${JSON.stringify(createdContact)}`);
      return {
        statusCode: 201,
        body: JSON.stringify(createdContact),
        headers: COMMON_HEADERS,
      };
    } catch (dbError) {
      const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
      console.error(`${logPrefix} Unexpected error during Supabase insert operation: ${errorMessage}`);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: `An unexpected error occurred: ${errorMessage}` }),
        headers: COMMON_HEADERS,
      };
    }
  } // --- End of POST handling ---

  // --- GET: Fetch all contacts for the user ---
  else if (httpMethod === 'GET') {
    // 1. Authentication & Authorization
    const userId = getAuthenticatedUserId(event, context);
    if (!userId) {
      console.error(`${logPrefix} GET error: User not authenticated.`);
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Authentication required to fetch contacts." }),
        headers: COMMON_HEADERS,
      };
    }
    console.log(`${logPrefix} Authenticated user ID for GET: ${userId}`);

    const pathParts = event.path.split('/').filter(part => part !== '');
    // Check if the last significant part of the path is a potential contact_id
    // e.g. /contacts/some-uuid -> pathId = some-uuid
    // e.g. /contacts -> pathId = contacts (not a UUID)
    // e.g. /contacts/ -> pathId = contacts (not a UUID)
    const potentialPathId = pathParts.length > 1 && pathParts[pathParts.length-2].toLowerCase() === 'contacts' 
                            ? pathParts[pathParts.length - 1] 
                            : null;
                            
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    const contactIdFromPath = potentialPathId && uuidRegex.test(potentialPathId) ? potentialPathId : null;

    const { search_term: searchTerm, contact_id: contactIdFromQuery, page: pageStr, limit: limitStr } = queryStringParameters || {};
    const contactIdToFetch = contactIdFromPath || contactIdFromQuery; // Prioritize ID from path

    const page = parseInt(pageStr || '1', 10);
    const limit = parseInt(limitStr || '20', 10);
    const offset = (page - 1) * limit;

    // If a specific contact_id is provided (either from path or query), fetch that contact only
    if (contactIdToFetch && typeof contactIdToFetch === 'string') {
      console.log(`${logPrefix} Fetching specific contact by ID: ${contactIdToFetch}`);
      const { data: specificContact, error: specificError } = await supabaseAdmin
        .from(TABLE_NAME)
        .select('*')
        .eq('user_id', userId)
        .eq('contact_id', contactIdToFetch)
        .maybeSingle(); // Use maybeSingle() as contact_id should be unique

      if (specificError) {
        console.error(`${logPrefix} Supabase error fetching specific contact:`, specificError.message);
        return {
          statusCode: 500,
          body: JSON.stringify({ // Return a simple error object, not ContactsApiResponse
            message: `Error fetching contact: ${specificError.message}`,
          }),
          headers: COMMON_HEADERS,
        };
      }

      if (!specificContact) {
        console.log(`${logPrefix} No contact found with ID ${contactIdToFetch} for user ${userId}`);
        return {
          statusCode: 404,
          body: JSON.stringify({ // Return a simple error object
            message: `Contact with ID ${contactIdToFetch} not found.`,
          }),
          headers: COMMON_HEADERS,
        };
      }
      // Apply the Google filter even for single contact fetches, just in case
              const filteredContacts = applyContactQualityFilters([specificContact], logPrefix);
      const finalContact = filteredContacts.length > 0 ? filteredContacts[0] : null;

      if (!finalContact) {
         console.log(`${logPrefix} Contact ID ${contactIdToFetch} was filtered out (e.g. erroneous Google contact).`);
         return {
          statusCode: 404,
          body: JSON.stringify({
            message: `Contact with ID ${contactIdToFetch} not found or was filtered.`,
          }),
          headers: COMMON_HEADERS,
        };
      }
      
      // For a single contact fetch, return the contact object directly
      return {
        statusCode: 200,
        body: JSON.stringify(finalContact), // Return the single contact object
        headers: COMMON_HEADERS,
      };
    }

    // If a searchTerm is provided, perform a search
    if (searchTerm && typeof searchTerm === 'string' && searchTerm.trim() !== '') {
      const searchValue = searchTerm.trim();
      console.log(`${logPrefix} Searching for contacts matching: "${searchValue}" using Full-Text Search.`);

      try {
        // Use textSearch on the 'fts_document' column
        const ftsCountQuery = supabaseAdmin
          .from(TABLE_NAME)
          .select('count', { count: 'exact' })
          .eq('user_id', userId)
          .textSearch('fts_document', searchValue, {
            type: 'websearch',
            config: 'english',
          });

        const ftsDataQuery = supabaseAdmin
          .from(TABLE_NAME)
          .select('*')
          .eq('user_id', userId)
          .textSearch('fts_document', searchValue, {
            type: 'websearch',
            config: 'english',
          })
          .range(offset, offset + limit -1);
        
        const [ftsCountResult, ftsDataResult] = await Promise.all([ftsCountQuery, ftsDataQuery]);

        const ftsData = ftsDataResult.data as Contact[] | null;
        const ftsCount = ftsCountResult.count;

        let ftsError: PostgrestError | null = null;
        if (ftsDataResult.error) {
          ftsError = ftsDataResult.error;
        }
        if (ftsCountResult.error) {
          if (ftsError) {
            ftsError.message = `FTS Data error: ${ftsError.message || 'Unknown'}. FTS Count error: ${ftsCountResult.error.message || 'Unknown'}.`;
          } else {
            ftsError = ftsCountResult.error;
          }
        }

        let ftsResults: Contact[] = ftsData || [];
        // Filter out erroneous Google contacts from FTS results
                  ftsResults = applyContactQualityFilters(ftsResults, logPrefix);

        if (ftsError) {
          console.error(`${logPrefix} Supabase error during Full-Text Search:`, ftsError.message);
          // Don't return immediately, proceed to fuzzy search if FTS fails
        } else {
          console.log(`${logPrefix} Full-Text Search found ${ftsResults.length} contacts (after filtering) for term: "${searchValue}"`);
        }

        const combinedResults: Contact[] = ftsResults;
        let finalCount = ftsCount ?? 0; // Initial count from FTS

        const FUZZY_SEARCH_THRESHOLD = 3; // If FTS results are less than this, augment with fuzzy.
        const MIN_SEARCH_TERM_LENGTH_FOR_FUZZY = 3; // Only do fuzzy if search term is reasonably long

        if (combinedResults.length < FUZZY_SEARCH_THRESHOLD && searchValue.length >= MIN_SEARCH_TERM_LENGTH_FOR_FUZZY) {
          console.log(`${logPrefix} FTS results were sparse (${combinedResults.length}) or failed. Augmenting with trigram-powered ILIKE search.`);
          const ilikeSearchTerm = `%${searchValue.replace(/ /g, '%')}%`;

          // Define the expected shape of a Supabase response object for these queries
          type SupabaseFuzzyResult = {
            data: Contact[] | null;
            error: PostgrestError | null;
            count: number | null;
            status: number; // Supabase responses include status and statusText
            statusText: string;
          };

          const createFuzzyQueryPromise = async (field: string): Promise<SupabaseFuzzyResult> => {
            try {
              const dataQuery = supabaseAdmin
                .from(TABLE_NAME)
                .select('*')
                .eq('user_id', userId)
                .ilike(field, ilikeSearchTerm)
                .range(offset, offset + limit - 1);
          
              const countQuery = supabaseAdmin
                .from(TABLE_NAME)
                .select('count', { count: 'exact' })
                .eq('user_id', userId)
                .ilike(field, ilikeSearchTerm);
          
              const [dataResult, countResult] = await Promise.all([dataQuery, countQuery]);
          
              let consolidatedError: PostgrestError | null = null;
              if (dataResult.error) {
                consolidatedError = dataResult.error;
              }
              if (countResult.error) {
                if (consolidatedError) {
                  consolidatedError.message = `Fuzzy Data error (${field}): ${consolidatedError.message || 'Unknown'}. Fuzzy Count error (${field}): ${countResult.error.message || 'Unknown'}.`;
                } else {
                  consolidatedError = countResult.error;
                }
              }
          
              let status = dataResult.status;
              let statusText = dataResult.statusText;
          
              if (consolidatedError) {
                // If there's an error, status might not be accurately reflecting the overall operation.
                // Prioritize error status or use a generic 500.
                if (dataResult.error && countResult.error) {
                  status = dataResult.status !== 200 ? dataResult.status : (countResult.status !== 200 ? countResult.status : 500);
                  statusText = "Multiple errors in fuzzy search";
                } else if (dataResult.error) {
                  status = dataResult.status;
                  statusText = dataResult.statusText;
                } else { // countResult.error must be true
                  status = countResult.status;
                  statusText = countResult.statusText;
                }
              }
          
              return {
                data: dataResult.data as Contact[] | null,
                error: consolidatedError,
                count: countResult.count,
                status: status,
                statusText: statusText,
              };
            } catch (error) {
              console.error(`${logPrefix} Critical error in createFuzzyQueryPromise for field ${field}:`, error);
              return {
                data: null,
                error: { name: 'FuzzyPromiseError', message: `Unexpected error processing field ${field}: ${(error as Error).message}`, details: '', hint: '', code: 'FUZZY_PROMISE_ERR' },
                count: 0,
                status: 500,
                statusText: 'Internal Server Error during fuzzy query construction',
              };
            }
          };
          
          const fieldsToSearchFuzzy = ['first_name', 'last_name', 'company', 'email', 'job_title', 'notes'];
          const fuzzyQueryBuilders: Promise<SupabaseFuzzyResult>[] = fieldsToSearchFuzzy.map(field => createFuzzyQueryPromise(field));

          const settledFuzzyResults = await Promise.allSettled(fuzzyQueryBuilders);
          const fuzzyMatches: Contact[] = [];
          let maxFuzzyCount = 0;

          settledFuzzyResults.forEach((result, index) => {
            const field = ['first_name', 'last_name', 'company', 'email', 'job_title', 'notes'][index];
            if (result.status === 'fulfilled') {
              // Now result.value is SupabaseFuzzyResult
              const supabaseResult = result.value;
              if (supabaseResult.error) {
                console.warn(`${logPrefix} Supabase error during fuzzy ILIKE search on ${field}:`, supabaseResult.error.message);
              } else if (supabaseResult.data) {
                const fieldMatches = applyContactQualityFilters(supabaseResult.data, `${logPrefix}[fuzzy-${field}]`);
                fuzzyMatches.push(...fieldMatches);
                if (supabaseResult.count && supabaseResult.count > maxFuzzyCount) {
                  maxFuzzyCount = supabaseResult.count;
                }
                console.log(`${logPrefix} Fuzzy ILIKE search on ${field} found ${fieldMatches.length} contacts (after filtering).`);
              }
            } else {
              console.error(`${logPrefix} Promise rejected for fuzzy ILIKE search on ${field}:`, result.reason);
            }
          });

          // Deduplicate results (ftsResults might already contain some fuzzy matches)
          const allResultIds = new Set(combinedResults.map(c => c.contact_id));
          const uniqueFuzzyMatches = fuzzyMatches.filter(c => !allResultIds.has(c.contact_id));
          combinedResults.push(...uniqueFuzzyMatches);
          
          // Update finalCount if fuzzy search yielded more results overall
          // This logic might need refinement if FTS and fuzzy counts are very different
          if (maxFuzzyCount > (ftsCount || 0)) {
            finalCount = combinedResults.length; // Or a sum of distinct counts, this is an approximation
          }
           // If FTS returned 0 results, and fuzzy search found some, use fuzzy count.
           if ((ftsCount === null || ftsCount === 0) && fuzzyMatches.length > 0) {
            finalCount = combinedResults.length; // Approximate based on combined unique results.
          }
        }
        
        // Final deduplication of combinedResults just in case
        const finalUniqueContacts = Array.from(new Map(combinedResults.map(contact => [contact.contact_id, contact])).values());
        // And ensure the Google filter is applied one last time on the final combined list
        const trulyFinalContacts = applyContactQualityFilters(finalUniqueContacts, `${logPrefix}[final-filter]`);


        const totalPages = Math.ceil(finalCount / limit);

        console.log(`${logPrefix} Returning ${trulyFinalContacts.length} contacts for search term "${searchValue}". Total potential matches (approx): ${finalCount}. Page: ${page}, Limit: ${limit}`);
        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            contacts: trulyFinalContacts,
            pagination: { total: finalCount, page, limit, totalPages },
          }),
          headers: COMMON_HEADERS,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`${logPrefix} Error during contact search:`, errorMessage);
        return {
          statusCode: 500,
          body: JSON.stringify({
            success: false,
            message: `Error searching contacts: ${errorMessage}`,
            contacts: [],
          }),
          headers: COMMON_HEADERS,
        };
      }
    } else {
      // Default: Fetch all contacts for the user with pagination if no searchTerm or contact_id
      console.log(`${logPrefix} Fetching all contacts for user ${userId} with pagination. Page: ${page}, Limit: ${limit}`);
      try {
        const countQuery = supabaseAdmin
          .from(TABLE_NAME)
          .select('count', { count: 'exact' })
          .eq('user_id', userId);

        const dataQuery = supabaseAdmin
          .from(TABLE_NAME)
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        const [countResult, dataResult] = await Promise.all([countQuery, dataQuery]);
        
        const totalCount = countResult.count;
        const allContactsData = dataResult.data as Contact[] | null;
        
        let combinedError: PostgrestError | null = null;
        if (dataResult.error) {
          combinedError = dataResult.error;
        }
        if (countResult.error) {
          if (combinedError) {
            combinedError.message = `Data error: ${combinedError.message || 'Unknown'}. Count error: ${countResult.error.message || 'Unknown'}.`;
          } else {
            combinedError = countResult.error;
          }
        }

        if (combinedError) {
          console.error(`${logPrefix} Supabase error fetching all contacts:`, combinedError.message);
          return {
            statusCode: 500,
            body: JSON.stringify({ // Return the list-style response here
              success: false,
              message: `Error fetching contacts: ${combinedError.message}`,
              contacts: [],
              pagination: { total: 0, page, limit, totalPages: 0 }
            }),
            headers: COMMON_HEADERS,
          };
        }
        let allContacts = allContactsData || [];
        // Filter out erroneous Google contacts from all contacts list
        allContacts = applyContactQualityFilters(allContacts, logPrefix);
        
        const totalPages = Math.ceil((totalCount ?? 0) / limit);

        return {
          statusCode: 200,
          body: JSON.stringify({ // Return the list-style response here
            success: true,
            contacts: allContacts,
            pagination: { total: totalCount ?? 0, page, limit, totalPages },
          }),
          headers: COMMON_HEADERS,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`${logPrefix} Unexpected error fetching all contacts: ${errorMessage}`);
        return {
          statusCode: 500,
          body: JSON.stringify({ // Return the list-style response here
            success: false,
            message: `An unexpected error occurred while fetching contacts: ${errorMessage}`,
            contacts: [],
            pagination: { total: 0, page, limit, totalPages: 0 }
          }),
          headers: COMMON_HEADERS,
        };
      }
    }
  } // --- End of GET handling ---

  // --- PUT: Update a specific contact ---
  else if (httpMethod === 'PUT') {
    // 1. Authentication & Authorization
    const userId = getAuthenticatedUserId(event, context);
    if (!userId) {
      console.error(`${logPrefix} PUT error: User not authenticated.`);
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Authentication required to update contact." }),
        headers: COMMON_HEADERS,
      };
    }
    console.log(`${logPrefix} PUT request for user ${userId}`);

    try {
      // 2. Extract contact_id from path
      const pathParts = event.path.split('/').filter(part => part !== '');
      const contactId = pathParts[pathParts.length - 1]; // Assuming last part is the ID

      if (!contactId || contactId === 'contacts') { // 'contacts' would be the base path if no ID
        console.error(`${logPrefix} PUT error: contact_id missing in path.`);
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "contact_id is required in the path for PUT requests (e.g., /contacts/{contact_id})." }),
          headers: COMMON_HEADERS,
        };
      }
      console.log(`${logPrefix} Attempting to update contact_id: ${contactId}`);

      // 3. Parse and validate request body
      if (!eventBodyString) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Request body is required for PUT." }),
          headers: COMMON_HEADERS,
        };
      }
      let requestBody: ContactUpdatePayload; // Changed from Partial<ContactCreatePayload>
      try {
        requestBody = JSON.parse(eventBodyString);
      } catch (parseError) {
        console.error(`${logPrefix} JSON parsing error for PUT:`, parseError);
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Invalid JSON format in request body." }),
          headers: COMMON_HEADERS,
        };
      }

      // Helper function to preserve empty strings in fields
      const preserveEmptyString = (value: string | null | undefined): string | null => {
        if (value === null) {
          return null;
        } else if (typeof value === 'string') {
          // Keep empty strings as empty strings, not null
          return value;
        }
        // For undefined or other types, return null or handle as per field requirements
        // For address components, undefined should typically become null in the DB
        return null; 
      };

      // 4. Construct update object with validations
      const updateData: Partial<Omit<Contact, 'contact_id' | 'user_id' | 'created_at' /* updated_at is handled by db */>> = {};

      // Handle first_name and last_name updates independently
      if (requestBody.first_name !== undefined) {
        if (typeof requestBody.first_name === 'string' && requestBody.first_name.trim() !== '') {
          updateData.first_name = requestBody.first_name.trim();
        } else if (requestBody.first_name === null || (typeof requestBody.first_name === 'string' && requestBody.first_name.trim() === '')){
          // first_name is required in the DB, so validate it's not empty
          return { 
            statusCode: 400, 
            body: JSON.stringify({ message: "Validation error: 'first_name', if provided for update, must be a non-empty string." }), 
            headers: COMMON_HEADERS 
          };
        }
      }
      
      if (requestBody.last_name !== undefined) {
        if (typeof requestBody.last_name === 'string') {
          updateData.last_name = requestBody.last_name.trim(); // Allows empty string
        } else if (requestBody.last_name === null) {
          updateData.last_name = ''; // Treat null as empty string
        }
      }

      if (requestBody.email !== undefined) {
        if (requestBody.email === null) {
          updateData.email = null;
        } else if (requestBody.email.trim() === '') {
          updateData.email = '';
        } else {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(requestBody.email.trim())) {
            return { statusCode: 400, body: JSON.stringify({ message: "Validation error: 'email' has an invalid format." }), headers: COMMON_HEADERS };
          }
          updateData.email = requestBody.email.trim();
        }
      }
      if (requestBody.phone !== undefined) {
        if (requestBody.phone === null) {
          updateData.phone = null;
        } else if (requestBody.phone.trim() === '') {
          updateData.phone = '';
        } else {
          // More permissive regex for phone numbers
          const phoneRegex = /^[+]?([0-9\s-().ext]{3,30})$/; 
          if (!phoneRegex.test(requestBody.phone.trim())) {
            return { statusCode: 400, body: JSON.stringify({ message: "Validation error: 'phone' has an invalid format. Please use numbers and common phone characters (e.g., (), -, . ext)." }), headers: COMMON_HEADERS };
          }
          updateData.phone = requestBody.phone.trim();
        }
      }
       if (requestBody.mobile_phone !== undefined) {
        if (requestBody.mobile_phone === null) {
          updateData.mobile_phone = null;
        } else if (requestBody.mobile_phone.trim() === '') {
          updateData.mobile_phone = '';
        } else {
          const phoneRegex = /^[+]?([0-9\s-().ext]{3,30})$/;
          if (!phoneRegex.test(requestBody.mobile_phone.trim())) {
            return { statusCode: 400, body: JSON.stringify({ message: "Validation error: 'mobile_phone' has an invalid format. Please use numbers and common phone characters." }), headers: COMMON_HEADERS };
          }
          updateData.mobile_phone = requestBody.mobile_phone.trim();
        }
      }
      if (requestBody.work_phone !== undefined) {
        if (requestBody.work_phone === null) {
          updateData.work_phone = null;
        } else if (requestBody.work_phone.trim() === '') {
          updateData.work_phone = '';
        } else {
          const phoneRegex = /^[+]?([0-9\s-().ext]{3,30})$/;
          if (!phoneRegex.test(requestBody.work_phone.trim())) {
            return { statusCode: 400, body: JSON.stringify({ message: "Validation error: 'work_phone' has an invalid format. Please use numbers and common phone characters." }), headers: COMMON_HEADERS };
          }
          updateData.work_phone = requestBody.work_phone.trim();
        }
      }
      if (requestBody.company !== undefined) {
        updateData.company = preserveEmptyString(requestBody.company);
      }
      if (requestBody.job_title !== undefined) {
        updateData.job_title = preserveEmptyString(requestBody.job_title);
      }
      if (requestBody.department !== undefined) {
        updateData.department = preserveEmptyString(requestBody.department);
      }
      if (requestBody.middle_name !== undefined) {
        updateData.middle_name = preserveEmptyString(requestBody.middle_name);
      }
      if (requestBody.nickname !== undefined) {
        updateData.nickname = preserveEmptyString(requestBody.nickname);
      }

      // --- Process Address Fields ---
      if (requestBody.street_address !== undefined) {
        updateData.street_address = preserveEmptyString(requestBody.street_address);
      }
      if (requestBody.street_address_2 !== undefined) {
        updateData.street_address_2 = preserveEmptyString(requestBody.street_address_2);
      }
      if (requestBody.city !== undefined) {
        updateData.city = preserveEmptyString(requestBody.city);
      }
      if (requestBody.state_province !== undefined) {
        updateData.state_province = preserveEmptyString(requestBody.state_province);
        // We explicitly allow empty or null values for state_province
      }
      if (requestBody.postal_code !== undefined) {
        updateData.postal_code = preserveEmptyString(requestBody.postal_code);
        // We explicitly allow empty or null values for postal_code
      }
      if (requestBody.country !== undefined) {
        updateData.country = preserveEmptyString(requestBody.country);
      }

      // Regenerate formatted_address on the backend for consistency
      // Use the values from updateData which now contain the incoming changes
      let newFormattedAddress: string | null = null;
      if (updateData.street_address || updateData.city || updateData.country) {
        // Only regenerate formatted address if core address fields are present
        // State/province and postal_code are no longer required
        const addressParts: string[] = [];
        if (updateData.street_address) addressParts.push(updateData.street_address.trim());
        if (updateData.street_address_2) addressParts.push(updateData.street_address_2.trim());
        
        const cityStatePostal: string[] = [];
        if (updateData.city) cityStatePostal.push(updateData.city.trim());
        
        // Include state and postal code only if they're provided, but they're now optional
        const statePostalInner: string[] = [];
        if (updateData.state_province && updateData.state_province.trim() !== '') 
          statePostalInner.push(updateData.state_province.trim());
        if (updateData.postal_code && updateData.postal_code.trim() !== '') 
          statePostalInner.push(updateData.postal_code.trim());
        
        if (statePostalInner.length > 0) {
          if (cityStatePostal.length > 0) {
            cityStatePostal[0] += (cityStatePostal[0].length > 0 ? ', ' : '') + statePostalInner.join(' ');
          } else {
            cityStatePostal.push(statePostalInner.join(' '));
          }
        }
        if (cityStatePostal.length > 0) addressParts.push(cityStatePostal.join('')); // No extra comma if city was empty

        if (updateData.country) addressParts.push(updateData.country.trim());
        newFormattedAddress = addressParts.join('\n').trim();
      }
      // Only update formatted_address if it has been changed or components changed
      // Or if it was explicitly provided by client (though backend regen is preferred)
      if (newFormattedAddress !== null || requestBody.formatted_address !== undefined) {
          updateData.formatted_address = newFormattedAddress; // Prioritize backend generated
      }


      if (requestBody.website !== undefined) {
        if (requestBody.website === null) {
          updateData.website = null;
        } else if (requestBody.website.trim() === '') {
          updateData.website = '';
        } else {
          try {
            new URL(requestBody.website.trim()); // Validate URL
            updateData.website = requestBody.website.trim();
          } catch {
            return {
              statusCode: 400,
              body: JSON.stringify({ message: "Validation error: 'website' has an invalid URL format. Please include http:// or https:// prefix." }),
              headers: COMMON_HEADERS
            };
          }
        }
      }

      if (requestBody.birthday !== undefined) {
        if (requestBody.birthday === null) {
          updateData.birthday = null;
        } else if (requestBody.birthday.trim() === '') {
          // If an empty string is provided for birthday, treat it as null for the database
          updateData.birthday = null;
        } else {
          // Validate date format - backend expects ISO format (YYYY-MM-DD)
          let birthdayValue = requestBody.birthday.trim();
          
          // Normalize the birthday by removing extra spaces
          birthdayValue = birthdayValue.replace(/\s+/g, '');
          
          // Backend expects ISO format (YYYY-MM-DD)
          const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
          
          // More flexible patterns for various input formats
          const mdyPattern = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/; // MM-DD-YYYY or M-D-YYYY
          const dmyPattern = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/; // DD-MM-YYYY or D-M-YYYY
          const ymdPattern = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/; // YYYY-MM-DD or YYYY-M-D
          
          let validFormat = isoPattern.test(birthdayValue);
          let isoFormattedDate = birthdayValue;
          
          // Try MDY pattern (US format)
          if (!validFormat && mdyPattern.test(birthdayValue)) {
            const matches = birthdayValue.match(mdyPattern);
            if (matches) {
              const [, month, day, year] = matches;
              const paddedMonth = month.padStart(2, '0');
              const paddedDay = day.padStart(2, '0');
              isoFormattedDate = `${year}-${paddedMonth}-${paddedDay}`;
              validFormat = true;
            }
          }
          
          // Try DMY pattern (European format)
          if (!validFormat && dmyPattern.test(birthdayValue)) {
            const matches = birthdayValue.match(dmyPattern);
            if (matches) {
              const [, day, month, year] = matches;
              const paddedMonth = month.padStart(2, '0');
              const paddedDay = day.padStart(2, '0');
              isoFormattedDate = `${year}-${paddedMonth}-${paddedDay}`;
              validFormat = true;
            }
          }
          
          // Try YMD pattern (ISO-like format with possible missing padding)
          if (!validFormat && ymdPattern.test(birthdayValue)) {
            const matches = birthdayValue.match(ymdPattern);
            if (matches) {
              const [, year, month, day] = matches;
              const paddedMonth = month.padStart(2, '0');
              const paddedDay = day.padStart(2, '0');
              isoFormattedDate = `${year}-${paddedMonth}-${paddedDay}`;
              validFormat = true;
            }
          }
          
          // Final validation check
          if (!validFormat || isNaN(Date.parse(isoFormattedDate))) {
            return {
              statusCode: 400,
              body: JSON.stringify({ message: "Validation error: 'birthday' should be in a standard date format (YYYY-MM-DD, MM-DD-YYYY, or DD-MM-YYYY)." }),
              headers: COMMON_HEADERS
            };
          }
          
          updateData.birthday = isoFormattedDate;
          console.log(`${logPrefix} Successfully parsed birthday input "${birthdayValue}" to ISO format: ${isoFormattedDate}`);
        }
      }

      if (requestBody.notes !== undefined) {
        updateData.notes = preserveEmptyString(requestBody.notes);
        console.log(`${logPrefix} Notes update - Value: ${typeof requestBody.notes === 'string' ? `"${requestBody.notes}"` : requestBody.notes}, After processing: ${typeof updateData.notes === 'string' ? `"${updateData.notes}"` : updateData.notes}`);
      }

      if (Object.keys(updateData).length === 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "No valid fields provided for update." }),
          headers: COMMON_HEADERS,
        };
      }

      // 5. Perform update in Supabase
      console.log(`${logPrefix} Updating contact ${contactId} for user ${userId} with data:`, updateData);
      const { data, error: updateError } = await supabaseAdmin
        .from(TABLE_NAME)
        .update(updateData)
        .eq('contact_id', contactId)
        .eq('user_id', userId) // Ensure user owns the contact
        .select()
        .single(); // Expect a single row to be updated and returned

      if (updateError) {
        console.error(`${logPrefix} Supabase update error:`, updateError.message);
        // Check if error is due to contact not found (or not owned)
        if ((updateError as PostgrestError).code === 'PGRST116') { // PostgREST code for "No matching query does not exist"
          return {
            statusCode: 404,
            body: JSON.stringify({ message: `Contact with id ${contactId} not found or you do not have permission to update it.` }),
            headers: COMMON_HEADERS,
          };
        }
        return {
          statusCode: 500,
          body: JSON.stringify({ message: `Failed to update contact: ${updateError.message}` }),
          headers: COMMON_HEADERS,
        };
      }

      if (!data) { // Should ideally be covered by PGRST116 or other errors, but as a safeguard
          console.error(`${logPrefix} Supabase update error: No data returned after update, or contact not found for user.`);
          return {
              statusCode: 404, // Or 500 if it's unexpected
              body: JSON.stringify({ message: `Failed to update contact ${contactId}. It might not exist or you may not have permission.` }),
              headers: COMMON_HEADERS,
          };
      }

      const updatedContact = data as Contact;
      console.log(`${logPrefix} Successfully updated contact: ${updatedContact.contact_id}`);
      return {
        statusCode: 200,
        body: JSON.stringify(updatedContact),
        headers: COMMON_HEADERS,
      };

    } catch (error) {
      console.error(`${logPrefix} Unexpected error in PUT handler:`, error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "An unexpected error occurred while updating the contact." }),
        headers: COMMON_HEADERS,
      };
    }
  } // --- End of PUT handling ---

  // --- PATCH: Partially update a specific contact ---
  else if (httpMethod === 'PATCH') {
    console.log(`${logPrefix} PATCH request received.`);
    const userId = getAuthenticatedUserId(event, context);
    if (!userId) {
      console.error(`${logPrefix} PATCH error: User not authenticated.`);
      return { statusCode: 401, body: JSON.stringify({ message: "Authentication required to update contact." }), headers: COMMON_HEADERS };
    }
    console.log(`${logPrefix} PATCH request for user ${userId}`);

    let requestBody: { identifier?: string; contact_id?: string; updates: ContactUpdatePayload };
    try {
      if (!eventBodyString) throw new Error("Request body is missing for PATCH.");
      requestBody = JSON.parse(eventBodyString);
      if (!requestBody.updates || Object.keys(requestBody.updates).length === 0) {
        throw new Error("Missing 'updates' object or 'updates' object is empty in request body.");
      }
      if (!requestBody.identifier && !requestBody.contact_id) {
        throw new Error("Either 'identifier' or 'contact_id' must be provided in the request body.");
      }
      console.log(`${logPrefix} Parsed PATCH request body:`, JSON.stringify(requestBody, null, 2));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Invalid request body for PATCH.";
      console.error(`${logPrefix} PATCH error - Invalid request body:`, msg);
      return { statusCode: 400, body: JSON.stringify({ message: msg }), headers: COMMON_HEADERS };
    }

    try {
      let contactToUpdate: Pick<Contact, 'contact_id'> | null = null;

      // 1. Prioritize contact_id if provided
      if (requestBody.contact_id) {
        console.log(`${logPrefix} Attempting to find contact by contact_id: ${requestBody.contact_id}`);
        const { data: contactById, error: idError } = await supabaseAdmin
          .from(TABLE_NAME)
          .select('contact_id')
          .eq('contact_id', requestBody.contact_id)
          .eq('user_id', userId)
          .single();
        if (idError && idError.code !== 'PGRST116') { // PGRST116: Row to update not found
          throw idError;
        }
        if (contactById) {
          contactToUpdate = contactById;
        }
      }

      // 2. If not found by contact_id (or contact_id not provided), try identifier
      if (!contactToUpdate && requestBody.identifier) {
        console.log(`${logPrefix} Contact not found by contact_id or contact_id not provided. Attempting to find by identifier: ${requestBody.identifier}`);
        const identifier = requestBody.identifier;
        let query = supabaseAdmin
          .from(TABLE_NAME)
          .select('contact_id, first_name, last_name, email, phone') // Select all needed fields
          .eq('user_id', userId);

        if (identifier.includes('@')) { // Assume email
          query = query.eq('email', identifier);
        } else { // Assume name (first name, last name, or full name)
          const nameParts = identifier.trim().split(/\s+/);
          query = query.ilike('first_name', `%${nameParts[0]}%`);
          if (nameParts.length > 1) {
            query = query.ilike('last_name', `%${nameParts.slice(1).join(' ')}%`);
          }
        }
        const { data: contactsByIdentifier, error: identifierError } = await query.limit(1); // Take the first match for simplicity
        if (identifierError) throw identifierError;
        if (contactsByIdentifier && contactsByIdentifier.length > 0) {
          contactToUpdate = contactsByIdentifier[0];
        }
      }

      if (!contactToUpdate || !contactToUpdate.contact_id) {
        console.warn(`${logPrefix} PATCH warning: Contact not found with provided identifier/contact_id.`);
        return { statusCode: 404, body: JSON.stringify({ message: "Contact not found with the provided details or you do not have permission." }), headers: COMMON_HEADERS };
      }
      
      console.log(`${logPrefix} Contact found. ID for update: ${contactToUpdate.contact_id}. Applying updates.`);

      // 3. Perform the update
      const { data: updatedContact, error: updateError } = await supabaseAdmin
        .from(TABLE_NAME)
        .update(requestBody.updates)
        .eq('contact_id', contactToUpdate.contact_id)
        .eq('user_id', userId) // Ensure user owns the contact they are updating
        .select()
        .single();

      if (updateError) {
        console.error(`${logPrefix} Supabase PATCH update error:`, updateError.message);
        // Check for specific error codes if needed, e.g., unique constraint violation
        return { statusCode: 500, body: JSON.stringify({ message: `Failed to update contact: ${updateError.message}` }), headers: COMMON_HEADERS };
      }

      console.log(`${logPrefix} Successfully updated contact:`, JSON.stringify(updatedContact, null, 2));
      return {
        statusCode: 200,
        body: JSON.stringify(updatedContact),
        headers: COMMON_HEADERS,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`${logPrefix} Unexpected error in PATCH handler:`, errorMessage);
      if (error instanceof Error && 'code' in error && (error as PostgrestError).code === 'PGRST116') {
        // This can happen if the contact_id from identifier search was deleted just before update
        return { statusCode: 404, body: JSON.stringify({ message: 'Contact not found or became unavailable during update.'}), headers: COMMON_HEADERS };
      }
      return {
        statusCode: 500,
        body: JSON.stringify({ message: `An unexpected error occurred while updating the contact: ${errorMessage}` }),
        headers: COMMON_HEADERS,
      };
    }
  } // --- End of PATCH handling ---

  // --- DELETE: Delete a specific contact ---
  else if (httpMethod === 'DELETE') {
    // 1. Authentication & Authorization
    const userId = getAuthenticatedUserId(event, context);
    if (!userId) {
      console.error(`${logPrefix} DELETE error: User not authenticated.`);
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Authentication required to delete contact." }),
        headers: COMMON_HEADERS,
      };
    }
    console.log(`${logPrefix} DELETE request for user ${userId}`);
    
    // Define our contact identifier for use across try blocks
    let contactIdentifier: ContactIdentifier;

    let requestBody: { identifier?: string; contact_id?: string };
    try {
      // For DELETE operations, the body might be empty if it's coming from the frontend API client
      // that doesn't explicitly send a body with DELETE requests
      if (!eventBodyString) {
        console.log(`${logPrefix} Request body is missing for DELETE, checking path parameters instead.`);
        
        // Extract the contact ID from the path, e.g. "/.netlify/functions/contacts/{contact_id}"
        const pathParts = event.path.split('/');
        const contactIdFromPath = pathParts[pathParts.length - 1];
        
        if (contactIdFromPath && contactIdFromPath !== 'contacts') {
          requestBody = { contact_id: contactIdFromPath };
          console.log(`${logPrefix} Extracted contact_id from path: ${contactIdFromPath}`);
        } else {
          throw new Error("Request body is missing for DELETE and no contact_id found in path.");
        }
      } else {
        requestBody = JSON.parse(eventBodyString);
      }
      
      if (!requestBody.identifier && !requestBody.contact_id) {
        throw new Error("Either 'identifier' or 'contact_id' must be provided for DELETE.");
      }
      
      // Check for various ways to identify the contact
      const typedBody = requestBody as { contact_id?: string; contact_name?: string; identifier?: string; email?: string };
      
      if (typedBody.contact_id === 'contact_id_placeholder' && typedBody.contact_name) {
        // Handle the placeholder case with name identifier
        console.log(`${logPrefix} Contact using name identifier: ${typedBody.contact_name}`);
        contactIdentifier = { type: 'name', name: typedBody.contact_name };
      } else if (typedBody.contact_id && typedBody.contact_id !== 'contact_id_placeholder') {
        // Use contact_id if provided and not a placeholder
        console.log(`${logPrefix} Contact using ID identifier: ${typedBody.contact_id}`);
        contactIdentifier = { type: 'id', contact_id: typedBody.contact_id };
      } else if (typedBody.identifier) {
        // Use the explicit identifier field if provided (could be name, email, etc.)
        console.log(`${logPrefix} Contact using explicit identifier: ${typedBody.identifier}`);
        // Determine if it looks like an email
        if (typedBody.identifier.includes('@')) {
          contactIdentifier = { type: 'email', email: typedBody.identifier };
        } else {
          contactIdentifier = { type: 'name', name: typedBody.identifier };
        }
      } else {
        console.error(`${logPrefix} No valid contact identifier found in request`);
        return { 
          statusCode: 400, 
          body: JSON.stringify({ message: "Valid contact identifier is required for deletion" }), 
          headers: COMMON_HEADERS 
        };
      }
      
      console.log(`${logPrefix} Parsed DELETE request body:`, JSON.stringify(requestBody, null, 2));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Invalid request body for DELETE.";
      console.error(`${logPrefix} DELETE error - Invalid request body:`, msg);
      return { statusCode: 400, body: JSON.stringify({ message: msg }), headers: COMMON_HEADERS };
    }

    try {
      // Use our contact service to delete the contact
      console.log(`${logPrefix} Deleting contact using contactService with identifier:`, contactIdentifier);
      
      const deleteResult = await contactService.deleteContact(userId, contactIdentifier);
      
      if (!deleteResult.success) {
        // Handle different error cases with appropriate status codes
        const errorCode = deleteResult.error?.code || 'UNKNOWN_ERROR';
        let statusCode = 500;
        
        if (errorCode === 'CONTACT_NOT_FOUND') {
          statusCode = 404;
        } else if (['INVALID_ID', 'INVALID_NAME', 'INVALID_EMAIL', 'MISSING_USER_ID'].includes(errorCode)) {
          statusCode = 400;
        }
        
        console.error(`${logPrefix} Contact deletion failed: ${errorCode} - ${deleteResult.error?.message}`);
        
        return { 
          statusCode, 
          body: JSON.stringify({
            message: deleteResult.error?.message || 'Failed to delete contact',
            error: errorCode
          }), 
          headers: COMMON_HEADERS 
        };
      }
      
      // Deletion successful
      const contactDetails = deleteResult.data?.name 
        ? `"${deleteResult.data.name}" (ID: ${deleteResult.data.contact_id})` 
        : `ID: ${deleteResult.data?.contact_id}`;
        
      console.log(`${logPrefix} Successfully deleted contact ${contactDetails} for user ${userId}`);
      
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          message: "Contact deleted successfully",
          contact_id: deleteResult.data?.contact_id
        }),
        headers: COMMON_HEADERS
      };

    } catch (error) {
      console.error(`${logPrefix} Unexpected error in DELETE handler:`, error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "An unexpected error occurred while deleting the contact." }),
        headers: COMMON_HEADERS,
      };
    }
  } // --- End of DELETE handling ---

  // --- Method Not Allowed for other HTTP methods ---
  else {
    console.log(`${logPrefix} Method Not Allowed: ${httpMethod}`);
    return {
      statusCode: 405,
      body: JSON.stringify({ message: `Method ${httpMethod} Not Allowed on /contacts` }),
      headers: { ...COMMON_HEADERS, 'Allow': 'POST, GET, PUT, DELETE, PATCH' },
    };
  }
};

export { handler };
