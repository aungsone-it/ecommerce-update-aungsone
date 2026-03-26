/**
 * Client-side stock cache updates when order status changes — mirrors
 * `supabase/functions/make-server-16010b6f/index.tsx` PUT /orders/:id rules.
 * No Supabase product list fetches; only patches ADMIN_PRODUCTS in memory.
 */

import { applyOrderLineStockDeltasToAdminCache } from "./module-cache";

export function normalizeOrderStatus(s: string | undefined): string {
  if (s == null || s === "") return "";
  return String(s).trim().toLowerCase().replace(/\s+/g, "-");
}

function isInventoryCommitStatus(status: string | undefined): boolean {
  const n = normalizeOrderStatus(status);
  return n === "ready-to-ship" || n === "fulfilled";
}

/** Same as server: false = not yet committed at order level */
function physicallyReducedInventory(order: { inventoryDeducted?: boolean }): boolean {
  return order.inventoryDeducted !== false;
}

export type OrderSnapshotForInventory = {
  status: string;
  inventoryDeducted?: boolean;
  products: { id: string; quantity: number }[];
};

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
    existingOrder.inventoryDeducted === false &&
    items.length > 0
  ) {
    applyOrderLineStockDeltasToAdminCache(items, "deduct", options);
  }
}
