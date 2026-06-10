import { useLayoutEffect } from "react";
import { useLocation } from "react-router";
import {
  shouldResolveCustomDomainHost,
  useResolvedVendorHostSlug,
} from "../utils/vendorHostResolution";
import { resolveVendorSubdomainStoreSlug } from "../utils/vendorSubdomainHooks";
import {
  isPlatformBrandedPublicPath,
  primePlatformBrandingFaviconFromCache,
  readPlatformBrandingCache,
  writePlatformBrandingFaviconCache,
  clearPlatformBrandingFaviconCache,
  applyDefaultPlatformFavicon,
} from "../utils/platformBranding";
import { applyVendorStoreLogoFavicon } from "../utils/documentFavicon";

/**
 * Re-applies platform store logo on SPA navigations (history suggestions read the last favicon set).
 */
export function PlatformBrandingHead() {
  const location = useLocation();
  const subdomainSlug = resolveVendorSubdomainStoreSlug();
  const { slug: customHostSlug } = useResolvedVendorHostSlug();
  const pendingCustomVendorHost =
    typeof window !== "undefined" &&
    shouldResolveCustomDomainHost(window.location.hostname) &&
    subdomainSlug == null;

  const applyPlatform =
    !pendingCustomVendorHost &&
    isPlatformBrandedPublicPath(location.pathname, {
      vendorSubdomain: subdomainSlug != null,
      customVendorHost: customHostSlug != null && subdomainSlug == null,
    });

  useLayoutEffect(() => {
    if (!applyPlatform) return;
    primePlatformBrandingFaviconFromCache();
    const logo = readPlatformBrandingCache()?.storeLogo?.trim();
    if (logo) {
      void applyVendorStoreLogoFavicon(logo, {
        onRasterized: (dataUrl) => writePlatformBrandingFaviconCache(logo, dataUrl),
      });
    } else {
      clearPlatformBrandingFaviconCache();
      applyDefaultPlatformFavicon();
    }
  }, [applyPlatform, location.pathname]);

  return null;
}
