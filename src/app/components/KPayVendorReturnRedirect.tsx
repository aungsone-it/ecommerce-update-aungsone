import { useLayoutEffect } from "react";
import { useLocation } from "react-router";
import { maybeRedirectKpayReturnToUnifiedSummary } from "../utils/kpayUnifiedSummaryRedirect";

/**
 * KBZ PWA UAT often redirects to the store root with `?merch_order_id=...`
 * (merchant return URL registered as homepage). Send those sessions to unified
 * `walwal.online/summary` (or localhost `/summary` in dev).
 */
export function KPayVendorReturnRedirect() {
  const location = useLocation();

  useLayoutEffect(() => {
    maybeRedirectKpayReturnToUnifiedSummary();
  }, [location.pathname, location.search]);

  return null;
}
