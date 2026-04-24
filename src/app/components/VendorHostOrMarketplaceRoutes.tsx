import { Suspense, lazy } from "react";
import { resolveVendorSubdomainStoreSlug } from "../utils/vendorSubdomainHooks";
import { useResolvedVendorHostSlug } from "../utils/vendorHostResolution";
import { RouteLoadingFallback } from "./RouteLoadingFallback";
import { NotFound } from "../pages/NotFound";

const VendorStorefrontPage = lazy(() =>
  import("../pages/VendorStorefrontPage").then((m) => ({ default: m.VendorStorefrontPage }))
);
const StorefrontPage = lazy(() =>
  import("../pages/StorefrontPage").then((m) => ({ default: m.StorefrontPage }))
);

function useIsVendorOnlyHost(): boolean {
  const sub = resolveVendorSubdomainStoreSlug();
  const { slug: custom } = useResolvedVendorHostSlug();
  return sub != null || custom != null;
}

/** `/saved` — vendor subdomain / custom domain use vendor storefront wishlist; apex uses marketplace. */
export function VendorHostOrMarketplaceSaved() {
  const vendorHost = useIsVendorOnlyHost();
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      {vendorHost ? <VendorStorefrontPage /> : <StorefrontPage />}
    </Suspense>
  );
}

/** `/product/:productSlug` — same path shape; vendor host renders vendor product detail. */
export function VendorHostOrMarketplaceProduct() {
  const vendorHost = useIsVendorOnlyHost();
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      {vendorHost ? <VendorStorefrontPage /> : <StorefrontPage />}
    </Suspense>
  );
}

/** `/profile` and nested — vendor host uses vendor storefront account shell. */
export function VendorHostOrMarketplaceProfile() {
  const vendorHost = useIsVendorOnlyHost();
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      {vendorHost ? <VendorStorefrontPage /> : <StorefrontPage />}
    </Suspense>
  );
}

/** `/:categorySlug` — valid only on vendor-only hosts (subdomain/custom-domain). */
export function VendorHostCategoryRoute() {
  const sub = resolveVendorSubdomainStoreSlug();
  const { slug: custom, loading } = useResolvedVendorHostSlug();
  const vendorHost = sub != null || custom != null;
  if (loading && !sub) return <RouteLoadingFallback />;
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      {vendorHost ? <VendorStorefrontPage /> : <NotFound />}
    </Suspense>
  );
}
