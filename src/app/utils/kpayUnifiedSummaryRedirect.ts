import {
  UNIFIED_KPAY_SUMMARY_PATH,
  buildUnifiedKpaySummaryRedirectUrl,
  isUnifiedKpayReturnHost,
} from "./vendorCheckoutPaths";

/** Hard-redirect KPay return traffic to unified `/summary` before React paints. */
export function maybeRedirectKpayReturnToUnifiedSummary(): boolean {
  if (typeof window === "undefined") return false;

  const path = (window.location.pathname.split("?")[0] || "").replace(/\/$/, "") || "/";
  if (path === UNIFIED_KPAY_SUMMARY_PATH && isUnifiedKpayReturnHost()) {
    return false;
  }

  const target = buildUnifiedKpaySummaryRedirectUrl();
  if (!target) return false;

  const here = window.location.href.split("#")[0];
  if (here === target) return false;

  window.location.replace(target);
  return true;
}
