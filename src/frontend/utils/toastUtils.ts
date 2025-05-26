// src/frontend/utils/toastUtils.ts
import { ToastOptions } from 'react-toastify';

/**
 * Centralized toast durations.
 * These semantic names should be used throughout the application
 * to ensure consistency and easy updates.
 */
export const ToastDurations = {
  QUICK_INFO: 1500,      // For very brief, non-critical info (formerly default: 1500ms)
  DEFAULT: 2000,         // Standard informational toasts (formerly short: 2000ms)
  USER_ACTION: 2500,     // Confirmation of user actions (e.g., "Settings saved")
  IMPORTANT_INFO: 3000,  // Info that user should likely read (e.g., "User already registered")
  WARNING: 4000,         // Warnings that need attention (consistent with previous warning time)
  ERROR: 5000,           // Error messages (formerly long: 5000ms)
  // EXTENDED_ERROR: 7000 // Example: For errors that might need more time (can be added if needed)
};

export type ToastDurationKey = keyof typeof ToastDurations;

/**
 * Standard toast configuration options to maintain consistency
 * throughout the application.
 * Accepts a ToastDurationKey or a direct number for duration.
 */
export const getToastOptions = (
  durationOrKey: ToastDurationKey | number = 'DEFAULT',
  position: "top-right" | "top-center" | "top-left" | "bottom-right" | "bottom-center" | "bottom-left" = "top-center"
): ToastOptions => {
  const duration = typeof durationOrKey === 'number' ? durationOrKey : ToastDurations[durationOrKey];
  return {
    position,
    autoClose: duration,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    progressClassName: 'toast-progress-bar',
    className: 'custom-toast'
  };
};

/**
 * Get toast options for short-lived notifications (uses QUICK_INFO)
 */
export const getShortToastOptions = (
  position: "top-right" | "top-center" | "top-left" | "bottom-right" | "bottom-center" | "bottom-left" = "top-center"
): ToastOptions => {
  return getToastOptions('QUICK_INFO', position);
};

/**
 * Get toast options for long-lived notifications (uses ERROR)
 */
export const getLongToastOptions = (
  position: "top-right" | "top-center" | "top-left" | "bottom-right" | "bottom-center" | "bottom-left" = "top-center"
): ToastOptions => {
  return getToastOptions('ERROR', position);
};