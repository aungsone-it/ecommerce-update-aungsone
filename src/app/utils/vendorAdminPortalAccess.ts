import { resolveVendorSubdomainStoreSlug } from "./vendorSubdomainHooks";
import {
  pathVendorStoreSlugFromPathname,
  resolveVendorPathSlug,
  vendorPathStoreSlugsMatch,
} from "./vendorStorePaths";

export type VendorAdminPortalContext = {
  /** Canonical store slug for this admin URL (e.g. go-go, migoo). */
  expectedStoreSlug: string | null;
  /** True when auth must match `expectedStoreSlug` (vendor host or /vendor/:slug/admin). */
  requiresMatch: boolean;
};

function pathnameIsVendorScopedAdmin(pathname: string): boolean {
  const path = String(pathname || "");
  if (path === "/admin" || path.startsWith("/admin/")) return true;
  return /^\/vendor\/[^/]+\/admin(?:\/|$)/i.test(path);
}

/**
 * Resolve which vendor store slug owns the current admin portal URL.
 * Returns null on platform super-admin `/admin` (apex with no vendor host).
 */
export function resolveVendorAdminPortalContext(input?: {
  pathname?: string;
  subdomainSlug?: string | null;
  customHostSlug?: string | null;
  routeStoreName?: string | null;
}): VendorAdminPortalContext {
  const pathname =
    input?.pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");

  if (!pathnameIsVendorScopedAdmin(pathname)) {
    return { expectedStoreSlug: null, requiresMatch: false };
  }

  const pathSegment = pathVendorStoreSlugFromPathname(pathname);
  if (pathSegment && /\/vendor\/[^/]+\/admin/i.test(pathname)) {
    return {
      expectedStoreSlug: resolveVendorPathSlug(pathSegment),
      requiresMatch: true,
    };
  }

  const subdomainSlug =
    input?.subdomainSlug ??
    (typeof window !== "undefined" ? resolveVendorSubdomainStoreSlug() : null);
  if (subdomainSlug) {
    return {
      expectedStoreSlug: resolveVendorPathSlug(subdomainSlug),
      requiresMatch: true,
    };
  }

  const customHostSlug = String(input?.customHostSlug || "").trim();
  if (customHostSlug) {
    return {
      expectedStoreSlug: resolveVendorPathSlug(customHostSlug),
      requiresMatch: true,
    };
  }

  const routeStoreName = String(input?.routeStoreName || "").trim();
  if (routeStoreName) {
    return {
      expectedStoreSlug: resolveVendorPathSlug(routeStoreName),
      requiresMatch: true,
    };
  }

  return { expectedStoreSlug: null, requiresMatch: false };
}

export function vendorAuthMatchesAdminPortal(
  authStoreSlug: string | null | undefined,
  expectedStoreSlug: string | null | undefined
): boolean {
  const expected = String(expectedStoreSlug || "").trim();
  if (!expected) return true;
  const auth = String(authStoreSlug || "").trim();
  if (!auth) return false;
  return vendorPathStoreSlugsMatch(expected, auth);
}

export function vendorAdminPortalMismatchMessage(
  expectedStoreSlug: string | null | undefined,
  authStoreSlug?: string | null
): string {
  const portal = humanizeSlugLabel(expectedStoreSlug);
  const account = humanizeSlugLabel(authStoreSlug);
  if (account) {
    return `This admin portal is for ${portal}. Your account belongs to ${account}. Sign in with the correct vendor account for this store URL.`;
  }
  return `This admin portal is for ${portal}. Sign in with the vendor account registered for this store URL.`;
}

function humanizeSlugLabel(slug: string | null | undefined): string {
  const raw = String(slug || "").trim();
  if (!raw) return "this store";
  return raw
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
