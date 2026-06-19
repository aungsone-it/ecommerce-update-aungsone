/** Shared path heuristics for vendor customer storefront (Suspense fallbacks, prefetch). */

const MARKETPLACE_VENDOR_NON_STOREFRONT = new Set(["application", "setup", "login"]);

export function normalizeStorefrontPath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

export function isMarketplaceVendorStorefrontPath(pathname: string): boolean {
  const p = normalizeStorefrontPath(pathname);

  const slashVendor = p.match(/^\/vendor\/([^/]+)(?:\/(.*))?$/);
  if (slashVendor) {
    const segment = slashVendor[1].toLowerCase();
    if (MARKETPLACE_VENDOR_NON_STOREFRONT.has(segment)) return false;
    if (/^\/vendor\/[^/]+\/admin(\/|$)/.test(p)) return false;
    return true;
  }

  return /^\/vendor-[^/]+(\/|$)/.test(p);
}

export function isVendorStorefrontProductPath(pathname: string): boolean {
  const p = normalizeStorefrontPath(pathname);
  if (/^\/product\/[^/]+/.test(p)) return true;
  if (/^\/vendor\/[^/]+\/product\/[^/]+/.test(p)) return true;
  if (/^\/vendor-[^/]+\/product\/[^/]+/.test(p)) return true;
  return false;
}

export function isVendorStorefrontSavedPath(pathname: string): boolean {
  const p = normalizeStorefrontPath(pathname);
  return p === "/saved" || /\/saved$/.test(p);
}
