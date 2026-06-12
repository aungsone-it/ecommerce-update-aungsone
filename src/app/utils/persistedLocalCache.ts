/**
 * Cross-session JSON cache in localStorage to cut repeat Supabase / edge calls
 * after first visit: `/` landing, `/store` marketplace, vendor storefront.
 */

import { devWarn } from "./devLog";

const WRAPPER_VERSION = 1;

/** Skip persisting payloads larger than this — avoids QuotaExceededError on admin product grids. */
const PERSISTED_MAX_ENTRY_BYTES = 1.5 * 1024 * 1024;

export type PersistedWrapper<T> = {
  v: typeof WRAPPER_VERSION;
  savedAt: number;
  payload: T;
};

/** Default: keep catalog-like payloads for 7 days (tune without breaking wallets). */
export const PERSISTED_CATALOG_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Super-admin products page 1 — short TTL so browser refresh picks up new rows quickly. */
export const PERSISTED_ADMIN_PRODUCTS_PAGE_TTL_MS = 2 * 60 * 1000;

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

export function readPersistedPayloadSavedAt(key: string): number | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedWrapper<unknown>;
    if (!parsed || parsed.v !== WRAPPER_VERSION || typeof parsed.savedAt !== "number") {
      return null;
    }
    return parsed.savedAt;
  } catch {
    return null;
  }
}

const SUPABASE_AUTH_LS_PREFIX = "sb-";

/** Prefixes safe to delete before auth/session writes (catalog + admin caches). */
const CACHE_LS_PREFIXES = [
  "migoo-ls-",
  "migoo_cache_",
  "migoo-notifications",
  "migoo-checkout",
  "migoo-shipping-addresses-",
  "migoo-applied-coupon",
  "vendor_storefront_",
  "vendorAuth",
];

/**
 * Free localStorage so Supabase can persist `sb-*-auth-token` (fixes QuotaExceededError on login).
 * Keeps existing Supabase auth keys until sign-in replaces them.
 */
export function freeLocalStorageForAuth(opts?: { clearAll?: boolean }): number {
  if (typeof localStorage === "undefined") return 0;
  let removed = 0;
  try {
    if (opts?.clearAll) {
      const n = localStorage.length;
      localStorage.clear();
      return n;
    }
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(SUPABASE_AUTH_LS_PREFIX)) continue;
      if (CACHE_LS_PREFIXES.some((p) => k.startsWith(p) || k.includes(p))) {
        keys.push(k);
        continue;
      }
      if (k.startsWith("migoo-") && k !== "migoo-user") {
        keys.push(k);
      }
    }
    for (const k of keys) {
      localStorage.removeItem(k);
      removed++;
    }
    removePersistedKeysPrefix("migoo-ls-");
  } catch {
    /* ignore */
  }
  return removed;
}

export function isStorageQuotaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name?: string }).name) : "";
  const message = "message" in err ? String((err as { message?: string }).message) : String(err);
  return name === "QuotaExceededError" || /quota/i.test(message);
}

function evictPersistedCacheEntries(): number {
  if (typeof localStorage === "undefined") return 0;
  let removed = 0;
  try {
    for (const prefix of CACHE_LS_PREFIXES) {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith(prefix) || k.includes(prefix))) keys.push(k);
      }
      for (const k of keys) {
        localStorage.removeItem(k);
        removed++;
      }
    }
  } catch {
    /* ignore */
  }
  return removed;
}

export function writePersistedJson<T>(key: string, payload: T): void {
  if (typeof localStorage === "undefined") return;
  const body: PersistedWrapper<T> = {
    v: WRAPPER_VERSION,
    savedAt: Date.now(),
    payload,
  };
  const serialized = JSON.stringify(body);
  if (serialized.length > PERSISTED_MAX_ENTRY_BYTES) {
    devWarn(
      `[persistedLocalCache] skip write — payload too large (${(serialized.length / (1024 * 1024)).toFixed(2)}MB):`,
      key,
    );
    return;
  }
  try {
    localStorage.setItem(key, serialized);
  } catch (e) {
    if (isStorageQuotaError(e)) {
      freeLocalStorageForAuth();
      evictPersistedCacheEntries();
      try {
        localStorage.setItem(key, serialized);
        return;
      } catch {
        /* still full — skip silently in production */
      }
    }
    devWarn("[persistedLocalCache] write failed (quota?)", key, e);
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
export const LS_STOREFRONT_CATALOG_BOOTSTRAP =
  "migoo-ls-storefront-catalog-bootstrap-v2";

/** Full categories array as returned by fetchAllCategories (before active filter). */
export const LS_STOREFRONT_CATEGORIES = "migoo-ls-storefront-categories-v2";

/** Site settings object from fetchSiteSettings. */
export const LS_STOREFRONT_SETTINGS = "migoo-ls-storefront-settings-v2";

/** Public Terms / Privacy payloads — keyed as `${LS_STOREFRONT_POLICY_PREFIX}${slug}:${kind}`. */
export const LS_STOREFRONT_POLICY_PREFIX = "migoo-ls-policy:";
export const PERSISTED_POLICY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function lsVendorCatalogPage1Key(
  vendorId: string,
  qNorm: string,
  category: string,
  pageSize: number,
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
  pageSize: number,
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
export const LS_LANDING_PLATFORM_SETTINGS =
  "migoo-ls-landing-platform-settings-v1";

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
export const LS_ADMIN_FINANCES_ANALYTICS =
  "migoo-ls-admin-finances-analytics-v1";

/** Settings → Users tab: raw `GET auth/users` array — instant paint; revalidated in background. */
export const LS_ADMIN_AUTH_USERS = "migoo-ls-admin-auth-users-v1";

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
