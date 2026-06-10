import {
  UNIFIED_KPAY_SUMMARY_PATH,
  buildUnifiedKpaySummaryRedirectUrl,
  enrichKpayReturnSearch,
  isUnifiedKpayReturnHost,
} from "./vendorCheckoutPaths";

function normalizePathname(pathname: string): string {
  return (pathname.split("?")[0] || "").replace(/\/+$/, "") || "/";
}

function markKpayRedirectShell(): void {
  try {
    document.documentElement.classList.add("kpay-unified-redirect");
  } catch {
    /* ignore */
  }
}

/** Remove anti-flash shell so unified `/summary` is never stuck invisible. */
export function clearKpayRedirectShell(): void {
  if (typeof document === "undefined") return;
  try {
    document.documentElement.classList.remove("kpay-unified-redirect");
  } catch {
    /* ignore */
  }
}

/** Merge pending PWA ids into the URL bar without navigation (no flash). */
function enrichUnifiedSummarySearchInPlace(): void {
  if (!isUnifiedKpayReturnHost()) return;
  if (normalizePathname(window.location.pathname) !== UNIFIED_KPAY_SUMMARY_PATH) return;

  const enriched = enrichKpayReturnSearch(window.location.search);
  const current = window.location.search || "";
  if (enriched === current) return;

  window.history.replaceState(null, "", `${UNIFIED_KPAY_SUMMARY_PATH}${enriched}`);
}

/** `/kpay/return` on unified apex → `/summary` without reloading the document. */
function promoteKpayReturnPathInPlace(): void {
  if (!isUnifiedKpayReturnHost()) return;
  if (normalizePathname(window.location.pathname) !== "/kpay/return") return;

  const enriched = enrichKpayReturnSearch(window.location.search);
  window.history.replaceState(null, "", `${UNIFIED_KPAY_SUMMARY_PATH}${enriched}`);
}

/**
 * Normalize KPay return URL before React paints.
 * Same-origin fixes use `replaceState` (no visible reload).
 * Vendor subdomain → apex uses one hard `location.replace`.
 *
 * @returns true when a cross-origin redirect started (do not mount React yet).
 */
export function maybeRedirectKpayReturnToUnifiedSummary(): boolean {
  if (typeof window === "undefined") return false;

  promoteKpayReturnPathInPlace();
  enrichUnifiedSummarySearchInPlace();

  const path = normalizePathname(window.location.pathname);
  if (path === UNIFIED_KPAY_SUMMARY_PATH && isUnifiedKpayReturnHost()) {
    clearKpayRedirectShell();
    return false;
  }

  if (isUnifiedKpayReturnHost()) {
    return false;
  }

  const target = buildUnifiedKpaySummaryRedirectUrl();
  if (!target) return false;

  const here = window.location.href.split("#")[0];
  if (here === target) return false;

  markKpayRedirectShell();
  window.location.replace(target);
  return true;
}
