import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { getVendorSubdomainBase } from "../utils/vendorSubdomainBase";
import { getStoreSlugFromSubdomainLabel } from "../utils/subdomainSlugMap";

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
 * On vendor subdomains, storefront "home" lives at /. If someone opens
 * /store/go-go or /store/gogo (mapped), normalize to / so the address bar stays clean.
 */
export function SubdomainVendorRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const base = getVendorSubdomainBase();
    if (!base) return;

    const host = window.location.hostname.toLowerCase();
    if (!host.endsWith(`.${base}`)) return;

    const label = host.slice(0, -(base.length + 1));
    if (!label || RESERVED_SUBDOMAINS.has(label)) return;

    const resolved = getStoreSlugFromSubdomainLabel(label);
    const path = location.pathname;
    if (!path.startsWith("/store/")) return;

    const homeMatch = path.match(/^\/store\/([^/]+)\/?$/);
    if (!homeMatch) return;

    const pathSlug = decodeURIComponent(homeMatch[1]);
    if (pathSlug === resolved || pathSlug === label) {
      navigate(
        { pathname: "/", search: location.search, hash: location.hash },
        { replace: true }
      );
    }
  }, [navigate, location.pathname, location.search, location.hash]);

  return null;
}
