import { supabaseAdmin } from './supabaseAdmin';
import type { AlertIdentifier, Alert, AlertStatus, CreateAlertPayload, UpdateAlertPayload, ContactOperationResult } from '../types/domain';
import { isValidUUID } from '../utils/validation';

export interface FindAlertsOptions {
  status?: AlertStatus | AlertStatus[];
  contactId?: string;
  eventId?: string;
  fromDate?: string;
  toDate?: string;
  includeRecurring?: boolean;
  priority?: number;
  tags?: string[];
  limit?: number;
  offset?: number;
}

interface AlertPaginationResult {
  alerts: Alert[];
  pagination: {
    totalAlerts: number;
    currentPage: number;
    totalPages: number;
    limit: number;
    hasMore: boolean;
  };
}

class AlertService {
  /**
   * Creates a new alert for a user
   */
  async createAlert(userId: string, alertData: CreateAlertPayload): Promise<ContactOperationResult<Alert>> {
    try {
      if (!userId) {
        return {
          success: false,
          error: {
            code: 'MISSING_USER_ID',
            message: 'User ID is required to create an alert.'
          }
        };
      }

      // Validate required fields
      if (!alertData.title) {
        return {
          success: false,
          error: {
            code: 'MISSING_TITLE',
            message: 'Alert title is required.'
          }
        };
      }

      if (!alertData.due_date) {
        return {
          success: false,
          error: {
            code: 'MISSING_DUE_DATE',
            message: 'Alert due date is required.'
          }
        };
      }

      // Validate contact_id if provided
      if (alertData.contact_id && !isValidUUID(alertData.contact_id)) {
        return {
          success: false,
          error: {
            code: 'INVALID_CONTACT_ID',
            message: 'Invalid contact ID format.'
          }
        };
      }

      // Validate event_id if provided
      if (alertData.event_id && !isValidUUID(alertData.event_id)) {
        return {
          success: false,
          error: {
            code: 'INVALID_EVENT_ID',
            message: 'Invalid event ID format.'
          }
        };
      }

      // Prepare data for insertion
      const alertToCreate = {
        user_id: userId,
        ...alertData
      };

      const { data, error } = await supabaseAdmin
        .from('alerts')
        .insert(alertToCreate)
        .select('*')
        .single();

      if (error) {
        console.error(`Error creating alert: ${error.message}`, error);
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to create alert.',
            details: error
          }
        };
      }

      return {
        success: true,
        data: data as Alert
      };
    } catch (error) {
      console.error('Unexpected error creating alert:', error);
      return {
        success: false,
        error: {
          code: 'UNEXPECTED_ERROR',
          message: 'An unexpected error occurred while creating the alert.',
          details: error
        }
      };
    }
  }

  /**
   * Updates an existing alert
   */
  async updateAlert(
    userId: string,
    alertId: string,
    updateData: UpdateAlertPayload
  ): Promise<ContactOperationResult<Alert>> {
    try {
      if (!userId) {
        return {
          success: false,
          error: {
            code: 'MISSING_USER_ID',
            message: 'User ID is required to update an alert.'
          }
        };
      }

      if (!alertId || !isValidUUID(alertId)) {
        return {
          success: false,
          error: {
            code: 'INVALID_ALERT_ID',
            message: 'Valid alert ID is required.'
          }
        };
      }

      // Validate contact_id if provided
      if (updateData.contact_id && !isValidUUID(updateData.contact_id)) {
        return {
          success: false,
          error: {
            code: 'INVALID_CONTACT_ID',
            message: 'Invalid contact ID format.'
          }
        };
      }

      // Validate event_id if provided
      if (updateData.event_id && !isValidUUID(updateData.event_id)) {
        return {
          success: false,
          error: {
            code: 'INVALID_EVENT_ID',
            message: 'Invalid event ID format.'
          }
        };
      }

      // First check if the alert exists and belongs to the user
      const { data: existingAlert, error: checkError } = await supabaseAdmin
        .from('alerts')
        .select('*')
        .eq('alert_id', alertId)
        .eq('user_id', userId)
        .single();

      if (checkError || !existingAlert) {
        return {
          success: false,
          error: {
            code: 'ALERT_NOT_FOUND',
            message: 'Alert not found or does not belong to the user.',
            details: checkError
          }
        };
      }

      // Perform the update
      const { data, error } = await supabaseAdmin
        .from('alerts')
        .update(updateData)
        .eq('alert_id', alertId)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (error) {
        console.error(`Error updating alert: ${error.message}`, error);
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to update alert.',
            details: error
          }
        };
      }

      return {
        success: true,
        data: data as Alert
      };
    } catch (error) {
      console.error('Unexpected error updating alert:', error);
      return {
        success: false,
        error: {
          code: 'UNEXPECTED_ERROR',
          message: 'An unexpected error occurred while updating the alert.',
          details: error
        }
      };
    }
  }

  /**
   * Deletes an alert
   */
  async deleteAlert(userId: string, alertIdentifier: AlertIdentifier): Promise<ContactOperationResult<{ alert_id: string; title: string }>> {
    try {
      if (!userId) {
        return {
          success: false,
          error: {
            code: 'MISSING_USER_ID',
            message: 'User ID is required to delete an alert.'
          }
        };
      }

      let alertId: string;
      let title: string = '';

      // Handle different identifier types
      if (alertIdentifier.type === 'id') {
        if (!isValidUUID(alertIdentifier.alert_id)) {
          return {
            success: false,
            error: {
              code: 'INVALID_ALERT_ID',
              message: 'Invalid alert ID format.'
            }
          };
        }
        alertId = alertIdentifier.alert_id;

        // Get the title for the response
        const { data: alertData, error: fetchError } = await supabaseAdmin
          .from('alerts')
          .select('title')
          .eq('alert_id', alertId)
          .eq('user_id', userId)
          .single();

        if (fetchError || !alertData) {
          return {
            success: false,
            error: {
              code: 'ALERT_NOT_FOUND',
              message: 'Alert not found or does not belong to the user.',
              details: fetchError
            }
          };
        }

        title = alertData.title;
      } else if (alertIdentifier.type === 'title_user') {
        if (!alertIdentifier.title) {
          return {
            success: false,
            error: {
              code: 'MISSING_TITLE',
              message: 'Alert title is required for title-based deletion.'
            }
          };
        }

        // Find alert by title for this user
        const { data: alertData, error: fetchError } = await supabaseAdmin
          .from('alerts')
          .select('alert_id, title')
          .eq('title', alertIdentifier.title)
          .eq('user_id', userId);

        if (fetchError) {
          return {
            success: false,
            error: {
              code: 'DB_ERROR',
              message: 'Error fetching alert by title.',
              details: fetchError
            }
          };
        }

        if (!alertData || alertData.length === 0) {
          return {
            success: false,
            error: {
              code: 'ALERT_NOT_FOUND',
              message: `No alert found with title "${alertIdentifier.title}".`
            }
          };
        }

        if (alertData.length > 1) {
          return {
            success: false,
            error: {
              code: 'MULTIPLE_ALERTS_FOUND',
              message: `Multiple alerts found with title "${alertIdentifier.title}". Please use a specific alert ID.`
            }
          };
        }

        alertId = alertData[0].alert_id;
        title = alertData[0].title;
      } else {
        return {
          success: false,
          error: {
            code: 'INVALID_IDENTIFIER_TYPE',
            message: 'Invalid alert identifier type.'
          }
        };
      }

      // Perform the deletion
      const { error: deleteError } = await supabaseAdmin
        .from('alerts')
        .delete()
        .eq('alert_id', alertId)
        .eq('user_id', userId);

      if (deleteError) {
        console.error(`Error deleting alert: ${deleteError.message}`, deleteError);
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to delete alert.',
            details: deleteError
          }
        };
      }

      return {
        success: true,
        data: {
          alert_id: alertId,
          title
        }
      };
    } catch (error) {
      console.error('Unexpected error deleting alert:', error);
      return {
        success: false,
        error: {
          code: 'UNEXPECTED_ERROR',
          message: 'An unexpected error occurred while deleting the alert.',
          details: error
        }
      };
    }
  }

  /**
   * Finds alerts for a user based on various criteria
   */
  async findAlerts(userId: string, options: FindAlertsOptions = {}): Promise<ContactOperationResult<AlertPaginationResult>> {
    try {
      if (!userId) {
        return {
          success: false,
          error: {
            code: 'MISSING_USER_ID',
            message: 'User ID is required to find alerts.'
          }
        };
      }

      // Set defaults for pagination
      const limit = options.limit || 10;
      const offset = options.offset || 0;
      const page = Math.floor(offset / limit) + 1;

      // Start building the query
      let query = supabaseAdmin
        .from('alerts')
        .select('*', { count: 'exact' })
        .eq('user_id', userId);

      // Add filters
      if (options.status) {
        if (Array.isArray(options.status)) {
          query = query.in('status', options.status);
        } else {
          query = query.eq('status', options.status);
        }
      }

      if (options.contactId) {
        query = query.eq('contact_id', options.contactId);
      }

      if (options.eventId) {
        query = query.eq('event_id', options.eventId);
      }

      if (options.fromDate) {
        query = query.gte('due_date', options.fromDate);
      }

      if (options.toDate) {
        query = query.lte('due_date', options.toDate);
      }

      if (options.priority) {
        query = query.eq('priority', options.priority);
      }

      if (options.tags && options.tags.length > 0) {
        // Filter for alerts that contain any of the specified tags
        query = query.overlaps('tags', options.tags);
      }

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      // Order by due date (most recent first)
      query = query.order('due_date', { ascending: true });

      // Execute the query
      const { data, error, count } = await query;

      if (error) {
        console.error(`Error finding alerts: ${error.message}`, error);
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to find alerts.',
            details: error
          }
        };
      }

      const totalAlerts = count || 0;
      const totalPages = Math.ceil(totalAlerts / limit);
      const hasMore = offset + limit < totalAlerts;

      return {
        success: true,
        data: {
          alerts: data as Alert[],
          pagination: {
            totalAlerts,
            currentPage: page,
            totalPages,
            limit,
            hasMore
          }
        }
      };
    } catch (error) {
      console.error('Unexpected error finding alerts:', error);
      return {
        success: false,
        error: {
          code: 'UNEXPECTED_ERROR',
          message: 'An unexpected error occurred while finding alerts.',
          details: error
        }
      };
    }
  }

  /**
   * Gets a single alert by ID
   */
  async getAlertById(userId: string, alertId: string): Promise<ContactOperationResult<Alert>> {
    try {
      if (!userId) {
        return {
          success: false,
          error: {
            code: 'MISSING_USER_ID',
            message: 'User ID is required to get an alert.'
          }
        };
      }

      if (!alertId || !isValidUUID(alertId)) {
        return {
          success: false,
          error: {
            code: 'INVALID_ALERT_ID',
            message: 'Valid alert ID is required.'
          }
        };
      }

      const { data, error } = await supabaseAdmin
        .from('alerts')
        .select('*')
        .eq('alert_id', alertId)
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error(`Error getting alert: ${error.message}`, error);
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to get alert.',
            details: error
          }
        };
      }

      if (!data) {
        return {
          success: false,
          error: {
            code: 'ALERT_NOT_FOUND',
            message: 'Alert not found or does not belong to the user.'
          }
        };
      }

      return {
        success: true,
        data: data as Alert
      };
    } catch (error) {
      console.error('Unexpected error getting alert:', error);
      return {
        success: false,
        error: {
          code: 'UNEXPECTED_ERROR',
          message: 'An unexpected error occurred while getting the alert.',
          details: error
        }
      };
    }
  }

  /**
   * Get upcoming alerts (due within the next X days)
   */
  async getUpcomingAlerts(
    userId: string,
    daysAhead: number = 7,
    limit: number = 10
  ): Promise<ContactOperationResult<Alert[]>> {
    try {
      if (!userId) {
        return {
          success: false,
          error: {
            code: 'MISSING_USER_ID',
            message: 'User ID is required to get upcoming alerts.'
          }
        };
      }

      const now = new Date();
      const futureDate = new Date(now);
      futureDate.setDate(now.getDate() + daysAhead);

      const { data, error } = await supabaseAdmin
        .from('alerts')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .gte('due_date', now.toISOString())
        .lte('due_date', futureDate.toISOString())
        .order('due_date', { ascending: true })
        .limit(limit);

      if (error) {
        console.error(`Error getting upcoming alerts: ${error.message}`, error);
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to get upcoming alerts.',
            details: error
          }
        };
      }

      return {
        success: true,
        data: data as Alert[]
      };
    } catch (error) {
      console.error('Unexpected error getting upcoming alerts:', error);
      return {
        success: false,
        error: {
          code: 'UNEXPECTED_ERROR',
          message: 'An unexpected error occurred while getting upcoming alerts.',
          details: error
        }
      };
    }
  }

  /**
   * Mark an alert as dismissed
   */
  async dismissAlert(userId: string, alertId: string): Promise<ContactOperationResult<Alert>> {
    try {
      if (!userId) {
        return {
          success: false,
          error: {
            code: 'MISSING_USER_ID',
            message: 'User ID is required to dismiss an alert.'
          }
        };
      }

      if (!alertId || !isValidUUID(alertId)) {
        return {
          success: false,
          error: {
            code: 'INVALID_ALERT_ID',
            message: 'Valid alert ID is required.'
          }
        };
      }

      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from('alerts')
        .update({
          status: 'dismissed',
          dismissed_at: now
        })
        .eq('alert_id', alertId)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (error) {
        console.error(`Error dismissing alert: ${error.message}`, error);
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to dismiss alert.',
            details: error
          }
        };
      }

      return {
        success: true,
        data: data as Alert
      };
    } catch (error) {
      console.error('Unexpected error dismissing alert:', error);
      return {
        success: false,
        error: {
          code: 'UNEXPECTED_ERROR',
          message: 'An unexpected error occurred while dismissing the alert.',
          details: error
        }
      };
    }
  }

  /**
   * Snooze an alert (delay it)
   */
  async snoozeAlert(
    userId: string,
    alertId: string,
    snoozeUntil: string
  ): Promise<ContactOperationResult<Alert>> {
    try {
      if (!userId) {
        return {
          success: false,
          error: {
            code: 'MISSING_USER_ID',
            message: 'User ID is required to snooze an alert.'
          }
        };
      }

      if (!alertId || !isValidUUID(alertId)) {
        return {
          success: false,
          error: {
            code: 'INVALID_ALERT_ID',
            message: 'Valid alert ID is required.'
          }
        };
      }

      if (!snoozeUntil) {
        return {
          success: false,
          error: {
            code: 'MISSING_SNOOZE_UNTIL',
            message: 'A snooze until date is required.'
          }
        };
      }

      // Validate snoozeUntil is a future date
      const snoozeDate = new Date(snoozeUntil);
      const now = new Date();
      if (snoozeDate <= now) {
        return {
          success: false,
          error: {
            code: 'INVALID_SNOOZE_DATE',
            message: 'Snooze until date must be in the future.'
          }
        };
      }

      const { data, error } = await supabaseAdmin
        .from('alerts')
        .update({
          status: 'snoozed',
          snoozed_until: snoozeUntil
        })
        .eq('alert_id', alertId)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (error) {
        console.error(`Error snoozing alert: ${error.message}`, error);
        return {
          success: false,
          error: {
            code: 'DB_ERROR',
            message: 'Failed to snooze alert.',
            details: error
          }
        };
      }

      return {
        success: true,
        data: data as Alert
      };
    } catch (error) {
      console.error('Unexpected error snoozing alert:', error);
      return {
        success: false,
        error: {
          code: 'UNEXPECTED_ERROR',
          message: 'An unexpected error occurred while snoozing the alert.',
          details: error
        }
      };
    }
  }
}

export const alertService = new AlertService(); 