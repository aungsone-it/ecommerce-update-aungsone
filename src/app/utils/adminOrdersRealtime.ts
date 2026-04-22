const ADMIN_ORDERS_UPDATED_STORAGE_KEY = "migoo-admin-orders-updated-at";

export function adminOrdersUpdatedStorageKey(): string {
  return ADMIN_ORDERS_UPDATED_STORAGE_KEY;
}

/** Broadcast order mutations to this tab + other tabs (via storage event). */
export function notifyAdminOrdersUpdated(reason = "orders-mutated"): void {
  if (typeof window === "undefined") return;
  const at = Date.now();
  try {
    localStorage.setItem(ADMIN_ORDERS_UPDATED_STORAGE_KEY, String(at));
  } catch {
    // Best effort only.
  }
  window.dispatchEvent(new CustomEvent("adminOrdersUpdated", { detail: { at, reason } }));
}
