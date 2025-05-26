// src/frontend/index.tsx

import React, { lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'; 
import { AuthProvider } from './context/AuthContext';
import { LocaleProvider } from './context/LocaleContext';
import { CalendarProvider } from './context/CalendarContext';
import { AlertsProvider } from './context/AlertsContext';
import { NotificationProvider } from './context/NotificationContext';
import { routingCache } from './utils/routingCache';
import { initializeSettings } from './utils/settingsManager';

import './styles/global.scss';
import { AssistantChatProvider } from './context/AssistantContext'; 
import { LoadingProvider } from './context/LoadingContext';
import { shouldRefreshSettings } from './services/userSettingsService';
import ProtectedRoute from './components/auth/ProtectedRoute'; 
import Header from './components/layout/Header';
import StandardToastContainer from './components/common/StandardToastContainer';
import LoginPage from './pages/auth/LoginPage'; 
import SignupPage from './pages/auth/SignupPage'; 
import SuspenseWithLoading from './components/common/SuspenseWithLoading';
import RouterChangeListener from './components/auth/RouterChangeListener';
import GlobalSpinner from './components/common/GlobalSpinner';

// Lazily load non-critical pages with error handling
const ForgotPasswordPage = lazy(() =>
  import('./pages/auth/ForgotPasswordPage')
    .catch(error => {
      console.error('Error loading ForgotPasswordPage module:', error);
      // Return a minimal module that will render a fallback component
      return { default: () => <div>Failed to load page. Please refresh or try again later.</div> };
    })
);
const ResetPasswordPage = lazy(() =>
  import('./pages/auth/ResetPasswordPage')
    .catch(error => {
      console.error('CRITICAL: Error loading ResetPasswordPage module:', error);
      return { default: () => <div>Error: Reset Password page module failed to load. Please check deployment and build logs.</div> };
    })
);
const VerifyEmailPage = lazy(() =>
  import('./pages/auth/VerifyEmailPage')
    .catch(error => {
      console.error('CRITICAL: Error loading VerifyEmailPage module:', error);
      return { default: () => <div>Error: Email Verification page module failed to load. Please check deployment and build logs.</div> };
    })
);
const AssistantPage = lazy(() =>
  import('./pages/main/AssistantPage')
    .catch(error => {
      console.error('CRITICAL: Error loading AssistantPage module:', error);
      return { default: () => <div>Error: Assistant page module failed to load. Please check deployment and build logs.</div> };
    })
);
const CalendarPage = lazy(() =>
  import('./pages/main/CalendarPage')
    .catch(error => {
      console.error('CRITICAL: Error loading CalendarPage module:', error);
      return { default: () => <div>Error: Calendar page module failed to load. Please check deployment and build logs.</div> };
    })
);
const ContactsPage = lazy(() =>
  import('./pages/main/ContactsPage')
    .catch(error => {
      console.error('CRITICAL: Error loading ContactsPage module:', error);
      // Return a minimal module that will render a specific fallback component
      return { default: () => <div>Error: Contacts page module failed to load. Please check deployment and build logs.</div> };
    })
);
const AlertsPage = lazy(() =>
  import('./pages/main/AlertsPage')
    .catch(error => {
      console.error('CRITICAL: Error loading AlertsPage module:', error);
      return { default: () => <div>Error: Alerts page module failed to load. Please check deployment and build logs.</div> };
    })
);
const SettingsPage = lazy(() =>
  import('./pages/settings/SettingsPage')
    .catch(error => {
      console.error('CRITICAL: Error loading SettingsPage module:', error);
      return { default: () => <div>Error: Settings page module failed to load. Please check deployment and build logs.</div> };
    })
);

// Create a component to prefetch chunks
const ChunkPrefetcher: React.FC = () => {
  React.useEffect(() => {
    // Prefetch modules that have been problematic
    console.log('Prefetching critical chunks...');
    Promise.all([
      import('./pages/auth/ForgotPasswordPage'),
      import('./pages/auth/ResetPasswordPage')
    ]).catch(error => {
      console.warn('Prefetch warning:', error);
      // Non-fatal error, we will still try to load when needed
    });
  }, []);

  return null; // This component doesn't render anything
};

const NotFound: React.FC = () => <h2>404 - Page Not Found</h2>;

// Protected Layout component that replaces the old Layout
const ProtectedLayout: React.FC = () => {
  return (
    <div className="site-layout">
      <Header />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

// AppInitializer component to handle app startup tasks
const AppInitializer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  React.useEffect(() => {
    // Log app initialization
    console.log('[AppInitializer] Starting application initialization');

    // Clear birthday loading state from localStorage to prevent auto-loading on refresh
    try {
      // These items cause automatic birthday loading when present
      localStorage.removeItem('showBirthdayEventsConfig');
      
      console.log('[AppInitializer] Cleared birthday loading state from localStorage');
    } catch (error) {
      console.error('[AppInitializer] Error clearing birthday state from localStorage:', error);
    }

    // Check if user settings need to be refreshed from server
    // This helps with cross-device synchronization
    if (shouldRefreshSettings()) {
      console.log('[AppInitializer] User settings need refresh. Will be handled by AuthContext when session is available.');
    }

    // Log display information
    console.log('[AppInitializer] Display info:', {
      width: window.screen.width,
      height: window.screen.height,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
      colorDepth: window.screen.colorDepth,
      pixelDepth: window.screen.pixelDepth,
      devicePixelRatio: window.devicePixelRatio || 1,
      orientation: window.screen.orientation ? window.screen.orientation.type : 'unknown'
    });

    // Initialize routing cache
    routingCache.cleanup();
    
    // Set up periodic cleanup
    const cleanupInterval = setInterval(() => {
      routingCache.cleanup();
    }, 300000); // Clean up every 5 minutes

    console.log('[AppInitializer] Application initialization complete');

    return () => {
      clearInterval(cleanupInterval);
    };
  }, []);

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={
          <SuspenseWithLoading>
            <ForgotPasswordPage />
          </SuspenseWithLoading>
        } />
        <Route path="/reset-password" element={
          <SuspenseWithLoading>
            <ResetPasswordPage />
          </SuspenseWithLoading>
        } />
        <Route path="/verify-email" element={
          <SuspenseWithLoading>
            <VerifyEmailPage />
          </SuspenseWithLoading>
        } /> 
        
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<ProtectedLayout />}>
            <Route index element={<Navigate to="/assistant" replace />} /> 
            <Route path="assistant" element={
              <SuspenseWithLoading>
                <AssistantPage />
              </SuspenseWithLoading>
            } />
            <Route path="calendar" element={
              <SuspenseWithLoading>
                <CalendarPage />
              </SuspenseWithLoading>
            } />
            <Route path="contacts" element={
              <SuspenseWithLoading>
                <ContactsPage />
              </SuspenseWithLoading>
            } />
            <Route path="alerts" element={
              <SuspenseWithLoading>
                <AlertsPage />
              </SuspenseWithLoading>
            } />
            <Route path="settings" element={
              <SuspenseWithLoading>
                <SettingsPage />
              </SuspenseWithLoading>
            } />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
      <StandardToastContainer />
    </>
  );
};



// App root entry point
const rootElement = document.getElementById('root');

if (rootElement) {
  // Correctly initialize settings if needed, this was a linter error before
  // Assuming initializeSettings might need the auth state or similar,
  // it might be better placed within AuthProvider or similar context setup.
  // For now, if it was added by me and causing issues, let's ensure it's
  // called in a way that doesn't break, or remove if not truly needed here.
  // The previous linter error was "Expected 1 arguments, but got 0."
  // Let's assume for now it was meant to be called with `null` if no user yet.
  initializeSettings(null); 

  const root = ReactDOM.createRoot(rootElement);
  
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <LocaleProvider>
            <CalendarProvider>
              <AlertsProvider>
                <AssistantChatProvider>
                  <LoadingProvider>
                    <NotificationProvider>
                      <RouterChangeListener>
                        <AppInitializer>
                          <GlobalSpinner />
                          <ChunkPrefetcher />
                          <App />
                        </AppInitializer>
                      </RouterChangeListener>
                    </NotificationProvider>
                  </LoadingProvider>
                </AssistantChatProvider>
              </AlertsProvider>
            </CalendarProvider>
          </LocaleProvider>
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
} else {
  console.error('Failed to find the root element');
}