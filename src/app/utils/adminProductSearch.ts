import { useEffect, useState } from "react";

/**
 * Same thresholds as vendor storefront (`VendorStoreView`): no server `q` until the box has enough
 * characters, then one debounced request after typing pauses. Clearing the box flushes `q` immediately.
 */
export const ADMIN_PORTAL_SEARCH_MIN_SERVER_CHARS = 3;
/** Aligned with `VENDOR_SEARCH_DEBOUNCE_MS` in VendorStoreView.tsx */
export const ADMIN_PORTAL_SEARCH_DEBOUNCE_MS = 450;

/**
 * Super-admin list search: mirrors vendor catalog search — `""` until trim length ≥ min chars, then
 * debounced server `q`. Sub-minimum input keeps server `q` empty (live client filter only on the page).
 */
export function useAdminPortalDebouncedSearch(live: string): string {
  const [debounced, setDebounced] = useState(() => {
    const t = live.trim();
    return t.length >= ADMIN_PORTAL_SEARCH_MIN_SERVER_CHARS ? t : "";
  });
  useEffect(() => {
    const raw = live.trim();
    if (raw === "") {
      setDebounced("");
      return;
    }
    if (raw.length < ADMIN_PORTAL_SEARCH_MIN_SERVER_CHARS) {
      setDebounced("");
      return;
    }
    const id = window.setTimeout(
      () => setDebounced(raw),
      ADMIN_PORTAL_SEARCH_DEBOUNCE_MS
    );
    return () => window.clearTimeout(id);
  }, [live]);
  return debounced;
}

export type AdminSearchableProduct = {
  id?: string;
  name?: string;
  title?: string;
  sku?: string;
  category?: string;
  variants?: { sku?: string }[];
};

/** Live filter while typing (no network) — empty needle shows all rows. Same fields as main storefront catalog search. */
export function productMatchesAdminLiveSearch(
  product: AdminSearchableProduct,
  liveTrimmed: string
): boolean {
  const raw = liveTrimmed.trim();
  if (!raw) return true;
  const q = raw.toLowerCase();
  const name = String(product.name ?? product.title ?? "").toLowerCase();
  const sku = String(product.sku ?? "").toLowerCase();
  const id = String(product.id ?? "").toLowerCase();
  const cat = String(product.category ?? "").toLowerCase();
  if (name.includes(q) || sku.includes(q) || id.includes(q) || cat.includes(q)) return true;
  const vars = product.variants;
  if (Array.isArray(vars)) {
    for (const v of vars) {
      if (String(v?.sku ?? "").toLowerCase().includes(q)) return true;
    }
  }
  return false;
}
