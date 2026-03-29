/**
 * CACHED LOAD FUNCTIONS FOR STOREFRONT
 * Import and use these in Storefront.tsx to enable module-level caching
 */

import {
  moduleCache,
  CACHE_KEYS,
  fetchCatalogBootstrap,
  fetchAllCategories,
  fetchSiteSettings,
} from "../utils/module-cache";
import {
  readPersistedJson,
  writePersistedJson,
  PERSISTED_CATALOG_TTL_MS,
  LS_STOREFRONT_CATALOG_BOOTSTRAP,
  LS_STOREFRONT_CATEGORIES,
  LS_STOREFRONT_SETTINGS,
} from "../utils/persistedLocalCache";

function filterActiveProducts(list: any[]) {
  return (list || []).filter((p: any) => {
    try {
      const status = String(p.status || "").toLowerCase();
      return !status || status === "active";
    } catch {
      return false;
    }
  });
}

/** Home + first catalog page (slim rows); reduces egress vs. loading entire catalog. */
export async function loadCatalogBootstrapCached(isBackgroundRefresh = false) {
  if (!isBackgroundRefresh) {
    const fromLs = readPersistedJson<any>(LS_STOREFRONT_CATALOG_BOOTSTRAP, PERSISTED_CATALOG_TTL_MS);
    if (fromLs && typeof fromLs === "object") {
      moduleCache.prime(CACHE_KEYS.STOREFRONT_CATALOG_BOOTSTRAP, fromLs);
      return {
        products: filterActiveProducts(fromLs.products),
        total: fromLs.total ?? 0,
        page: fromLs.page ?? 1,
        pageSize: fromLs.pageSize ?? 24,
        hasMore: !!fromLs.hasMore,
        dealProducts: filterActiveProducts(fromLs.dealProducts),
        newArrivals: filterActiveProducts(fromLs.newArrivals),
        sort: fromLs.sort,
      };
    }
  }

  const data = await moduleCache.get(
    CACHE_KEYS.STOREFRONT_CATALOG_BOOTSTRAP,
    () => fetchCatalogBootstrap(24),
    isBackgroundRefresh
  );

  if (data && typeof data === "object") {
    writePersistedJson(LS_STOREFRONT_CATALOG_BOOTSTRAP, data);
  }

  return {
    products: filterActiveProducts(data.products),
    total: data.total ?? 0,
    page: data.page ?? 1,
    pageSize: data.pageSize ?? 24,
    hasMore: !!data.hasMore,
    dealProducts: filterActiveProducts(data.dealProducts),
    newArrivals: filterActiveProducts(data.newArrivals),
    sort: data.sort,
  };
}

/** @deprecated Use loadCatalogBootstrapCached — kept for any legacy import */
export async function loadProductsCached(isBackgroundRefresh = false) {
  const b = await loadCatalogBootstrapCached(isBackgroundRefresh);
  return b.products;
}

export async function loadCategoriesCached() {
  try {
    console.log("Loading categories...");
    const fromLs = readPersistedJson<any[]>(LS_STOREFRONT_CATEGORIES, PERSISTED_CATALOG_TTL_MS);
    let allCategories: any[];
    if (fromLs && Array.isArray(fromLs)) {
      moduleCache.prime(CACHE_KEYS.STOREFRONT_CATEGORIES, fromLs);
      allCategories = fromLs;
    } else {
      allCategories = await moduleCache.get(CACHE_KEYS.STOREFRONT_CATEGORIES, fetchAllCategories, false);
      if (Array.isArray(allCategories)) {
        writePersistedJson(LS_STOREFRONT_CATEGORIES, allCategories);
      }
    }

    const activeCategories = (allCategories || []).filter((c: any) => c.status === "active");
    console.log(`[STOREFRONT CACHED] Loaded ${activeCategories.length} active categories`);
    return activeCategories;
  } catch (error) {
    console.error("Failed to load categories:", error);
    return [];
  }
}

export async function loadSiteSettingsCached() {
  try {
    console.log("Loading site settings...");
    const fromLs = readPersistedJson<any>(LS_STOREFRONT_SETTINGS, PERSISTED_CATALOG_TTL_MS);
    let settings: any;
    if (fromLs != null && typeof fromLs === "object") {
      moduleCache.prime(CACHE_KEYS.STOREFRONT_SETTINGS, fromLs);
      settings = fromLs;
    } else {
      settings = await moduleCache.get(CACHE_KEYS.STOREFRONT_SETTINGS, fetchSiteSettings, false);
      if (settings != null && typeof settings === "object") {
        writePersistedJson(LS_STOREFRONT_SETTINGS, settings);
      }
    }
    console.log("[STOREFRONT CACHED] Loaded site settings");
    return settings;
  } catch (error) {
    console.warn("Could not load site settings, using defaults");
    return null;
  }
}
