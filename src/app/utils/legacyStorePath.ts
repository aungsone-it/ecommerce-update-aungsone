/**
 * Maps legacy marketplace URLs to canonical paths.
 * Apex marketplace routes (/products, /profile, …) are removed — only vendor paths remain.
 */
export function legacyStorePathToCanonical(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (path === "/store" || path === "/products") return "/";

  if (
    path === "/store/checkout" ||
    path === "/store/checkout/success" ||
    path === "/store/summary" ||
    path === "/checkout" ||
    path === "/checkout/success" ||
    path === "/summary" ||
    path === "/order-confirmation" ||
    path.startsWith("/product/") ||
    path.startsWith("/profile") ||
    path === "/saved" ||
    path.startsWith("/blog")
  ) {
    return null;
  }

  if (path === "/store/reset-password") return "/reset-password";

  const vendorReset = path.match(/^\/store\/([^/]+)\/reset-password$/);
  if (vendorReset) {
    return `/vendor/${encodeURIComponent(decodeURIComponent(vendorReset[1]))}/reset-password`;
  }

  if (path.startsWith("/store/")) {
    return path.replace(/^\/store\//, "/vendor/");
  }

  return null;
}
