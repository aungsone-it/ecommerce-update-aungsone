/**
 * Cross-session JSON cache in localStorage to cut repeat Supabase / edge calls
 * after first visit: `/` landing, `/store` marketplace, vendor storefront.
 */

const WRAPPER_VERSION = 1;

export type PersistedWrapper<T> = {
  v: typeof WRAPPER_VERSION;
  savedAt: number;
  payload: T;
};

/** Default: keep catalog-like payloads for 7 days (tune without breaking wallets). */
export const PERSISTED_CATALOG_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function readPersistedJson<T>(key: string, maxAgeMs: number): T | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedWrapper<T>;
    if (
      !parsed ||
      parsed.v !== WRAPPER_VERSION ||
      typeof parsed.savedAt !== "number" ||
      parsed.payload === undefined
    ) {
      return null;
    }
    if (Date.now() - parsed.savedAt > maxAgeMs) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

export function writePersistedJson<T>(key: string, payload: T): void {
  if (typeof localStorage === "undefined") return;
  try {
    const body: PersistedWrapper<T> = {
      v: WRAPPER_VERSION,
      savedAt: Date.now(),
      payload,
    };
    localStorage.setItem(key, JSON.stringify(body));
  } catch (e) {
    console.warn("[persistedLocalCache] write failed (quota?)", key, e);
  }
}

export function removePersistedKey(key: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Marketplace first-page catalog (raw API body from GET products?bootstrap=1). */
export const LS_STOREFRONT_CATALOG_BOOTSTRAP = "migoo-ls-storefront-catalog-bootstrap-v2";

/** Full categories array as returned by fetchAllCategories (before active filter). */
export const LS_STOREFRONT_CATEGORIES = "migoo-ls-storefront-categories-v2";

/** Site settings object from fetchSiteSettings. */
export const LS_STOREFRONT_SETTINGS = "migoo-ls-storefront-settings-v2";

export function lsVendorCatalogPage1Key(
  vendorId: string,
  qNorm: string,
  category: string,
  pageSize: number
): string {
  const safeVendor = encodeURIComponent(String(vendorId));
  const safeQ = encodeURIComponent(qNorm || "_");
  const safeCat = encodeURIComponent(String(category || "all"));
  return `migoo-ls-vendor-p1-${safeVendor}-q-${safeQ}-c-${safeCat}-ps-${pageSize}-v1`;
}

/** Vendor categories list (raw API array). */
export function lsVendorCategoriesKey(vendorId: string): string {
  return `migoo-ls-vendor-cats-${encodeURIComponent(String(vendorId))}-v1`;
}

/** Vendor /saved grid — one page of POST wishlist-vendor-page (per user + storefront + wishlist revision). */
export function lsVendorSavedWishlistPageKey(
  userId: string,
  vendorId: string,
  wishlistSig: string,
  page: number,
  pageSize: number
): string {
  const p = Math.max(1, page);
  const ps = Math.min(100, Math.max(1, pageSize));
  return `migoo-ls-vendor-saved-wl-${encodeURIComponent(userId)}-v-${encodeURIComponent(vendorId)}-sig-${encodeURIComponent(wishlistSig)}-p-${p}-ps-${ps}-v1`;
}

/** Customer wishlist product id list — instant restore when revisiting /saved (same TTL as catalog). */
export function lsWishlistProductIdsKey(userId: string): string {
  return `migoo-ls-customer-wishlist-ids-${encodeURIComponent(userId)}-v1`;
}

/** `/` landing — GET platform-settings JSON body */
export const LS_LANDING_PLATFORM_SETTINGS = "migoo-ls-landing-platform-settings-v1";

/** `/` landing — GET vendors list JSON body (`{ vendors, total }`) */
export const LS_LANDING_VENDORS = "migoo-ls-landing-vendors-v1";

/** `/` landing — GET landing-stats JSON body */
export const LS_LANDING_STATS = "migoo-ls-landing-stats-v1";

/** `/` landing — GET /categories public JSON body */
export const LS_LANDING_CATEGORIES = "migoo-ls-landing-categories-v1";

/** Super Admin product/inventory grid — page 1 API body (`GET products?adminList=1&page=1`). */
export function lsAdminProductsPage1Key(opts: {
  pageSize: number;
  tab: string;
  status: string;
  sort: string;
  vendor: string;
  collaborator: string;
  qNorm: string;
  /** When set, server excludes products already assigned to this vendor (assign picker). */
  excludeVendorIdNorm?: string;
}): string {
  const ps = Math.min(100, Math.max(1, opts.pageSize));
  const ev = encodeURIComponent((opts.excludeVendorIdNorm || "").trim() || "_");
  return `migoo-ls-admin-p1-ps-${ps}-t-${encodeURIComponent(opts.tab)}-st-${encodeURIComponent(opts.status)}-s-${encodeURIComponent(opts.sort)}-v-${encodeURIComponent(opts.vendor || "_")}-c-${encodeURIComponent(opts.collaborator || "_")}-q-${encodeURIComponent(opts.qNorm || "_")}-ev-${ev}-v2`;
}

/** Super Admin orders table — page 1 body (`GET orders?page=1`). */
export function lsAdminOrdersPage1Key(opts: {
  pageSize: number;
  qNorm: string;
  status: string;
  payment: string;
  vendor: string;
  dateFrom: string;
  dateTo: string;
  sort: string;
}): string {
  const ps = Math.min(100, Math.max(1, opts.pageSize));
  return `migoo-ls-admin-orders-p1-ps-${ps}-st-${encodeURIComponent(opts.status)}-pay-${encodeURIComponent(opts.payment)}-v-${encodeURIComponent(opts.vendor || "_")}-df-${encodeURIComponent(opts.dateFrom || "_")}-dt-${encodeURIComponent(opts.dateTo || "_")}-s-${encodeURIComponent(opts.sort)}-q-${encodeURIComponent(opts.qNorm || "_")}-v1`;
}

/** Super Admin finances analytics (`GET finances/analytics`) — instant paint after reload; always revalidated in background. */
export const LS_ADMIN_FINANCES_ANALYTICS = "migoo-ls-admin-finances-analytics-v1";

/** Super Admin customers table — page 1 (`GET customers?page=1`). */
export function lsAdminCustomersPage1Key(opts: {
  pageSize: number;
  qNorm: string;
  status: string;
  tier: string;
  segment: string;
}): string {
  const ps = Math.min(100, Math.max(1, opts.pageSize));
  return `migoo-ls-admin-customers-p1-ps-${ps}-st-${encodeURIComponent(opts.status)}-t-${encodeURIComponent(opts.tier)}-seg-${encodeURIComponent(opts.segment)}-q-${encodeURIComponent(opts.qNorm || "_")}-v1`;
}

/** Remove persisted keys by prefix (e.g. clear all admin product page-1 caches after mutations). */
export function removePersistedKeysPrefix(prefix: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
