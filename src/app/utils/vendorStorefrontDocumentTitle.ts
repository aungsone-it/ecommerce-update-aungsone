import { matchPath } from "react-router";

/** Mirrors storefront account routing segments → internal mode labels */
export type VendorStorefrontDocTitleMode =
  | "storefront"
  | "view-profile"
  | "edit-profile"
  | "order-history"
  | "shipping-addresses"
  | "security-settings";

/** e.g. `go-go` → `GoGo` for compact browser titles */
export function vendorCompactBrandFromSlug(slug: string | undefined | null): string {
  const raw = decodeURIComponent(String(slug ?? "").trim());
  if (!raw) return "";
  const parts = raw.split(/[-_\s]+/).filter(Boolean);
  if (parts.length === 0) return "";
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join("");
}

export function humanizePathSegmentForTitle(segment: string): string {
  const raw = decodeURIComponent(String(segment || "").trim());
  if (!raw) return "";
  return raw
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function vendorProfileSegmentToDocTitleMode(seg: string | null): VendorStorefrontDocTitleMode {
  if (seg === null) return "storefront";
  if (seg === "view") return "view-profile";
  switch (seg) {
    case "edit":
      return "edit-profile";
    case "orders":
      return "order-history";
    case "addresses":
      return "shipping-addresses";
    case "security":
      return "security-settings";
    default:
      return "view-profile";
  }
}

export function buildVendorStorefrontDocumentTitle(input: {
  vendorSlug: string | undefined | null;
  pathname: string;
  storeBase: string;
  savedPage: boolean;
  vendorViewMode: VendorStorefrontDocTitleMode;
  profileOrderId: string | null;
  selectedProductName?: string | null;
  categorySegment?: string | null;
  /** When slug-derived brand is empty (edge cases) */
  storeDisplayNameFallback?: string | null;
}): string {
  const fromSlug = vendorCompactBrandFromSlug(input.vendorSlug);
  const fb = (input.storeDisplayNameFallback || "").trim();
  const compact =
    fromSlug ||
    vendorCompactBrandFromSlug(fb.replace(/\s+/g, "-")) ||
    fb.replace(/\s+/g, "").trim() ||
    "Store";

  const { pathname, storeBase } = input;
  const sb = storeBase || "";

  const checkoutSuccess =
    pathname === "/summary" ||
    pathname === "/order-confirmation" ||
    pathname.endsWith("/checkout/success") ||
    (!!sb && (pathname === `${sb}/summary` || pathname === `${sb}/checkout/success`)) ||
    matchPath({ path: "/vendor/:storeName/checkout/success", end: true }, pathname) != null ||
    matchPath({ path: "/vendor/:storeName/summary", end: true }, pathname) != null ||
    matchPath({ path: "/vendor-:storeName/checkout/success", end: true }, pathname) != null ||
    matchPath({ path: "/vendor-:storeName/summary", end: true }, pathname) != null;

  if (checkoutSuccess) return `Order confirmed - ${compact}`;

  const checkoutPage =
    pathname === "/checkout" ||
    (!!sb && pathname === `${sb}/checkout`) ||
    matchPath({ path: "/vendor/:storeName/checkout", end: true }, pathname) != null ||
    matchPath({ path: "/vendor-:storeName/checkout", end: true }, pathname) != null;

  if (checkoutPage) return `Checkout - ${compact}`;

  if (input.savedPage) return `Saved - ${compact}`;

  switch (input.vendorViewMode) {
    case "view-profile":
      return `Profile - ${compact}`;
    case "edit-profile":
      return `Edit profile - ${compact}`;
    case "order-history":
      return input.profileOrderId ? `Order - ${compact}` : `Orders - ${compact}`;
    case "shipping-addresses":
      return `Addresses - ${compact}`;
    case "security-settings":
      return `Security - ${compact}`;
    default:
      break;
  }

  const productName = input.selectedProductName?.trim();
  if (productName) return `${productName} - ${compact}`;

  const cat = input.categorySegment?.trim();
  if (cat) {
    const label = humanizePathSegmentForTitle(cat);
    if (label) return `${label} - ${compact}`;
  }

  return compact;
}
