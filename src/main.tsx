import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
import { ErrorBoundary } from "./app/components/ErrorBoundary";
import {
  isPlatformBrandedPublicPath,
  primePlatformBrandingFaviconFromCache,
} from "./app/utils/platformBranding";
import { isOnVendorSubdomainHost } from "./app/utils/vendorSubdomainHooks";
import {
  fetchVendorSlugByCustomDomain,
  shouldResolveCustomDomainHost,
} from "./app/utils/vendorHostResolution";
import { isMarketplaceVendorStorefrontPath } from "./app/utils/vendorStorefrontRoutePaths";
import {
  clearKpayRedirectShell,
  maybeRedirectKpayReturnToUnifiedSummary,
} from "./app/utils/kpayUnifiedSummaryRedirect";
import { KPAY_PWA_PENDING_STORAGE_KEY } from "./app/utils/kpayClient";
import {
  isUnifiedKpayReturnHost,
  UNIFIED_KPAY_SUMMARY_PATH,
} from "./app/utils/vendorCheckoutPaths";
import { prefetchVendorStorefrontPage } from "./app/pages/vendorStorefrontPageLazy";
import { primeVendorStorefrontHeadFromCache } from "./app/utils/vendorStorefrontBrandingCache";

function isAdminAppPath(pathname: string): boolean {
  const p = (pathname.split("?")[0] || "").replace(/\/+$/, "") || "/";
  return p === "/admin" || p.startsWith("/admin/");
}

function isKpayReturnTraffic(): boolean {
  if (typeof window === "undefined") return false;
  const path = (window.location.pathname.split("?")[0] || "").replace(/\/+$/, "") || "/";
  const search = window.location.search || "";
  const hasQuery = /(?:^|[?&])(?:merch_order_id|merchOrderId|prepay_id|prepayId|callback_info)=/i.test(
    search,
  );
  let pending = false;
  try {
    pending = Boolean(localStorage.getItem(KPAY_PWA_PENDING_STORAGE_KEY));
  } catch {
    /* ignore */
  }
  return (
    hasQuery ||
    (pending && (path === "/summary" || path === "/kpay/return" || path === "/"))
  );
}

// Cache bust: 20260307181500
function isUnifiedSummaryRoute(): boolean {
  if (typeof window === "undefined") return false;
  const path = (window.location.pathname.split("?")[0] || "").replace(/\/+$/, "") || "/";
  return path === UNIFIED_KPAY_SUMMARY_PATH && isUnifiedKpayReturnHost();
}

if (typeof window !== "undefined" && isUnifiedSummaryRoute()) {
  clearKpayRedirectShell();
}

const kpayUnifiedSummaryRedirecting =
  typeof window !== "undefined" &&
  !isUnifiedSummaryRoute() &&
  maybeRedirectKpayReturnToUnifiedSummary();

if (typeof window !== "undefined" && !kpayUnifiedSummaryRedirecting) {
  primeVendorStorefrontHeadFromCache();
}

if (
  typeof window !== "undefined" &&
  isPlatformBrandedPublicPath(window.location.pathname, {
    vendorSubdomain: isOnVendorSubdomainHost(),
    customVendorHost: shouldResolveCustomDomainHost(window.location.hostname),
  })
) {
  primePlatformBrandingFaviconFromCache();
}

function mountApp(): void {
  if (typeof window !== "undefined" && !kpayUnifiedSummaryRedirecting) {
    const path = window.location.pathname;
    const host = window.location.hostname;
    const skipVendorPrefetch = isOnVendorSubdomainHost() && isKpayReturnTraffic();
    const onVendorStorefront =
      !isAdminAppPath(path) &&
      (isOnVendorSubdomainHost() ||
        shouldResolveCustomDomainHost(host) ||
        isMarketplaceVendorStorefrontPath(path));
    if (!skipVendorPrefetch && onVendorStorefront) {
      prefetchVendorStorefrontPage();
      if (shouldResolveCustomDomainHost(host)) {
        void fetchVendorSlugByCustomDomain(host);
      }
    }
  }

  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
}

if (!kpayUnifiedSummaryRedirecting) {
  mountApp();
}
