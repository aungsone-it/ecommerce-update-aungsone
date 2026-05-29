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

// Cache bust: 20260307181500
if (typeof window !== "undefined") {
  const host = window.location.hostname;
  if (isOnVendorSubdomainHost() || shouldResolveCustomDomainHost(host)) {
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

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
