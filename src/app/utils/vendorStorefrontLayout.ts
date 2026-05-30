/** Matches mobile sticky purchase bar padding in VendorStoreView product detail. */
export const VENDOR_MOBILE_STICKY_PURCHASE_BAR_OFFSET =
  "calc(5.5rem + env(safe-area-inset-bottom, 0px))";

/** Back-to-top sits just above the sticky purchase bar on mobile PDP. */
export const VENDOR_MOBILE_BACK_TO_TOP_OFFSET =
  "calc(5.5rem + 0.625rem + env(safe-area-inset-bottom, 0px))";

/** Chat bubble sits above back-to-top on mobile PDP. */
export const VENDOR_MOBILE_CHAT_OFFSET =
  "calc(5.5rem + 0.625rem + 2.5rem + 0.625rem + env(safe-area-inset-bottom, 0px))";

export function isVendorStorefrontProductDetailPath(pathname: string): boolean {
  if (pathname.startsWith("/product/")) return true;
  return /^\/vendor\/[^/]+\/product\/[^/]+/.test(pathname);
}
