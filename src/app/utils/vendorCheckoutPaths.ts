import { matchPath } from "react-router";
import {
  resolveVendorSubdomainHostContext,
  resolveVendorSubdomainStoreSlug,
} from "./vendorSubdomainHooks";
import {
  buildCheckoutSummaryPath,
  KPAY_PWA_PENDING_STORAGE_KEY,
  parsePwaCallbackInfo,
  type PwaCheckoutDraftResponse,
} from "./kpayClient";
import { getEffectiveVendorSubdomainBase } from "./vendorSubdomainBase";
import { resolveSubdomainHostLabelForStore } from "./subdomainSlugMap";
import { buildVendorStoreHomePath, resolveVendorPathSlug } from "./vendorStorePaths";
import { API_BASE_URL } from "../../utils/api-client";
import { publicAnonKey } from "../../../utils/supabase/info";

const MARKETPLACE_APEX = "walwal.online";

/** Marketplace apex (`walwal.online/`) — branding home and unified KPay return host. */
export function isMarketplaceApexHost(hostname?: string): boolean {
  const host = (hostname ?? (typeof window !== "undefined" ? window.location.hostname : ""))
    .split(":")[0]
    .toLowerCase();
  const envBase = String(import.meta.env.VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN || "")
    .trim()
    .toLowerCase();
  const effectiveBase = getEffectiveVendorSubdomainBase() || envBase;
  if (host === MARKETPLACE_APEX || host === `www.${MARKETPLACE_APEX}`) return true;
  if (effectiveBase && (host === effectiveBase || host === `www.${effectiveBase}`)) return true;
  return false;
}

/**
 * Host for the single KBZ return URL (`walwal.online/summary`, or `localhost:5173/summary` in dev).
 * Vendor subdomains (e.g. gogo.walwal.online) use their own `/summary`.
 */
export function isUnifiedKpayReturnHost(hostname?: string): boolean {
  const host = (hostname ?? (typeof window !== "undefined" ? window.location.hostname : ""))
    .split(":")[0]
    .toLowerCase();
  if (isMarketplaceApexHost(host)) return true;
  if (isLocalDevHostname(host)) {
    return !resolveVendorSubdomainHostContext(host).isVendorSubdomainHost;
  }
  return false;
}

export function isUnifiedKpaySummaryPath(pathname: string, hostname?: string): boolean {
  const path = (pathname.split("?")[0] || "").replace(/\/$/, "") || "/";
  return path === "/summary" && isUnifiedKpayReturnHost(hostname);
}

/** @deprecated Use isUnifiedKpaySummaryPath */
export function isApexKpaySummaryPath(pathname: string): boolean {
  return isUnifiedKpaySummaryPath(pathname);
}

export function readKpayReturnQueryOrderId(search: string): string {
  const qs = new URLSearchParams(search);
  return (qs.get("merch_order_id") || qs.get("merchOrderId") || "").trim();
}

export function readKpayReturnPrepayId(search: string): string {
  const qs = new URLSearchParams(search);
  return (qs.get("prepay_id") || qs.get("prepayId") || "").trim();
}

function readKpayPendingRecord(): {
  merchantOrderId?: string;
  prepayId?: string;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KPAY_PWA_PENDING_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { merchantOrderId?: string; prepayId?: string };
  } catch {
    return null;
  }
}

/** Merge pending PWA checkout ids into the return query when KBZ omits them. */
export function enrichKpayReturnSearch(search: string): string {
  const qs = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (!readKpayReturnQueryOrderId(`?${qs.toString()}`)) {
    const pendingId = String(readKpayPendingRecord()?.merchantOrderId || "").trim();
    if (pendingId) qs.set("merch_order_id", pendingId);
  }
  if (!readKpayReturnPrepayId(`?${qs.toString()}`)) {
    const pendingPrepay = String(readKpayPendingRecord()?.prepayId || "").trim();
    if (pendingPrepay) qs.set("prepay_id", pendingPrepay);
  }
  const q = qs.toString();
  return q ? `?${q}` : "";
}

/** True when the current vendor host session should move to unified `/summary`. */
export function hasVendorKpayReturnSignals(params?: {
  pathname?: string;
  search?: string;
}): boolean {
  if (typeof window === "undefined") return false;
  if (isUnifiedKpayReturnHost()) return false;

  const search = params?.search ?? window.location.search ?? "";
  const path =
    (params?.pathname ?? window.location.pathname).split("?")[0].replace(/\/$/, "") || "/";

  if (readKpayReturnQueryOrderId(search)) return true;
  if (readKpayReturnPrepayId(search)) return true;
  if (parsePwaCallbackInfo(new URLSearchParams(search).get("callback_info"))) return true;

  // KBZ often opens vendor `/summary` with no query after in-app payment.
  if (path === "/summary" && readKpayPendingStoreContext()) return true;
  if (path === "/kpay/return") return true;

  if (
    path === "/" &&
    (readKpayReturnQueryOrderId(search) || readKpayReturnPrepayId(search))
  ) {
    return true;
  }

  return false;
}

export function buildUnifiedKpaySummaryRedirectUrl(params?: {
  pathname?: string;
  search?: string;
}): string | null {
  if (!hasVendorKpayReturnSignals(params)) return null;
  const search = enrichKpayReturnSearch(params?.search ?? window.location.search ?? "");
  return `${resolveUnifiedKpayReturnBaseUrl()}${UNIFIED_KPAY_SUMMARY_PATH}${search}`;
}

export function resolveStoreSlugFromStorefrontOrigin(
  origin: string | null | undefined,
): string | null {
  const o = (origin || "").trim();
  if (!o) return null;
  try {
    const { storeSlugCandidate } = resolveVendorSubdomainHostContext(new URL(o).hostname);
    return storeSlugCandidate;
  } catch {
    return null;
  }
}

export function resolveStoreSlugFromPwaCheckoutDraft(
  draft: PwaCheckoutDraftResponse | null | undefined,
): string | null {
  if (!draft) return null;
  const fromPath =
    extractStoreSlugFromPathname(draft.originPath || "") ||
    extractStoreSlugFromPathname(draft.summaryPath || "");
  if (fromPath) return resolveVendorPathSlug(fromPath);
  const fromOrigin = resolveStoreSlugFromStorefrontOrigin(draft.storefrontOrigin);
  if (fromOrigin) return fromOrigin;
  const draftOrder = draft.draftOrder as { vendor?: string; vendorId?: string } | undefined;
  const vendorId = draftOrder?.vendorId;
  if (typeof vendorId === "string" && vendorId.trim()) {
    return resolveVendorPathSlug(vendorId.trim());
  }
  const vendor = draftOrder?.vendor;
  if (typeof vendor === "string" && vendor.trim()) {
    return resolveVendorPathSlug(vendor.trim());
  }
  return null;
}

export function resolveKpayReturnStoreSlug(params: {
  pathname?: string;
  search?: string;
}): string | null {
  const pending = readKpayPendingStoreContext();
  const fromPending =
    (pending?.storeName && pending.storeName.trim()) ||
    extractStoreSlugFromPathname(pending?.originPath || "") ||
    extractStoreSlugFromPathname(pending?.summaryPath || "");
  if (fromPending) return resolveVendorPathSlug(fromPending);

  const fromPendingOrigin = resolveStoreSlugFromStorefrontOrigin(pending?.storefrontOrigin);
  if (fromPendingOrigin) return fromPendingOrigin;

  try {
    const raw = localStorage.getItem(KPAY_PWA_PENDING_STORAGE_KEY);
    if (raw) {
      const pendingDraft = JSON.parse(raw) as {
        draftOrder?: { vendorId?: string; vendor?: string };
      };
      const pendingVendorId = pendingDraft?.draftOrder?.vendorId;
      if (typeof pendingVendorId === "string" && pendingVendorId.trim()) {
        return resolveVendorPathSlug(pendingVendorId.trim());
      }
      const pendingVendor = pendingDraft?.draftOrder?.vendor;
      if (typeof pendingVendor === "string" && pendingVendor.trim()) {
        return resolveVendorPathSlug(pendingVendor.trim());
      }
    }
  } catch {
    /* ignore */
  }

  const qs = new URLSearchParams(params.search || "");
  const cb = parsePwaCallbackInfo(qs.get("callback_info"));
  const fromCallback = resolveStoreSlugFromStorefrontOrigin(cb?.storefrontOrigin);
  if (fromCallback) return fromCallback;

  return null;
}

export function hasKpaySummaryReturnContext(params: {
  pathname: string;
  search: string;
}): boolean {
  if (!isUnifiedKpaySummaryPath(params.pathname)) return false;
  if (readKpayReturnQueryOrderId(params.search)) return true;
  if (resolveKpayReturnStoreSlug(params)) return true;
  if (parsePwaCallbackInfo(new URLSearchParams(params.search).get("callback_info"))) {
    return true;
  }
  return Boolean(readKpayPendingStoreContext());
}

/** Where "Continue Shopping" should go after unified `/summary` (vendor host, not branding apex). */
export function buildVendorSubdomainHomeUrl(params: {
  storeSlug: string;
  storeName?: string | null;
}): string | null {
  const base = getEffectiveVendorSubdomainBase();
  if (!base || typeof window === "undefined") return null;

  const slug = resolveVendorPathSlug(params.storeSlug);
  const hostLabel = resolveSubdomainHostLabelForStore({
    storeSlug: slug,
    storeName: params.storeName,
  });
  if (!hostLabel) return null;

  const protocol = window.location.protocol;
  const port = window.location.port ? `:${window.location.port}` : "";
  return `${protocol}//${hostLabel}.${base}${port}/`;
}

function normalizeStorefrontOriginUrl(origin: string | null | undefined): string | null {
  const raw = (origin || "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return `${u.origin}/`;
  } catch {
    return null;
  }
}

/** Resolve vendor home URL: checkout origin → verified custom domain → subdomain → /vendor/:slug. */
export async function resolveVendorStorefrontHomeUrl(params: {
  storeSlug?: string | null;
  storeName?: string | null;
  storefrontOrigin?: string | null;
}): Promise<string> {
  const fromOrigin = normalizeStorefrontOriginUrl(params.storefrontOrigin);
  if (fromOrigin) return fromOrigin;

  const slugRaw =
    (params.storeSlug && params.storeSlug.trim()) ||
    (params.storeName ? resolveVendorPathSlug(params.storeName) : null);
  if (!slugRaw) return "/";

  const slug = resolveVendorPathSlug(slugRaw);
  const storeName = params.storeName?.trim() || null;

  try {
    const res = await fetch(`${API_BASE_URL}/vendor/store/${encodeURIComponent(slug)}`, {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        settings?: { customDomain?: string; domainStatus?: string; storeSlug?: string };
      };
      const settings = data?.settings;
      const customDomain = String(settings?.customDomain || "").trim().toLowerCase();
      const domainStatus = String(settings?.domainStatus || "").trim().toLowerCase();
      if (customDomain && domainStatus === "verified") {
        return `https://${customDomain}/`;
      }
      const canonicalSlug =
        typeof settings?.storeSlug === "string" && settings.storeSlug.trim()
          ? settings.storeSlug.trim()
          : slug;
      const subdomainUrl = buildVendorSubdomainHomeUrl({
        storeSlug: canonicalSlug,
        storeName,
      });
      if (subdomainUrl) return subdomainUrl;
    }
  } catch {
    /* fall through to sync heuristics */
  }

  const subdomainUrl = buildVendorSubdomainHomeUrl({ storeSlug: slug, storeName });
  if (subdomainUrl) return subdomainUrl;

  return buildVendorStoreHomePath({ pathSlug: slug, hostRootStorePaths: false });
}

export function resolveUnifiedSummaryContinueShoppingTarget(params: {
  search?: string;
  storeSlug?: string | null;
  storefrontOrigin?: string | null;
  orderVendor?: string | null;
}): string {
  const qs = new URLSearchParams(params.search || "");
  const pending = readKpayPendingStoreContext();
  const callback = parsePwaCallbackInfo(qs.get("callback_info"));

  const origin =
    normalizeStorefrontOriginUrl(params.storefrontOrigin) ||
    normalizeStorefrontOriginUrl(pending?.storefrontOrigin) ||
    normalizeStorefrontOriginUrl(callback?.storefrontOrigin);

  if (origin) return origin;

  const slugRaw =
    (params.storeSlug && params.storeSlug.trim()) ||
    resolveKpayReturnStoreSlug({ search: params.search || "" }) ||
    (params.orderVendor ? resolveVendorPathSlug(params.orderVendor) : null) ||
    null;

  if (!slugRaw) {
    if (typeof window !== "undefined") {
      const fromPendingPath = pending?.originPath?.split("?")[0] || "";
      if (fromPendingPath && fromPendingPath !== "/checkout") {
        const home = fromPendingPath.replace(/\/checkout(?:\/success)?\/?$/, "") || "/";
        return home.startsWith("/") ? home : `/${home}`;
      }
    }
    return "/";
  }

  const slug = resolveVendorPathSlug(slugRaw);
  const subdomainUrl = buildVendorSubdomainHomeUrl({
    storeSlug: slug,
    storeName: params.orderVendor || params.storeSlug,
  });
  if (subdomainUrl) return subdomainUrl;

  return buildVendorStoreHomePath({ pathSlug: slug, hostRootStorePaths: false });
}

export async function navigateUnifiedSummaryContinueShopping(
  navigate: (path: string, options?: { replace?: boolean }) => void,
  params: {
    search?: string;
    storeSlug?: string | null;
    storefrontOrigin?: string | null;
    orderVendor?: string | null;
    preResolvedHomeUrl?: string | null;
  },
): Promise<void> {
  const preResolved = normalizeStorefrontOriginUrl(params.preResolvedHomeUrl);
  const target =
    preResolved ||
    (await resolveVendorStorefrontHomeUrl({
      storeSlug: params.storeSlug,
      storeName: params.orderVendor || params.storeSlug,
      storefrontOrigin: params.storefrontOrigin,
    }));

  if (/^https?:\/\//i.test(target)) {
    window.location.assign(target);
    return;
  }
  navigate(target, { replace: true });
}

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
    const draftVendor = (p.draftOrder as { vendor?: string; vendorId?: string } | undefined)?.vendor;
    const storeName =
      (typeof p.storeName === "string" && p.storeName.trim()) ||
      extractStoreSlugFromPathname(p.originPath || "") ||
      extractStoreSlugFromPathname(p.summaryPath || "") ||
      (typeof draftVendor === "string" && draftVendor.trim()) ||
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

/** Post-KPay order summary always renders on the unified return host (`walwal.online/summary`). */
export const UNIFIED_KPAY_SUMMARY_PATH = "/summary";

export function resolveUnifiedKpayPostPaymentSummaryPath(): string {
  return UNIFIED_KPAY_SUMMARY_PATH;
}

/** Origin for the unified KBZ post-payment summary (`https://walwal.online` in production). */
export function resolveUnifiedKpayReturnBaseUrl(): string {
  if (typeof window === "undefined") return `https://${MARKETPLACE_APEX}`;
  const host = window.location.hostname.toLowerCase();
  if (isLocalDevHostname(host)) {
    if (isUnifiedKpayReturnHost(host)) return window.location.origin;
    const port = window.location.port ? `:${window.location.port}` : "";
    return `${window.location.protocol}//localhost${port}`;
  }
  if (isUnifiedKpayReturnHost(host)) return window.location.origin;
  return `https://${MARKETPLACE_APEX}`;
}

/** Summary route for the current host: `/summary` on vendor subdomain, `/vendor/:slug/summary` on localhost/apex. */
export function resolveVendorSummaryPath(params: {
  pathname: string;
  storeName?: string | null;
  onVendorHost?: boolean;
}): string {
  const path = (params.pathname.split("?")[0] || "").replace(/\/$/, "") || "/";
  const rawSlug =
    (params.storeName && params.storeName.trim()) ||
    extractStoreSlugFromPathname(path) ||
    null;
  const slug = rawSlug ? resolveVendorPathSlug(rawSlug) : null;

  if (slug && (path === "/summary" || path.endsWith("/summary"))) {
    if (path === "/summary" && isUnifiedKpayReturnHost()) {
      return "/summary";
    }
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
  const enc = encodeURIComponent(resolveVendorPathSlug(storeName.trim()));
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

  if (path === "/kpay/return") return null;

  const search = params.search || "";

  if (isUnifiedKpayReturnHost()) {
    if (path === UNIFIED_KPAY_SUMMARY_PATH) return null;
    return `${UNIFIED_KPAY_SUMMARY_PATH}${search}`;
  }

  return `${resolveUnifiedKpayReturnBaseUrl()}${UNIFIED_KPAY_SUMMARY_PATH}${search}`;
}
