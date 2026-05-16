import { matchPath } from "react-router";
import { resolveVendorSubdomainStoreSlug } from "./vendorSubdomainHooks";
import { buildCheckoutSummaryPath, KPAY_PWA_PENDING_STORAGE_KEY } from "./kpayClient";

export function isLocalDevHostname(hostname?: string): boolean {
  const h = (
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")
  ).toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "[::1]" ||
    h.endsWith(".localhost")
  );
}

export function isLocalStorefrontOrigin(origin: string): boolean {
  try {
    return isLocalDevHostname(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export function extractStoreSlugFromPathname(pathname: string): string | null {
  const patterns = [
    "/vendor/:storeName/*",
    "/vendor/:storeName",
    "/vendor-:storeName/*",
    "/vendor-:storeName",
  ] as const;
  for (const pattern of patterns) {
    const m =
      matchPath({ path: pattern, end: false }, pathname) ??
      matchPath({ path: pattern, end: true }, pathname);
    const raw = m?.params?.storeName;
    if (typeof raw === "string" && raw.trim()) {
      return decodeURIComponent(raw.trim());
    }
  }
  return null;
}

export type KpayPendingStoreContext = {
  storeName?: string;
  summaryPath?: string;
  storefrontOrigin?: string;
  originPath?: string;
};

export function readKpayPendingStoreContext(): KpayPendingStoreContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KPAY_PWA_PENDING_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as KpayPendingStoreContext & {
      draftOrder?: { vendor?: string };
    };
    const storeName =
      (typeof p.storeName === "string" && p.storeName.trim()) ||
      extractStoreSlugFromPathname(p.originPath || "") ||
      extractStoreSlugFromPathname(p.summaryPath || "") ||
      undefined;
    return {
      storeName,
      summaryPath: p.summaryPath,
      storefrontOrigin: p.storefrontOrigin,
      originPath: p.originPath,
    };
  } catch {
    return null;
  }
}

const HOST_ROOT_CHECKOUT_PATHS = new Set([
  "/checkout",
  "/checkout/success",
  "/summary",
  "/kpay/return",
  "/order-confirmation",
]);

export function isHostRootCheckoutPath(pathname: string): boolean {
  const path = (pathname.split("?")[0] || "").replace(/\/$/, "") || "/";
  return HOST_ROOT_CHECKOUT_PATHS.has(path);
}

/** Summary route for the current host: `/summary` on vendor subdomain, `/vendor/:slug/summary` on localhost/apex. */
export function resolveVendorSummaryPath(params: {
  pathname: string;
  storeName?: string | null;
  onVendorHost?: boolean;
}): string {
  const path = (params.pathname.split("?")[0] || "").replace(/\/$/, "") || "/";
  const slug =
    (params.storeName && params.storeName.trim()) ||
    extractStoreSlugFromPathname(path) ||
    null;

  if (slug && (path === "/summary" || path.endsWith("/summary"))) {
    return path.startsWith("/vendor/") || path.startsWith("/vendor-")
      ? path
      : `/vendor/${encodeURIComponent(slug)}/summary`;
  }

  const onVendorHost =
    params.onVendorHost ?? resolveVendorSubdomainStoreSlug() != null;

  if (onVendorHost) {
    return buildCheckoutSummaryPath(path);
  }

  if (slug) {
    return `/vendor/${encodeURIComponent(slug)}/summary`;
  }

  return buildCheckoutSummaryPath(path);
}

/** Map host-root checkout paths to marketplace vendor paths (local dev / apex without subdomain). */
export function toMarketplaceVendorCheckoutPath(
  storeName: string,
  rootPath: string,
): string {
  const enc = encodeURIComponent(storeName.trim());
  const p = (rootPath.split("?")[0] || "").replace(/\/$/, "") || "/";
  if (p === "/checkout/success") return `/vendor/${enc}/checkout/success`;
  if (p === "/checkout") return `/vendor/${enc}/checkout`;
  if (p === "/summary") return `/vendor/${enc}/summary`;
  if (p === "/kpay/return") return `/vendor/${enc}/kpay/return`;
  if (p === "/order-confirmation") return `/vendor/${enc}/order-confirmation`;
  return `/vendor/${enc}${p.startsWith("/") ? p : `/${p}`}`;
}

export function resolveSummaryRedirectTarget(params: {
  pathname: string;
  search: string;
  onVendorHost: boolean;
  storeName?: string | null;
}): string | null {
  const path = (params.pathname.split("?")[0] || "").replace(/\/$/, "") || "/";
  const paramsQs = new URLSearchParams(params.search);
  const merchOrderId = (
    paramsQs.get("merch_order_id") ||
    paramsQs.get("merchOrderId") ||
    ""
  ).trim();
  if (!merchOrderId) return null;

  if (path === "/summary" || path.endsWith("/summary") || path === "/kpay/return") {
    return null;
  }

  const slug =
    params.storeName ||
    extractStoreSlugFromPathname(path) ||
    readKpayPendingStoreContext()?.storeName ||
    null;

  if (params.onVendorHost) {
    return `/summary${params.search}`;
  }

  if (slug) {
    return `/vendor/${encodeURIComponent(slug)}/summary${params.search}`;
  }

  return null;
}
