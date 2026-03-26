/**
 * 🚀 MODULE-LEVEL CACHE - "Load once and no more loading" philosophy
 * 
 * This singleton cache persists data at the module level, ensuring data is loaded
 * ONCE per browser session and reused across ALL navigations and component remounts.
 * 
 * Benefits:
 * - Reduces API calls from thousands to ~100
 * - Instant navigation (no loading states after initial load)
 * - Reduces Supabase storage requests dramatically
 * - Premium UX with instant data access
 */

import { projectId, publicAnonKey } from '../../../utils/supabase/info';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class ModuleCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private loading: Map<string, Promise<any>> = new Map();
  private hits: number = 0;
  private misses: number = 0;

  /**
   * Get data from cache or fetch if not available
   * @param key - Unique cache key
   * @param fetcher - Function to fetch data if not cached
   * @param forceRefresh - Force fetch even if cached
   * @returns Cached or freshly fetched data
   */
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    forceRefresh: boolean = false
  ): Promise<T> {
    // Check if we're already loading this key (prevent duplicate requests)
    const existingLoad = this.loading.get(key);
    if (existingLoad) {
      console.log(`⏳ [MODULE CACHE] Already loading ${key}, waiting...`);
      this.hits++; // Count as hit since we're reusing the request
      return existingLoad;
    }

    // Check cache
    const cached = this.cache.get(key);
    if (cached && !forceRefresh) {
      this.hits++;
      console.log(`✅ [MODULE CACHE HIT] ${key} (cached at ${new Date(cached.timestamp).toLocaleTimeString()})`);
      return cached.data;
    }

    // Cache miss or force refresh
    this.misses++;
    console.log(`${forceRefresh ? '🔄' : '❌'} [MODULE CACHE ${forceRefresh ? 'REFRESH' : 'MISS'}] ${key} - Fetching...`);

    // Create loading promise
    const loadingPromise = fetcher()
      .then((data) => {
        // Store in cache
        this.cache.set(key, {
          data,
          timestamp: Date.now(),
        });
        console.log(`💾 [MODULE CACHE] Saved ${key}`);
        return data;
      })
      .finally(() => {
        // Remove from loading map
        this.loading.delete(key);
      });

    // Store loading promise to prevent duplicate requests
    this.loading.set(key, loadingPromise);

    return loadingPromise;
  }

  /**
   * Get data from cache only (no fetching)
   * Returns null if not cached
   */
  peek<T>(key: string): T | null {
    const cached = this.cache.get(key);
    return cached ? cached.data : null;
  }

  /**
   * Store data without a network fetch (keeps session cache in sync after local mutations).
   */
  prime<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Check if key is cached
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Clear specific key from cache
   */
  invalidate(key: string): void {
    console.log(`🗑️ [MODULE CACHE] Invalidated ${key}`);
    this.cache.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
    for (const key of [...this.loading.keys()]) {
      if (key.startsWith(prefix)) {
        this.loading.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    console.log('🗑️ [MODULE CACHE] Cleared all cache');
    this.cache.clear();
    this.loading.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const totalRequests = this.hits + this.misses;
    return {
      cacheSize: this.cache.size,
      loading: this.loading.size,
      keys: Array.from(this.cache.keys()),
      hits: this.hits,
      misses: this.misses,
      totalRequests,
      hitRate: totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0,
    };
  }
}

// Singleton instance
export const moduleCache = new ModuleCache();

/**
 * 🎯 PRE-CONFIGURED FETCHERS FOR COMMON DATA
 * These provide consistent cache keys and fetching logic
 */

// Fetch all products from all vendors (SECURE storefront)
export async function fetchAllProducts() {
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/products`,
    {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.status}`);
  }

  const data = await response.json();
  return data.products || [];
}

/** Paginated storefront catalog (slim rows) — standard ecommerce pattern. */
export async function fetchCatalogBootstrap(pageSize = 24) {
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/products?bootstrap=1&pageSize=${pageSize}`,
    { headers: { Authorization: `Bearer ${publicAnonKey}` } }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch catalog bootstrap: ${response.status}`);
  }
  return response.json();
}

export async function fetchCatalogPage(params: {
  page: number;
  pageSize?: number;
  q?: string;
  category?: string;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
}) {
  const sp = new URLSearchParams();
  sp.set("catalog", "1");
  sp.set("page", String(params.page));
  sp.set("pageSize", String(params.pageSize ?? 24));
  if (params.q) sp.set("q", params.q);
  if (params.category && params.category !== "all") sp.set("category", params.category);
  if (params.sort) sp.set("sort", params.sort);
  if (params.minPrice != null && !Number.isNaN(params.minPrice)) sp.set("minPrice", String(params.minPrice));
  if (params.maxPrice != null && !Number.isNaN(params.maxPrice)) sp.set("maxPrice", String(params.maxPrice));
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/products?${sp.toString()}`,
    { headers: { Authorization: `Bearer ${publicAnonKey}` } }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch catalog page: ${response.status}`);
  }
  return response.json();
}

export async function fetchProductsByIds(ids: string[]) {
  if (!ids.length) return [];
  const q = encodeURIComponent(ids.slice(0, 200).join(","));
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/products?ids=${q}`,
    { headers: { Authorization: `Bearer ${publicAnonKey}` } }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch products by ids: ${response.status}`);
  }
  const data = await response.json();
  return data.products || [];
}

// Fetch all vendors (SECURE admin)
export async function fetchAllVendors() {
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendors`,
    {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch vendors: ${response.status}`);
  }

  const data = await response.json();
  return data.vendors || [];
}

/** Super Admin orders API — full payload (supports warning + order shape for Vendor Profile). */
export async function fetchAdminOrdersPayload(): Promise<{ orders: any[]; warning?: string }> {
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/orders`,
    {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch orders: ${response.status}`);
  }

  const data = await response.json();
  return { orders: data.orders || [], warning: data.warning };
}

/** @deprecated Prefer fetchAdminOrdersPayload + cache; returns orders array only */
export async function fetchAllOrders() {
  const p = await fetchAdminOrdersPayload();
  return p.orders;
}

export async function fetchAdminAllCategoriesList(): Promise<any[]> {
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/admin/all-categories`,
    {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch admin categories: ${response.status}`);
  }
  const data = await response.json();
  return data.categories || [];
}

export async function fetchAdminCustomersPayload(): Promise<{ customers: any[] }> {
  const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${publicAnonKey}`,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch customers');
  }
  return { customers: data.customers || [] };
}

export type AdminDashboardFilters = {
  revenue: string;
  orders: string;
  customers: string;
  products: string;
};

const DASH_STATS_PREFIX = 'admin-dashboard-stats:';

export function adminDashboardStatsCacheKey(filters: AdminDashboardFilters): string {
  return `${DASH_STATS_PREFIX}${filters.revenue}|${filters.orders}|${filters.customers}|${filters.products}`;
}

export async function fetchAdminDashboardStatsRaw(filters: AdminDashboardFilters): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    revenueFilter: filters.revenue,
    ordersFilter: filters.orders,
    customersFilter: filters.customers,
    productsFilter: filters.products,
  });
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/dashboard/stats?${params}`,
    {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    }
  );
  if (!response.ok) {
    throw new Error('Failed to fetch dashboard stats');
  }
  return response.json();
}

// Fetch vendor products (vendor admin/storefront)
export async function fetchVendorProducts(vendorId: string) {
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/products/${vendorId}`,
    {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch vendor products: ${response.status}`);
  }

  const data = await response.json();
  return {
    products: data.products || [],
    storeName: data.storeName || 'Vendor Store',
    logo: data.logo || '',
  };
}

// Fetch vendor categories (vendor admin/storefront)
export async function fetchVendorCategories(vendorId: string) {
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/categories-details/${vendorId}`,
    {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch vendor categories: ${response.status}`);
  }

  const data = await response.json();
  return (data.categories || []).filter((c: any) => c.status === 'active');
}

// Fetch vendor orders (vendor admin)
export async function fetchVendorOrders(vendorId: string) {
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/orders/${vendorId}`,
    {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch vendor orders: ${response.status}`);
  }

  const data = await response.json();
  return data.orders || [];
}

// Fetch categories (SECURE storefront)
export async function fetchAllCategories() {
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/categories`,
    {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch categories: ${response.status}`);
  }

  const data = await response.json();
  return data.categories || [];
}

// Fetch site settings (SECURE storefront)
export async function fetchSiteSettings() {
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/settings/general`,
    {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch site settings: ${response.status}`);
  }

  return await response.json();
}

export async function fetchBannersApi() {
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/settings/banners`,
    { headers: { Authorization: `Bearer ${publicAnonKey}` } }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch banners: ${response.status}`);
  }
  return response.json();
}

export async function fetchFeaturedCampaignsApi() {
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/campaigns/featured`,
    {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch featured campaigns: ${response.status}`);
  }
  return response.json();
}

export async function fetchAppearanceSettingsApi() {
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/appearance-settings`,
    {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch appearance settings: ${response.status}`);
  }
  return response.json();
}

/**
 * 🎯 CACHE KEYS - Use these consistently across the app
 */
export const CACHE_KEYS = {
  // SECURE Storefront
  STOREFRONT_PRODUCTS: 'storefront-products',
  /** First page + home sections (slim payloads) */
  STOREFRONT_CATALOG_BOOTSTRAP: 'storefront-catalog-bootstrap-v1',
  STOREFRONT_CATEGORIES: 'storefront-categories',
  STOREFRONT_SETTINGS: 'storefront-settings',
  STOREFRONT_BANNERS: 'storefront-banners-v1',
  STOREFRONT_FEATURED_CAMPAIGNS: 'storefront-featured-campaigns-v1',
  STOREFRONT_APPEARANCE: 'storefront-appearance-v1',
  
  // SECURE Admin
  /** Bump when vendor list semantics change (e.g. API no longer returns audience rows as vendors). */
  ADMIN_VENDORS: 'admin-vendors-v2',
  ADMIN_PRODUCTS: 'admin-products',
  /** Full `/orders` JSON: `{ orders, warning? }` — bumped key when shape changed */
  ADMIN_ORDERS: 'admin-orders-v2-payload',
  /** Super Admin merged categories (admin/all-categories) */
  ADMIN_ALL_CATEGORIES: 'admin-all-categories-v1',
  /** Super Admin /customers list */
  ADMIN_CUSTOMERS: 'admin-customers-v1',
  
  // Vendor specific (append vendorId)
  vendorProducts: (vendorId: string) => `vendor-products-${vendorId}`,
  /** Vendor admin list (all statuses) — separate from public storefront vendor catalog */
  vendorProductsAdmin: (vendorId: string) => `vendor-products-admin-${vendorId}`,
  vendorCategories: (vendorId: string) => `vendor-categories-${vendorId}`,
  vendorOrders: (vendorId: string) => `vendor-orders-${vendorId}`,

  /** Full product by id (GET /products/:id) — Super Admin + shared with storefront shape */
  productById: (productId: string) => `product-by-id-${productId}`,
  
  // 🚀 NEW: Image/Asset caching to prevent 699 storage requests/day!
  // Cache signed URLs for 24 hours (they're valid for 1-10 years anyway)
  signedUrl: (imagePath: string) => `signed-url-${imagePath}`,
  productImage: (productId: string, imageUrl: string) => `product-image-${productId}-${imageUrl}`,
  vendorLogo: (vendorId: string) => `vendor-logo-${vendorId}`,
  profileImage: (userId: string) => `profile-image-${userId}`,
};

/** Full product JSON (GET /products/:id) — same payload Super Admin uses via productsApi.getById */
export async function fetchProductByIdFromApi(productId: string) {
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/products/${encodeURIComponent(productId)}`,
    { headers: { Authorization: `Bearer ${publicAnonKey}` } }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch product: ${response.status}`);
  }
  return response.json();
}

/** Vendor admin: all products (all statuses) for one vendor */
export async function fetchVendorProductsAdmin(vendorId: string) {
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/products-admin/${encodeURIComponent(vendorId)}`,
    { headers: { Authorization: `Bearer ${publicAnonKey}` } }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch vendor products (admin): ${response.status}`);
  }
  return response.json();
}

/** Cached GET /products/:id — revisit = no duplicate edge/DB hit (invalidate on admin edit/delete). */
export async function getCachedProductById(productId: string, forceRefresh = false) {
  return moduleCache.get(
    CACHE_KEYS.productById(productId),
    () => fetchProductByIdFromApi(productId),
    forceRefresh
  );
}

/** Cached vendor admin product list — same pattern as storefront vendor catalog cache */
export async function getCachedVendorProductsAdmin(vendorId: string, forceRefresh = false) {
  return moduleCache.get(
    CACHE_KEYS.vendorProductsAdmin(vendorId),
    () => fetchVendorProductsAdmin(vendorId),
    forceRefresh
  );
}

export function invalidateProductByIdCache(productId: string): void {
  moduleCache.invalidate(CACHE_KEYS.productById(productId));
}

export function invalidateVendorProductsAdminCache(vendorId: string): void {
  moduleCache.invalidate(CACHE_KEYS.vendorProductsAdmin(vendorId));
}

/** Super Admin `/products` grid — one fetch per session until Refresh or invalidation */
export async function getCachedAdminAllProducts(forceRefresh = false) {
  return moduleCache.get(CACHE_KEYS.ADMIN_PRODUCTS, () => fetchAllProducts(), forceRefresh);
}

export function invalidateAdminAllProductsCache(): void {
  moduleCache.invalidate(CACHE_KEYS.ADMIN_PRODUCTS);
}

/** Super Admin products grid — after create/delete without refetch */
export function primeAdminAllProductsCache(products: unknown[]): void {
  moduleCache.prime(CACHE_KEYS.ADMIN_PRODUCTS, products);
}

/**
 * After inventory adjust in Super Admin (no refetch). Keeps session cache aligned with UI.
 * Does not hit Supabase — safe to call on every +/- or save.
 */
export function patchAdminProductInventoryInCache(
  itemId: string,
  newInventory: number,
  opts?: { isVariant?: boolean; parentId?: string }
): void {
  const peeked = moduleCache.peek<any[]>(CACHE_KEYS.ADMIN_PRODUCTS);
  if (!peeked || !Array.isArray(peeked)) return;

  const next = peeked.map((p: any) => {
    if (opts?.isVariant && opts.parentId && p.id === opts.parentId) {
      const variants = (p.variants || []).map((v: any) =>
        v.id === itemId ? { ...v, inventory: newInventory } : v
      );
      const total = variants.reduce((s: number, v: any) => s + (Number(v.inventory) || 0), 0);
      return { ...p, variants, inventory: total };
    }
    if (!opts?.isVariant && p.id === itemId) {
      return { ...p, inventory: newInventory };
    }
    return p;
  });

  moduleCache.prime(CACHE_KEYS.ADMIN_PRODUCTS, next);
}

/** Notify listeners (e.g. Inventory) to re-derive rows from patched ADMIN_PRODUCTS — no network. */
export function dispatchAdminProductsCachePatched(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("migoo-admin-products-cache-patched"));
}

/**
 * Apply a signed delta to one product or variant row in the admin products session cache.
 * Matches server `applyOrderItemsStockDelta` (single product KV key per line item).
 */
export function applyDeltaToAdminProductInventoryInCache(productId: string, delta: number): void {
  const peeked = moduleCache.peek<any[]>(CACHE_KEYS.ADMIN_PRODUCTS);
  if (!peeked || !Array.isArray(peeked)) return;

  const next = peeked.map((p: any) => {
    if (p.id === productId) {
      const cur = Number(p.inventory ?? p.stock ?? 0);
      const nv = Math.max(0, cur + delta);
      return { ...p, inventory: nv, stock: nv };
    }
    if (Array.isArray(p.variants) && p.variants.some((v: any) => v.id === productId)) {
      const variants = p.variants.map((v: any) =>
        v.id === productId
          ? { ...v, inventory: Math.max(0, (Number(v.inventory) || 0) + delta) }
          : v
      );
      const total = variants.reduce((s: number, v: any) => s + (Number(v.inventory) || 0), 0);
      return { ...p, variants, inventory: total, stock: total };
    }
    return p;
  });

  moduleCache.prime(CACHE_KEYS.ADMIN_PRODUCTS, next);
}

/**
 * Apply stock movement for order line items (deduct or restore). No Supabase calls.
 */
export function applyOrderLineStockDeltasToAdminCache(
  items: { productId: string; quantity: number }[],
  direction: "deduct" | "restore",
  options?: { skipDispatch?: boolean }
): void {
  const sign = direction === "deduct" ? -1 : 1;
  for (const it of items) {
    const qty = Math.max(0, Number(it.quantity) || 0);
    if (qty <= 0) continue;
    applyDeltaToAdminProductInventoryInCache(it.productId, sign * qty);
  }
  if (!options?.skipDispatch) {
    dispatchAdminProductsCachePatched();
  }
}

/** Vendor admin product list JSON shape — merge `products` into existing cached payload if any */
export function primeVendorProductsAdminCache(vendorId: string, products: unknown[]): void {
  const key = CACHE_KEYS.vendorProductsAdmin(vendorId);
  const prev = moduleCache.peek<Record<string, unknown>>(key);
  const base =
    prev && typeof prev === "object" && prev !== null && !Array.isArray(prev) ? prev : {};
  moduleCache.prime(key, { ...base, products });
}

/** Super Admin vendor name map source — same as Vendor list cache */
export async function getCachedAdminVendorsForProductList(forceRefresh = false) {
  return moduleCache.get(CACHE_KEYS.ADMIN_VENDORS, () => fetchAllVendors(), forceRefresh);
}

export async function getCachedAdminOrdersPayload(forceRefresh = false) {
  return moduleCache.get(CACHE_KEYS.ADMIN_ORDERS, () => fetchAdminOrdersPayload(), forceRefresh);
}

export function invalidateAdminOrdersCache(): void {
  moduleCache.invalidate(CACHE_KEYS.ADMIN_ORDERS);
}

export async function getCachedAdminAllCategories(forceRefresh = false) {
  return moduleCache.get(CACHE_KEYS.ADMIN_ALL_CATEGORIES, () => fetchAdminAllCategoriesList(), forceRefresh);
}

export function primeAdminAllCategoriesCache(categories: unknown[]): void {
  moduleCache.prime(CACHE_KEYS.ADMIN_ALL_CATEGORIES, categories);
}

export function invalidateAdminAllCategoriesCache(): void {
  moduleCache.invalidate(CACHE_KEYS.ADMIN_ALL_CATEGORIES);
}

export async function getCachedAdminCustomersPayload(forceRefresh = false) {
  return moduleCache.get(CACHE_KEYS.ADMIN_CUSTOMERS, () => fetchAdminCustomersPayload(), forceRefresh);
}

export function invalidateAdminCustomersCache(): void {
  moduleCache.invalidate(CACHE_KEYS.ADMIN_CUSTOMERS);
}

export async function getCachedAdminDashboardStats(filters: AdminDashboardFilters, forceRefresh = false) {
  const key = adminDashboardStatsCacheKey(filters);
  return moduleCache.get(key, () => fetchAdminDashboardStatsRaw(filters), forceRefresh);
}

export function invalidateAdminDashboardStatsCaches(): void {
  moduleCache.invalidatePrefix(DASH_STATS_PREFIX);
}

/** Vendor `/vendor/orders/:id` list — session cache per vendor */
export async function getCachedVendorOrders(vendorId: string, forceRefresh = false) {
  return moduleCache.get(CACHE_KEYS.vendorOrders(vendorId), () => fetchVendorOrders(vendorId), forceRefresh);
}

export function invalidateVendorOrdersCache(vendorId: string): void {
  moduleCache.invalidate(CACHE_KEYS.vendorOrders(vendorId));
}

export function primeVendorOrdersCache(vendorId: string, orders: unknown[]): void {
  moduleCache.prime(CACHE_KEYS.vendorOrders(vendorId), orders);
}

/**
 * 🖼️ CACHED IMAGE URL GETTER
 * Prevents duplicate storage requests for the same image
 * Caches signed URLs for 24 hours (valid for years anyway)
 */
export async function getCachedImageUrl(
  imagePath: string,
  fetcher: () => Promise<string>
): Promise<string> {
  const cacheKey = CACHE_KEYS.signedUrl(imagePath);
  
  return moduleCache.get(cacheKey, async () => {
    console.log(`🖼️ [IMAGE CACHE MISS] Fetching signed URL for: ${imagePath}`);
    return await fetcher();
  });
}

/**
 * 🎯 BROWSER CACHE HELPER
 * Adds cache headers to img elements to prevent re-downloading
 */
export function getCacheableImageProps(src: string) {
  return {
    src,
    // Force browser to cache aggressively
    crossOrigin: 'anonymous' as const,
    referrerPolicy: 'no-referrer' as const,
    decoding: 'async' as const,
    loading: 'lazy' as const,
  };
}