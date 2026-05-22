import { useEffect, useLayoutEffect, useState } from "react";
import {
  applyVendorStoreLogoFavicon,
  resetDocumentFavicon,
} from "../utils/documentFavicon";
import {
  fetchPlatformBranding,
  normalizePlatformStoreName,
  primePlatformBrandingFaviconFromCache,
  readPlatformBrandingCache,
  writePlatformBrandingCache,
  writePlatformBrandingFaviconCache,
  clearPlatformBrandingFaviconCache,
  type PlatformBranding,
} from "../utils/platformBranding";

/**
 * Platform store name + logo from General settings (cached in LS).
 * Applies the same rasterized logo favicon as vendor storefront tabs.
 */
export function usePlatformBranding(options?: { applyFavicon?: boolean }): PlatformBranding {
  const applyFavicon = options?.applyFavicon !== false;

  const [branding, setBranding] = useState<PlatformBranding>(() => {
    const primed = primePlatformBrandingFaviconFromCache();
    const cached = readPlatformBrandingCache();
    return {
      storeName: normalizePlatformStoreName(cached?.storeName || primed.storeName),
      storeLogo: cached?.storeLogo || primed.storeLogo || "",
    };
  });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);

    void (async () => {
      const data = await fetchPlatformBranding(controller.signal);
      clearTimeout(t);
      if (cancelled) return;
      const prevLogo = readPlatformBrandingCache()?.storeLogo?.trim() || "";
      setBranding(data);
      writePlatformBrandingCache(data);
      const nextLogo = data.storeLogo?.trim() || "";
      if (!nextLogo || nextLogo !== prevLogo) {
        clearPlatformBrandingFaviconCache();
      }
    })();

    const onLogo = (e: Event) => {
      const d = (e as CustomEvent<{ logoUrl?: string; storeName?: string }>).detail;
      const prev = readPlatformBrandingCache() || {};
      const next: PlatformBranding = {
        storeLogo:
          typeof d?.logoUrl === "string" ? d.logoUrl : (prev.storeLogo || ""),
        storeName: normalizePlatformStoreName(
          typeof d?.storeName === "string" ? d.storeName : prev.storeName
        ),
      };
      if ((next.storeLogo?.trim() || "") !== (prev.storeLogo?.trim() || "")) {
        clearPlatformBrandingFaviconCache();
      }
      setBranding(next);
      writePlatformBrandingCache(next);
    };

    window.addEventListener("logoUpdated", onLogo);
    return () => {
      cancelled = true;
      clearTimeout(t);
      controller.abort();
      window.removeEventListener("logoUpdated", onLogo);
    };
  }, []);

  useLayoutEffect(() => {
    if (!applyFavicon) return;
    const logo = branding.storeLogo?.trim();
    if (logo) {
      void applyVendorStoreLogoFavicon(logo, {
        onRasterized: (dataUrl) => writePlatformBrandingFaviconCache(logo, dataUrl),
      });
    } else {
      clearPlatformBrandingFaviconCache();
      resetDocumentFavicon();
    }
  }, [applyFavicon, branding.storeLogo]);

  return branding;
}
