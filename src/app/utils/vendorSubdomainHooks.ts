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

export type VendorSubdomainHostContext = {
  /** e.g. gogo.walwal.online — any non-reserved single-label subdomain on the platform apex. */
  isVendorSubdomainHost: boolean;
  /** Host label before the apex (e.g. gogo, gogot). */
  label: string | null;
  /** Mapped store slug candidate for API lookup (e.g. go-go), or null when not a vendor host. */
  storeSlugCandidate: string | null;
};

/** Parse vendor subdomain host from hostname + configured/derived apex. */
export function resolveVendorSubdomainHostContext(
  hostname?: string,
): VendorSubdomainHostContext {
  const base = getVendorSubdomainBase();
  if (!base || typeof window === "undefined") {
    return { isVendorSubdomainHost: false, label: null, storeSlugCandidate: null };
  }
  const host = (hostname ?? window.location.hostname).toLowerCase();
  if (!host.endsWith(`.${base}`)) {
    return { isVendorSubdomainHost: false, label: null, storeSlugCandidate: null };
  }
  if (host === base || host === `www.${base}`) {
    return { isVendorSubdomainHost: false, label: null, storeSlugCandidate: null };
  }
  const label = host.slice(0, -(base.length + 1)).toLowerCase();
  if (!label || label.includes(".") || RESERVED_SUBDOMAINS.has(label)) {
    return { isVendorSubdomainHost: false, label: null, storeSlugCandidate: null };
  }
  return {
    isVendorSubdomainHost: true,
    label,
    storeSlugCandidate: getStoreSlugFromSubdomainLabel(label),
  };
}

/** True on vendor subdomain hosts like gogo.walwal.online (including unknown labels). */
export function isOnVendorSubdomainHost(hostname?: string): boolean {
  return resolveVendorSubdomainHostContext(hostname).isVendorSubdomainHost;
}

/** Marketplace home URL when leaving an invalid/unknown vendor subdomain storefront. */
export function getVendorSubdomainMarketplaceHomeUrl(): string {
  if (typeof window === "undefined") return "/";
  const base = getVendorSubdomainBase();
  if (base && base !== "localhost") {
    return `${window.location.protocol}//${base}/`;
  }
  return "/";
}

/** Real store slug for the current vendor subdomain host (e.g. gogo.walwal.online → go-go), or null if not a vendor host. */
export function resolveVendorSubdomainStoreSlug(): string | null {
  return resolveVendorSubdomainHostContext().storeSlugCandidate;
}

/** `/admin` or `/admin/...` (avoids matching `/administrator`). Case- and trailing-slash tolerant. */
export function pathnameUnderAdmin(pathname: string): boolean {
  const p = (pathname.replace(/\/+$/, "") || "/").toLowerCase();
  return p === "/admin" || p.startsWith("/admin/");
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

const VENDOR_ADMIN_TOP_SEGMENTS = new Set([
  "dashboard",
  "products",
  "categories",
  "orders",
  "settings",
  "finances",
  "users",
  "marketing",
]);

/**
 * Parse `/admin`, `/admin/orders`, `/admin/products/:id/view`, and deeper paths like
 * `/admin/orders/:orderId` on a vendor host (`/admin/*` after VendorProtectedLayout).
 * Returns null only for paths that are clearly not vendor admin (e.g. `/admin/foo/bar` with unknown root).
 */
export function parseVendorSubdomainAdminPath(
  pathname: string,
  storeSlug: string
): ParsedVendorSubdomainAdminPath | null {
  if (!pathnameUnderAdmin(pathname)) return null;
  const pathTrim = pathname.replace(/\/+$/, "") || "/";
  const m = pathTrim.match(/^\/admin(?:\/(.*))?$/i);
  const rawTail = (m?.[1] ?? "").replace(/\/+$/, "");
  const normalized = rawTail.replace(/^\/+|\/+$/g, "");
  const viewMatch = normalized.match(/^products\/([^/]+)\/view$/i);
  if (viewMatch) {
    return { storeName: storeSlug, productId: viewMatch[1] };
  }
  if (!normalized) {
    return { storeName: storeSlug };
  }
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 1) {
    return { storeName: storeSlug, section: segments[0] };
  }
  const first = segments[0] ?? "";
  const firstLower = first.toLowerCase();
  if (VENDOR_ADMIN_TOP_SEGMENTS.has(firstLower)) {
    return { storeName: storeSlug, section: firstLower };
  }
  return null;
}

