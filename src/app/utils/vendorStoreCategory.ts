/** URL segment for vendor storefront "no category" tab. */
export const VENDOR_STORE_UNCATEGORIZED_SLUG = "uncategorized";

/** Internal filter token (API + module cache keys) — not a product.category value. */
export const VENDOR_STORE_UNCATEGORIZED_FILTER = "__uncategorized__";

export function isVendorUncategorizedSlug(slug: string): boolean {
  return String(slug || "").trim().toLowerCase() === VENDOR_STORE_UNCATEGORIZED_SLUG;
}

export function isVendorUncategorizedFilter(category: string): boolean {
  const c = String(category || "").trim();
  return c === VENDOR_STORE_UNCATEGORIZED_FILTER || isVendorUncategorizedSlug(c);
}

export function productHasNoCategory(product: { category?: string | null }): boolean {
  const raw = String(product?.category ?? "").trim();
  if (!raw) return true;
  return raw.toLowerCase() === VENDOR_STORE_UNCATEGORIZED_SLUG;
}

/** Map route slug → catalog filter param (display name or uncategorized token). */
export function vendorCatalogFilterFromRouteSlug(
  routeSlug: string,
  subnavItems: { name: string }[]
): string {
  const norm = String(routeSlug || "").trim().toLowerCase();
  if (!norm) return "all";
  if (isVendorUncategorizedSlug(norm)) return VENDOR_STORE_UNCATEGORIZED_FILTER;
  const match = subnavItems.find((c) => slugifyCategoryName(c.name) === norm);
  return match ? match.name : humanizeCategorySlug(routeSlug);
}

function slugifyCategoryName(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function humanizeCategorySlug(slug: string): string {
  return String(slug || "")
    .trim()
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function vendorCategoryPathSegment(categoryName: string): string {
  const raw = String(categoryName || "").trim();
  if (!raw || raw.toLowerCase() === "all") return "";
  if (isVendorUncategorizedFilter(raw)) return VENDOR_STORE_UNCATEGORIZED_SLUG;
  return slugifyCategoryName(raw);
}
