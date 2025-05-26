// src/frontend/services/CalendarIntegrationService.ts
import { apiClient } from '../utils/api';
import { getIntegrationStatuses as getSupabaseIntegrationStatuses } from './supabaseClient';

// Define types for calendar integrations
export type CalendarProvider = 'google' | 'zoom' | 'elber' | 'birthdays';

export interface CalendarSource {
  id: CalendarProvider;
  name: string;
  connected: boolean;
  visible?: boolean;
}

export interface OAuthResponse {
  type: 'google-oauth-success' | 'google-oauth-error';
  provider?: 'google';
  error?: string;
  errorMessage?: string;
  timestamp?: string;
}

export interface CalendarIntegrationResult {
  success: boolean;
  message: string;
  error?: string;
}

export interface IntegrationStatuses {
  google: boolean;
  zoom: boolean;
  microsoft: boolean;
  [key: string]: boolean; // Allow for future integrations
}

// Define interfaces for the initiate-auth endpoint
export interface InitiateAuthRequest {
  origin: string;
  feature?: 'contacts' | 'calendar' | 'calendar_readonly';
}

export interface InitiateAuthResponse {
  authUrl: string;
}

// Class to handle calendar integrations
export class CalendarIntegrationService {
  // Initialize Google OAuth flow
  public static initiateGoogleOAuth(featureNeeded: 'calendar' | 'calendar_readonly' | 'contacts' = 'calendar_readonly'): Promise<CalendarIntegrationResult> {
    return new Promise((resolve) => {
      // Create a popup window for the OAuth flow
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      // First, call the backend to get the auth URL
      console.log('[CalendarIntegrationService] Requesting auth URL from server...');
      const requestData: InitiateAuthRequest = {
        origin: window.location.origin,
        feature: featureNeeded
      };
      
      // Using then/catch instead of async/await in Promise executor
      apiClient.post<InitiateAuthRequest, InitiateAuthResponse>('/google-oauth/initiate-auth', requestData)
        .then(response => {
          if (!response || !response.authUrl) {
            throw new Error('Failed to get OAuth URL from server');
          }
          
          const authUrl = response.authUrl;
          console.log('[CalendarIntegrationService] Received auth URL, opening popup...');
          
          const popup = window.open(
            authUrl,
            'google-oauth',
            `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
          );
        
          if (!popup) {
            throw new Error('Failed to open popup window. Please check if popup blockers are enabled.');
          }
          
          // Function to handle messages from the popup
          const handleMessage = (event: MessageEvent) => {
            // Verify origin for security
            const allowedOrigins = [
              window.location.origin,
              'https://elber-ai.netlify.app',
              'https://elber-ai-dev.netlify.app'
            ];
            
            if (!allowedOrigins.includes(event.origin)) {
              console.warn(`[CalendarIntegrationService] Ignoring message from untrusted origin: ${event.origin}`);
              return;
            }
            
            const response = event.data as OAuthResponse;
            
            if (response?.type === 'google-oauth-success') {
              window.removeEventListener('message', handleMessage);
              resolve({
                success: true,
                message: 'Google Calendar connected successfully!'
              });
            } else if (response?.type === 'google-oauth-error') {
              window.removeEventListener('message', handleMessage);
              resolve({
                success: false,
                message: 'Failed to connect Google Calendar',
                error: response.error
              });
            }
          };
          
          // Add event listener for messages from the popup
          window.addEventListener('message', handleMessage);
          
          // Check periodically if popup was closed without completing the flow
          const checkPopupClosed = setInterval(() => {
            if (!popup || popup.closed) {
              clearInterval(checkPopupClosed);
              window.removeEventListener('message', handleMessage);
              
              resolve({
                success: false,
                message: 'Google Calendar connection was cancelled',
                error: 'User closed the authentication window'
              });
            }
          }, 1000);
        })
        .catch(error => {
          resolve({
            success: false,
            message: 'Failed to initiate Google Calendar connection',
            error: error instanceof Error ? error.message : String(error)
          });
        });
    });
  }

  // Fetch Google Calendar events
  public static async fetchGoogleCalendarEvents(): Promise<CalendarIntegrationResult> {
    try {
      interface GoogleCalendarEvent {
        id: string;
        summary: string;
        start: { dateTime?: string; date?: string };
        end: { dateTime?: string; date?: string };
        [key: string]: unknown;
      }
      
      const response = await apiClient.get<{success: boolean, events: GoogleCalendarEvent[]}>('/google-calendar/events');
      
      if (!response || !response.success) {
        throw new Error('Failed to fetch Google Calendar events');
      }
      
      return {
        success: true,
        message: `Successfully fetched ${response.events?.length || 0} events from Google Calendar`
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch Google Calendar events',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Check if Google Calendar is connected
  public static async checkGoogleCalendarConnection(): Promise<boolean> {
    try {
      // Get all statuses and return just the Google one
      const statuses = await this.getIntegrationStatuses();
      return statuses.google || false;
    } catch (error) {
      console.error('[CalendarIntegrationService] Error checking Google Calendar connection:', error);
      return false;
    }
  }

  // Check status of all integrations at once
  public static async getIntegrationStatuses(): Promise<IntegrationStatuses> {
    try {
      // Use direct Supabase RPC call from our utility file instead of API client
      return await getSupabaseIntegrationStatuses();
    } catch (error) {
      console.error('[CalendarIntegrationService] Error checking integration statuses:', error);
      // Return safe default when API fails
      return { google: false, zoom: false, microsoft: false };
    }
  }

  // Disconnect Google Calendar
  public static async disconnectGoogleCalendar(): Promise<CalendarIntegrationResult> {
    try {
      interface DisconnectResponse {
        success: boolean;
        message: string;
      }
      
      const response = await apiClient.post<DisconnectResponse, DisconnectResponse>('/google-calendar/disconnect', { confirm: true } as unknown as DisconnectResponse);
      
      if (!response) {
        throw new Error('No response received from disconnect request');
      }
      
      return {
        success: response.success || false,
        message: response.message || 'Google Calendar disconnected successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to disconnect Google Calendar',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
