import {
  VendorStorefrontFullSkeleton,
  VendorStorefrontProductRouteSkeleton,
} from "./SkeletonLoaders";
import {
  SuperAdminPanelSkeleton,
  VendorAdminPanelSkeleton,
} from "./AdminSkeletonLoaders";
import { isOnVendorSubdomainHost } from "../utils/vendorSubdomainHooks";
import { shouldResolveCustomDomainHost } from "../utils/vendorHostResolution";

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
  return pathname.replace(/\/+$/, "") || "/";
}

function isVendorProductRoutePath(pathname: string): boolean {
  return /^\/product\/[^/]+/.test(normalizePath(pathname));
}

function isSuperAdminPath(pathname: string): boolean {
  const p = normalizePath(pathname);
  if (p === "/admin/setup" || p === "/admin/fix-slugs") return false;
  return p === "/admin" || p.startsWith("/admin/");
}

function isVendorAdminPath(pathname: string, hostname: string): boolean {
  const p = normalizePath(pathname);
  if (/^\/vendor\/[^/]+\/admin(\/|$)/.test(p)) return true;

  const onVendorHost = isOnVendorSubdomainHost() || shouldResolveCustomDomainHost(hostname);
  if (!onVendorHost) return false;
  if (p === "/admin/setup") return false;
  return p === "/admin" || p.startsWith("/admin/");
}

function isVendorStorefrontSuspenseContext(pathname: string, hostname: string): boolean {
  const p = normalizePath(pathname);
  if (isVendorProductRoutePath(p)) return true;
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
  if (isVendorProductRoutePath(path)) {
    return <VendorStorefrontProductRouteSkeleton />;
  }
  return <VendorStorefrontFullSkeleton />;
}

/** Suspense fallback for super-admin panel routes. */
export function SuperAdminRouteFallback() {
  return <SuperAdminPanelSkeleton />;
}

/** Suspense fallback for vendor admin panel routes. */
export function VendorAdminRouteFallback() {
  return <VendorAdminPanelSkeleton />;
}

/**
 * Unified Suspense fallback — admin panels, vendor storefront, then generic.
 * Use on all lazy route boundaries so first paint matches in-page loading UI.
 */
export function RouteSuspenseFallback() {
  if (typeof window === "undefined") {
    return <RouteLoadingFallback />;
  }

  const path = window.location.pathname;
  const host = window.location.hostname;

  if (isVendorAdminPath(path, host)) {
    return <VendorAdminPanelSkeleton />;
  }
  if (isSuperAdminPath(path)) {
    return <SuperAdminPanelSkeleton />;
  }
  if (isVendorStorefrontSuspenseContext(path, host)) {
    if (isVendorProductRoutePath(path)) {
      return <VendorStorefrontProductRouteSkeleton />;
    }
    return <VendorStorefrontFullSkeleton />;
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
