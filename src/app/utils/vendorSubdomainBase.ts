import {
  isBarePlatformApexHost,
  resolveActiveVendorSubdomainBase,
  stripWwwHost,
} from "./platformApexHost";

/**
 * Apex host for vendor subdomains (e.g. `gogo.example.com` → `example.com`).
 * On a multi-label host, **derived hostname wins** over env so a mis-set build-time
 * `VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN` cannot break production. For `example.co.uk`,
 * set `VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN` explicitly (naive derivation is last-two labels only).
 */
export function getVendorSubdomainBase(): string {
  if (typeof window !== "undefined") {
    return resolveActiveVendorSubdomainBase(window.location.hostname);
  }
  return stripWwwHost(
    String(import.meta.env.VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN || "").trim()
  );
}

/**
 * Like getVendorSubdomainBase, but when the browser is already on a 2-label apex
 * (e.g. walwal.online), returns that host — deriveNaiveVendorApexFromHost only handles 3+ labels.
 */
export function getEffectiveVendorSubdomainBase(): string {
  const base = getVendorSubdomainBase().trim().toLowerCase();
  if (base || typeof window === "undefined") return base;
  const host = window.location.hostname.toLowerCase();
  if (isBarePlatformApexHost(host)) return stripWwwHost(host);
  return "";
}
