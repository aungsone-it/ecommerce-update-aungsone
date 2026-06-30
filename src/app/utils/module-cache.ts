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

import { format } from 'date-fns';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { SmartCache } from '../../utils/cache';
import { devLog } from './devLog';
import { vendorApplicationsApi } from '../../utils/api';
import { withNetworkRetry } from './networkRetry';
import { notifyAdminOrdersUpdated, isSuperAdminFinancesSessionStale } from "./adminOrdersRealtime";
import {
  isVendorUncategorizedFilter,
  VENDOR_STORE_UNCATEGORIZED_SLUG,
} from "./vendorStoreCategory";
import { normalizeVendorStorefrontProducts } from "./vendorStorefrontProductStats";
import {
  readPersistedJson,
  writePersistedJson,
  PERSISTED_CATALOG_TTL_MS,
  PERSISTED_ADMIN_PRODUCTS_PAGE_TTL_MS,
  lsAdminProductsPage1Key,
  lsAdminCustomersPage1Key,
  LS_ADMIN_FINANCES_ANALYTICS,
  LS_ADMIN_AUTH_USERS,
  removePersistedKeysPrefix,
  removePersistedKey,
} from './persistedLocalCache';
import {
  getCanonicalSubdomainLabelIfSlugForm,
  hyphenSlugFromDisplayName,
  parseSubdomainSlugMap,
} from './subdomainSlugMap';

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
    // Coalesce in-flight fetches — but never for forceRefresh: that must see post-mutation server data
    // (e.g. inventory after order status PUT). Waiting on an older in-flight request returns stale rows.
    const existingLoad = this.loading.get(key);
    if (existingLoad) {
      if (!forceRefresh) {
        devLog(`⏳ [MODULE CACHE] Already loading ${key}, waiting...`);
        this.hits++; // Count as hit since we're reusing the request
        return existingLoad;
      }
      // Force refresh: await in-flight load first so we don't clobber loading map / race; then fetch fresh.
      await existingLoad.catch(() => {});
    }

    // Check cache
    const cached = this.cache.get(key);
    if (cached && !forceRefresh) {
      this.hits++;
      devLog(`✅ [MODULE CACHE HIT] ${key} (cached at ${new Date(cached.timestamp).toLocaleTimeString()})`);
      return cached.data;
    }

    // Cache miss or force refresh
    this.misses++;
    devLog(`${forceRefresh ? '🔄' : '❌'} [MODULE CACHE ${forceRefresh ? 'REFRESH' : 'MISS'}] ${key} - Fetching...`);

    // Create loading promise — one retry on transient network failure (e.g. flaky Wi‑Fi)
    const loadingPromise = withNetworkRetry(() => fetcher(), { retries: 1, delayMs: 500 })
      .then((data) => {
        // Store in cache
        this.cache.set(key, {
          data,
          timestamp: Date.now(),
        });
        devLog(`💾 [MODULE CACHE] Saved ${key}`);
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
    devLog(`🗑️ [MODULE CACHE] Invalidated ${key}`);
    this.cache.delete(key);
    this.loading.delete(key);
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
    devLog('🗑️ [MODULE CACHE] Cleared all cache');
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

  /**
   * Copy inventory/stock/variants from the full admin products list into each cached paginated page.
   * Keeps Product + Inventory grids aligned after in-memory stock patches without nuking page caches.
   */
  mergePaginatedAdminProductsFromFull(fullListKey: string, pageKeyPrefix: string): void {
    const full = this.peek<any[]>(fullListKey);
    if (!full || !Array.isArray(full)) return;
    const byId = new Map<string, any>();
    for (const p of full) {
      if (p && p.id != null) byId.set(String(p.id), p);
    }
    for (const key of [...this.cache.keys()]) {
      if (!key.startsWith(pageKeyPrefix)) continue;
      const entry = this.cache.get(key);
      const raw = entry?.data as { products?: any[]; [k: string]: unknown } | undefined;
      if (!raw || !Array.isArray(raw.products)) continue;
      const products = raw.products.map((row: any) => {
        const src = byId.get(String(row.id));
        if (!src) return row;
        return {
          ...row,
          inventory: src.inventory,
          stock: src.stock ?? src.inventory ?? row.stock,
          hasVariants: src.hasVariants ?? row.hasVariants,
          variants: Array.isArray(src.variants) ? src.variants : row.variants,
        };
      });
      this.cache.set(key, {
        data: { ...raw, products },
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Drop deleted rows from each cached admin paginated page and adjust totals/counts in place.
   * `deletedSnapshots` supplies status metadata when the row is no longer on this page slice.
   */
  removeProductsFromPaginatedAdminCaches(
    pageKeyPrefix: string,
    productIds: Set<string>,
    deletedSnapshots: any[] = []
  ): void {
    if (productIds.size === 0) return;
    const snapshotById = new Map<string, any>();
    for (const row of deletedSnapshots) {
      if (row?.id != null) snapshotById.set(String(row.id), row);
    }
    const deleteCount = productIds.size;

    for (const key of [...this.cache.keys()]) {
      if (!key.startsWith(pageKeyPrefix)) continue;
      const entry = this.cache.get(key);
      const raw = entry?.data as {
        products?: any[];
        total?: number;
        counts?: { all: number; active: number; offShelf: number };
        page?: number;
        pageSize?: number;
        hasMore?: boolean;
        [k: string]: unknown;
      } | undefined;
      if (!raw || !Array.isArray(raw.products)) continue;

      const removedRows = raw.products.filter((row) => productIds.has(String(row?.id)));
      const products = raw.products.filter((row) => !productIds.has(String(row?.id)));

      let counts = raw.counts;
      if (counts) {
        for (const id of productIds) {
          const row =
            snapshotById.get(id) ||
            removedRows.find((r) => String(r?.id) === id) ||
            raw.products.find((r) => String(r?.id) === id);
          if (!row) continue;
          const status = String(row?.status ?? "active").trim().toLowerCase().replace(/\s+/g, "-");
          const isActive = status === "active" || status === "published";
          const isOffShelf = status === "off-shelf" || status === "offshelf";
          counts = {
            all: Math.max(0, counts.all - 1),
            active: Math.max(0, counts.active - (isActive ? 1 : 0)),
            offShelf: Math.max(0, counts.offShelf - (isOffShelf ? 1 : 0)),
          };
        }
      }

      const total = Math.max(0, Number(raw.total ?? 0) - deleteCount);
      const page = Math.max(1, Number(raw.page ?? 1));
      const pageSize = Math.max(1, Number(raw.pageSize ?? ADMIN_PRODUCTS_INITIAL_PAGE_SIZE));
      this.cache.set(key, {
        data: {
          ...raw,
          products,
          total,
          counts,
          hasMore: page * pageSize < total,
        },
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Prepend a new product to page-1 admin paginated caches; bump totals/counts on other pages.
   */
  insertProductIntoPaginatedAdminCaches(pageKeyPrefix: string, product: any): void {
    const id = String(product?.id ?? "").trim();
    if (!id) return;
    const status = String(product?.status ?? "active").trim().toLowerCase().replace(/\s+/g, "-");
    const isActive = status === "active" || status === "published";
    const isOffShelf = status === "off-shelf" || status === "offshelf";

    for (const key of [...this.cache.keys()]) {
      if (!key.startsWith(pageKeyPrefix)) continue;
      const entry = this.cache.get(key);
      const raw = entry?.data as {
        products?: any[];
        total?: number;
        counts?: { all: number; active: number; offShelf: number };
        page?: number;
        pageSize?: number;
        hasMore?: boolean;
        [k: string]: unknown;
      } | undefined;
      if (!raw || !Array.isArray(raw.products)) continue;

      const page = Math.max(1, Number(raw.page ?? 1));
      const pageSize = Math.max(1, Number(raw.pageSize ?? ADMIN_PRODUCTS_INITIAL_PAGE_SIZE));
      const total = Number(raw.total ?? 0) + 1;
      let counts = raw.counts
        ? {
            all: raw.counts.all + 1,
            active: raw.counts.active + (isActive ? 1 : 0),
            offShelf: raw.counts.offShelf + (isOffShelf ? 1 : 0),
          }
        : undefined;

      let products = raw.products;
      if (page === 1) {
        if (products.some((row) => String(row?.id) === id)) continue;
        products = [product, ...products].slice(0, pageSize);
      }

      this.cache.set(key, {
        data: {
          ...raw,
          products,
          total,
          counts,
          hasMore: page * pageSize < total,
        },
        timestamp: Date.now(),
      });
    }
  }

  /** Drop deleted rows from each cached admin customers page and adjust totals/stats in place. */
  removeCustomersFromPaginatedAdminCaches(
    pageKeyPrefix: string,
    customerIds: Set<string>,
    deletedSnapshots: any[] = []
  ): void {
    if (customerIds.size === 0) return;
    const snapshotById = new Map<string, any>();
    for (const row of deletedSnapshots) {
      if (row?.id != null) snapshotById.set(String(row.id), row);
    }
    const deleteCount = customerIds.size;

    for (const key of [...this.cache.keys()]) {
      if (!key.startsWith(pageKeyPrefix)) continue;
      const entry = this.cache.get(key);
      const raw = entry?.data as {
        customers?: any[];
        total?: number;
        stats?: {
          total?: number;
          active?: number;
          vip?: number;
          newThisMonth?: number;
          totalRevenue?: number;
          avgLTV?: number;
          champions?: number;
          atRisk?: number;
        };
        page?: number;
        pageSize?: number;
        hasMore?: boolean;
        [k: string]: unknown;
      } | undefined;
      if (!raw || !Array.isArray(raw.customers)) continue;

      const removedRows = raw.customers.filter((row) => customerIds.has(String(row?.id)));
      const customers = raw.customers.filter((row) => !customerIds.has(String(row?.id)));

      let stats = raw.stats;
      if (stats) {
        let activeDrop = 0;
        let vipDrop = 0;
        let revenueDrop = 0;
        for (const id of customerIds) {
          const row =
            snapshotById.get(id) ||
            removedRows.find((r) => String(r?.id) === id) ||
            raw.customers.find((r) => String(r?.id) === id);
          if (!row) continue;
          if (String(row.status ?? "").toLowerCase() === "active") activeDrop += 1;
          if (String(row.tier ?? "").toLowerCase() === "vip") vipDrop += 1;
          revenueDrop += Number(row.totalSpent ?? 0);
        }
        stats = {
          ...stats,
          total: Math.max(0, Number(stats.total ?? 0) - deleteCount),
          active: Math.max(0, Number(stats.active ?? 0) - activeDrop),
          vip: Math.max(0, Number(stats.vip ?? 0) - vipDrop),
          totalRevenue: Math.max(0, Number(stats.totalRevenue ?? 0) - revenueDrop),
        };
      }

      const total = Math.max(0, Number(raw.total ?? 0) - deleteCount);
      const page = Math.max(1, Number(raw.page ?? 1));
      const pageSize = Math.max(1, Number(raw.pageSize ?? ADMIN_CUSTOMERS_PAGE_DEFAULT));
      this.cache.set(key, {
        data: {
          ...raw,
          customers,
          total,
          stats,
          hasMore: page * pageSize < total,
        },
        timestamp: Date.now(),
      });
    }
  }

  /** Drop deleted rows from cached vendor storefront catalog pages (`vendor-products-{id}-*`). */
  removeProductsFromVendorCatalogPaginatedCaches(
    catalogKeys: string[],
    productIds: Set<string>,
    deleteCount: number
  ): void {
    if (productIds.size === 0 || catalogKeys.length === 0) return;
    const prefixes = catalogKeys
      .map((k) => String(k).trim())
      .filter(Boolean)
      .map((k) => `vendor-products-${k}-`);

    for (const key of [...this.cache.keys()]) {
      if (!prefixes.some((prefix) => key.startsWith(prefix))) continue;
      this.patchVendorCatalogCacheEntry(key, productIds, deleteCount);
    }
  }

  /** Drop deleted product ids from every cached vendor storefront catalog page. */
  removeProductIdsFromAllVendorCatalogCaches(productIds: Set<string>): void {
    if (productIds.size === 0) return;
    const deleteCount = productIds.size;
    for (const key of [...this.cache.keys()]) {
      if (!key.startsWith("vendor-products-")) continue;
      this.patchVendorCatalogCacheEntry(key, productIds, deleteCount);
    }
  }

  private patchVendorCatalogCacheEntry(
    key: string,
    productIds: Set<string>,
    deleteCount: number
  ): void {
    const entry = this.cache.get(key);
    const raw = entry?.data as {
      products?: any[];
      total?: number;
      page?: number;
      pageSize?: number;
      hasMore?: boolean;
      [k: string]: unknown;
    } | undefined;
    if (!raw || !Array.isArray(raw.products)) return;

    const removedOnPage = raw.products.filter((row) => productIds.has(String(row?.id))).length;
    if (removedOnPage === 0 && deleteCount === 0) return;

    const products = raw.products.filter((row) => !productIds.has(String(row?.id)));
    const total = Math.max(0, Number(raw.total ?? 0) - deleteCount);
    const page = Math.max(1, Number(raw.page ?? 1));
    const pageSize = Math.max(1, Number(raw.pageSize ?? 24));
    this.cache.set(key, {
      data: {
        ...raw,
        products,
        total,
        hasMore: page * pageSize < total,
      },
      timestamp: Date.now(),
    });
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

/** Super Admin lists (products, inventory): ~15–20 rows per request. */
export const ADMIN_PRODUCTS_INITIAL_PAGE_SIZE = 20;
export const ADMIN_ORDERS_PAGE_DEFAULT = 20;
export const ADMIN_CUSTOMERS_PAGE_DEFAULT = 20;

export const ADMIN_PRODUCTS_PAGE_CACHE_PREFIX = "admin-products-page-";

export type AdminProductsPageParams = {
  page: number;
  pageSize?: number;
  q?: string;
  status?: string;
  tab?: string;
  vendor?: string;
  collaborator?: string;
  sort?: string;
  /** Server filters out products already assigned to this vendor (assign-product picker). */
  excludeVendorId?: string;
};

export type AdminProductsPagePayload = {
  adminList?: boolean;
  products: unknown[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  counts?: { all: number; active: number; offShelf: number };
};

function normAdminQ(q: string): string {
  return String(q || "").trim().slice(0, 200);
}

function normAdminExcludeVendorId(id: string | undefined): string {
  return String(id || "").trim().slice(0, 200);
}

export function adminProductsPageCacheKey(p: AdminProductsPageParams): string {
  const pageSize = Math.min(100, Math.max(1, p.pageSize ?? ADMIN_PRODUCTS_INITIAL_PAGE_SIZE));
  const qn = normAdminQ(p.q || "");
  const ev = normAdminExcludeVendorId(p.excludeVendorId);
  return `${ADMIN_PRODUCTS_PAGE_CACHE_PREFIX}p${p.page}-ps${pageSize}-t-${p.tab || "all"}-st-${p.status || "all"}-s-${p.sort || "newest"}-v-${encodeURIComponent(p.vendor || "all")}-c-${encodeURIComponent(p.collaborator || "all")}-q-${encodeURIComponent(qn)}-ev-${encodeURIComponent(ev || "_")}`;
}

function normalizeAdminProductStatusForCache(status: unknown): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function adminProductCacheSearchBlob(product: any): string {
  const parts = [
    product?.name,
    product?.title,
    product?.sku,
    product?.id,
    product?.category,
  ];
  if (Array.isArray(product?.variants)) {
    for (const variant of product.variants) {
      parts.push(variant?.sku, variant?.id, variant?.name);
    }
  }
  return parts.map((x) => String(x ?? "").toLowerCase()).join(" ");
}

function adminProductCacheTimestamp(product: any): number {
  for (const value of [product?.createdAt, product?.createDate, product?.updatedAt]) {
    const ms = Date.parse(String(value ?? ""));
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

function adminProductMatchesDerivedPage(product: any, params: AdminProductsPageParams): boolean {
  const q = normAdminQ(params.q || "").toLowerCase();
  if (q && !adminProductCacheSearchBlob(product).includes(q)) return false;

  const status = normalizeAdminProductStatusForCache(product?.status);
  const filterStatus = normalizeAdminProductStatusForCache(params.status || "all");
  if (filterStatus === "active" && status !== "active" && status !== "published") return false;
  if (filterStatus === "off-shelf" && status !== "off-shelf" && status !== "offshelf") return false;

  return true;
}

function countDerivedAdminProductsByStatus(rows: any[]): { all: number; active: number; offShelf: number } {
  let active = 0;
  let offShelf = 0;
  for (const product of rows) {
    const status = normalizeAdminProductStatusForCache(product?.status);
    if (status === "active" || status === "published") active++;
    if (status === "off-shelf" || status === "offshelf") offShelf++;
  }
  return { all: rows.length, active, offShelf };
}

export function primeAdminProductsPageFromFullCache(
  params: AdminProductsPageParams
): AdminProductsPagePayload | null {
  if ((params.vendor || "all") !== "all") return null;
  if ((params.collaborator || "all") !== "all") return null;
  if (normAdminExcludeVendorId(params.excludeVendorId)) return null;
  if ((params.tab || "all") !== "all") return null;

  const full = moduleCache.peek<any[]>(CACHE_KEYS.ADMIN_PRODUCTS);
  if (!Array.isArray(full) || full.length === 0) return null;

  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? ADMIN_PRODUCTS_INITIAL_PAGE_SIZE));
  const page = Math.max(1, params.page);
  const sort = params.tab === "sales" ? "popular" : params.sort && params.sort !== "" ? params.sort : "newest";
  const effectiveParams = { ...params, page, pageSize, sort };
  const filtered = full
    .filter((product) => adminProductMatchesDerivedPage(product, effectiveParams))
    .sort((a, b) => {
      if (sort === "oldest") return adminProductCacheTimestamp(a) - adminProductCacheTimestamp(b);
      return adminProductCacheTimestamp(b) - adminProductCacheTimestamp(a);
    });
  const start = (page - 1) * pageSize;
  const payload: AdminProductsPagePayload = {
    adminList: true,
    products: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    hasMore: start + pageSize < filtered.length,
    counts: countDerivedAdminProductsByStatus(filtered),
  };
  moduleCache.prime(adminProductsPageCacheKey(effectiveParams), payload);
  return payload;
}

export async function fetchAdminProductsPage(
  params: AdminProductsPageParams,
  opts?: { bustCache?: boolean }
): Promise<AdminProductsPagePayload> {
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? ADMIN_PRODUCTS_INITIAL_PAGE_SIZE));
  const sp = new URLSearchParams();
  sp.set("adminList", "1");
  if (opts?.bustCache) sp.set("_", String(Date.now()));
  sp.set("page", String(Math.max(1, params.page)));
  sp.set("pageSize", String(pageSize));
  const q = normAdminQ(params.q || "");
  if (q) sp.set("q", q);
  if (params.status && params.status !== "all") sp.set("status", params.status);
  if (params.tab && params.tab !== "all") sp.set("tab", params.tab);
  if (params.vendor && params.vendor !== "all") sp.set("vendor", params.vendor);
  if (params.collaborator && params.collaborator !== "all") sp.set("collaborator", params.collaborator);
  if (params.sort) sp.set("sort", params.sort);
  const ev = normAdminExcludeVendorId(params.excludeVendorId);
  if (ev) sp.set("excludeVendorId", ev);
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/products?${sp.toString()}`,
    { headers: { Authorization: `Bearer ${publicAnonKey}` } }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch admin products page: ${response.status}`);
  }
  const data = await response.json();
  return {
    adminList: !!data.adminList,
    products: Array.isArray(data.products) ? data.products : [],
    total: Number(data.total ?? 0),
    page: Number(data.page ?? params.page),
    pageSize: Number(data.pageSize ?? pageSize),
    hasMore: !!data.hasMore,
    counts:
      data.counts && typeof data.counts === "object"
        ? {
            all: Number(data.counts.all ?? 0),
            active: Number(data.counts.active ?? 0),
            offShelf: Number(data.counts.offShelf ?? 0),
          }
        : undefined,
  };
}

/**
 * Cached admin product page + localStorage for page 1 (per filter key).
 */
export async function getCachedAdminProductsPage(
  params: AdminProductsPageParams,
  forceRefresh = false
): Promise<AdminProductsPagePayload> {
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? ADMIN_PRODUCTS_INITIAL_PAGE_SIZE));
  const page = Math.max(1, params.page);
  const qNorm = normAdminQ(params.q || "");
  const tab = params.tab || "all";
  const status = params.status || "all";
  const sort =
    tab === "sales" ? "popular" : params.sort && params.sort !== "" ? params.sort : "newest";
  const vendor = params.vendor || "all";
  const collaborator = params.collaborator || "all";
  const excludeVendorIdNorm = normAdminExcludeVendorId(params.excludeVendorId);

  const key = adminProductsPageCacheKey({
    ...params,
    page,
    pageSize,
    q: qNorm,
    tab,
    status,
    sort,
    vendor,
    collaborator,
    excludeVendorId: excludeVendorIdNorm || undefined,
  });

  if (!forceRefresh) {
    const fromSession = moduleCache.peek<AdminProductsPagePayload>(key);
    if (fromSession && Array.isArray(fromSession.products)) {
      return fromSession;
    }
    const fromFull = primeAdminProductsPageFromFullCache({
      ...params,
      page,
      pageSize,
      q: qNorm,
      tab,
      status,
      sort,
      vendor,
      collaborator,
      excludeVendorId: excludeVendorIdNorm || undefined,
    });
    if (fromFull) return fromFull;
  }

  if (!forceRefresh && page === 1) {
    const fromLs = readPersistedJson<AdminProductsPagePayload>(
      lsAdminProductsPage1Key({
        pageSize,
        tab,
        status,
        sort,
        vendor,
        collaborator,
        qNorm,
        excludeVendorIdNorm,
      }),
      PERSISTED_ADMIN_PRODUCTS_PAGE_TTL_MS
    );
    if (fromLs && Array.isArray(fromLs.products)) {
      moduleCache.prime(key, fromLs);
      return fromLs;
    }
  }

  const data = await moduleCache.get(
    key,
    () =>
      fetchAdminProductsPage(
        {
          ...params,
          page,
          pageSize,
          q: qNorm,
          tab,
          status,
          sort,
          vendor,
          collaborator,
          excludeVendorId: excludeVendorIdNorm || undefined,
        },
        { bustCache: forceRefresh }
      ),
    forceRefresh
  );

  if (page === 1 && data && Array.isArray(data.products)) {
    writePersistedJson(
      lsAdminProductsPage1Key({
        pageSize,
        tab,
        status,
        sort,
        vendor,
        collaborator,
        qNorm,
        excludeVendorIdNorm,
      }),
      data
    );
  }

  return data;
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

/** Stable short id for moduleCache / localStorage keys when the wishlist revision changes. */
export function wishlistSigFromProductIds(ids: string[]): string {
  if (ids.length === 0) return "0";
  let h = 2166136261;
  for (const id of ids) {
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0x9e3779b9;
  }
  return `${ids.length}-u${(h >>> 0).toString(36)}`;
}

export type VendorWishlistVendorPageResult = {
  products: any[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

/** Server-paginated wishlist rows filtered to one vendor storefront (POST wishlist-vendor-page). */
export async function fetchVendorWishlistVendorPage(params: {
  vendorStorefront: string;
  resolvedVendorId?: string | null;
  productIds: string[];
  page: number;
  pageSize?: number;
}): Promise<VendorWishlistVendorPageResult> {
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 24));
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/products/wishlist-vendor-page`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vendorStorefront: params.vendorStorefront,
        resolvedVendorId: params.resolvedVendorId ?? undefined,
        productIds: params.productIds,
        page: params.page,
        pageSize,
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch vendor wishlist page: ${response.status}`);
  }
  const data = await response.json();
  return {
    products: data.products || [],
    total: Number(data.total ?? 0),
    page: Number(data.page ?? params.page),
    pageSize: Number(data.pageSize ?? pageSize),
    hasMore: !!data.hasMore,
  };
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

/** Full vendor applications list (admin) — mirrors `vendorApplicationsApi.getAll().data`. */
export async function fetchAdminVendorApplicationsRaw(): Promise<Record<string, unknown>[]> {
  const res = await vendorApplicationsApi.getAll();
  if (res.success && Array.isArray(res.data)) {
    return res.data as Record<string, unknown>[];
  }
  return [];
}

export async function getCachedAdminVendorApplications(
  forceRefresh = false
): Promise<Record<string, unknown>[]> {
  return moduleCache.get(
    CACHE_KEYS.ADMIN_VENDOR_APPLICATIONS,
    fetchAdminVendorApplicationsRaw,
    forceRefresh
  );
}

export function invalidateAdminVendorApplicationsCache(): void {
  moduleCache.invalidate(CACHE_KEYS.ADMIN_VENDOR_APPLICATIONS);
}

/**
 * Vendor application lifecycle signal (submit/approve/reject) so admin SPA refreshes instantly
 * without waiting for polling intervals or full page reload.
 */
export const ADMIN_VENDOR_APPLICATIONS_UPDATED_EVENT = "adminVendorApplicationsUpdated";
export const ADMIN_VENDOR_APPLICATIONS_UPDATED_STORAGE_KEY =
  "migoo-admin-vendor-applications-updated-v1";

export function notifyAdminVendorApplicationsUpdated(reason?: string): void {
  if (typeof window === "undefined") return;
  const payload = { at: Date.now(), reason: reason || "mutation" };
  try {
    window.dispatchEvent(
      new CustomEvent(ADMIN_VENDOR_APPLICATIONS_UPDATED_EVENT, { detail: payload })
    );
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(ADMIN_VENDOR_APPLICATIONS_UPDATED_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  try {
    const bc = new BroadcastChannel(ADMIN_VENDOR_APPLICATIONS_UPDATED_EVENT);
    bc.postMessage(payload);
    bc.close();
  } catch {
    /* ignore */
  }
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

export const ADMIN_ORDERS_PAGE_CACHE_PREFIX = "admin-orders-page-";

export type AdminOrdersPageParams = {
  page: number;
  pageSize?: number;
  q?: string;
  status?: string;
  payment?: string;
  vendor?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: "newest" | "oldest";
};

export type AdminOrdersPagePayload = {
  orders: any[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  aggregates?: {
    filteredCount: number;
    filteredTotalRevenue: number;
    filteredAvgOrderValue: number;
    statusBreakdown: {
      pending: number;
      processing: number;
      fulfilled: number;
      cancelled: number;
    };
    uniqueVendors: string[];
    vendorRevenue?: { vendor: string; revenue: number }[];
  };
  warning?: string;
  cached?: boolean;
};

function normOrdersQ(q: string): string {
  return String(q || "").trim().slice(0, 200);
}

export function adminOrdersPageCacheKey(p: AdminOrdersPageParams): string {
  const pageSize = Math.min(100, Math.max(1, p.pageSize ?? ADMIN_ORDERS_PAGE_DEFAULT));
  const qn = normOrdersQ(p.q || "");
  return `${ADMIN_ORDERS_PAGE_CACHE_PREFIX}p${p.page}-ps${pageSize}-st-${p.status || "all"}-pay-${p.payment || "all"}-v-${encodeURIComponent(p.vendor || "all")}-df-${encodeURIComponent(p.dateFrom || "")}-dt-${encodeURIComponent(p.dateTo || "")}-s-${p.sort || "newest"}-q-${encodeURIComponent(qn)}`;
}

export async function fetchAdminOrdersPage(params: AdminOrdersPageParams): Promise<AdminOrdersPagePayload> {
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? ADMIN_ORDERS_PAGE_DEFAULT));
  const sp = new URLSearchParams();
  sp.set("page", String(Math.max(1, params.page)));
  sp.set("pageSize", String(pageSize));
  const q = normOrdersQ(params.q || "");
  if (q) sp.set("q", q);
  if (params.status && params.status !== "all") sp.set("status", params.status);
  if (params.payment && params.payment !== "all") sp.set("payment", params.payment);
  if (params.vendor && params.vendor !== "all") sp.set("vendor", params.vendor);
  if (params.dateFrom) sp.set("dateFrom", params.dateFrom);
  if (params.dateTo) sp.set("dateTo", params.dateTo);
  if (params.sort) sp.set("sort", params.sort);
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/orders?${sp.toString()}`,
    { headers: { Authorization: `Bearer ${publicAnonKey}` } }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch orders page: ${response.status}`);
  }
  const data = await response.json();
  const agg = data.aggregates && typeof data.aggregates === "object" ? data.aggregates : undefined;
  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    total: Number(data.total ?? 0),
    page: Number(data.page ?? params.page),
    pageSize: Number(data.pageSize ?? pageSize),
    hasMore: !!data.hasMore,
    aggregates: agg
      ? {
          filteredCount: Number(agg.filteredCount ?? 0),
          filteredTotalRevenue: Number(agg.filteredTotalRevenue ?? 0),
          filteredAvgOrderValue: Number(agg.filteredAvgOrderValue ?? 0),
          statusBreakdown: {
            pending: Number(agg.statusBreakdown?.pending ?? 0),
            processing: Number(agg.statusBreakdown?.processing ?? 0),
            fulfilled: Number(agg.statusBreakdown?.fulfilled ?? 0),
            cancelled: Number(agg.statusBreakdown?.cancelled ?? 0),
          },
          uniqueVendors: Array.isArray(agg.uniqueVendors) ? agg.uniqueVendors : [],
          vendorRevenue: Array.isArray(agg.vendorRevenue)
            ? agg.vendorRevenue.map((x: any) => ({
                vendor: String(x.vendor ?? ""),
                revenue: Number(x.revenue ?? 0),
              }))
            : undefined,
        }
      : undefined,
    warning: data.warning,
    cached: data.cached,
  };
}

export async function getCachedAdminOrdersPage(
  params: AdminOrdersPageParams,
  forceRefresh = false
): Promise<AdminOrdersPagePayload> {
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? ADMIN_ORDERS_PAGE_DEFAULT));
  const page = Math.max(1, params.page);
  const qNorm = normOrdersQ(params.q || "");
  const status = params.status || "all";
  const payment = params.payment || "all";
  const vendor = params.vendor || "all";
  const dateFrom = params.dateFrom || "";
  const dateTo = params.dateTo || "";
  const sort = params.sort || "newest";
  const key = adminOrdersPageCacheKey({
    ...params,
    page,
    pageSize,
    q: qNorm,
    status,
    payment,
    vendor,
    dateFrom,
    dateTo,
    sort,
  });

  // Intentionally no localStorage read/write for admin orders page-1: order rows change often; persisted
  // snapshots caused stale status chips after a full browser reload.

  const data = await moduleCache.get(key, () =>
    fetchAdminOrdersPage({
      ...params,
      page,
      pageSize,
      q: qNorm,
      status,
      payment,
      vendor,
      dateFrom,
      dateTo,
      sort,
    }),
    forceRefresh
  );

  return data;
}

/** @deprecated Prefer fetchAdminOrdersPayload + cache; returns orders array only */
export async function fetchAllOrders() {
  const p = await fetchAdminOrdersPayload();
  return p.orders;
}

/** Products column: prefer productIds length (source of truth for admin picker). */
export function resolveCategoryProductCount(cat: {
  productCount?: number;
  productIds?: unknown;
}): number {
  if (Array.isArray(cat.productIds)) {
    return cat.productIds.filter((id) => id != null && String(id).trim() !== "").length;
  }
  const stored = Number(cat.productCount);
  return Number.isFinite(stored) && stored >= 0 ? stored : 0;
}

function normalizeCategoryNameKey(name: unknown): string {
  return String(name ?? "").trim().toLowerCase();
}

/** Merge category.productIds with products whose `category` field matches the category name. */
export function enrichAdminCategoriesWithProductCounts(
  categories: Record<string, unknown>[],
  products: Record<string, unknown>[]
): Record<string, unknown>[] {
  const idsByCategoryName = new Map<string, string[]>();
  for (const p of products) {
    if (!p || typeof p !== "object") continue;
    const nameKey = normalizeCategoryNameKey((p as { category?: string }).category);
    if (!nameKey) continue;
    const id = String((p as { id?: string }).id ?? "").trim();
    if (!id) continue;
    const list = idsByCategoryName.get(nameKey) || [];
    list.push(id);
    idsByCategoryName.set(nameKey, list);
  }

  return categories.map((cat) => {
    const nameKey = normalizeCategoryNameKey(cat.name);
    const fromPicker = Array.isArray(cat.productIds)
      ? (cat.productIds as unknown[]).map((id) => String(id).trim()).filter(Boolean)
      : [];
    const fromProductField = nameKey ? idsByCategoryName.get(nameKey) || [] : [];
    const merged = [...new Set([...fromPicker, ...fromProductField])];
    return {
      ...cat,
      productIds: merged,
      productCount: merged.length,
    };
  });
}

export async function fetchAdminAllCategoriesList(): Promise<any[]> {
  const [categoriesRes, products] = await Promise.all([
    fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/admin/all-categories`,
      {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      }
    ),
    fetchAllProducts().catch(() => [] as Record<string, unknown>[]),
  ]);

  if (!categoriesRes.ok) {
    throw new Error(`Failed to fetch admin categories: ${categoriesRes.status}`);
  }
  const data = await categoriesRes.json();
  const raw = ((data.categories || []) as Record<string, unknown>[]).filter((cat) => {
    if (!cat || typeof cat !== "object") return false;
    if ((cat as { vendorId?: unknown }).vendorId) return false;
    return !String((cat as { id?: unknown }).id || "").startsWith("category:");
  });
  const productRows = Array.isArray(products) ? products : [];
  const enriched = enrichAdminCategoriesWithProductCounts(raw, productRows);
  return enriched.map((cat) => ({
    ...cat,
    productCount: resolveCategoryProductCount(cat as { productCount?: number; productIds?: unknown }),
  }));
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

export const ADMIN_CUSTOMERS_PAGE_CACHE_PREFIX = "admin-customers-page-";

export type AdminCustomersPageParams = {
  page: number;
  pageSize?: number;
  q?: string;
  status?: string;
  tier?: string;
  segment?: string;
};

export type AdminCustomersPagePayload = {
  customers: any[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  stats?: {
    total: number;
    active: number;
    vip: number;
    newThisMonth: number;
    totalRevenue: number;
    avgLTV: number;
    champions: number;
    atRisk: number;
    segments?: {
      champions: number;
      loyal: number;
      potentialLoyalist: number;
      atRisk: number;
      cantLose: number;
      hibernating: number;
      needAttention: number;
      unknown: number;
    };
  };
};

function normCustQ(q: string): string {
  return String(q || "").trim().slice(0, 200);
}

export function adminCustomersPageCacheKey(p: AdminCustomersPageParams): string {
  const pageSize = Math.min(100, Math.max(1, p.pageSize ?? ADMIN_CUSTOMERS_PAGE_DEFAULT));
  const qn = normCustQ(p.q || "");
  return `${ADMIN_CUSTOMERS_PAGE_CACHE_PREFIX}p${p.page}-ps${pageSize}-st-${p.status || "all"}-t-${p.tier || "all"}-seg-${p.segment || "all"}-q-${encodeURIComponent(qn)}`;
}

export async function fetchAdminCustomersPage(params: AdminCustomersPageParams): Promise<AdminCustomersPagePayload> {
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? ADMIN_CUSTOMERS_PAGE_DEFAULT));
  const sp = new URLSearchParams();
  sp.set("page", String(Math.max(1, params.page)));
  sp.set("pageSize", String(pageSize));
  const q = normCustQ(params.q || "");
  if (q) sp.set("q", q);
  if (params.status && params.status !== "all") sp.set("status", params.status);
  if (params.tier && params.tier !== "all") sp.set("tier", params.tier);
  if (params.segment && params.segment !== "all") sp.set("segment", params.segment);
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/customers?${sp.toString()}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publicAnonKey}`,
      },
    }
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch customers");
  }
  const st = data.stats && typeof data.stats === "object" ? data.stats : undefined;
  return {
    customers: Array.isArray(data.customers) ? data.customers : [],
    total: Number(data.total ?? 0),
    page: Number(data.page ?? params.page),
    pageSize: Number(data.pageSize ?? pageSize),
    hasMore: !!data.hasMore,
    stats: st
      ? {
          total: Number(st.total ?? 0),
          active: Number(st.active ?? 0),
          vip: Number(st.vip ?? 0),
          newThisMonth: Number(st.newThisMonth ?? 0),
          totalRevenue: Number(st.totalRevenue ?? 0),
          avgLTV: Number(st.avgLTV ?? 0),
          champions: Number(st.champions ?? 0),
          atRisk: Number(st.atRisk ?? 0),
          segments:
            st.segments && typeof st.segments === "object"
              ? {
                  champions: Number(st.segments.champions ?? 0),
                  loyal: Number(st.segments.loyal ?? 0),
                  potentialLoyalist: Number(st.segments.potentialLoyalist ?? 0),
                  atRisk: Number(st.segments.atRisk ?? 0),
                  cantLose: Number(st.segments.cantLose ?? 0),
                  hibernating: Number(st.segments.hibernating ?? 0),
                  needAttention: Number(st.segments.needAttention ?? 0),
                  unknown: Number(st.segments.unknown ?? 0),
                }
              : undefined,
        }
      : undefined,
  };
}

export async function getCachedAdminCustomersPage(
  params: AdminCustomersPageParams,
  forceRefresh = false
): Promise<AdminCustomersPagePayload> {
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? ADMIN_CUSTOMERS_PAGE_DEFAULT));
  const page = Math.max(1, params.page);
  const qNorm = normCustQ(params.q || "");
  const status = params.status || "all";
  const tier = params.tier || "all";
  const segment = params.segment || "all";
  const key = adminCustomersPageCacheKey({
    ...params,
    page,
    pageSize,
    q: qNorm,
    status,
    tier,
    segment,
  });

  if (!forceRefresh && page === 1) {
    const fromLs = readPersistedJson<AdminCustomersPagePayload>(
      lsAdminCustomersPage1Key({ pageSize, qNorm, status, tier, segment }),
      PERSISTED_CATALOG_TTL_MS
    );
    if (fromLs && Array.isArray(fromLs.customers)) {
      moduleCache.prime(key, fromLs);
      return fromLs;
    }
  }

  const data = await moduleCache.get(
    key,
    () =>
      fetchAdminCustomersPage({
        ...params,
        page,
        pageSize,
        q: qNorm,
        status,
        tier,
        segment,
      }),
    forceRefresh
  );

  if (page === 1 && data && Array.isArray(data.customers)) {
    writePersistedJson(
      lsAdminCustomersPage1Key({ pageSize, qNorm, status, tier, segment }),
      data
    );
  }

  return data;
}

export type AdminDashboardFilters = {
  revenue: string;
  orders: string;
  customers: string;
  products: string;
  /** Sales trend, top products, recent orders — separate from per-card KPI filters. */
  globalSection: string;
};

/** Custom range from admin Home analytics date popovers — parsed by `dashboard/stats` edge handler. */
export function encodeAdminDashboardDateFilter(range: { from?: Date; to?: Date } | undefined): string {
  if (!range?.from || !range?.to) return 'All time';
  return `DashboardRange:${format(range.from, 'yyyy-MM-dd')}:${format(range.to, 'yyyy-MM-dd')}`;
}

const DASH_STATS_PREFIX = 'admin-dashboard-stats:';

export function adminDashboardStatsCacheKey(filters: AdminDashboardFilters): string {
  return `${DASH_STATS_PREFIX}${filters.revenue}|${filters.orders}|${filters.customers}|${filters.products}|${filters.globalSection}`;
}

export async function fetchAdminDashboardStatsRaw(filters: AdminDashboardFilters): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    revenueFilter: filters.revenue,
    ordersFilter: filters.orders,
    customersFilter: filters.customers,
    productsFilter: filters.products,
    globalFilter: filters.globalSection,
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

export type VendorStorefrontProductsResult = {
  products: any[];
  storeName: string;
  storeSlug?: string;
  logo: string;
  /** Public contact from vendor storefront settings (matches marketplace header). */
  storePhone?: string;
  /** Meta (Facebook) Pixel ID for this vendor's ads — from storefront settings. */
  metaPixelId?: string;
  /** KV vendor id after slug resolution — use for matching wishlist rows to this storefront. */
  resolvedVendorId?: string;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

function vendorIdentifierCandidates(vendorId: string): string[] {
  const raw = String(vendorId || "").trim();
  if (!raw) return [];
  const out = new Set<string>([raw]);
  const lower = raw.toLowerCase();
  const slugMap = parseSubdomainSlugMap();

  const canonicalLabel = getCanonicalSubdomainLabelIfSlugForm(raw);
  if (canonicalLabel) out.add(canonicalLabel);

  if (slugMap[lower]) out.add(String(slugMap[lower]).trim());
  for (const [label, slug] of Object.entries(slugMap)) {
    if (String(slug).toLowerCase() === lower) out.add(String(label).trim());
  }

  if (raw.includes("-")) out.add(raw.replace(/-/g, ""));

  const hyphen = hyphenSlugFromDisplayName(raw);
  if (hyphen) out.add(hyphen);

  return Array.from(out).filter(Boolean);
}

/** Public vendor storefront catalog — server-paginated (page / pageSize / q / category / resolveSlug). */
export async function fetchVendorProducts(
  vendorId: string,
  opts?: {
    page?: number;
    pageSize?: number;
    q?: string;
    category?: string;
    resolveSlug?: string;
  }
): Promise<VendorStorefrontProductsResult> {
  const sp = new URLSearchParams();
  sp.set("page", String(opts?.page ?? 1));
  sp.set("pageSize", String(Math.min(100, Math.max(1, opts?.pageSize ?? 24))));
  if (opts?.q && opts.q.trim()) sp.set("q", opts.q.trim());
  if (opts?.category && opts.category.toLowerCase() !== "all") {
    const cat = opts.category;
    sp.set(
      "category",
      isVendorUncategorizedFilter(cat) ? VENDOR_STORE_UNCATEGORIZED_SLUG : cat
    );
  }
  if (opts?.resolveSlug) sp.set("resolveSlug", opts.resolveSlug);
  const candidates = vendorIdentifierCandidates(vendorId);
  let response: Response | null = null;
  for (const candidate of candidates) {
    response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/products/${encodeURIComponent(candidate)}?${sp.toString()}`,
      {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      }
    );
    if (response.ok) break;
  }

  if (!response || !response.ok) {
    const status = response?.status ?? 0;
    throw new Error(`Failed to fetch vendor products: ${status}`);
  }

  const data = await response.json();
  const list = normalizeVendorStorefrontProducts(data.products || []);
  const page = Number(data.page ?? opts?.page ?? 1);
  const pageSize = Number(data.pageSize ?? opts?.pageSize ?? 24);
  const total = Number(data.total ?? list.length);
  return {
    products: list,
    storeName: data.storeName || "Vendor Store",
    storeSlug:
      typeof data.storeSlug === "string" && data.storeSlug.trim()
        ? data.storeSlug.trim()
        : undefined,
    logo: data.logo || "",
    storePhone:
      typeof data.storePhone === "string" && data.storePhone.trim()
        ? data.storePhone.trim()
        : undefined,
    metaPixelId:
      typeof data.metaPixelId === "string" && data.metaPixelId.trim()
        ? data.metaPixelId.trim()
        : undefined,
    resolvedVendorId:
      typeof data.resolvedVendorId === "string" && data.resolvedVendorId.trim()
        ? data.resolvedVendorId.trim()
        : undefined,
    total,
    page,
    pageSize,
    hasMore: !!data.hasMore,
  };
}

function vendorCreatedCategoryStorageKey(vendorId: string): string {
  return `migoo-vendor-created-categories:${String(vendorId || "").trim()}`;
}

const GLOBAL_VENDOR_CREATED_CATEGORY_STORAGE_KEY = "migoo-vendor-created-categories:global";

function readRememberedVendorCategoryRefs(vendorId?: string): Set<string> {
  const refs = new Set<string>();
  if (typeof window === "undefined") return refs;
  try {
    const keys = [GLOBAL_VENDOR_CREATED_CATEGORY_STORAGE_KEY];
    if (vendorId) keys.push(vendorCreatedCategoryStorageKey(vendorId));
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith("migoo-vendor-created-categories:")) keys.push(key);
    }
    for (const key of [...new Set(keys)]) {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        parsed.forEach((value) => {
          const ref = String(value || "").trim().toLowerCase();
          if (ref) refs.add(ref);
        });
      }
    }
  } catch {
    /* ignore invalid local category memory */
  }
  return refs;
}

export function rememberVendorCreatedCategory(vendorId: string, category: { id?: unknown; name?: unknown }): void {
  if (typeof window === "undefined" || !vendorId) return;
  try {
    const refs = readRememberedVendorCategoryRefs(vendorId);
    const id = String(category?.id || "").trim().toLowerCase();
    const name = String(category?.name || "").trim().toLowerCase();
    if (id) refs.add(`id:${id}`);
    if (name) refs.add(`name:${name}`);
    const serialized = JSON.stringify([...refs]);
    localStorage.setItem(vendorCreatedCategoryStorageKey(vendorId), serialized);
    localStorage.setItem(GLOBAL_VENDOR_CREATED_CATEGORY_STORAGE_KEY, serialized);
  } catch {
    /* ignore storage failures */
  }
}

export function isVendorCreatedCategory(category: any, vendorId?: string): boolean {
  if (!category) return false;
  if (category.source === "vendor" || category.createdByVendor === true) return true;
  const refs = readRememberedVendorCategoryRefs(vendorId);
  const id = String(category?.id || "").trim().toLowerCase();
  const name = String(category?.name || "").trim().toLowerCase();
  return (id && refs.has(`id:${id}`)) || (name && refs.has(`name:${name}`));
}

export function filterVendorCreatedCategories(categories: any[], vendorId?: string): any[] {
  return Array.isArray(categories)
    ? categories.filter((category) => isVendorCreatedCategory(category, vendorId))
    : [];
}

// Fetch vendor categories (vendor admin/storefront)
export async function fetchVendorCategories(vendorId: string) {
  const candidates = vendorIdentifierCandidates(vendorId);
  let response: Response | null = null;
  for (const candidate of candidates) {
    response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/categories-details/${encodeURIComponent(candidate)}`,
      {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      }
    );
    if (response.ok) break;
  }

  if (!response || !response.ok) {
    const status = response?.status ?? 0;
    throw new Error(`Failed to fetch vendor categories: ${status}`);
  }

  const data = await response.json();
  return filterVendorCreatedCategories(data.categories || [], vendorId).filter((c: any) => c.status === 'active');
}

// Fetch vendor orders (vendor admin)
export async function fetchVendorOrders(vendorId: string, bustHttpCache = false) {
  const url = new URL(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/orders/${encodeURIComponent(vendorId)}`
  );
  if (bustHttpCache) url.searchParams.set("_", String(Date.now()));
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${publicAnonKey}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch vendor orders: ${response.status}`);
  }

  const data = await response.json();
  return data.orders || [];
}

export interface VendorOrdersPageQuery {
  page: number;
  pageSize: number;
  q?: string;
  status?: string;
  payment?: string;
  sort?: "newest" | "oldest";
  from?: string;
  to?: string;
}

export interface VendorOrdersPagePayload {
  orders: any[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  summary?: {
    totalRevenue: number;
    pending: number;
    processing: number;
    fulfilled: number;
    cancelled: number;
  };
}

export async function fetchVendorOrdersPage(
  vendorId: string,
  query: VendorOrdersPageQuery,
  bustHttpCache = false
): Promise<VendorOrdersPagePayload> {
  const url = new URL(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/orders/${encodeURIComponent(vendorId)}`
  );
  url.searchParams.set("page", String(query.page));
  url.searchParams.set("pageSize", String(query.pageSize));
  if (query.q) url.searchParams.set("q", query.q);
  if (query.status) url.searchParams.set("status", query.status);
  if (query.payment) url.searchParams.set("payment", query.payment);
  if (query.sort) url.searchParams.set("sort", query.sort);
  if (query.from) url.searchParams.set("from", query.from);
  if (query.to) url.searchParams.set("to", query.to);
  if (bustHttpCache) url.searchParams.set("_", String(Date.now()));
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${publicAnonKey}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch vendor orders page: ${response.status}`);
  }
  const data = await response.json();
  return {
    orders: Array.isArray(data.orders) ? data.orders : [],
    total: Number(data.total ?? 0),
    page: Number(data.page ?? query.page),
    pageSize: Number(data.pageSize ?? query.pageSize),
    hasMore: !!data.hasMore,
    summary: data.summary,
  };
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
  /** Bump when vendor list semantics change (e.g. aggregated productsCount/totalRevenue from KV). */
  ADMIN_VENDORS: 'admin-vendors-v4',
  /** Vendor applications GET list — invalidate on approve/reject/new application. */
  ADMIN_VENDOR_APPLICATIONS: 'admin-vendor-applications-v1',
  ADMIN_PRODUCTS: 'admin-products',
  /** Full `/orders` JSON: `{ orders, warning? }` — bumped key when shape changed */
  ADMIN_ORDERS: 'admin-orders-v2-payload',
  /** Super Admin merged categories (admin/all-categories) */
  ADMIN_ALL_CATEGORIES: 'admin-all-categories-v1',
  /** Super Admin /customers list */
  ADMIN_CUSTOMERS: 'admin-customers-v1',
  /** Settings → Users: raw GET `/auth/users` JSON array (filtered client-side by viewer) */
  ADMIN_AUTH_USERS: 'admin-auth-users-v1',
  /** Settings → Activities: global staff activity feed */
  ADMIN_STAFF_ACTIVITIES: 'admin-staff-activities-v1',
  /** Super Admin GET /finances/analytics — invalidated with orders (revenue source). */
  ADMIN_FINANCES_ANALYTICS: 'admin-finances-analytics-v1',
  
  // Vendor specific (append vendorId)
  vendorProducts: (vendorId: string) => `vendor-products-${vendorId}`,
  /** Paginated vendor storefront list — pageSize in key so browse (24) vs search (100) never collide */
  vendorProductsPage: (vendorId: string, page: number, qNorm: string, category: string, pageSize: number) =>
    `vendor-products-${vendorId}-p${page}-ps${pageSize}-q${qNorm}-c${category}`,
  /** Vendor admin list (all statuses) — separate from public storefront vendor catalog */
  vendorProductsAdmin: (vendorId: string) => `vendor-products-admin-${vendorId}`,
  vendorCategories: (vendorId: string) => `vendor-categories-${vendorId}`,
  vendorOrders: (vendorId: string) => `vendor-orders-${vendorId}`,
  vendorOrdersPage: (
    vendorId: string,
    page: number,
    pageSize: number,
    q: string,
    status: string,
    payment: string,
    sort: string,
    from: string,
    to: string
  ) =>
    `vendor-orders-${vendorId}-p${page}-ps${pageSize}-q${q}-st${status}-pay${payment}-so${sort}-f${from}-t${to}`,
  vendorAudiencePage: (
    vendorId: string,
    page: number,
    pageSize: number,
    q: string,
    status: string,
    tier: string,
    segment: string
  ) => `vendor-audience-${vendorId}-p${page}-ps${pageSize}-q${q}-st${status}-tr${tier}-sg${segment}`,
  /** Customer wishlist slice for one vendor storefront — `wishlistSig` bumps when productIds revision changes */
  vendorSavedWishlistPage: (
    userId: string,
    vendorId: string,
    wishlistSig: string,
    page: number,
    pageSize: number
  ) => `vendor-saved-wl-${userId}-${vendorId}-sig${wishlistSig}-p${page}-ps${pageSize}`,

  /** Full product by id (GET /products/:id) — Super Admin + shared with storefront shape */
  productById: (productId: string) => `product-by-id-${productId}`,
  
  // 🚀 NEW: Image/Asset caching to prevent 699 storage requests/day!
  // Cache signed URLs for 24 hours (they're valid for 1-10 years anyway)
  signedUrl: (imagePath: string) => `signed-url-${imagePath}`,
  productImage: (productId: string, imageUrl: string) => `product-image-${productId}-${imageUrl}`,
  vendorLogo: (vendorId: string) => `vendor-logo-${vendorId}`,
  profileImage: (userId: string) => `profile-image-${userId}`,
  /** Customer order list GET `/user/:id/orders` — storefront + vendor profile order history */
  customerOrders: (userId: string) => `customer-orders-${userId}`,
};

/** Logged-in customer orders (same endpoint as VendorStoreView / Storefront profile). */
export async function fetchCustomerOrdersList(userId: string): Promise<any[]> {
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/user/${encodeURIComponent(userId)}/orders`,
    { headers: { Authorization: `Bearer ${publicAnonKey}` } }
  );
  if (!response.ok) {
    const t = await response.text();
    throw new Error(t || "Failed to fetch orders");
  }
  const data = await response.json();
  return Array.isArray(data.orders) ? data.orders : [];
}

export function invalidateCustomerOrdersCache(userId: string): void {
  if (!userId || !String(userId).trim()) return;
  moduleCache.invalidate(CACHE_KEYS.customerOrders(String(userId).trim()));
}

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

/** Public vendor storefront catalog (paginated + localStorage page-1) — call after Store Settings name/logo changes */
export function invalidateVendorStorefrontCatalogCache(vendorId: string): void {
  const id = String(vendorId);
  moduleCache.invalidatePrefix(`vendor-products-${id}-`);
  if (typeof window !== "undefined") {
    removePersistedKeysPrefix(`migoo-ls-vendor-p1-${encodeURIComponent(id)}`);
  }
}

/** Wishlist changes on `/store/:slug/saved` — clear paginated module + localStorage for that user + storefront. */
export function invalidateVendorSavedWishlistCaches(userId: string, vendorId: string): void {
  const uid = String(userId);
  const vid = String(vendorId);
  moduleCache.invalidatePrefix(`vendor-saved-wl-${uid}-${vid}-`);
  if (typeof window !== "undefined") {
    removePersistedKeysPrefix(
      `migoo-ls-vendor-saved-wl-${encodeURIComponent(uid)}-v-${encodeURIComponent(vid)}-`
    );
  }
}

/** Same-tab + cross-tab signal so open `VendorStoreView` refetches immediately after assign/unassign. */
export const VENDOR_CATALOG_MUTATION_EVENT = "migoo-vendor-catalog-mutation";

/** Any super-admin product delete — all vendor storefront tabs listen (no vendor key matching). */
export const PLATFORM_PRODUCTS_DELETED_EVENT = "migoo-platform-products-deleted";

/**
 * Super-admin deleted products: bust every vendor storefront LS snapshot + module cache,
 * then broadcast ids so open `/vendor/*` tabs drop rows instantly and refetch.
 */
export function broadcastPlatformProductsDeleted(productIds: string[]): void {
  if (typeof window === "undefined") return;
  const ids = [...new Set(productIds.map(String).filter(Boolean))];
  if (ids.length === 0) return;

  moduleCache.removeProductIdsFromAllVendorCatalogCaches(new Set(ids));
  removePersistedKeysPrefix("migoo-ls-vendor-p1-");

  const detail = { productIds: ids };
  try {
    window.dispatchEvent(new CustomEvent(PLATFORM_PRODUCTS_DELETED_EVENT, { detail }));
  } catch {
    /* ignore */
  }
  try {
    const bc = new BroadcastChannel(PLATFORM_PRODUCTS_DELETED_EVENT);
    bc.postMessage({ productIds: ids });
    bc.close();
  } catch {
    /* ignore */
  }
}

function notifyVendorCatalogMutation(catalogKeys: string[]): void {
  if (typeof window === "undefined") return;
  const keys = [...new Set(catalogKeys.map((k) => String(k).trim()).filter(Boolean))];
  if (keys.length === 0) return;
  try {
    window.dispatchEvent(
      new CustomEvent(VENDOR_CATALOG_MUTATION_EVENT, { detail: { keys } })
    );
  } catch {
    /* ignore */
  }
  try {
    const bc = new BroadcastChannel(VENDOR_CATALOG_MUTATION_EVENT);
    bc.postMessage({ type: "catalog-mutated", keys });
    bc.close();
  } catch {
    /* ignore — private mode, etc. */
  }
}

/**
 * After mutating vendor↔product links, clear every client cache key the public storefront might use.
 * Storefront routes pass the URL segment (`storeSlug`) into VendorStoreView, while APIs use internal `vendor.id`;
 * both must be cleared or the shop keeps stale products until TTL/hard refresh.
 */
export function invalidateVendorStorefrontCatalogCachesAfterProductLinkChange(
  internalVendorId: string,
  storefrontUrlKeys?: Array<string | undefined | null>
): void {
  const keys = new Set<string>();
  keys.add(String(internalVendorId));
  for (const k of storefrontUrlKeys || []) {
    const s = String(k ?? "").trim();
    if (s) keys.add(s);
  }
  const keyList = [...keys];
  for (const k of keyList) {
    invalidateVendorStorefrontCatalogCache(k);
  }
  notifyVendorCatalogMutation(keyList);
}

export function broadcastVendorCategoryAssignmentChanged(
  vendorId: string,
  storefrontUrlKeys?: Array<string | undefined | null>
): void {
  const keys = new Set<string>();
  const rawVendorId = String(vendorId || "").trim();
  if (rawVendorId) keys.add(rawVendorId);
  for (const key of storefrontUrlKeys || []) {
    const raw = String(key ?? "").trim();
    if (!raw) continue;
    keys.add(raw);
    keys.add(raw.toLowerCase());
    const hyphen = raw.toLowerCase().replace(/\s+/g, "-");
    if (hyphen) keys.add(hyphen);
    const compact = raw.toLowerCase().replace(/\s+/g, "");
    if (compact) keys.add(compact);
  }

  const keyList = [...keys];
  for (const key of keyList) {
    invalidateVendorStorefrontCatalogCache(key);
    moduleCache.invalidate(CACHE_KEYS.vendorCategories(key));
    removePersistedKey(`migoo-ls-vendor-cats-${encodeURIComponent(key)}-v1`);
  }
  notifyVendorCatalogMutation(keyList);
}

/** Super Admin delete — patch session + paginated caches without forcing a grid refetch. */
export function removeAdminProductsFromCaches(productIds: string[]): void {
  const idSet = new Set(productIds.map(String).filter(Boolean));
  if (idSet.size === 0) return;

  const deletedSnapshots: any[] = [];
  const full = moduleCache.peek<any[]>(CACHE_KEYS.ADMIN_PRODUCTS);
  if (full && Array.isArray(full)) {
    deletedSnapshots.push(...full.filter((p) => idSet.has(String(p?.id))));
    moduleCache.prime(
      CACHE_KEYS.ADMIN_PRODUCTS,
      full.filter((p) => !idSet.has(String(p?.id)))
    );
  }

  moduleCache.removeProductsFromPaginatedAdminCaches(
    ADMIN_PRODUCTS_PAGE_CACHE_PREFIX,
    idSet,
    deletedSnapshots
  );

  if (typeof window !== "undefined") {
    removePersistedKeysPrefix("migoo-ls-admin-p1-");
  }

  dispatchAdminProductsCachePatched();
}

/** Super Admin create — prepend row to session + paginated caches without forcing a grid refetch. */
export function insertAdminProductIntoCaches(product: any): void {
  const id = String(product?.id ?? "").trim();
  if (!id) return;

  const full = moduleCache.peek<any[]>(CACHE_KEYS.ADMIN_PRODUCTS);
  if (full && Array.isArray(full)) {
    if (!full.some((p) => String(p?.id) === id)) {
      moduleCache.prime(CACHE_KEYS.ADMIN_PRODUCTS, [product, ...full]);
    }
  } else {
    moduleCache.prime(CACHE_KEYS.ADMIN_PRODUCTS, [product]);
  }

  moduleCache.insertProductIntoPaginatedAdminCaches(ADMIN_PRODUCTS_PAGE_CACHE_PREFIX, product);

  if (typeof window !== "undefined") {
    removePersistedKeysPrefix("migoo-ls-admin-p1-");
  }

  dispatchAdminProductsCachePatched();
}

/** Vendor admin product list — drop deleted rows from cached payload for each vendor. */
export function removeProductsFromVendorAdminCaches(
  vendorIds: string[],
  productIds: string[]
): void {
  const idSet = new Set(productIds.map(String).filter(Boolean));
  if (idSet.size === 0) return;
  for (const vendorId of vendorIds) {
    const key = CACHE_KEYS.vendorProductsAdmin(String(vendorId));
    const prev = moduleCache.peek<{ products?: unknown[] }>(key);
    if (!prev?.products || !Array.isArray(prev.products)) continue;
    const next = prev.products.filter((p: any) => !idSet.has(String(p?.id)));
    if (next.length === prev.products.length) continue;
    primeVendorProductsAdminCache(String(vendorId), next);
  }
}

/** Instant vendor storefront removal + cache bust (same-tab + cross-tab). */
export function notifyVendorStorefrontProductsRemoved(
  catalogKeys: string[],
  productIds: string[]
): void {
  if (typeof window === "undefined") return;
  const keys = [...new Set(catalogKeys.map((k) => String(k).trim()).filter(Boolean))];
  const ids = [...new Set(productIds.map(String).filter(Boolean))];
  if (ids.length === 0) return;

  if (keys.length > 0) {
    moduleCache.removeProductsFromVendorCatalogPaginatedCaches(keys, new Set(ids), ids.length);
    for (const k of keys) {
      removePersistedKeysPrefix(`migoo-ls-vendor-p1-${encodeURIComponent(k)}`);
    }
  }

  const detail = { keys, productIds: ids };
  try {
    window.dispatchEvent(new CustomEvent(VENDOR_CATALOG_MUTATION_EVENT, { detail }));
  } catch {
    /* ignore */
  }
  try {
    const bc = new BroadcastChannel(VENDOR_CATALOG_MUTATION_EVENT);
    bc.postMessage({ type: "products-deleted", keys, productIds: ids });
    bc.close();
  } catch {
    /* ignore */
  }
}

/** Super Admin `/products` grid — one fetch per session until Refresh or invalidation */
export async function getCachedAdminAllProducts(forceRefresh = false) {
  return moduleCache.get(CACHE_KEYS.ADMIN_PRODUCTS, () => fetchAllProducts(), forceRefresh);
}

export function invalidateAdminAllProductsCache(): void {
  moduleCache.invalidate(CACHE_KEYS.ADMIN_PRODUCTS);
  invalidateAdminProductsPaginatedCaches();
}

/**
 * Paginated admin product lists (`admin-products-page-*`) + persisted page-1 JSON live separately from
 * `ADMIN_PRODUCTS`. After order-driven stock patches or realtime bumps, drop these so the next
 * `getCachedAdminProductsPage` forces a fresh fetch (stale ME005 on Inventory vs Products).
 */
export function invalidateAdminProductsPaginatedCaches(): void {
  moduleCache.invalidatePrefix(ADMIN_PRODUCTS_PAGE_CACHE_PREFIX);
  if (typeof window !== "undefined") {
    removePersistedKeysPrefix("migoo-ls-admin-p1-");
  }
}

/**
 * After `ADMIN_PRODUCTS` is patched, push inventory/stock into each cached paginated page + clear p1
 * localStorage snapshots so list UIs stay consistent **without** wiping session keys (avoids full refetch blink).
 */
export function mergePaginatedAdminProductCachesFromFullProducts(): void {
  moduleCache.mergePaginatedAdminProductsFromFull(CACHE_KEYS.ADMIN_PRODUCTS, ADMIN_PRODUCTS_PAGE_CACHE_PREFIX);
  if (typeof window !== "undefined") {
    removePersistedKeysPrefix("migoo-ls-admin-p1-");
  }
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

/** Cross-tab: Inventory in other tabs listens on this channel (session cache is not shared between tabs). */
export const ADMIN_PRODUCTS_BROADCAST_CHANNEL = "migoo-admin-products-cache";

/** Same-tab: full admin product list changed (create/delete/realtime insert) — force refetch, not inventory merge. */
export const ADMIN_PRODUCTS_LIST_CHANGED_EVENT = "migoo-admin-products-list-changed";

/**
 * Bust paginated + page-1 localStorage and notify all tabs to refetch the products grid.
 * Use after create/delete and KV `product:` inserts (not for order-driven stock merges).
 */
export function notifyAdminProductsListChanged(): void {
  invalidateAdminProductsPaginatedCaches();
  moduleCache.invalidate(CACHE_KEYS.ADMIN_PRODUCTS);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ADMIN_PRODUCTS_LIST_CHANGED_EVENT));
  try {
    const bc = new BroadcastChannel(ADMIN_PRODUCTS_BROADCAST_CHANNEL);
    bc.postMessage({ type: "list-changed" });
    bc.close();
  } catch {
    /* BroadcastChannel unsupported */
  }
}

/** Notify listeners that admin product data changed (paginated rows already merged when applicable). */
export function dispatchAdminProductsCachePatched(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("migoo-admin-products-cache-patched"));
  try {
    const bc = new BroadcastChannel(ADMIN_PRODUCTS_BROADCAST_CHANNEL);
    bc.postMessage({ type: "admin-products-updated" });
    bc.close();
  } catch {
    /* BroadcastChannel unsupported */
  }
}

/**
 * Apply a signed delta to one product or variant row in the admin products session cache.
 * When `sku` is set and the product has variants, adjusts the matching variant and recomputes parent totals.
 * When `productId` matches a variant id, adjusts that variant row (legacy line items).
 */
export function applyLineItemStockDeltaToAdminCache(
  productId: string,
  sku: string | undefined,
  delta: number
): void {
  const peeked = moduleCache.peek<any[]>(CACHE_KEYS.ADMIN_PRODUCTS);
  if (!peeked || !Array.isArray(peeked)) return;

  const next = peeked.map((p: any) => {
    if (p.id === productId) {
      if (Array.isArray(p.variants) && p.variants.length > 0 && sku && String(sku).trim() !== "" && sku !== "N/A") {
        const skuNorm = String(sku).trim().toLowerCase();
        const vi = p.variants.findIndex(
          (v: any) => String(v.sku || "").trim().toLowerCase() === skuNorm
        );
        if (vi >= 0) {
          const variants = p.variants.map((v: any, i: number) =>
            i === vi
              ? { ...v, inventory: Math.max(0, (Number(v.inventory) || 0) + delta) }
              : v
          );
          const total = variants.reduce((s: number, v: any) => s + (Number(v.inventory) || 0), 0);
          return { ...p, variants, inventory: total, stock: total };
        }
      }
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
 * Apply a signed delta to one product or variant row in the admin products session cache.
 * Matches server `applyOrderItemsStockDelta` (single product KV key per line item).
 */
export function applyDeltaToAdminProductInventoryInCache(productId: string, delta: number): void {
  applyLineItemStockDeltaToAdminCache(productId, undefined, delta);
}

/**
 * Apply stock movement for order line items (deduct or restore). No Supabase calls.
 */
export function applyOrderLineStockDeltasToAdminCache(
  items: { productId: string; quantity: number; sku?: string }[],
  direction: "deduct" | "restore",
  options?: { skipDispatch?: boolean }
): void {
  const sign = direction === "deduct" ? -1 : 1;
  for (const it of items) {
    const qty = Math.max(0, Number(it.quantity) || 0);
    if (qty <= 0) continue;
    applyLineItemStockDeltaToAdminCache(it.productId, it.sku, sign * qty);
  }
  mergePaginatedAdminProductCachesFromFullProducts();
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

/** Optimistic status change — keeps pending-order badge in sync before server round-trip. */
export function patchAdminOrdersCacheStatuses(
  updates: Array<{ orderId: string; status: string }>
): void {
  if (updates.length === 0) return;
  const payload = moduleCache.peek<{ orders?: unknown[] }>(CACHE_KEYS.ADMIN_ORDERS);
  if (!payload?.orders || !Array.isArray(payload.orders)) return;

  const byId = new Map(updates.map((u) => [String(u.orderId), String(u.status)]));
  const now = new Date().toISOString();
  const orders = payload.orders.map((raw) => {
    const o = raw as Record<string, unknown>;
    const id = String(o?.id ?? "");
    const nextStatus = byId.get(id);
    if (!nextStatus) return raw;
    return { ...o, status: nextStatus, updatedAt: now };
  });

  moduleCache.prime(CACHE_KEYS.ADMIN_ORDERS, { ...payload, orders });
  SmartCache.delete("badge_counts");
  if (typeof window !== "undefined") {
    notifyAdminOrdersUpdated("patch-admin-orders-status");
  }
}

export function invalidateAdminOrdersCache(): void {
  moduleCache.invalidate(CACHE_KEYS.ADMIN_ORDERS);
  moduleCache.invalidatePrefix(ADMIN_ORDERS_PAGE_CACHE_PREFIX);
  moduleCache.invalidate(CACHE_KEYS.ADMIN_FINANCES_ANALYTICS);
  /** Vendor portals peek `vendor-orders-*`; clear so Finances/Dashboard refetch matches super-admin mutations. */
  moduleCache.invalidatePrefix("vendor-orders-");
  SmartCache.delete("badge_counts");
  if (typeof window !== "undefined") {
    removePersistedKeysPrefix("migoo-ls-admin-orders-p1-");
    // Keep last finances snapshot for instant paint; Finances view revalidates in background.
    notifyAdminOrdersUpdated("invalidate-admin-orders-cache");
  }
}

/** Hydrate finances UI from session module cache or localStorage (same TTL as catalog snapshots). */
export function readFinancialAnalyticsHydrate(): Record<string, unknown> | null {
  if (isSuperAdminFinancesSessionStale()) return null;
  const fromModule = moduleCache.peek<Record<string, unknown>>(CACHE_KEYS.ADMIN_FINANCES_ANALYTICS);
  if (fromModule) return fromModule;
  const fromLs = readPersistedJson<Record<string, unknown>>(LS_ADMIN_FINANCES_ANALYTICS, PERSISTED_CATALOG_TTL_MS);
  if (fromLs) {
    moduleCache.prime(CACHE_KEYS.ADMIN_FINANCES_ANALYTICS, fromLs);
    return fromLs;
  }
  return null;
}

/**
 * Session-scoped cache + localStorage persist — skip network when fresh (navigation, remount).
 * Use `forceRefresh`/invalidate for post-mutation and storefront order paths.
 */
export async function getCachedFinancialAnalytics(forceRefresh = false): Promise<Record<string, unknown>> {
  return moduleCache.get(
    CACHE_KEYS.ADMIN_FINANCES_ANALYTICS,
    async () => {
      const data = await withNetworkRetry(() => fetchFinancialAnalyticsFromApi(), {
        retries: 1,
        delayMs: 500,
      });
      writePersistedJson(LS_ADMIN_FINANCES_ANALYTICS, data);
      return data;
    },
    forceRefresh
  );
}

export async function fetchFinancialAnalyticsFromApi(): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/finances/analytics`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch financial data: ${response.statusText}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Force network + persist (alias for `getCachedFinancialAnalytics(true)`). */
export async function fetchAndCacheFinancialAnalytics(): Promise<Record<string, unknown>> {
  return getCachedFinancialAnalytics(true);
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

const LS_ADMIN_CATEGORIES_PENDING_DELETE = 'migoo-admin-categories-pending-delete-v1';

let pendingAdminCategoryDeletes = loadPendingAdminCategoryDeletesFromStorage();

function loadPendingAdminCategoryDeletesFromStorage(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(LS_ADMIN_CATEGORIES_PENDING_DELETE);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function persistPendingAdminCategoryDeletes(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      LS_ADMIN_CATEGORIES_PENDING_DELETE,
      JSON.stringify([...pendingAdminCategoryDeletes])
    );
  } catch {
    /* ignore */
  }
}

export function getPendingAdminCategoryDeleteIds(): string[] {
  return [...pendingAdminCategoryDeletes];
}

export function addPendingAdminCategoryDeletes(ids: string[]): void {
  for (const id of ids) {
    const s = String(id ?? '').trim();
    if (s) pendingAdminCategoryDeletes.add(s);
  }
  persistPendingAdminCategoryDeletes();
}

export function clearPendingAdminCategoryDeletes(ids: string[]): void {
  for (const id of ids) {
    pendingAdminCategoryDeletes.delete(String(id));
  }
  persistPendingAdminCategoryDeletes();
}

export function filterOutPendingAdminCategoryDeletes<T extends { id?: string }>(list: T[]): T[] {
  if (pendingAdminCategoryDeletes.size === 0) return list;
  return list.filter((item) => !pendingAdminCategoryDeletes.has(String(item?.id)));
}

let suppressAdminCategoriesRealtimeUntil = 0;

export function suppressAdminCategoriesRealtimeReload(ms = 5000): void {
  suppressAdminCategoriesRealtimeUntil = Date.now() + ms;
}

export function shouldSuppressAdminCategoriesRealtimeReload(): boolean {
  return (
    Date.now() < suppressAdminCategoriesRealtimeUntil ||
    pendingAdminCategoryDeletes.size > 0
  );
}

/** Super Admin delete — patch session cache without forcing a list refetch. */
export function removeAdminCategoriesFromCaches(categoryIds: string[]): void {
  const idSet = new Set(categoryIds.map(String).filter(Boolean));
  if (idSet.size === 0) return;

  const prev = moduleCache.peek<any[]>(CACHE_KEYS.ADMIN_ALL_CATEGORIES);
  if (prev && Array.isArray(prev)) {
    moduleCache.prime(
      CACHE_KEYS.ADMIN_ALL_CATEGORIES,
      prev.filter((c) => !idSet.has(String(c?.id)))
    );
  }
}

export async function getCachedAdminCustomersPayload(forceRefresh = false) {
  return moduleCache.get(CACHE_KEYS.ADMIN_CUSTOMERS, () => fetchAdminCustomersPayload(), forceRefresh);
}

export function invalidateAdminCustomersCache(): void {
  moduleCache.invalidate(CACHE_KEYS.ADMIN_CUSTOMERS);
  moduleCache.invalidatePrefix(ADMIN_CUSTOMERS_PAGE_CACHE_PREFIX);
  if (typeof window !== "undefined") {
    removePersistedKeysPrefix("migoo-ls-admin-customers-p1-");
  }
}

/** Super Admin delete — patch session + paginated caches without forcing a list refetch. */
export function removeAdminCustomersFromCaches(
  customerIds: string[],
  deletedSnapshots: any[] = []
): void {
  const idSet = new Set(customerIds.map(String).filter(Boolean));
  if (idSet.size === 0) return;

  const full = moduleCache.peek<any[]>(CACHE_KEYS.ADMIN_CUSTOMERS);
  if (full && Array.isArray(full)) {
    moduleCache.prime(
      CACHE_KEYS.ADMIN_CUSTOMERS,
      full.filter((c) => !idSet.has(String(c?.id)))
    );
  }

  moduleCache.removeCustomersFromPaginatedAdminCaches(
    ADMIN_CUSTOMERS_PAGE_CACHE_PREFIX,
    idSet,
    deletedSnapshots
  );

  if (typeof window !== "undefined") {
    removePersistedKeysPrefix("migoo-ls-admin-customers-p1-");
  }
}

async function fetchAuthUsersRaw(): Promise<any[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/users`,
      {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      throw new Error("Failed to fetch users");
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Settings → Users: session + localStorage; `forceRefresh` bypasses cache for SWR revalidation. */
export async function getCachedAdminAuthUsers(forceRefresh = false): Promise<any[]> {
  return moduleCache.get(
    CACHE_KEYS.ADMIN_AUTH_USERS,
    async () => {
      const data = await fetchAuthUsersRaw();
      if (typeof window !== "undefined") {
        writePersistedJson(LS_ADMIN_AUTH_USERS, data);
      }
      return data;
    },
    forceRefresh
  );
}

export function invalidateAdminAuthUsersCache(): void {
  moduleCache.invalidate(CACHE_KEYS.ADMIN_AUTH_USERS);
  if (typeof window !== "undefined") {
    removePersistedKey(LS_ADMIN_AUTH_USERS);
  }
}

export function primeAdminAuthUsersCache(raw: unknown[]): void {
  moduleCache.prime(CACHE_KEYS.ADMIN_AUTH_USERS, raw);
  if (typeof window !== "undefined") {
    writePersistedJson(LS_ADMIN_AUTH_USERS, raw);
  }
}

export type StaffActivityFeedRow = {
  id: string;
  type: string;
  action: string;
  detail: string;
  at: string;
  actorUserId: string;
  actorName?: string;
  actorEmail?: string;
  actorRole?: string;
};

const STAFF_ACTIVITIES_API =
  `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/auth/staff-activities`;

/** Poll interval while Activities tab is open — lightweight incremental requests only. */
export const STAFF_ACTIVITIES_POLL_MS = 30_000;

function normalizeStaffActivityRows(list: unknown): StaffActivityFeedRow[] {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (row: unknown) =>
      row &&
      typeof row === "object" &&
      typeof (row as { id?: string }).id === "string" &&
      typeof (row as { action?: string }).action === "string"
  ) as StaffActivityFeedRow[];
}

async function fetchStaffActivitiesFull(): Promise<StaffActivityFeedRow[]> {
  const response = await fetch(STAFF_ACTIVITIES_API, {
    headers: { Authorization: `Bearer ${publicAnonKey}` },
  });
  if (!response.ok) return [];
  const data = await response.json();
  return normalizeStaffActivityRows(data.activities);
}

export async function fetchIncrementalStaffActivities(
  since: string
): Promise<StaffActivityFeedRow[]> {
  const sinceParam = encodeURIComponent(String(since || "").trim());
  if (!sinceParam) return [];
  const response = await fetch(`${STAFF_ACTIVITIES_API}?since=${sinceParam}`, {
    headers: { Authorization: `Bearer ${publicAnonKey}` },
  });
  if (!response.ok) return [];
  const data = await response.json();
  return normalizeStaffActivityRows(data.activities);
}

export function peekStaffActivitiesCache(): StaffActivityFeedRow[] | null {
  const peeked = moduleCache.peek<StaffActivityFeedRow[]>(CACHE_KEYS.ADMIN_STAFF_ACTIVITIES);
  return peeked && Array.isArray(peeked) ? peeked : null;
}

export async function getCachedStaffActivities(
  forceRefresh = false
): Promise<StaffActivityFeedRow[]> {
  return moduleCache.get(
    CACHE_KEYS.ADMIN_STAFF_ACTIVITIES,
    fetchStaffActivitiesFull,
    forceRefresh
  );
}

export function primeStaffActivitiesCache(rows: StaffActivityFeedRow[]): void {
  moduleCache.prime(CACHE_KEYS.ADMIN_STAFF_ACTIVITIES, rows);
}

export function invalidateStaffActivitiesCache(): void {
  moduleCache.invalidate(CACHE_KEYS.ADMIN_STAFF_ACTIVITIES);
}

export async function clearStaffActivities(clearedByUserId: string): Promise<boolean> {
  const actorId = String(clearedByUserId || "").trim();
  if (!actorId) return false;
  const response = await fetch(
    `${STAFF_ACTIVITIES_API}?clearedBy=${encodeURIComponent(actorId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    }
  );
  if (!response.ok) return false;
  invalidateStaffActivitiesCache();
  return true;
}

export function mergeStaffActivities(
  existing: StaffActivityFeedRow[],
  incoming: StaffActivityFeedRow[]
): StaffActivityFeedRow[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((row) => `${row.actorUserId}-${row.id}`));
  const merged = [
    ...incoming.filter((row) => !seen.has(`${row.actorUserId}-${row.id}`)),
    ...existing,
  ];
  merged.sort((a, b) => {
    const aMs = Date.parse(String(a.at || ""));
    const bMs = Date.parse(String(b.at || ""));
    return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
  });
  return merged;
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
  return moduleCache.get(
    CACHE_KEYS.vendorOrders(vendorId),
    () => fetchVendorOrders(vendorId, forceRefresh),
    forceRefresh
  );
}

export async function getCachedVendorOrdersPage(
  vendorId: string,
  query: VendorOrdersPageQuery,
  forceRefresh = false
): Promise<VendorOrdersPagePayload> {
  const qNorm = String(query.q || "").trim().toLowerCase();
  const status = String(query.status || "all").trim().toLowerCase();
  const payment = String(query.payment || "all").trim().toLowerCase();
  const sort = query.sort === "oldest" ? "oldest" : "newest";
  const from = String(query.from || "").trim();
  const to = String(query.to || "").trim();
  const key = CACHE_KEYS.vendorOrdersPage(
    vendorId,
    query.page,
    query.pageSize,
    qNorm,
    status,
    payment,
    sort,
    from,
    to
  );
  return moduleCache.get(
    key,
    () =>
      fetchVendorOrdersPage(
        vendorId,
        {
          ...query,
          q: qNorm,
          status,
          payment,
          sort,
          from,
          to,
        },
        forceRefresh
      ),
    forceRefresh
  );
}

export function invalidateVendorOrdersCache(vendorId: string): void {
  moduleCache.invalidate(CACHE_KEYS.vendorOrders(vendorId));
  moduleCache.invalidatePrefix(`vendor-orders-${vendorId}-`);
  if (typeof window !== "undefined") {
    notifyAdminOrdersUpdated("invalidate-vendor-orders-cache");
  }
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
    devLog(`🖼️ [IMAGE CACHE MISS] Fetching signed URL for: ${imagePath}`);
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
    crossOrigin: 'anonymous' as const,
    referrerPolicy: 'no-referrer' as const,
    decoding: 'async' as const,
  };
}

const SUPABASE_STORAGE_OBJECT_PUBLIC = "/storage/v1/object/public/";
const SUPABASE_STORAGE_OBJECT_SIGNED = "/storage/v1/object/sign/";

/** Default grid thumb width when env is unset (PageSpeed / mobile LCP). */
const DEFAULT_GRID_THUMB_MAX = 256;
const DEFAULT_LOGO_THUMB_MAX = 96;
const DEFAULT_BANNER_THUMB_MAX = 720;

function resolveThumbMax(explicitMax: number | undefined, fallback: number): number {
  if (explicitMax != null && Number.isFinite(explicitMax) && explicitMax >= 64 && explicitMax <= 4096) {
    return Math.round(explicitMax);
  }
  const raw = import.meta.env.VITE_SUPABASE_THUMB_MAX;
  const fromEnv =
    raw != null && String(raw).trim() !== "" ? Number(raw) : Number.NaN;
  if (Number.isFinite(fromEnv) && fromEnv >= 64 && fromEnv <= 4096) {
    return Math.round(fromEnv);
  }
  return fallback;
}

/**
 * Rewrite Supabase Storage public URLs to the image render endpoint (smaller downloads → better LCP).
 * Uses `VITE_SUPABASE_THUMB_MAX` when set; otherwise sensible defaults per use-case.
 */
export function gridDisplayImageUrl(src: string, maxWidth?: number): string {
  if (!src) return src;
  const max = resolveThumbMax(maxWidth, DEFAULT_GRID_THUMB_MAX);
  let base = src;
  if (src.includes(SUPABASE_STORAGE_OBJECT_PUBLIC)) {
    base = src.replace(
      SUPABASE_STORAGE_OBJECT_PUBLIC,
      "/storage/v1/render/image/public/"
    );
  } else if (src.includes(SUPABASE_STORAGE_OBJECT_SIGNED)) {
    base = src.replace(
      SUPABASE_STORAGE_OBJECT_SIGNED,
      "/storage/v1/render/image/sign/"
    );
  } else {
    return src;
  }
  const joiner = base.includes("?") ? "&" : "?";
  return `${base}${joiner}width=${max}&height=${max}&resize=cover&quality=70`;
}

export function logoDisplayImageUrl(src: string): string {
  return gridDisplayImageUrl(src, DEFAULT_LOGO_THUMB_MAX);
}

export function bannerDisplayImageUrl(src: string): string {
  return gridDisplayImageUrl(src, DEFAULT_BANNER_THUMB_MAX);
}