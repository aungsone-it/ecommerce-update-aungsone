import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
import { ErrorBoundary } from "./app/components/ErrorBoundary";
import {
  isPlatformBrandedPublicPath,
  primePlatformBrandingFaviconFromCache,
} from "./app/utils/platformBranding";
import { isOnVendorSubdomainHost } from "./app/utils/vendorSubdomainHooks";

// Cache bust: 20260307181500
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
