import { useEffect } from "react";
import { useLocation, useParams } from "react-router";
import { resolveVendorSubdomainStoreSlug } from "../utils/vendorSubdomainHooks";
import { useResolvedVendorHostSlug } from "../utils/vendorHostResolution";
import { parseStorefrontPolicyRoute } from "../utils/storefrontPolicyPaths";
import {
  bustVendorStorePolicyCaches,
  prefetchStorefrontPolicyData,
} from "../hooks/useStorefrontPolicyData";
import { subscribeStorefrontPolicyUpdates } from "../utils/storefrontPolicyRealtime";

/**
 * Keeps Terms / Privacy cache warm and busted for the active storefront context
 * (store home, product pages, etc.) so footer links open instantly after admin edits.
 */
export function StorefrontPolicyLiveBridge() {
  const location = useLocation();
  const params = useParams();
  const subdomainSlug = resolveVendorSubdomainStoreSlug();
  const { slug: customHostSlug } = useResolvedVendorHostSlug();

  const storeSlug = (() => {
    const fromRoute = String(params.storeName || "").trim();
    if (fromRoute) return fromRoute;
    return subdomainSlug || customHostSlug || null;
  })();

  const policyRoute = parseStorefrontPolicyRoute(location.pathname);
  const onPolicyPage = policyRoute.kind != null;

  useEffect(() => {
    if (!storeSlug || onPolicyPage) return;

    return subscribeStorefrontPolicyUpdates({
      storeSlug,
      includePlatform: true,
      onLivePatch: (patch) => {
        bustVendorStorePolicyCaches(storeSlug);
        void prefetchStorefrontPolicyData(storeSlug, patch.kind);
      },
      onUpdate: () => {
        bustVendorStorePolicyCaches(storeSlug);
        void prefetchStorefrontPolicyData(storeSlug, "terms");
        void prefetchStorefrontPolicyData(storeSlug, "privacy");
      },
    });
  }, [storeSlug, onPolicyPage]);

  return null;
}
