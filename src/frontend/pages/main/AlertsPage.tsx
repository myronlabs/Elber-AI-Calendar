import React, { useState, useEffect, useMemo } from 'react';
import { useAlerts } from '../../context/AlertsContext';
import { 
  formatDateTimeForDisplay, 
  convertLocalInputToUTC, 
  getUserTimezone 
} from '../../utils/timezoneUtils';
import { routeAssistantRequest } from '../../utils/assistantRouter';
import { ApiMessage } from '../../types/assistantShared';
import Button from '../../components/common/Button';

// Import types from backend domain types
import type { Alert, CreateAlertPayload } from '../../../backend/types/domain';
import { AlertType, AlertStatus, AlertPriority } from '../../../backend/types/domain';

// Simple notification state for now (can be replaced with proper context later)
interface Notification {
  message: string;
  type: 'success' | 'error' | 'info';
}

// Conversation-aware alert helpers
interface ConversationAwareAlertOperations {
  createAlertWithConversation: (message: string, conversationHistory?: ApiMessage[]) => Promise<Alert | null>;
  updateAlertWithConversation: (message: string, conversationHistory?: ApiMessage[]) => Promise<Alert | null>;
  deleteAlertWithConversation: (message: string, conversationHistory?: ApiMessage[]) => Promise<boolean>;
}

const AlertsPage: React.FC = () => {
  // Use the alerts context
  const {
    alerts,
    isLoading,
    error,
    fetchAlerts,
    createAlert,
    deleteAlert,
    dismissAlert,
    snoozeAlert,
    clearError
  } = useAlerts();

  // Simplified notification state (replace with context when available)
  const [notification, setNotification] = useState<Notification | null>(null);
  const userTimezone = getUserTimezone();
  
  // Local UI state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Filter state
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<AlertPriority | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<AlertType | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form state
  const [formData, setFormData] = useState<CreateAlertPayload>({
    title: '',
    description: '',
    alert_type: AlertType.CUSTOM,
    due_date: '',
    priority: AlertPriority.MEDIUM,
    recurring: false,
    tags: []
  });

  // Notification helper
  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Load alerts only when page is actually visited
  useEffect(() => {
    console.log('[AlertsPage] Page mounted, fetching alerts');
    fetchAlerts();
  }, [fetchAlerts]);

  // Handle context errors
  useEffect(() => {
    if (error) {
      showNotification(error.message, 'error');
      clearError();
    }
  }, [error, clearError]);

  // Conversation-aware alert operations
  const conversationAwareAlertOps: ConversationAwareAlertOperations = useMemo(() => ({
    createAlertWithConversation: async (message: string, conversationHistory?: ApiMessage[]): Promise<Alert | null> => {
      console.log(`[AlertsPage] Using conversation-aware assistant for alert creation: ${message}`);
      
      try {
        const messageHistory: ApiMessage[] = [
          ...(conversationHistory || []),
          { role: 'user', content: `${message} (User timezone: ${userTimezone})` }
        ];

        console.log(`[AlertsPage] Sending ${messageHistory.length} messages to assistant (conversation-aware)`);
        
        const response = await routeAssistantRequest(messageHistory);

        if (response?.role === 'assistant' && response.content) {
          // Check metadata for successful alert operations
          const metadata = response._metadata;
          
          if (metadata?.should_refresh_alerts) {
            console.log(`[AlertsPage] Alert operation successful, refreshing alerts...`);
            await fetchAlerts(true);
            
            // Find the most recently created alert
            const sortedAlerts = alerts.sort((a, b) => 
              new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
            );
            
            const newestAlert = sortedAlerts[0];
            if (newestAlert) {
              console.log(`[AlertsPage] Successfully created alert via conversation-aware assistant: ${newestAlert.title}`);
              return newestAlert;
            }
          }
          
          console.log(`[AlertsPage] Assistant processed alert request successfully: ${response.content}`);
          return null;
        }

        throw new Error('Assistant did not provide a valid response for alert operation');
      } catch (error) {
        console.error(`[AlertsPage] Error in conversation-aware alert creation:`, error);
        throw error;
      }
    },

    updateAlertWithConversation: async (message: string, conversationHistory?: ApiMessage[]): Promise<Alert | null> => {
      console.log(`[AlertsPage] Using conversation-aware assistant for alert update: ${message}`);
      
      try {
        const messageHistory: ApiMessage[] = [
          ...(conversationHistory || []),
          { role: 'user', content: `${message} (User timezone: ${userTimezone})` }
        ];

        const response = await routeAssistantRequest(messageHistory);

        if (response?.role === 'assistant' && response.content) {
          const metadata = response._metadata;
          
          if (metadata?.should_refresh_alerts) {
            console.log(`[AlertsPage] Alert update successful, refreshing alerts...`);
            await fetchAlerts(true);
            return null; // Successfully updated, but no specific alert to return
          }
          
          console.log(`[AlertsPage] Assistant processed alert update successfully: ${response.content}`);
          return null;
        }

        throw new Error('Assistant did not provide a valid response for alert update');
      } catch (error) {
        console.error(`[AlertsPage] Error in conversation-aware alert update:`, error);
        throw error;
      }
    },

    deleteAlertWithConversation: async (message: string, conversationHistory?: ApiMessage[]): Promise<boolean> => {
      console.log(`[AlertsPage] Using conversation-aware assistant for alert deletion: ${message}`);
      
      try {
        const messageHistory: ApiMessage[] = [
          ...(conversationHistory || []),
          { role: 'user', content: `${message} (User timezone: ${userTimezone})` }
        ];

        const response = await routeAssistantRequest(messageHistory);

        if (response?.role === 'assistant' && response.content) {
          const metadata = response._metadata;
          
          if (metadata?.should_refresh_alerts) {
            console.log(`[AlertsPage] Alert deletion successful, refreshing alerts...`);
            await fetchAlerts(true);
            return true;
          }
          
          // Check if response indicates success
          const responseText = response.content.toLowerCase();
          if (responseText.includes('deleted') || responseText.includes('removed')) {
            await fetchAlerts(true);
            return true;
          }
          
          return false;
        }

        throw new Error('Assistant did not provide a valid response for alert deletion');
      } catch (error) {
        console.error(`[AlertsPage] Error in conversation-aware alert deletion:`, error);
        return false;
      }
    }
  }), [userTimezone, fetchAlerts, alerts]);

  // Filter alerts based on current filters
  const filteredAlerts = alerts.filter(alert => {
    if (statusFilter !== 'all' && alert.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && alert.priority !== priorityFilter) return false;
    if (typeFilter !== 'all' && alert.alert_type !== typeFilter) return false;
    if (searchTerm && !alert.title.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !alert.description?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // Sort alerts by due date and priority
  const sortedAlerts = [...filteredAlerts].sort((a, b) => {
    const dateA = new Date(a.due_date).getTime();
    const dateB = new Date(b.due_date).getTime();
    if (dateA !== dateB) return dateA - dateB;
    return b.priority - a.priority;
  });

  // Handle form submission for creating alerts
  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Convert local datetime to UTC for backend
      const utcDueDate = convertLocalInputToUTC(formData.due_date, userTimezone);
      
      const alertData = {
        ...formData,
        due_date: utcDueDate
      };

      const newAlert = await createAlert(alertData);
      
      if (newAlert) {
        showNotification('Alert created successfully', 'success');
        setShowCreateForm(false);
        setFormData({
          title: '',
          description: '',
          alert_type: AlertType.CUSTOM,
          due_date: '',
          priority: AlertPriority.MEDIUM,
          recurring: false,
          tags: []
        });
      }
    } catch (error) {
      console.error('Error creating alert:', error);
      showNotification('Error creating alert', 'error');
    }
  };

  // Handle alert actions (dismiss, snooze)
  const handleAlertAction = async (alertId: string, action: string, data?: { hours?: number }) => {
    try {
      let success = false;
      
      if (action === 'dismiss') {
        success = await dismissAlert(alertId);
      } else if (action === 'snooze' && data?.hours) {
        success = await snoozeAlert(alertId, data.hours);
      }
      
      if (success) {
        showNotification(`Alert ${action}ed successfully`, 'success');
      } else {
        showNotification(`Error ${action}ing alert`, 'error');
      }
    } catch (error) {
      console.error(`Error ${action}ing alert:`, error);
      showNotification(`Error ${action}ing alert`, 'error');
    }
  };

  // Handle delete alert
  const handleDeleteAlert = async () => {
    if (!selectedAlert) return;
    
    try {
      const success = await deleteAlert(selectedAlert.alert_id);
      
      if (success) {
        showNotification('Alert deleted successfully', 'success');
        setShowDeleteConfirm(false);
        setSelectedAlert(null);
      } else {
        showNotification('Error deleting alert', 'error');
      }
    } catch (error) {
      console.error('Error deleting alert:', error);
      showNotification('Error deleting alert', 'error');
    }
  };

  // Get priority label with emoji
  const getPriorityLabel = (priority: AlertPriority) => {
    switch (priority) {
      case AlertPriority.HIGH: return '🔴 High';
      case AlertPriority.MEDIUM: return '🟠 Medium';
      case AlertPriority.LOW: return '🟢 Low';
      default: return 'Normal';
    }
  };

  // Get status label with emoji
  const getStatusLabel = (status: AlertStatus) => {
    switch (status) {
      case AlertStatus.PENDING: return '⏳ Pending';
      case AlertStatus.TRIGGERED: return '🔔 Triggered';
      case AlertStatus.DISMISSED: return '✓ Dismissed';
      case AlertStatus.SNOOZED: return '💤 Snoozed';
      default: return status;
    }
  };

  // Get alert type label
  const getTypeLabel = (type: AlertType) => {
    switch (type) {
      case AlertType.UPCOMING_BIRTHDAY: return '🎂 Birthday';
      case AlertType.MEETING_REMINDER: return '📅 Meeting';
      case AlertType.TASK_DUE: return '✅ Task';
      case AlertType.FOLLOW_UP: return '📞 Follow-up';
      case AlertType.CUSTOM: return '📝 Custom';
      default: return type;
    }
  };

  // Format due date with enhanced timezone awareness
  const formatDueDate = (isoDate: string) => {
    return formatDateTimeForDisplay(isoDate, {
      timezone: userTimezone,
      showRelative: false,
      format: 'smart'
    });
  };

  // Get relative time description
  const getRelativeTime = (isoDate: string) => {
    return formatDateTimeForDisplay(isoDate, {
      timezone: userTimezone,
      format: 'relative-only'
    });
  };

  // Expose conversation-aware operations for external use
  // These functions maintain conversation state when integrating with the main assistant
  // Usage: Import this page's conversation operations when needed for assistant integration
  React.useEffect(() => {
    // Make conversation-aware operations available globally if needed
    (window as { alertsPageConversationOps?: ConversationAwareAlertOperations }).alertsPageConversationOps = conversationAwareAlertOps;
    
    return () => {
      delete (window as { alertsPageConversationOps?: ConversationAwareAlertOperations }).alertsPageConversationOps;
    };
  }, [conversationAwareAlertOps]);

  if (isLoading) {
    return (
      <div className="page-loader-overlay">
        <div className="page-loading-spinner"></div>
      </div>
    );
  }

  return (
    <main className="alerts-page">
      {/* Notification display */}
      {notification && (
        <div className={`notification notification-${notification.type}`}>
          {notification.message}
          <button onClick={() => setNotification(null)}>×</button>
        </div>
      )}

      <div className="alerts-header">
        <h1>Alerts & Reminders</h1>
        <div className="header-info">
          <span className="timezone-info">
            <span className="timezone-icon">📍</span>
            {userTimezone.replace(/_/g, ' ')}
          </span>
          <Button 
            variant="primary"
            onClick={() => setShowCreateForm(true)}
          >
            + Create Alert
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="alerts-filters">
        <div className="filter-group">
          <label>Search:</label>
          <input
            type="text"
            placeholder="Search alerts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-group">
          <label>Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AlertStatus | 'all')}
          >
            <option value="all">All</option>
            <option value={AlertStatus.PENDING}>Pending</option>
            <option value={AlertStatus.TRIGGERED}>Triggered</option>
            <option value={AlertStatus.SNOOZED}>Snoozed</option>
            <option value={AlertStatus.DISMISSED}>Dismissed</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Priority:</label>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value === 'all' ? 'all' : Number(e.target.value) as AlertPriority)}
          >
            <option value="all">All</option>
            <option value={AlertPriority.HIGH}>High</option>
            <option value={AlertPriority.MEDIUM}>Medium</option>
            <option value={AlertPriority.LOW}>Low</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Type:</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as AlertType | 'all')}
          >
            <option value="all">All</option>
            <option value={AlertType.UPCOMING_BIRTHDAY}>Birthday</option>
            <option value={AlertType.MEETING_REMINDER}>Meeting</option>
            <option value={AlertType.TASK_DUE}>Task</option>
            <option value={AlertType.FOLLOW_UP}>Follow-up</option>
            <option value={AlertType.CUSTOM}>Custom</option>
          </select>
        </div>
      </div>

      {/* Alerts List */}
      <div className="alerts-list">
        {sortedAlerts.length === 0 ? (
          <div className="empty-state">
            <h3>No alerts found</h3>
            <p>Create your first alert to get started</p>
          </div>
        ) : (
          sortedAlerts.map(alert => (
            <div key={alert.alert_id} className={`alert-card alert-${alert.status} priority-${alert.priority}`}>
              <div className="alert-header">
                <h3>{alert.title}</h3>
                <div className="alert-badges">
                  <span className="priority-badge">{getPriorityLabel(alert.priority)}</span>
                  <span className="status-badge">{getStatusLabel(alert.status)}</span>
                  <span className="type-badge">{getTypeLabel(alert.alert_type)}</span>
                </div>
              </div>

              {alert.description && (
                <p className="alert-description">{alert.description}</p>
              )}

              <div className="alert-timing">
                <div className="due-date">
                  <strong>Due:</strong> {formatDueDate(alert.due_date)}
                </div>
                <div className="relative-time">
                  {getRelativeTime(alert.due_date)}
                </div>
              </div>

              {alert.tags && alert.tags.length > 0 && (
                <div className="alert-tags">
                  {alert.tags.map(tag => (
                    <span key={tag} className="tag">{tag}</span>
                  ))}
                </div>
              )}

              <div className="alert-actions">
                {alert.status === AlertStatus.PENDING && (
                  <>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => handleAlertAction(alert.alert_id, 'snooze', { hours: 1 })}
                    >
                      Snooze 1h
                    </Button>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => handleAlertAction(alert.alert_id, 'dismiss')}
                    >
                      Dismiss
                    </Button>
                  </>
                )}
                {alert.status === AlertStatus.SNOOZED && (
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => handleAlertAction(alert.alert_id, 'activate')}
                  >
                    Reactivate
                  </Button>
                )}

                <Button
                  variant="danger"
                  size="small"
                  onClick={() => {
                    setSelectedAlert(alert);
                    setShowDeleteConfirm(true);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Alert Modal */}
      {showCreateForm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Create New Alert</h2>
              <button
                className="modal-close"
                onClick={() => setShowCreateForm(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateAlert} className="alert-form">
              <div className="form-group">
                <label htmlFor="title">Title *</label>
                <input
                  type="text"
                  id="title"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Enter alert title"
                />
              </div>

              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description"
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label htmlFor="alert_type">Type</label>
                <select
                  id="alert_type"
                  value={formData.alert_type}
                  onChange={(e) => setFormData({ ...formData, alert_type: e.target.value as AlertType })}
                >
                  <option value={AlertType.CUSTOM}>Custom</option>
                  <option value={AlertType.TASK_DUE}>Task Due</option>
                  <option value={AlertType.MEETING_REMINDER}>Meeting Reminder</option>
                  <option value={AlertType.FOLLOW_UP}>Follow-up</option>
                  <option value={AlertType.UPCOMING_BIRTHDAY}>Birthday</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="due_date">Due Date & Time * (Your timezone: {userTimezone})</label>
                <input
                  type="datetime-local"
                  id="due_date"
                  required
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label htmlFor="priority">Priority</label>
                <select
                  id="priority"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) as AlertPriority })}
                >
                  <option value={AlertPriority.LOW}>Low</option>
                  <option value={AlertPriority.MEDIUM}>Medium</option>
                  <option value={AlertPriority.HIGH}>High</option>
                </select>
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.recurring}
                    onChange={(e) => setFormData({ ...formData, recurring: e.target.checked })}
                  />
                  Recurring Alert
                </label>
              </div>

              <div className="form-actions">
                <Button variant="secondary" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit">
                  Create Alert
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedAlert && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Confirm Delete</h2>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete the alert &ldquo;{selectedAlert.title}&rdquo;?</p>
              <p>This action cannot be undone.</p>
            </div>
            <div className="form-actions">
              <Button 
                variant="secondary"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setSelectedAlert(null);
                }}
              >
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteAlert}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default AlertsPage; 