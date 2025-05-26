// src/frontend/utils/toastManager.ts
import { toast, ToastOptions, ToastContent, TypeOptions } from 'react-toastify';
import { getToastOptions, getLongToastOptions } from './toastUtils';

/**
 * Toast notification types matching our dark theme
 */
export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'default';

/**
 * Simplified, high-performance toast manager
 * Eliminates queuing complexity and memory leaks
 */
class ToastManager {
  private activeToasts = new Set<string | number>();
  private readonly MAX_VISIBLE_TOASTS = 4;
  
  /**
   * Show a toast notification with proper styling
   */
  show(content: ToastContent, type: ToastType = 'default', options?: ToastOptions) {
    // If we're at the limit, dismiss the oldest toast
    if (this.activeToasts.size >= this.MAX_VISIBLE_TOASTS) {
      toast.dismiss();
      this.activeToasts.clear();
    }

    const defaultOptions = this.getDefaultOptions(type);
    const finalOptions = { ...defaultOptions, ...options };
    
    const toastId = this.showToast(content, type, finalOptions);
    
    if (toastId) {
      this.activeToasts.add(toastId);
      
      // Clean up tracking when toast closes
      const duration = finalOptions.autoClose;
      if (typeof duration === 'number' && duration > 0) {
        setTimeout(() => {
          this.activeToasts.delete(toastId);
        }, duration + 100); // Small buffer for animation
      }
    }
    
    return toastId;
  }

  /**
   * Show success toast
   */
  success(content: ToastContent, options?: ToastOptions) {
    return this.show(content, 'success', options);
  }

  /**
   * Show error toast
   */
  error(content: ToastContent, options?: ToastOptions) {
    return this.show(content, 'error', { ...getLongToastOptions(), ...options });
  }

  /**
   * Show warning toast
   */
  warning(content: ToastContent, options?: ToastOptions) {
    return this.show(content, 'warning', options);
  }

  /**
   * Show info toast
   */
  info(content: ToastContent, options?: ToastOptions) {
    return this.show(content, 'info', options);
  }

  /**
   * Show a single toast with proper type mapping
   */
  private showToast(content: ToastContent, type: ToastType, options?: ToastOptions) {
    const toastType = type === 'default' ? undefined : type;
    return toast(content, {
      ...options,
      type: toastType as TypeOptions,
      containerId: 'main-toast-container'
    });
  }

  /**
   * Get default options based on toast type
   */
  private getDefaultOptions(type: ToastType): ToastOptions {
    switch (type) {
      case 'error':
        return getToastOptions('ERROR');
      case 'success':
        return getToastOptions('DEFAULT');
      case 'warning':
        return getToastOptions('WARNING');
      case 'info':
        return getToastOptions('DEFAULT');
      default:
        return getToastOptions('DEFAULT');
    }
  }

  /**
   * Show loading toast (special case that returns an ID)
   */
  loading(content: ToastContent, options?: ToastOptions) {
    const toastId = toast.loading(content, {
      ...options,
      containerId: 'main-toast-container'
    });
    
    if (toastId) {
      this.activeToasts.add(toastId);
    }
    
    return toastId;
  }

  /**
   * Clear all toasts
   */
  clearAll() {
    toast.dismiss();
    this.activeToasts.clear();
  }

  /**
   * Dismiss a specific toast
   */
  dismiss(toastId?: string | number) {
    if (toastId) {
      toast.dismiss(toastId);
      this.activeToasts.delete(toastId);
    } else {
      toast.dismiss();
      this.activeToasts.clear();
    }
  }
}

// Export singleton instance
export const toastManager = new ToastManager();

// Export convenience functions
export const showToast = toastManager.show.bind(toastManager);
export const showSuccess = toastManager.success.bind(toastManager);
export const showError = toastManager.error.bind(toastManager);
export const showWarning = toastManager.warning.bind(toastManager);
export const showInfo = toastManager.info.bind(toastManager);
export const showLoading = toastManager.loading.bind(toastManager);
export const dismissToast = toastManager.dismiss.bind(toastManager);
export const clearAllToasts = toastManager.clearAll.bind(toastManager);
