# 🚀 Module-Level Caching Implementation Plan

## ✅ COMPLETED
1. **Created `/src/app/utils/module-cache.ts`** - Singleton cache utility with pre-configured fetchers
2. **Vendor Storefront (`/src/app/components/VendorStoreView.tsx`)** - Fully implemented module-level caching

## 📋 TODO - Implement Caching in These Files:

### 1. **SECURE Storefront** (`/src/app/components/Storefront.tsx`)
**Current Issue:** Lines 1191-1252 - `loadProducts()` fetches on EVERY navigation
**Fix:**
```typescript
import { moduleCache, CACHE_KEYS, fetchAllProducts, fetchAllCategories, fetchSiteSettings } from "../utils/module-cache";

const loadProducts = useCallback(async (isBackgroundRefresh = false) => {
  try {
    const products = await moduleCache.get(
      CACHE_KEYS.STOREFRONT_PRODUCTS,
      fetchAllProducts,
      isBackgroundRefresh
    );
    
    // Filter active products
    const activeProducts = products.filter(p => !p.status || p.status === 'active');
    
    if (!isBackgroundRefresh) {
      setProducts(activeProducts);
    }
  } catch (error) {
    console.error("❌ Failed to load products:", error);
  }
}, []);

const loadCategories = useCallback(async () => {
  try {
    const categories = await moduleCache.get(
      CACHE_KEYS.STOREFRONT_CATEGORIES,
      fetchAllCategories,
      false
    );
    setCategories(categories);
  } catch (error) {
    console.error("❌ Failed to load categories:", error);
  }
}, []);

const loadSiteSettings = useCallback(async () => {
  try {
    const settings = await moduleCache.get(
      CACHE_KEYS.STOREFRONT_SETTINGS,
      fetchSiteSettings,
      false
    );
    setSiteSettings(settings);
  } catch (error) {
    console.warn("⚠️ Could not load site settings");
  }
}, []);
```

### 2. **SECURE Admin - VendorProfile.tsx** (`/src/app/components/VendorProfile.tsx`)
**Current Issue:** Lines 169-231 - Fetches products and orders on every mount
**Fix:**
```typescript
import { moduleCache, CACHE_KEYS, fetchAllProducts, fetchAllOrders } from "../utils/module-cache";

const loadProducts = async () => {
  setIsLoadingProducts(true);
  try {
    const products = await moduleCache.get(
      CACHE_KEYS.ADMIN_PRODUCTS,
      fetchAllProducts,
      false
    );
    // Filter and set products
  } finally {
    setIsLoadingProducts(false);
  }
};

const loadOrders = async () => {
  setIsLoadingOrders(true);
  try {
    const orders = await moduleCache.get(
      CACHE_KEYS.ADMIN_ORDERS,
      fetchAllOrders,
      false
    );
    // Set orders
  } finally {
    setIsLoadingOrders(false);
  }
};
```

### 3. **SECURE Admin - Vendor.tsx** (`/src/app/components/Vendor.tsx`)
**Current Issue:** Fetches vendors list on every mount
**Fix:**
```typescript
import { moduleCache, CACHE_KEYS, fetchAllVendors } from "../utils/module-cache";

const loadVendors = async () => {
  try {
    const vendors = await moduleCache.get(
      CACHE_KEYS.ADMIN_VENDORS,
      fetchAllVendors,
      false
    );
    setVendors(vendors);
  } catch (error) {
    console.error("❌ Failed to load vendors:", error);
  }
};

// IMPORTANT: Invalidate cache after mutations
const handleAddVendor = async (vendorData) => {
  // ... add vendor
  moduleCache.invalidate(CACHE_KEYS.ADMIN_VENDORS); // Force refresh on next load
};

const handleDeleteVendor = async (vendorId) => {
  // ... delete vendor
  moduleCache.invalidate(CACHE_KEYS.ADMIN_VENDORS); // Force refresh on next load
};
```

### 4. **Vendor Admin - VendorAdminOrderManagement.tsx** (`/src/app/components/vendor-admin/VendorAdminOrderManagement.tsx`)
**Current Issue:** Line 166 - Fetches orders on every mount
**Fix:**
```typescript
import { moduleCache, CACHE_KEYS, fetchVendorOrders } from "../../utils/module-cache";

const loadOrders = async (forceRefresh = false) => {
  setIsLoading(true);
  try {
    const orders = await moduleCache.get(
      CACHE_KEYS.vendorOrders(vendorId),
      () => fetchVendorOrders(vendorId),
      forceRefresh
    );
    setOrders(orders);
  } finally {
    setIsLoading(false);
  }
};
```

### 5. **Vendor Admin - Main Page** (Find the component that loads vendor's own products)
**Fix:** Same pattern as vendor storefront

---

## 🎯 EXPECTED IMPACT

### Before Module-Level Caching:
- **Total Requests:** 20,977
  - Storage: 15,036
  - Database: 5,373
  - API: 63

### After Module-Level Caching:
- **Total Requests:** ~100-500 (99% reduction!)
  - Storage: ~50-100 (first load only)
  - Database: ~30-50 (first load only)
  - API: ~20-30

### User Experience:
- ✅ First navigation: ~2-3s (normal)
- ✅ All subsequent navigations: **INSTANT** (0ms, data from cache)
- ✅ No loading spinners after initial load
- ✅ Premium, buttery-smooth experience

---

## 🔄 CACHE INVALIDATION STRATEGY

### When to Invalidate Cache:
1. **After mutations (CRUD operations):**
   ```typescript
   // After adding/editing/deleting vendor
   moduleCache.invalidate(CACHE_KEYS.ADMIN_VENDORS);
   
   // After adding/editing/deleting product
   moduleCache.invalidate(CACHE_KEYS.ADMIN_PRODUCTS);
   moduleCache.invalidate(CACHE_KEYS.STOREFRONT_PRODUCTS);
   moduleCache.invalidate(CACHE_KEYS.vendorProducts(vendorId));
   
   // After order status change
   moduleCache.invalidate(CACHE_KEYS.ADMIN_ORDERS);
   moduleCache.invalidate(CACHE_KEYS.vendorOrders(vendorId));
   ```

2. **Manual refresh button:**
   ```typescript
   <Button onClick={() => {
     moduleCache.clear(); // Clear ALL cache
     loadData();
   }}>
     Refresh Data
   </Button>
   ```

3. **Timed auto-refresh (optional):**
   ```typescript
   // Refresh cache every 5 minutes in background
   useEffect(() => {
     const interval = setInterval(() => {
       moduleCache.clear();
       loadData();
     }, 5 * 60 * 1000);
     return () => clearInterval(interval);
   }, []);
   ```

---

## ✅ IMPLEMENTATION CHECKLIST

- [x] Create `/src/app/utils/module-cache.ts`
- [x] Vendor Storefront caching
- [ ] SECURE Storefront caching
- [ ] SECURE Admin - VendorProfile.tsx
- [ ] SECURE Admin - Vendor.tsx
- [ ] SECURE Admin - Orders.tsx (if exists)
- [ ] Vendor Admin - VendorAdminOrderManagement.tsx
- [ ] Vendor Admin - Products page
- [ ] Add cache invalidation to ALL mutation operations (add/edit/delete)

---

## 📊 HOW TO VERIFY IT'S WORKING

1. **Open browser console**
2. **Navigate to any page** - You should see:
   ```
   ❌ [MODULE CACHE MISS] storefront-products - Fetching...
   💾 [MODULE CACHE] Saved storefront-products
   ```

3. **Navigate to another page and back** - You should see:
   ```
   ✅ [MODULE CACHE HIT] storefront-products (cached at 10:30:45 AM)
   ```

4. **Check Supabase dashboard** - Requests should drop dramatically

5. **Navigation should be INSTANT** - No loading spinners except first load

---

## 🚨 IMPORTANT NOTES

1. **Cache persists for entire browser session** (until page refresh)
2. **Mutations MUST invalidate cache** or users will see stale data
3. **Force refresh available** via `forceRefresh: true` parameter
4. **Each vendor has separate cache** using vendorId
5. **Cache is shared across components** - Storefront and Admin share the same products cache

---

## 💡 DEBUGGING

Check cache stats in console:
```typescript
console.log(moduleCache.getStats());
// Output: { entries: 5, loading: 0, keys: ['storefront-products', 'vendor-products-123', ...] }
```

Clear cache manually:
```typescript
moduleCache.clear();
```

Peek at cache without fetching:
```typescript
const cachedProducts = moduleCache.peek(CACHE_KEYS.STOREFRONT_PRODUCTS);
if (cachedProducts) {
  console.log('Already have products:', cachedProducts.length);
}
```
