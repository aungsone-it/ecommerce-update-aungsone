import { useMemo } from "react";
import { useParams } from "react-router";
import { resolveVendorSubdomainStoreSlug } from "../utils/vendorSubdomainHooks";
import { useResolvedVendorHostSlug } from "../utils/vendorHostResolution";
import { resolveStorefrontPolicyPaths } from "../utils/storefrontPolicyPaths";

type UseStorefrontPolicyPathsOptions = {
  /** When true, links use `/terms` and `/privacy` (subdomain / custom domain). */
  onVendorHost?: boolean;
};

/** Resolves `/terms` vs `/vendor/:slug/terms` for links from login, footer, etc. */
export function useStorefrontPolicyPaths(
  explicitStoreSlug?: string | null,
  options?: UseStorefrontPolicyPathsOptions
) {
  const { storeName: routeStoreName } = useParams();
  const { slug: hostSlug } = useResolvedVendorHostSlug();
  const subdomainSlug = resolveVendorSubdomainStoreSlug();
  const detectedVendorHost = !!(hostSlug || subdomainSlug);
  const onVendorHost = options?.onVendorHost ?? detectedVendorHost;

  return useMemo(() => {
    const storeSlug =
      explicitStoreSlug ||
      hostSlug ||
      subdomainSlug ||
      routeStoreName ||
      null;
    return resolveStorefrontPolicyPaths({ storeSlug, onVendorHost });
  }, [
    explicitStoreSlug,
    hostSlug,
    subdomainSlug,
    routeStoreName,
    onVendorHost,
  ]);
}
