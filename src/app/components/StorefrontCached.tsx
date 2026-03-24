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
  const data = await moduleCache.get(
    CACHE_KEYS.STOREFRONT_CATALOG_BOOTSTRAP,
    () => fetchCatalogBootstrap(24),
    isBackgroundRefresh
  );
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
    const allCategories = await moduleCache.get(
      CACHE_KEYS.STOREFRONT_CATEGORIES,
      fetchAllCategories,
      false
    );

    // Only show active categories on storefront
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
    const settings = await moduleCache.get(
      CACHE_KEYS.STOREFRONT_SETTINGS,
      fetchSiteSettings,
      false
    );
    console.log("[STOREFRONT CACHED] Loaded site settings");
    return settings;
  } catch (error) {
    console.warn("Could not load site settings, using defaults");
    return null;
  }
}
