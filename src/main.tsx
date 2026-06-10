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
import { maybeRedirectKpayReturnToUnifiedSummary } from "./app/utils/kpayUnifiedSummaryRedirect";
import { KPAY_PWA_PENDING_STORAGE_KEY } from "./app/utils/kpayClient";

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
const kpayUnifiedSummaryRedirecting =
  typeof window !== "undefined" && maybeRedirectKpayReturnToUnifiedSummary();

if (typeof window !== "undefined" && !kpayUnifiedSummaryRedirecting) {
  const host = window.location.hostname;
  const skipVendorPrefetch = isOnVendorSubdomainHost() && isKpayReturnTraffic();
  if (!skipVendorPrefetch && (isOnVendorSubdomainHost() || shouldResolveCustomDomainHost(host))) {
    void import("./app/pages/VendorStorefrontPage");
    if (shouldResolveCustomDomainHost(host)) {
      void fetchVendorSlugByCustomDomain(host);
    }
  }
}
if (
  typeof window !== "undefined" &&
  isPlatformBrandedPublicPath(window.location.pathname, {
    vendorSubdomain: isOnVendorSubdomainHost(),
  })
) {
  primePlatformBrandingFaviconFromCache();
}

if (!kpayUnifiedSummaryRedirecting) {
  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
}
