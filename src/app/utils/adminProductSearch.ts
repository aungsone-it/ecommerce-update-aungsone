/**
 * Aligns with storefront search throttling: min length + debounce apply when triggering
 * server `q` (catalog). Admin product grids use a single cached list + instant client filter
 * so typing never hits Supabase; these constants document parity and future server search.
 */
export const ADMIN_PORTAL_SEARCH_MIN_SERVER_CHARS = 3;
export const ADMIN_PORTAL_SEARCH_DEBOUNCE_MS = 480;

export type AdminSearchableProduct = {
  name?: string;
  title?: string;
  sku?: string;
  category?: string;
  variants?: { sku?: string }[];
};

/** Live filter while typing (no network) — empty needle shows all rows. */
export function productMatchesAdminLiveSearch(
  product: AdminSearchableProduct,
  liveTrimmed: string
): boolean {
  const raw = liveTrimmed.trim();
  if (!raw) return true;
  const q = raw.toLowerCase();
  const name = String(product.name ?? product.title ?? "").toLowerCase();
  const sku = String(product.sku ?? "").toLowerCase();
  const cat = String(product.category ?? "").toLowerCase();
  if (name.includes(q) || sku.includes(q) || cat.includes(q)) return true;
  const vars = product.variants;
  if (Array.isArray(vars)) {
    for (const v of vars) {
      if (String(v?.sku ?? "").toLowerCase().includes(q)) return true;
    }
  }
  return false;
}
