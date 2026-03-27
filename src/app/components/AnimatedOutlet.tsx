import { Outlet, useLocation } from "react-router";
import { resolveVendorSubdomainStoreSlug } from "../utils/vendorSubdomainHooks";

/**
 * AnimatedOutlet - INSTANT TRANSITIONS (NO BLINKING)
 * Provides instant page transitions without any fade animations
 * Smart grouping: Routes that share components don't trigger re-renders
 */
export function AnimatedOutlet() {
  const location = useLocation();

  // Group routes by component to prevent unnecessary re-renders
  // All storefront routes should be treated as one "page" for rendering purposes
  const getRouteGroup = (pathname: string): string => {
    // Vendor subdomain home is / but must not share the "landing" group (avoids remount/state bugs).
    if (pathname === "/") {
      const subSlug = resolveVendorSubdomainStoreSlug();
      if (subSlug) return `vendor-subdomain-${subSlug}`;
      return "landing";
    }

    // Storefront routes (all use StorefrontPage component)
    if (
      pathname === "/store" ||
      pathname.startsWith("/products") ||
      pathname.startsWith("/product/") ||
      pathname.startsWith("/checkout") ||
      pathname.startsWith("/order-confirmation") ||
      pathname.startsWith("/profile") ||
      pathname.startsWith("/saved") ||
      pathname.startsWith("/blog")
    ) {
      return "storefront";
    }

    // Admin routes (must check early to avoid conflicts)
    if (pathname.startsWith("/admin") && !pathname.startsWith("/vendor/")) {
      return "admin";
    }

    // Auth pages (check before vendor routes)
    if (pathname === "/auth" || pathname === "/vendor/login") {
      return "auth";
    }

    // Setup pages (check before vendor routes)
    if (pathname === "/setup" || pathname === "/vendor/setup" || pathname === "/vendor/application") {
      return "setup";
    }

    // Vendor admin: /store/<slug>/admin (same grouping as legacy /vendor/.../admin)
    if (pathname.startsWith("/store/") && pathname.includes("/admin")) {
      const parts = pathname.split("/");
      const vendorSlug = parts[2] || "unknown";
      return `vendor-admin-${vendorSlug}`;
    }

    // Vendor admin routes (legacy /vendor/.../admin)
    if (pathname.startsWith("/vendor/") && pathname.includes("/admin")) {
      const parts = pathname.split("/");
      const vendorSlug = parts[2] || "unknown";
      return `vendor-admin-${vendorSlug}`; // Group by vendor
    }

    // Vendor storefront routes (both /store/ and legacy /vendor/)
    if (pathname.startsWith("/store/") || pathname.startsWith("/vendor/")) {
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