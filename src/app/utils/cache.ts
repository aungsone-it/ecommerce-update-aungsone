// ============================================
// API CACHE UTILITY
// Simple in-memory cache for API responses
// ============================================

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
}

class ApiCache {
  private cache: Map<string, CacheEntry> = new Map();

  /**
   * Get cached data if it exists and hasn't expired
   */
  get<T = any>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;

    // Check if cache has expired
    if (age > entry.ttl) {
      console.log(`🗑️ Cache expired for key: ${key}`);
      this.cache.delete(key);
      return null;
    }

    console.log(`✅ Cache hit for key: ${key} (age: ${age}ms)`);
    return entry.data as T;
  }

  /**
   * Set data in cache with TTL (time to live in milliseconds)
   */
  set<T = any>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
    console.log(`💾 Cached data for key: ${key} (TTL: ${ttl}ms)`);
  }

  /**
   * Delete specific cache entry
   */
  delete(key: string): void {
    const deleted = this.cache.delete(key);
    if (deleted) {
      console.log(`🗑️ Deleted cache for key: ${key}`);
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    console.log('🗑️ Cleared all cache');
  }

  /**
   * Get all cache keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }
}

// Export singleton instance
export const apiCache = new ApiCache();

// Re-export SmartCache from utils for convenience
export { SmartCache, CACHE_KEYS, CACHE_TTL } from '../../utils/cache';
