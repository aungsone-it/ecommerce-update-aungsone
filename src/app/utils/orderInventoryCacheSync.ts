/**
 * Client-side inventory alignment when order status changes — mirrors
 * `supabase/functions/make-server-16010b6f/index.tsx` PUT /orders/:id rules.
 * Prefer refetching `/products` after PUT (server truth for variant stock); fall back to in-memory patch.
 */

import {
  applyOrderLineStockDeltasToAdminCache,
  moduleCache,
  CACHE_KEYS,
  getCachedAdminAllProducts,
  dispatchAdminProductsCachePatched,
} from "./module-cache";

export function normalizeOrderStatus(s: string | undefined): string {
  if (s == null || s === "") return "";
  return String(s).trim().toLowerCase().replace(/\s+/g, "-");
}

function isInventoryCommitStatus(status: string | undefined): boolean {
  const n = normalizeOrderStatus(status);
  return n === "ready-to-ship" || n === "fulfilled";
}

/** Same as server: stock was committed only when flag is explicitly true. */
function physicallyReducedInventory(order: { inventoryDeducted?: boolean }): boolean {
  return order.inventoryDeducted === true;
}

export type OrderSnapshotForInventory = {
  status: string;
  inventoryDeducted?: boolean;
  /** Helps choose fast cache mirror vs server refetch (vendor storefront line items differ from main marketplace). */
  vendor?: string;
  /** Line ids are parent product ids from checkout; `sku` identifies the variant row when applicable. */
  products: { id: string; quantity: number; sku?: string }[];
};

/** Main SECURE marketplace — in-memory SKU patch matches server well. Other vendors → refetch `/products`. */
export function isMainMarketplaceVendorName(vendor: string | undefined): boolean {
  const v = String(vendor ?? "").trim().toLowerCase();
  // Missing vendor must not default to "marketplace" — ambiguous orders use server refetch (vendor-safe).
  if (!v) return false;
  return v === "secure store";
}

/**
 * After a successful PUT /orders/:id on the server, sync admin product cache.
 */
export function syncAdminInventoryCacheAfterOrderStatusChange(
  existingOrder: OrderSnapshotForInventory,
  newStatusRaw: string,
  options?: { skipDispatch?: boolean }
): void {
  const prevNorm = normalizeOrderStatus(existingOrder.status);
  const newNorm = normalizeOrderStatus(newStatusRaw);
  const wasCancelled = prevNorm === "cancelled";
  const isNowCancelled = newNorm === "cancelled";
  const items = existingOrder.products.map((p) => ({
    productId: p.id,
    quantity: p.quantity || 1,
    sku: p.sku,
  }));

  // 1) Cancel → restore only if stock had already been reduced
  if (!wasCancelled && isNowCancelled && items.length > 0 && physicallyReducedInventory(existingOrder)) {
    applyOrderLineStockDeltasToAdminCache(items, "restore", options);
    return;
  }

  // 2) Move away from ready-to-ship / fulfilled → restore (new flow only)
  if (
    items.length > 0 &&
    isInventoryCommitStatus(existingOrder.status) &&
    !isInventoryCommitStatus(newStatusRaw) &&
    !isNowCancelled &&
    existingOrder.inventoryDeducted === true
  ) {
    applyOrderLineStockDeltasToAdminCache(items, "restore", options);
    return;
  }

  // 3) First move to ready-to-ship or fulfilled → deduct once
  if (
    !isNowCancelled &&
    isInventoryCommitStatus(newStatusRaw) &&
    existingOrder.inventoryDeducted !== true &&
    items.length > 0
  ) {
    applyOrderLineStockDeltasToAdminCache(items, "deduct", options);
  }
}

/**
 * Call after a successful PUT /orders/:id.
 * - Main marketplace (SECURE): patch session cache only — instant, no full product refetch.
 * - Vendor / other shop: refetch `/products` so variant stock matches server line-item shapes.
 * - Empty admin cache: always refetch once.
 */
export async function refreshAdminInventoryAfterOrderStatusPut(
  existingOrder: OrderSnapshotForInventory,
  newStatusRaw: string,
  options?: { skipDispatch?: boolean }
): Promise<void> {
  const peeked = moduleCache.peek<unknown[]>(CACHE_KEYS.ADMIN_PRODUCTS);
  if (!peeked || !Array.isArray(peeked) || peeked.length === 0) {
    try {
      await getCachedAdminAllProducts(true);
    } catch (e) {
      console.warn("[inventory] Admin products refetch after order status update failed:", e);
    }
    if (!options?.skipDispatch) {
      dispatchAdminProductsCachePatched();
    }
    return;
  }

  if (!isMainMarketplaceVendorName(existingOrder.vendor)) {
    try {
      await getCachedAdminAllProducts(true);
    } catch (e) {
      console.warn(
        "[inventory] Vendor order: refetch failed; applying in-memory mirror",
        e
      );
      syncAdminInventoryCacheAfterOrderStatusChange(existingOrder, newStatusRaw, {
        ...options,
        skipDispatch: true,
      });
      if (!options?.skipDispatch) {
        dispatchAdminProductsCachePatched();
      }
      return;
    }
    if (!options?.skipDispatch) {
      dispatchAdminProductsCachePatched();
    }
    return;
  }

  syncAdminInventoryCacheAfterOrderStatusChange(existingOrder, newStatusRaw, options);
}
