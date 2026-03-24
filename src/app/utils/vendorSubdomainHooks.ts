import { getVendorSubdomainBase } from "./vendorSubdomainBase";
import { getStoreSlugFromSubdomainLabel } from "./subdomainSlugMap";

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

/** Real store slug for the current vendor subdomain host (e.g. gogo.walwal.online → go-go), or null if not a vendor host. */
export function resolveVendorSubdomainStoreSlug(): string | null {
  const base = getVendorSubdomainBase();
  if (!base || typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  if (!host.endsWith(`.${base}`)) return null;
  if (host === base || host === `www.${base}`) return null;
  const label = host.slice(0, -(base.length + 1));
  if (!label || RESERVED_SUBDOMAINS.has(label)) return null;
  return getStoreSlugFromSubdomainLabel(label);
}
