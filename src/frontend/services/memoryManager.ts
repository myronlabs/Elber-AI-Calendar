// Simple Cleanup Registry
// Just manages cleanup functions - no complex monitoring needed

interface CleanupFunction {
  (): void;
}

class MemoryManager {
  private static instance: MemoryManager;
  private cleanupFunctions: Set<CleanupFunction> = new Set();

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  /**
   * Register a cleanup function to be called during memory pressure
   */
  registerCleanup(cleanup: CleanupFunction): () => void {
    this.cleanupFunctions.add(cleanup);
    
    // Return unregister function
    return () => {
      this.cleanupFunctions.delete(cleanup);
    };
  }

  /**
   * Trigger all registered cleanup functions
   */
  triggerCleanup(): void {
    console.log(`[MemoryManager] Triggering cleanup for ${this.cleanupFunctions.size} registered functions`);
    
    this.cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        console.error('[MemoryManager] Error during cleanup:', error);
      }
    });
  }

  /**
   * Clear object properties to help GC (based on Discord's approach)
   */
  static clearObject(obj: Record<string, unknown>): void {
    if (!obj || typeof obj !== 'object') return;
    
    Object.keys(obj).forEach(key => {
      try {
        delete obj[key];
      } catch {
        // Some properties might not be deletable
        obj[key] = null;
      }
    });
  }

  /**
   * Clear array efficiently without creating garbage
   */
  static clearArray(arr: unknown[]): void {
    if (!Array.isArray(arr)) return;
    arr.length = 0;
  }

  /**
   * Create a memory-efficient event listener cleanup
   */
  static createEventCleanup(
    element: EventTarget,
    event: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions
  ): () => void {
    element.addEventListener(event, handler, options);
    
    return () => {
      element.removeEventListener(event, handler, options);
    };
  }

  /**
   * Create a memory-efficient timer cleanup
   */
  static createTimerCleanup(
    callback: () => void,
    delay: number,
    isInterval = false
  ): () => void {
    const id = isInterval 
      ? setInterval(callback, delay)
      : setTimeout(callback, delay);
    
    return () => {
      if (isInterval) {
        clearInterval(id);
      } else {
        clearTimeout(id);
      }
    };
  }
}

// Export singleton instance
export const memoryManager = MemoryManager.getInstance();

// Export utility functions
export const { clearObject, clearArray, createEventCleanup, createTimerCleanup } = MemoryManager; 