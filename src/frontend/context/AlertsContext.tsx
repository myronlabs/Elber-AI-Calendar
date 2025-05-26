import React, { createContext, useContext, useState, useCallback, ReactNode, useRef } from 'react';
import { useAuth } from './AuthContext';
import { apiClient } from '../utils/api';
import type { Alert, CreateAlertPayload, UpdateAlertPayload } from '../../backend/types/domain';
import { AlertStatus } from '../../backend/types/domain';

interface AlertsState {
  alerts: Alert[];
  isLoading: boolean;
  error: Error | null;
  lastFetchTime: number | null;
}

interface AlertsContextType extends AlertsState {
  fetchAlerts: (forceRefresh?: boolean) => Promise<void>;
  createAlert: (alertData: CreateAlertPayload) => Promise<Alert | null>;
  updateAlert: (alertId: string, updateData: UpdateAlertPayload) => Promise<Alert | null>;
  deleteAlert: (alertId: string) => Promise<boolean>;
  dismissAlert: (alertId: string) => Promise<boolean>;
  snoozeAlert: (alertId: string, hours: number) => Promise<boolean>;
  clearError: () => void;
  setAlerts: (alerts: Alert[]) => void;
}

const AlertsContext = createContext<AlertsContextType | undefined>(undefined);

interface AlertsProviderProps {
  children: ReactNode;
}

// Cache duration: 1 minute
const CACHE_DURATION = 60 * 1000;

export const AlertsProvider: React.FC<AlertsProviderProps> = ({ children }) => {
  const { user, isLoading: authLoading } = useAuth();
  const prevUserRef = useRef(user);
  
  const [alertsState, setAlertsState] = useState<AlertsState>({
    alerts: [],
    isLoading: false,
    error: null,
    lastFetchTime: null
  });

  // Effect to reset state when user changes
  React.useEffect(() => {
    if (user?.id !== prevUserRef.current?.id) {
      console.log('[AlertsContext] User changed. Resetting alerts state.');
      setAlertsState({
        alerts: [],
        isLoading: false,
        error: null,
        lastFetchTime: null
      });
    }
    prevUserRef.current = user;
  }, [user]);

  // REMOVED: Auto-fetch on mount - alerts should only be loaded when AlertsPage is accessed
  // This prevents unnecessary API calls and improves performance

  const fetchAlerts = useCallback(async (forceRefresh = false) => {
    // Check if user is authenticated
    if (!user || authLoading) {
      console.warn('[AlertsContext] fetchAlerts called without authenticated user');
      return;
    }

    // Check cache unless force refresh is requested
    if (!forceRefresh && alertsState.lastFetchTime) {
      const timeSinceLastFetch = Date.now() - alertsState.lastFetchTime;
      if (timeSinceLastFetch < CACHE_DURATION) {
        console.log('[AlertsContext] Using cached alerts data');
        return;
      }
    }

    setAlertsState(prev => ({ ...prev, isLoading: true, error: null }));
    console.log('[AlertsContext] Fetching alerts from API...');

    try {
      const response = await apiClient.get<{ alerts: Alert[] }>('/alerts');
      const alerts = response.alerts || [];
      
      console.log(`[AlertsContext] Successfully fetched ${alerts.length} alerts`);
      
      setAlertsState({
        alerts,
        isLoading: false,
        error: null,
        lastFetchTime: Date.now()
      });
    } catch (error) {
      console.error('[AlertsContext] Error fetching alerts:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch alerts';
      setAlertsState(prev => ({
        ...prev,
        isLoading: false,
        error: new Error(errorMessage)
      }));
    }
  }, [user, authLoading, alertsState.lastFetchTime]);

  const createAlert = useCallback(async (alertData: CreateAlertPayload): Promise<Alert | null> => {
    if (!user) {
      console.error('[AlertsContext] Cannot create alert without authenticated user');
      return null;
    }

    setAlertsState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const newAlert = await apiClient.post<CreateAlertPayload, Alert>('/alerts', alertData);
      
      console.log(`[AlertsContext] Successfully created alert: ${newAlert.title}`);
      
      // Add the new alert to state
      setAlertsState(prev => ({
        ...prev,
        alerts: [...prev.alerts, newAlert],
        isLoading: false,
        lastFetchTime: Date.now() // Update cache time
      }));
      
      // Dispatch event for other components
      window.dispatchEvent(new CustomEvent('alert-created', { 
        detail: { alertId: newAlert.alert_id, alert: newAlert }
      }));
      
      return newAlert;
    } catch (error) {
      console.error('[AlertsContext] Error creating alert:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create alert';
      setAlertsState(prev => ({
        ...prev,
        isLoading: false,
        error: new Error(errorMessage)
      }));
      return null;
    }
  }, [user]);

  const updateAlert = useCallback(async (alertId: string, updateData: UpdateAlertPayload): Promise<Alert | null> => {
    if (!user) {
      console.error('[AlertsContext] Cannot update alert without authenticated user');
      return null;
    }

    setAlertsState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const updatedAlert = await apiClient.put<UpdateAlertPayload, Alert>(`/alerts/${alertId}`, updateData);
      
      console.log(`[AlertsContext] Successfully updated alert: ${alertId}`);
      
      // Update the alert in state
      setAlertsState(prev => ({
        ...prev,
        alerts: prev.alerts.map(alert => 
          alert.alert_id === alertId ? updatedAlert : alert
        ),
        isLoading: false,
        lastFetchTime: Date.now() // Update cache time
      }));
      
      // Dispatch event for other components
      window.dispatchEvent(new CustomEvent('alert-updated', { 
        detail: { alertId, alert: updatedAlert }
      }));
      
      return updatedAlert;
    } catch (error) {
      console.error('[AlertsContext] Error updating alert:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update alert';
      setAlertsState(prev => ({
        ...prev,
        isLoading: false,
        error: new Error(errorMessage)
      }));
      return null;
    }
  }, [user]);

  const deleteAlert = useCallback(async (alertId: string): Promise<boolean> => {
    if (!user) {
      console.error('[AlertsContext] Cannot delete alert without authenticated user');
      return false;
    }

    setAlertsState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      await apiClient.delete(`/alerts/${alertId}`);
      
      console.log(`[AlertsContext] Successfully deleted alert: ${alertId}`);
      
      // Remove the alert from state
      setAlertsState(prev => ({
        ...prev,
        alerts: prev.alerts.filter(alert => alert.alert_id !== alertId),
        isLoading: false,
        lastFetchTime: Date.now() // Update cache time
      }));
      
      // Dispatch event for other components
      window.dispatchEvent(new CustomEvent('alert-deleted', { 
        detail: { alertId }
      }));
      
      return true;
    } catch (error) {
      console.error('[AlertsContext] Error deleting alert:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete alert';
      setAlertsState(prev => ({
        ...prev,
        isLoading: false,
        error: new Error(errorMessage)
      }));
      return false;
    }
  }, [user]);

  const dismissAlert = useCallback(async (alertId: string): Promise<boolean> => {
    if (!user) {
      console.error('[AlertsContext] Cannot dismiss alert without authenticated user');
      return false;
    }

    try {
      // Use the same API format as AlertsPage
      await apiClient.put(`/alerts/${alertId}`, { action: 'dismiss' });
      
      console.log(`[AlertsContext] Successfully dismissed alert: ${alertId}`);
      
      // Update the alert status in state
      setAlertsState(prev => ({
        ...prev,
        alerts: prev.alerts.map(alert => 
          alert.alert_id === alertId 
            ? { ...alert, status: AlertStatus.DISMISSED, dismissed_at: new Date().toISOString() }
            : alert
        ),
        lastFetchTime: Date.now()
      }));
      
      return true;
    } catch (error) {
      console.error('[AlertsContext] Error dismissing alert:', error);
      return false;
    }
  }, [user]);

  const snoozeAlert = useCallback(async (alertId: string, hours: number): Promise<boolean> => {
    if (!user) {
      console.error('[AlertsContext] Cannot snooze alert without authenticated user');
      return false;
    }

    try {
      const snoozedUntil = new Date();
      snoozedUntil.setHours(snoozedUntil.getHours() + hours);
      
      // Use the same API format as AlertsPage
      await apiClient.put(`/alerts/${alertId}`, { action: 'snooze', hours });
      
      console.log(`[AlertsContext] Successfully snoozed alert ${alertId} for ${hours} hours`);
      
      // Update the alert status in state
      setAlertsState(prev => ({
        ...prev,
        alerts: prev.alerts.map(alert => 
          alert.alert_id === alertId 
            ? { ...alert, status: AlertStatus.SNOOZED, snoozed_until: snoozedUntil.toISOString() }
            : alert
        ),
        lastFetchTime: Date.now()
      }));
      
      return true;
    } catch (error) {
      console.error('[AlertsContext] Error snoozing alert:', error);
      return false;
    }
  }, [user]);

  const clearError = useCallback(() => {
    setAlertsState(prev => ({ ...prev, error: null }));
  }, []);

  const setAlerts = useCallback((alerts: Alert[]) => {
    console.log(`[AlertsContext] Manually setting ${alerts.length} alerts`);
    setAlertsState(prev => ({
      ...prev,
      alerts,
      lastFetchTime: Date.now()
    }));
  }, []);

  const value: AlertsContextType = {
    ...alertsState,
    fetchAlerts,
    createAlert,
    updateAlert,
    deleteAlert,
    dismissAlert,
    snoozeAlert,
    clearError,
    setAlerts
  };

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
};

export const useAlerts = (): AlertsContextType => {
  const context = useContext(AlertsContext);
  if (context === undefined) {
    throw new Error('useAlerts must be used within an AlertsProvider');
  }
  return context;
}; 