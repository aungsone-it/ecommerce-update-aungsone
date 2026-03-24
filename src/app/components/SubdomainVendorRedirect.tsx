import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router";

const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "admin",
  "app",
  "cdn",
  "mail",
  "ftp",
  "staging",
  "preview",
]);

/**
 * When the app is opened on {slug}.base.tld but the path is still "/" (edge middleware
 * skipped or env missing), send the SPA to /store/:slug so VendorStorefrontPage loads.
 */
export function SubdomainVendorRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const base = (import.meta.env.VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN || "").trim().toLowerCase();
    if (!base) return;

    const host = window.location.hostname.toLowerCase();
    if (!host.endsWith(`.${base}`)) return;

    const sub = host.slice(0, -(base.length + 1));
    if (!sub || RESERVED_SUBDOMAINS.has(sub)) return;

    const path = location.pathname;
    if (path.startsWith("/store/")) return;

    const suffix = path === "/" || path === "" ? "" : path;
    navigate(`/store/${sub}${suffix}`, { replace: true });
  }, [navigate, location.pathname]);

  return null;
}
