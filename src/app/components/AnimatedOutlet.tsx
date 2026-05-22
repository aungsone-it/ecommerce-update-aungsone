import { Outlet, useLocation } from "react-router";
import {
  pathnameUnderAdmin,
  resolveVendorSubdomainStoreSlug,
} from "../utils/vendorSubdomainHooks";
import { useResolvedVendorHostSlug } from "../utils/vendorHostResolution";

/**
 * AnimatedOutlet - INSTANT TRANSITIONS (NO BLINKING)
 * Provides instant page transitions without any fade animations
 * Smart grouping: Routes that share components don't trigger re-renders
 */
export function AnimatedOutlet() {
  const location = useLocation();
  const { slug: resolvedVendorHostSlug } = useResolvedVendorHostSlug();

  // Group routes by component to prevent unnecessary re-renders
  // All storefront routes should be treated as one "page" for rendering purposes
  const getRouteGroup = (pathname: string): string => {
    const subSlug = resolveVendorSubdomainStoreSlug();
    const vendorOnlyStoreGroup = subSlug
      ? `vendor-subdomain-${subSlug}`
      : resolvedVendorHostSlug
        ? `vendor-custom-home-${resolvedVendorHostSlug}`
        : null;

    // Vendor-only host home must not share the "landing" group (avoids remount/state bugs).
    if (pathname === "/") {
      if (vendorOnlyStoreGroup) return vendorOnlyStoreGroup;
      return "landing";
    }

    // Vendor-only host: storefront routes must stay in one group so key stays stable
    // across /, /product/*, /saved, /profile/*, /checkout, /order-confirmation,
    // and category slugs like /clothing.
    if (vendorOnlyStoreGroup) {
      const first = pathname.split("/").filter(Boolean)[0] || "";
      const isVendorStorefrontRootPath =
        pathname === "/" ||
        pathname.startsWith("/product/") ||
        pathname === "/saved" ||
        pathname.startsWith("/profile") ||
        pathname === "/checkout" ||
        pathname === "/summary" ||
        pathname === "/kpay/return" ||
        pathname === "/order-confirmation";
      const vendorRootReserved = new Set([
        "admin",
        "setup",
        "vendor",
        "store",
        "blog",
        "auth",
      ]);
      if (isVendorStorefrontRootPath || (first && !vendorRootReserved.has(first))) {
        return vendorOnlyStoreGroup;
      }
    }

    // Admin routes (must check early to avoid conflicts)
    if (pathnameUnderAdmin(pathname) && !pathname.startsWith("/vendor/")) {
      const subSlug = resolveVendorSubdomainStoreSlug();
      if (subSlug) return `vendor-admin-subdomain-${subSlug}`;
      if (resolvedVendorHostSlug) return `vendor-admin-custom-${resolvedVendorHostSlug}`;
      return "admin";
    }

    // Auth pages (check before vendor routes)
    if (pathname === "/auth" || pathname === "/vendor/login") {
      return "auth";
    }

    // Setup pages (check before vendor routes)
    if (pathname === "/setup" || pathname === "/admin/setup" || pathname === "/vendor/setup" || pathname === "/vendor/application") {
      return "setup";
    }

    // Vendor admin routes (/vendor/.../admin)
    if (pathname.startsWith("/vendor/") && pathname.includes("/admin")) {
      const parts = pathname.split("/");
      const vendorSlug = parts[2] || "unknown";
      return `vendor-admin-${vendorSlug}`; // Group by vendor
    }

    // Vendor storefront routes (both /store/ and legacy /vendor/)
    if (pathname.startsWith("/vendor/")) {
      const parts = pathname.split("/");
      const vendorSlug = parts[2] || "unknown";
      return `vendor-store-${vendorSlug}`; // Group by vendor
    }

    // Default: use full pathname for other routes
    return pathname;
  };

  const routeGroup = getRouteGroup(location.pathname);

  // Remove AnimatePresence completely - instant transitions only
  return (
    <div
      key={routeGroup} // Use route group to prevent unnecessary re-renders
      style={{
        position: "relative",
        width: "100%",
      }}
    >
      <Outlet />
    </div>
  );
}