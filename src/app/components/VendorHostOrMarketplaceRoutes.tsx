import { Suspense, lazy } from "react";
import { resolveVendorSubdomainStoreSlug } from "../utils/vendorSubdomainHooks";
import { useResolvedVendorHostSlug } from "../utils/vendorHostResolution";
import { RouteLoadingFallback } from "./RouteLoadingFallback";
import { NotFound } from "../pages/NotFound";

const VendorStorefrontPage = lazy(() =>
  import("../pages/VendorStorefrontPage").then((m) => ({ default: m.VendorStorefrontPage }))
);

function useVendorHost(): { vendorHost: boolean; loading: boolean } {
  const sub = resolveVendorSubdomainStoreSlug();
  const { slug: custom, loading } = useResolvedVendorHostSlug();
  return { vendorHost: sub != null || custom != null, loading: loading && !sub };
}

/** Vendor subdomain / custom domain only — apex marketplace storefront removed. */
export function VendorHostOnlyStorefront() {
  const { vendorHost, loading } = useVendorHost();
  if (loading) return <RouteLoadingFallback />;
  if (!vendorHost) return <NotFound />;
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
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
