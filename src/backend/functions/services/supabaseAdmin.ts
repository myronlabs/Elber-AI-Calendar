// src/backend/functions/services/supabaseAdmin.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  // Log the error and throw to prevent the function from proceeding without configuration
  console.error('CRITICAL: SUPABASE_URL is not defined in environment variables.');
  throw new Error('SUPABASE_URL is not defined in environment variables.');
}
if (!supabaseServiceRoleKey) {
  // Log the error and throw
  console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY is not defined in environment variables.');
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is not defined in environment variables.');
}

// Create a single supabase admin client for use in backend functions
// This uses the Service Role Key for admin-level access.
export const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    // It's generally recommended to set autoRefreshToken to false for server-side clients
    // as they usually handle short-lived operations and don't maintain long user sessions.
    autoRefreshToken: false,
    persistSession: false,
    // detectSessionInUrl: false, // Unlikely needed for backend admin client
  }
});

// Log to confirm initialization during deployment/startup, but not on every import if this module is cached.
// This console.log will run when the module is first loaded by a Netlify function.
console.log('Supabase admin client initialized (src/backend/functions/services/supabaseAdmin.ts).');