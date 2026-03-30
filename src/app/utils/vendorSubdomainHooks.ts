import { useParams, useLocation } from "react-router";
import { getVendorSubdomainBase } from "./vendorSubdomainBase";
import { getStoreSlugFromSubdomainLabel } from "./subdomainSlugMap";

const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "admin",
  "app",
  "cdn",
  "mail",
  "ftp",
  "staging",
  "preview",
]);

/** Real store slug for the current vendor subdomain host (e.g. gogo.walwal.online → go-go), or null if not a vendor host. */
export function resolveVendorSubdomainStoreSlug(): string | null {
  const base = getVendorSubdomainBase();
  if (!base || typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  if (!host.endsWith(`.${base}`)) return null;
  if (host === base || host === `www.${base}`) return null;
  const label = host.slice(0, -(base.length + 1));
  if (!label || RESERVED_SUBDOMAINS.has(label)) return null;
  return getStoreSlugFromSubdomainLabel(label);
}

/** `/admin` or `/admin/...` (avoids matching `/administrator`). */
export function pathnameUnderAdmin(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** Super-admin `/admin`, vendor-host `/admin`, and marketplace `/store|vendor/:slug/admin` panels — hide storefront-only UI (e.g. FloatingChat). */
export function isAdminPortalRoute(pathname: string): boolean {
  if (pathnameUnderAdmin(pathname)) return true;
  return /\/(store|vendor)\/[^/]+\/admin(?:\/|$)/.test(pathname);
}

/** True when the vendor panel should use paths under `/admin` (vendor subdomain host), not `/store/{slug}/admin`. */
export function isVendorSubdomainAdminPath(pathname: string): boolean {
  return !!resolveVendorSubdomainStoreSlug() && pathnameUnderAdmin(pathname);
}

export type ParsedVendorSubdomainAdminPath = {
  storeName: string;
  section?: string;
  productId?: string;
};

/**
 * Parse `/admin`, `/admin/orders`, `/admin/products/:id/view` on a vendor subdomain into route params.
 * Returns null for paths that are not valid vendor-admin URLs (e.g. `/admin/foo/bar`).
 */
export function parseVendorSubdomainAdminPath(
  pathname: string,
  storeSlug: string
): ParsedVendorSubdomainAdminPath | null {
  if (!pathnameUnderAdmin(pathname)) return null;
  const subPath = pathname.replace(/^\/admin\/?/, "").replace(/\/+$/, "");
  const normalized = subPath.replace(/^\/+|\/+$/g, "");
  const viewMatch = normalized.match(/^products\/([^/]+)\/view$/);
  if (viewMatch) {
    return { storeName: storeSlug, productId: viewMatch[1] };
  }
  if (!normalized) {
    return { storeName: storeSlug };
  }
  if (/^[^/]+$/.test(normalized)) {
    return { storeName: storeSlug, section: normalized };
  }
  return null;
}

/**
 * Merges React Router params with vendor-subdomain `/admin/*` parsing so vendor admin works on both
 * `storeSlug.walwal.online/admin` and `/store/{slug}/admin`.
 */
export function useVendorAdminRouteParams(): {
  storeName?: string;
  section?: string;
  productId?: string;
} {
  const params = useParams();
  const loc = useLocation();
  const subSlug = resolveVendorSubdomainStoreSlug();
  if (subSlug && pathnameUnderAdmin(loc.pathname)) {
    const parsed = parseVendorSubdomainAdminPath(loc.pathname, subSlug);
    if (parsed) {
      return {
        storeName: parsed.storeName,
        section: parsed.section,
        productId: parsed.productId,
      };
    }
  }
  return {
    storeName: params.storeName,
    section: params.section,
    productId: params.productId,
  };
}
