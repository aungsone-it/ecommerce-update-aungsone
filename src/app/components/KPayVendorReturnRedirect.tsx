import { useLayoutEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { resolveVendorSubdomainStoreSlug } from "../utils/vendorSubdomainHooks";
import { useResolvedVendorHostSlug } from "../utils/vendorHostResolution";
import {
  extractStoreSlugFromPathname,
  readKpayPendingStoreContext,
  resolveSummaryRedirectTarget,
} from "../utils/vendorCheckoutPaths";

/**
 * KBZ PWA UAT often redirects to the store root with `?merch_order_id=...`
 * (merchant return URL registered as homepage). Send those sessions to unified
 * `walwal.online/summary` (or localhost `/summary` in dev).
 */
export function KPayVendorReturnRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  const sub = resolveVendorSubdomainStoreSlug();
  const { slug: custom } = useResolvedVendorHostSlug();
  const vendorHost = sub != null || custom != null;

  const storeName = useMemo(
    () =>
      extractStoreSlugFromPathname(location.pathname) ||
      readKpayPendingStoreContext()?.storeName ||
      custom ||
      sub ||
      null,
    [location.pathname, custom, sub],
  );

  useLayoutEffect(() => {
    const target = resolveSummaryRedirectTarget({
      pathname: location.pathname,
      search: location.search,
      onVendorHost: vendorHost,
      storeName,
    });
    if (!target) return;
    if (/^https?:\/\//i.test(target)) {
      window.location.replace(target);
      return;
    }
    navigate(target, { replace: true });
  }, [vendorHost, storeName, location.pathname, location.search, navigate]);

  return null;
}
