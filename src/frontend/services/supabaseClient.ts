import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IntegrationStatuses } from './CalendarIntegrationService';

// Ensure your environment variables are correctly set in your .env file
// and are prefixed with VITE_ for Vite projects to expose them to the frontend.
const supabaseUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error("VITE_SUPABASE_URL is not defined. Please check your .env file and ensure it's prefixed with VITE_ for frontend access.");
  throw new Error("VITE_SUPABASE_URL is not defined.");
}

if (!supabaseAnonKey) {
  console.error("VITE_SUPABASE_ANON_KEY is not defined. Please check your .env file and ensure it's prefixed with VITE_ for frontend access.");
  throw new Error("VITE_SUPABASE_ANON_KEY is not defined.");
}

// Create and export the Supabase client for frontend use
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Supabase utility functions for the frontend
 * This file provides a centralized place for Supabase client and RPC calls
 */

/**
 * Get the status of all integrations for the current user
 * @returns Promise with the integration statuses
 */
export async function getIntegrationStatuses(): Promise<IntegrationStatuses> {
  try {
    const { data, error } = await supabase.rpc('get_integration_statuses');
    
    if (error) {
      console.error('[supabase.ts] Error fetching integration statuses:', error);
      throw error;
    }
    
    if (!data) {
      console.warn('[supabase.ts] No integration status data returned');
      return { google: false, zoom: false, microsoft: false };
    }
    
    return data as IntegrationStatuses;
  } catch (error) {
    console.error('[supabase.ts] Exception in getIntegrationStatuses:', error);
    // Return safe default status (all disconnected) in case of errors
    return { google: false, zoom: false, microsoft: false };
  }
} 