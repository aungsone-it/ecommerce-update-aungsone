// ============================================
// SMART CACHE SYSTEM - ZERO LOADING TIME
// ============================================
// Uses stale-while-revalidate pattern:
// 1. Return cached data instantly (0ms loading)
// 2. Fetch fresh data in background
// 3. Update UI when fresh data arrives

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: string;
}

const CACHE_VERSION = '1.0.0';
const CACHE_PREFIX = 'migoo_cache_';

// Cache TTL (time to live) - how long before cache is considered stale
const CACHE_TTL = {
  PRODUCTS: 5 * 60 * 1000, // 5 minutes
  ORDERS: 2 * 60 * 1000, // 2 minutes
  CUSTOMERS: 5 * 60 * 1000, // 5 minutes
  STATS: 1 * 60 * 1000, // 1 minute
  VENDORS: 10 * 60 * 1000, // 10 minutes
  COLLABORATORS: 10 * 60 * 1000, // 10 minutes
} as const;

export class SmartCache {
  /**
   * Get cached data - returns instantly if available
   */
  static get<T>(key: string): T | null {
    try {
      const cached = localStorage.getItem(CACHE_PREFIX + key);
      if (!cached) return null;

      const entry: CacheEntry<T> = JSON.parse(cached);
      
      // Check version
      if (entry.version !== CACHE_VERSION) {
        this.delete(key);
        return null;
      }

      return entry.data;
    } catch (error) {
      console.error('Cache read error:', error);
      return null;
    }
  }

  /**
   * Check if cache is fresh (not stale)
   */
  static isFresh(key: string, ttl: number): boolean {
    try {
      const cached = localStorage.getItem(CACHE_PREFIX + key);
      if (!cached) return false;

      const entry: CacheEntry<any> = JSON.parse(cached);
      const age = Date.now() - entry.timestamp;
      
      return age < ttl && entry.version === CACHE_VERSION;
    } catch {
      return false;
    }
  }

  /**
   * Set cache data
   */
  static set<T>(key: string, data: T): void {
    try {
      // 🔥 Don't optimize product data - store complete data for proper rendering
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        version: CACHE_VERSION,
      };
      
      const serialized = JSON.stringify(entry);
      
      // 🔥 Check size before caching (skip if > 8MB)
      const sizeInMB = new Blob([serialized]).size / (1024 * 1024);
      if (sizeInMB > 8) {
        console.warn(`⚠️ Skipping cache for ${key} - too large (${sizeInMB.toFixed(2)}MB)`);
        return;
      }
      
      localStorage.setItem(CACHE_PREFIX + key, serialized);
      console.log(`💾 Cached ${key} (${sizeInMB.toFixed(2)}MB)`);
    } catch (error) {
      // If quota exceeded, clear old cache
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.warn('📦 Storage quota exceeded, clearing old cache...');
        this.clearOldCache();
        
        // Try again
        try {
          const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now(),
            version: CACHE_VERSION,
          };
          localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
        } catch {
          console.warn(`⚠️ Could not cache ${key} - quota exceeded`);
        }
      } else {
        console.error('Cache write error:', error);
      }
    }
  }

  /**
   * Delete cached data
   */
  static delete(key: string): void {
    localStorage.removeItem(CACHE_PREFIX + key);
  }

  /**
   * Clear all cache
   */
  static clearAll(): void {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  }

  /**
   * Clear old/stale cache entries
   */
  static clearOldCache(): void {
    const keys = Object.keys(localStorage);
    const now = Date.now();
    
    keys.forEach(key => {
      if (!key.startsWith(CACHE_PREFIX)) return;
      
      try {
        const cached = localStorage.getItem(key);
        if (!cached) return;
        
        const entry: CacheEntry<any> = JSON.parse(cached);
        const age = now - entry.timestamp;
        
        // Remove if older than 1 hour
        if (age > 60 * 60 * 1000) {
          localStorage.removeItem(key);
        }
      } catch {
        // Invalid entry, remove it
        localStorage.removeItem(key);
      }
    });
  }

  /**
   * Clear non-essential data (keep user auth and critical data)
   */
  static clearNonEssentialData(): void {
    const keys = Object.keys(localStorage);
    const essentialKeys = [
      'migoo-user',           // User auth
      'migoo-cart',           // Shopping cart
      'migoo-applied-coupon', // Active coupon
    ];
    
    let clearedCount = 0;
    keys.forEach(key => {
      // Skip cache keys (handled by clearOldCache)
      if (key.startsWith(CACHE_PREFIX)) return;
      
      // Skip essential keys
      if (essentialKeys.some(essential => key.includes(essential))) return;
      
      // Remove non-essential localStorage items
      try {
        localStorage.removeItem(key);
        clearedCount++;
      } catch {
        // Ignore errors
      }
    });
    
    if (clearedCount > 0) {
      console.log(`🧹 Cleared ${clearedCount} non-essential items to free up space`);
    }
  }

  /**
   * Get cache age in milliseconds
   */
  static getAge(key: string): number | null {
    try {
      const cached = localStorage.getItem(CACHE_PREFIX + key);
      if (!cached) return null;

      const entry: CacheEntry<any> = JSON.parse(cached);
      return Date.now() - entry.timestamp;
    } catch {
      return null;
    }
  }
}

// Cache keys
export const CACHE_KEYS = {
  PRODUCTS: 'products',
  ORDERS: 'orders',
  CUSTOMERS: 'customers',
  STATS: 'stats',
  VENDORS: 'vendors',
  COLLABORATORS: 'collaborators',
  BLOG_POSTS: 'blog_posts',
  STOREFRONT_PRODUCTS: 'storefront_products',
  BADGE_COUNTS: 'badge_counts',
} as const;

export { CACHE_TTL };