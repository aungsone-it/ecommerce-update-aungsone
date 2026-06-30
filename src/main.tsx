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
import {
  clearKpayRedirectShell,
  maybeRedirectKpayReturnToUnifiedSummary,
} from "./app/utils/kpayUnifiedSummaryRedirect";
import {
  isUnifiedKpayReturnHost,
  UNIFIED_KPAY_SUMMARY_PATH,
} from "./app/utils/vendorCheckoutPaths";
import { primeVendorStorefrontHeadFromCache } from "./app/utils/vendorStorefrontBrandingCache";

const AUTH_USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveActorUserIdFromStorage(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem("migoo-staff-actor-id");
    if (!raw) return "";
    const trimmed = String(raw).trim();
    if (AUTH_USER_ID_RE.test(trimmed)) return trimmed;
  } catch {
    return "";
  }
  return "";
}

function installActorHeaderFetchBridge(): void {
  if (typeof window === "undefined") return;
  const scoped = window as typeof window & { __migooActorFetchPatched?: boolean };
  if (scoped.__migooActorFetchPatched) return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const actorId = resolveActorUserIdFromStorage();
    if (!actorId) return originalFetch(input, init);

    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (!url.includes("/functions/v1/make-server-16010b6f")) {
      return originalFetch(input, init);
    }

    if (input instanceof Request) {
      const headers = new Headers(init?.headers ?? input.headers);
      if (!headers.has("x-actor-user-id")) {
        headers.set("x-actor-user-id", actorId);
      }
      const nextRequest = new Request(input, { ...init, headers });
      return originalFetch(nextRequest);
    }

    const headers = new Headers(init?.headers);
    if (!headers.has("x-actor-user-id")) {
      headers.set("x-actor-user-id", actorId);
    }
    return originalFetch(input, { ...init, headers });
  };

  scoped.__migooActorFetchPatched = true;
}

function isAdminAppPath(pathname: string): boolean {
  const p = (pathname.split("?")[0] || "").replace(/\/+$/, "") || "/";
  return p === "/admin" || p.startsWith("/admin/");
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

if (typeof window !== "undefined") {
  installActorHeaderFetchBridge();
}

function mountApp(): void {
  if (typeof window !== "undefined" && !kpayUnifiedSummaryRedirecting) {
    const path = window.location.pathname;
    const host = window.location.hostname;
    if (!isAdminAppPath(path) && shouldResolveCustomDomainHost(host)) {
      // Resolve custom-domain vendor identity early, but let the router own route chunk loading.
      void fetchVendorSlugByCustomDomain(host);
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
