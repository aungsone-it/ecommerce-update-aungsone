import {
  VendorStorefrontFullSkeleton,
  VendorStorefrontProductRouteSkeleton,
} from "./SkeletonLoaders";
import { isOnVendorSubdomainHost } from "../utils/vendorSubdomainHooks";
import { shouldResolveCustomDomainHost } from "../utils/vendorHostResolution";
import {
  isMarketplaceVendorStorefrontPath,
  isVendorStorefrontProductPath,
  isVendorStorefrontSavedPath,
  normalizeStorefrontPath,
} from "../utils/vendorStorefrontRoutePaths";

const VENDOR_ROOT_RESERVED = new Set([
  "admin",
  "setup",
  "vendor",
  "store",
  "blog",
  "auth",
  "products",
  "reset-password",
  "terms",
  "privacy",
  "kpay",
  "product",
  "profile",
  "saved",
  "checkout",
  "summary",
  "order-confirmation",
]);

function normalizePath(pathname: string): string {
  return normalizeStorefrontPath(pathname);
}

function isVendorProductRoutePath(pathname: string): boolean {
  return isVendorStorefrontProductPath(pathname);
}

function isVendorSavedRoutePath(pathname: string): boolean {
  return isVendorStorefrontSavedPath(pathname);
}

function isVendorStorefrontSuspenseContext(pathname: string, hostname: string): boolean {
  const p = normalizePath(pathname);
  if (isVendorProductRoutePath(p)) return true;
  if (isMarketplaceVendorStorefrontPath(p)) return true;
  if (p === "/saved" || p.startsWith("/profile")) return true;
  if (["/checkout", "/summary", "/kpay/return", "/order-confirmation"].includes(p)) {
    return true;
  }

  const onVendorHost = isOnVendorSubdomainHost() || shouldResolveCustomDomainHost(hostname);
  if (!onVendorHost) return false;
  if (p === "/") return true;
  const first = p.split("/").filter(Boolean)[0] ?? "";
  return first.length > 0 && !VENDOR_ROOT_RESERVED.has(first);
}

function resolveStorefrontSuspenseFallback(path: string) {
  if (isVendorProductRoutePath(path)) {
    return <VendorStorefrontProductRouteSkeleton />;
  }
  if (isVendorSavedRoutePath(path)) {
    return <VendorStorefrontFullSkeleton savedLayout />;
  }
  return <VendorStorefrontFullSkeleton />;
}

/**
 * Suspense fallback for vendor storefront routes — matches in-page skeletons so
 * chunk download and data fetch feel like one continuous loading state.
 */
export function StorefrontAwareRouteFallback() {
  if (typeof window === "undefined") {
    return <RouteLoadingFallback />;
  }

  const path = window.location.pathname;
  const host = window.location.hostname;
  if (!isVendorStorefrontSuspenseContext(path, host)) {
    return <RouteLoadingFallback />;
  }
  return resolveStorefrontSuspenseFallback(path);
}

/**
 * Unified Suspense fallback — vendor storefront skeletons, then generic for admin/auth/etc.
 */
export function RouteSuspenseFallback() {
  if (typeof window === "undefined") {
    return <RouteLoadingFallback />;
  }

  const path = window.location.pathname;
  const host = window.location.hostname;

  if (isVendorStorefrontSuspenseContext(path, host)) {
    return resolveStorefrontSuspenseFallback(path);
  }
  return <RouteLoadingFallback />;
}

/** Lightweight full-width placeholder for lazy route chunks (marketplace, auth, etc.). */
export function RouteLoadingFallback() {
  return (
    <div
      className="min-h-[40vh] w-full flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-slate-50 to-white px-4 py-16"
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <div className="h-2.5 w-40 rounded-full bg-slate-200 animate-pulse" />
      <div className="h-2.5 w-28 rounded-full bg-slate-100 animate-pulse" />
      <span className="text-sm text-slate-500">Preparing page…</span>
    </div>
  );
}
