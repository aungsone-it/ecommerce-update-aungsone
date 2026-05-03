const ADMIN_ORDERS_UPDATED_STORAGE_KEY = "migoo-admin-orders-updated-at";

/** Set when order data changed on the server (storefront checkout, admin mutations, cache invalidation). */
const SS_SUPER_ADMIN_FINANCES_STALE = "migoo-ss-super-admin-finances-stale-v1";

export function adminOrdersUpdatedStorageKey(): string {
  return ADMIN_ORDERS_UPDATED_STORAGE_KEY;
}

/** Super-admin Finances must not trust LS/module snapshot until the next network revalidation. */
export function markSuperAdminFinancesSessionStale(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SS_SUPER_ADMIN_FINANCES_STALE, "1");
  } catch {
    /* ignore */
  }
}

export function isSuperAdminFinancesSessionStale(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(SS_SUPER_ADMIN_FINANCES_STALE) === "1";
  } catch {
    return false;
  }
}

/** Clears the flag and returns whether a forced finances refetch was needed. */
export function consumeSuperAdminFinancesSessionStale(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    if (sessionStorage.getItem(SS_SUPER_ADMIN_FINANCES_STALE) !== "1") return false;
    sessionStorage.removeItem(SS_SUPER_ADMIN_FINANCES_STALE);
    return true;
  } catch {
    return false;
  }
}

/** Broadcast order mutations to this tab + other tabs (via storage event). */
export function notifyAdminOrdersUpdated(reason = "orders-mutated"): void {
  if (typeof window === "undefined") return;
  if (
    reason === "storefront-order-created" ||
    reason === "storefront-checkout-order-created" ||
    reason === "invalidate-admin-orders-cache" ||
    reason === "realtime-order-pulse"
  ) {
    markSuperAdminFinancesSessionStale();
  }
  const at = Date.now();
  try {
    localStorage.setItem(ADMIN_ORDERS_UPDATED_STORAGE_KEY, String(at));
  } catch {
    // Best effort only.
  }
  window.dispatchEvent(new CustomEvent("adminOrdersUpdated", { detail: { at, reason } }));
}
