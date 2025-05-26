import React, { createContext, useContext, ReactNode, useCallback } from 'react';
import { showSuccess, showError, showWarning, showInfo, showToast, clearAllToasts } from '../utils/toastManager';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface NotificationContextType {
  showNotification: (_type: NotificationType, _message: string) => void;
  showSuccess: (_message: string) => void;
  showError: (_message: string) => void;
  showWarning: (_message: string) => void;
  showInfo: (_message: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const showNotification = useCallback((type: NotificationType, message: string) => {
    switch (type) {
      case 'success':
        showSuccess(message);
        break;
      case 'error':
        showError(message);
        break;
      case 'warning':
        showWarning(message);
        break;
      case 'info':
        showInfo(message);
        break;
      default:
        showToast(message, 'default');
    }
  }, []);

  const contextValue: NotificationContextType = {
    showNotification,
    showSuccess: useCallback((message: string) => showSuccess(message), []),
    showError: useCallback((message: string) => showError(message), []),
    showWarning: useCallback((message: string) => showWarning(message), []),
    showInfo: useCallback((message: string) => showInfo(message), []),
    clearAll: useCallback(() => clearAllToasts(), [])
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;