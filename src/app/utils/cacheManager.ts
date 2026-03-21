/**
 * 🔥 CENTRALIZED CACHE MANAGER
 * Manages all module-level caches with invalidation support
 * Implements "load once and no more loading" philosophy
 */

type CacheInvalidationCallback = () => void;

class CacheManager {
  private invalidationCallbacks: Map<string, CacheInvalidationCallback[]> = new Map();
  private cache: Map<string, any> = new Map();

  /**
   * Set a value in the cache
   */
  set(key: string, value: any) {
    this.cache.set(key, value);
  }

  /**
   * Get a value from the cache
   */
  get(key: string) {
    return this.cache.get(key);
  }

  /**
   * Clear a specific cache key
   */
  clear(key: string) {
    this.cache.delete(key);
  }

  /**
   * Register a callback to be called when cache is invalidated
   */
  registerInvalidation(key: string, callback: CacheInvalidationCallback) {
    if (!this.invalidationCallbacks.has(key)) {
      this.invalidationCallbacks.set(key, []);
    }
    this.invalidationCallbacks.get(key)!.push(callback);
  }

  /**
   * Invalidate all caches for a specific key
   */
  invalidate(key: string) {
    console.log(`🗑️ Invalidating cache for: ${key}`);
    const callbacks = this.invalidationCallbacks.get(key);
    if (callbacks) {
      callbacks.forEach(callback => callback());
    }
    this.clear(key);
  }

  /**
   * Invalidate all caches for a vendor
   */
  invalidateVendor(vendorId: string) {
    console.log(`🗑️ Invalidating all caches for vendor: ${vendorId}`);
    this.invalidate(`vendor:${vendorId}`);
    this.invalidate(`vendor:${vendorId}:products`);
    this.invalidate(`vendor:${vendorId}:categories`);
    this.invalidate(`vendor:${vendorId}:orders`);
    this.invalidate(`vendor:${vendorId}:storefront`);
    this.invalidate(`vendor:${vendorId}:dashboard`);
    
    // Also invalidate global categories since they show vendor names
    this.invalidate('categories');
  }

  /**
   * Invalidate all caches globally
   */
  invalidateAll() {
    console.log(`🗑️ Invalidating ALL caches globally`);
    this.invalidationCallbacks.forEach((callbacks, key) => {
      console.log(`  - Clearing: ${key}`);
      callbacks.forEach(callback => callback());
    });
    this.cache.clear();
  }

  /**
   * Trigger a data reload for vendor after settings update
   */
  reloadVendorData(vendorId: string) {
    console.log(`🔄 Reloading all vendor data for: ${vendorId}`);
    this.invalidateVendor(vendorId);
    
    // Dispatch custom event for components to listen to
    window.dispatchEvent(new CustomEvent('vendorDataUpdated', { 
      detail: { vendorId } 
    }));
  }
}

// Singleton instance
export const cacheManager = new CacheManager();