import { Suspense, lazy, useLayoutEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { resolveVendorSubdomainStoreSlug, isOnVendorSubdomainHost } from "../utils/vendorSubdomainHooks";
import { useResolvedVendorHostSlug } from "../utils/vendorHostResolution";
import {
  extractStoreSlugFromPathname,
  isHostRootCheckoutPath,
  isUnifiedKpaySummaryPath,
  readKpayPendingStoreContext,
  toMarketplaceVendorCheckoutPath,
} from "../utils/vendorCheckoutPaths";
import { StorefrontAwareRouteFallback } from "./RouteLoadingFallback";
import { VendorStorefrontPage } from "../pages/vendorStorefrontPageLazy";
const NotFound = lazy(() =>
  import("../pages/NotFound").then((m) => ({ default: m.NotFound }))
);

function useVendorHost(): { vendorHost: boolean; loading: boolean } {
  const onVendorSubdomainHost = isOnVendorSubdomainHost();
  const sub = resolveVendorSubdomainStoreSlug();
  const { slug: custom, loading } = useResolvedVendorHostSlug();
  return {
    vendorHost: onVendorSubdomainHost || sub != null || custom != null,
    loading: loading && !onVendorSubdomainHost && !sub,
  };
}

/**
 * Checkout, summary, and related routes on vendor subdomain/custom domain (production)
 * or `/vendor/:storeName/...` on localhost / marketplace apex (local dev).
 */
export function VendorHostOnlyStorefront() {
  const location = useLocation();
  const navigate = useNavigate();
  const { vendorHost, loading } = useVendorHost();

  const marketplaceSlug = useMemo(
    () => extractStoreSlugFromPathname(location.pathname),
    [location.pathname],
  );

  const pendingSlug = useMemo(() => {
    if (vendorHost || marketplaceSlug) return null;
    return readKpayPendingStoreContext()?.storeName ?? null;
  }, [vendorHost, marketplaceSlug]);

  useLayoutEffect(() => {
    if (vendorHost || loading || marketplaceSlug) return;
    if (!pendingSlug || !isHostRootCheckoutPath(location.pathname)) return;
    // Unified KPay return URL stays on `/summary` (walwal.online/summary or localhost dev).
    if (isUnifiedKpaySummaryPath(location.pathname)) return;

    const target = toMarketplaceVendorCheckoutPath(pendingSlug, location.pathname);
    if (target === location.pathname) return;

    navigate({ pathname: target, search: location.search }, { replace: true });
  }, [
    vendorHost,
    loading,
    marketplaceSlug,
    pendingSlug,
    location.pathname,
    location.search,
    navigate,
  ]);

  if (loading && !marketplaceSlug) return <StorefrontAwareRouteFallback />;

  const unifiedKpaySummary = isUnifiedKpaySummaryPath(location.pathname);

  const canRender =
    vendorHost ||
    marketplaceSlug ||
    (pendingSlug && isHostRootCheckoutPath(location.pathname)) ||
    unifiedKpaySummary;

  if (!canRender) {
    return (
      <Suspense fallback={<StorefrontAwareRouteFallback />}>
        <NotFound />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<StorefrontAwareRouteFallback />}>
      <VendorStorefrontPage />
    </Suspense>
  );
}

/** `/saved` — vendor host wishlist only. */
export function VendorHostOrMarketplaceSaved() {
  return <VendorHostOnlyStorefront />;
}

/** `/product/:productSlug` — vendor host product detail only. */
export function VendorHostOrMarketplaceProduct() {
  return <VendorHostOnlyStorefront />;
}

/** `/profile` and nested — vendor host account shell only. */
export function VendorHostOrMarketplaceProfile() {
  return <VendorHostOnlyStorefront />;
}

/** `/:categorySlug` — valid only on vendor-only hosts (subdomain/custom-domain). */
export function VendorHostCategoryRoute() {
  return <VendorHostOnlyStorefront />;
}
