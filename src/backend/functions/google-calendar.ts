import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { google, calendar_v3 } from 'googleapis';
import { supabaseAdmin, oauthConfigService } from '../services';
import { getUserIdFromEvent } from './_shared/utils';

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  console.log('[google-calendar] Handler called:', event.path, event.httpMethod);

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    // Get user ID from auth token
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    // Get Google OAuth tokens for user
    console.log(`[google-calendar] Looking up OAuth token for user: ${userId}`);
    
    const { data: tokenData, error: fetchError } = await supabaseAdmin
      .from('oauth_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .maybeSingle();

    if (fetchError) {
      console.error(`[google-calendar] Error fetching OAuth token for user ${userId}:`, fetchError);
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Failed to fetch OAuth connection',
          message: fetchError.message
        })
      };
    }

    if (!tokenData || !tokenData.access_token) {
      console.log(`[google-calendar] No Google OAuth token found for user ${userId}`);
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Google Calendar not connected',
          message: 'Please connect your Google Calendar first'
        })
      };
    }

    // Get OAuth config
    const googleConfig = oauthConfigService.getGoogleConfig();

    // Check if token is expired and refresh if needed
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      console.log(`[google-calendar] Token is expired for user ${userId}, attempting to refresh`);

      if (!tokenData.refresh_token) {
        console.log(`[google-calendar] No refresh token available for user ${userId}, need to reauthenticate`);
        return {
          statusCode: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            error: 'Google Calendar authorization expired',
            message: 'Please reconnect your Google Calendar'
          })
        };
      }

      try {
        const oauth2Client = new google.auth.OAuth2(
          googleConfig.clientId,
          googleConfig.clientSecret,
          googleConfig.redirectUri
        );

        oauth2Client.setCredentials({
          refresh_token: tokenData.refresh_token
        });

        const { credentials } = await oauth2Client.refreshAccessToken();
        console.log(`[google-calendar] Successfully refreshed token for user ${userId}`);

        await supabaseAdmin
          .from('oauth_connections')
          .update({
            access_token: credentials.access_token,
            expires_at: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
            updated_at: new Date().toISOString()
          })
          .eq('id', tokenData.id);

        tokenData.access_token = credentials.access_token || tokenData.access_token;
        tokenData.expires_at = credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null;
      } catch (error) {
        console.error(`[google-calendar] Error refreshing token for user ${userId}:`, error);
        return {
          statusCode: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            error: 'Failed to refresh Google Calendar authorization',
            message: 'Please reconnect your Google Calendar'
          })
        };
      }
    }

    // Create OAuth2 client with user's tokens
    const oauth2Client = new google.auth.OAuth2(
      googleConfig.clientId,
      googleConfig.clientSecret,
      googleConfig.redirectUri
    );

    oauth2Client.setCredentials({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry_date: tokenData.expires_at ? new Date(tokenData.expires_at).getTime() : undefined
    });

    // Create calendar client
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Parse the path to determine the action
    const pathParts = event.path.split('/').filter(p => p);
    const action = pathParts[pathParts.length - 1];

    console.log('[google-calendar] Action:', action);

    // Handle different endpoints
    switch (action) {
      case 'events': {
        if (event.httpMethod === 'GET') {
          // Fetch events from Google Calendar
          try {
            const response = await calendar.events.list({
              calendarId: 'primary',
              timeMin: new Date().toISOString(),
              maxResults: 50,
              singleEvents: true,
              orderBy: 'startTime'
            });

            const events = response.data.items || [];
            
            return {
              statusCode: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                success: true,
                events: events.map(event => ({
                  id: event.id,
                  summary: event.summary || 'Untitled Event',
                  description: event.description,
                  location: event.location,
                  start: event.start,
                  end: event.end,
                  status: event.status,
                  htmlLink: event.htmlLink,
                  created: event.created,
                  updated: event.updated,
                  reminders: event.reminders,
                  attendees: event.attendees
                }))
              })
            };
          } catch (error) {
            console.error('[google-calendar] Error fetching events:', error);
            return {
              statusCode: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                success: false,
                error: 'Failed to fetch Google Calendar events',
                message: error instanceof Error ? error.message : 'Unknown error'
              })
            };
          }
        }
        break;
      }

      case 'update': {
        if (event.httpMethod === 'PUT' || event.httpMethod === 'PATCH') {
          // Update a Google Calendar event
          const body = JSON.parse(event.body || '{}');
          const { eventId, updates } = body;

          if (!eventId) {
            return {
              statusCode: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({ error: 'Event ID is required' })
            };
          }

          try {
            // First get the existing event
            const existingEvent = await calendar.events.get({
              calendarId: 'primary',
              eventId: eventId
            });

            // Merge updates
            const updatedEvent: calendar_v3.Schema$Event = {
              ...existingEvent.data,
              ...updates
            };

            // Update the event
            const response = await calendar.events.update({
              calendarId: 'primary',
              eventId: eventId,
              requestBody: updatedEvent
            });

            return {
              statusCode: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                success: true,
                event: response.data,
                message: 'Event updated successfully'
              })
            };
          } catch (error) {
            console.error('[google-calendar] Error updating event:', error);
            return {
              statusCode: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                success: false,
                error: 'Failed to update Google Calendar event',
                message: error instanceof Error ? error.message : 'Unknown error'
              })
            };
          }
        }
        break;
      }

      case 'disconnect': {
        if (event.httpMethod === 'POST') {
          // Disconnect Google Calendar by removing tokens
          try {
            console.log(`[google-calendar] Clearing OAuth connection for user ${userId}`);
            
            const { error: deleteError } = await supabaseAdmin
              .from('oauth_connections')
              .delete()
              .eq('user_id', userId)
              .eq('provider', 'google');
            
            if (deleteError) {
              throw deleteError;
            }
            
            return {
              statusCode: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                success: true,
                message: 'Google Calendar disconnected successfully'
              })
            };
          } catch (error) {
            console.error('[google-calendar] Error disconnecting:', error);
            return {
              statusCode: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                success: false,
                error: 'Failed to disconnect Google Calendar',
                message: error instanceof Error ? error.message : 'Unknown error'
              })
            };
          }
        }
        break;
      }

      default:
        return {
          statusCode: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Endpoint not found' })
        };
    }

    // Method not allowed for the endpoint
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('[google-calendar] Unexpected error:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

export { handler }; 