/**
 * 🔥 CENTRALIZED CACHE MANAGER
 * Manages all module-level caches with invalidation support
 * Implements "load once and no more loading" philosophy
 */

type CacheInvalidationCallback = () => void;

class CacheManager {
  private invalidationCallbacks: Map<string, CacheInvalidationCallback[]> = new Map();
  private cache: Map<string, any> = new Map();
  private timedCache: Map<string, { value: any; expiresAt: number }> = new Map();

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
    this.timedCache.delete(key);
  }

  async fetch<T>(
    key: string,
    loader: () => Promise<T>,
    opts?: { ttl?: number; staleWhileRevalidate?: boolean }
  ): Promise<T> {
    const ttl = Math.max(1000, Number(opts?.ttl || 60000));
    const now = Date.now();
    const hit = this.timedCache.get(key);
    if (hit && hit.expiresAt > now) {
      this.cache.set(key, hit.value);
      return hit.value as T;
    }
    if (hit && opts?.staleWhileRevalidate) {
      void loader()
        .then((fresh) => {
          this.timedCache.set(key, { value: fresh, expiresAt: Date.now() + ttl });
          this.cache.set(key, fresh);
        })
        .catch(() => {
          /* keep stale */
        });
      return hit.value as T;
    }
    const fresh = await loader();
    this.timedCache.set(key, { value: fresh, expiresAt: Date.now() + ttl });
    this.cache.set(key, fresh);
    return fresh;
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
   * Clear all cache + timed entries whose keys start with prefix.
   */
  invalidatePrefix(prefix: string) {
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
    for (const key of [...this.timedCache.keys()]) {
      if (key.startsWith(prefix)) {
        this.timedCache.delete(key);
      }
    }
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
    this.timedCache.clear();
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