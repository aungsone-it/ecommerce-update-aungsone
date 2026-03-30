import { deriveNaiveVendorApexFromHost } from "./deriveVendorApex";

/**
 * Apex host for vendor subdomains (e.g. `gogo.example.com` → `example.com`).
 * On a multi-label host, **derived hostname wins** over env so a mis-set build-time
 * `VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN` cannot break production. For `example.co.uk`,
 * set `VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN` explicitly (naive derivation is last-two labels only).
 */
export function getVendorSubdomainBase(): string {
  const fromEnv = (import.meta.env.VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN || "").trim().toLowerCase();
  if (typeof window !== "undefined") {
    const derived = deriveNaiveVendorApexFromHost(window.location.hostname);
    if (derived) return derived;
  }
  if (fromEnv) return fromEnv;
  return "";
}

/**
 * Like getVendorSubdomainBase, but when the browser is already on a 2-label apex
 * (e.g. walwal.online), returns that host — deriveNaiveVendorApexFromHost only handles 3+ labels.
 */
export function getEffectiveVendorSubdomainBase(): string {
  const base = getVendorSubdomainBase().trim().toLowerCase();
  if (base || typeof window === "undefined") return base;
  const host = window.location.hostname.toLowerCase();
  const labels = host.split(".").filter(Boolean);
  if (
    labels.length === 2 &&
    host !== "localhost" &&
    !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  ) {
    return host;
  }
  return "";
}
