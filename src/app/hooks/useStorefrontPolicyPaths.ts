import { useEffect, useMemo } from "react";
import { useParams } from "react-router";
import { resolveVendorSubdomainStoreSlug } from "../utils/vendorSubdomainHooks";
import { useResolvedVendorHostSlug } from "../utils/vendorHostResolution";
import { resolveStorefrontPolicyPaths } from "../utils/storefrontPolicyPaths";
import { prefetchStorefrontPolicyData } from "./useStorefrontPolicyData";

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

  const storeSlug = useMemo(() => {
    const raw =
      explicitStoreSlug ||
      hostSlug ||
      subdomainSlug ||
      routeStoreName ||
      "";
    return String(raw).trim() || null;
  }, [explicitStoreSlug, hostSlug, subdomainSlug, routeStoreName]);

  const paths = useMemo(
    () => resolveStorefrontPolicyPaths({ storeSlug, onVendorHost }),
    [storeSlug, onVendorHost]
  );

  useEffect(() => {
    void prefetchStorefrontPolicyData(storeSlug, "terms");
    void prefetchStorefrontPolicyData(storeSlug, "privacy");
  }, [storeSlug]);

  return paths;
}
