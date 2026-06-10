/**
 * Platform apex hosts: any production domain pointed at Vercel acts as the marketplace
 * (landing, super-admin, vendor onboarding) until a vendor claims it as a custom domain.
 *
 * Configure primary / non-claimable apex via `VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN` and optional
 * `VITE_PLATFORM_RESERVED_APEX_DOMAINS` (comma-separated, e.g. `walwal.online,www.walwal.online`).
 */
import {
  deriveNaiveVendorApexFromHost,
  MULTI_TENANT_PLATFORM_APEX,
} from "./deriveVendorApex";

export { MULTI_TENANT_PLATFORM_APEX };

export function normalizeHostname(host: string): string {
  return host.split(":")[0].toLowerCase();
}

export function stripWwwHost(host: string): string {
  const h = normalizeHostname(host);
  return h.startsWith("www.") ? h.slice(4) : h;
}

export function isPlatformPreviewHostname(host: string): boolean {
  const h = normalizeHostname(host);
  if (h.endsWith(".vercel.app") || h.endsWith(".netlify.app") || h.endsWith(".railway.app")) {
    return true;
  }
  const parts = h.split(".").filter(Boolean);
  if (parts.length >= 2) {
    const naive = parts.slice(-2).join(".");
    if (MULTI_TENANT_PLATFORM_APEX.has(naive)) return true;
  }
  return false;
}

export function isLocalDevHostname(host: string): boolean {
  const h = normalizeHostname(host);
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "[::1]" ||
    h.endsWith(".localhost")
  );
}

/** Bare apex: `example.com` or `www.example.com` (not a subdomain, not preview/local). */
export function isBarePlatformApexHost(host: string): boolean {
  const h = normalizeHostname(host);
  if (!h || isLocalDevHostname(h) || isPlatformPreviewHostname(h)) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false;
  const bare = stripWwwHost(h);
  const parts = bare.split(".").filter(Boolean);
  if (parts.length !== 2) return false;
  const naive = parts.join(".");
  if (MULTI_TENANT_PLATFORM_APEX.has(naive)) return false;
  return h === bare || h === `www.${bare}`;
}

/** Apex label for vendor subdomains (`gogo.example.com` → `example.com`). */
export function resolveVendorSubdomainApexFromHost(host: string): string | null {
  const h = normalizeHostname(host);
  if (isLocalDevHostname(h) || isPlatformPreviewHostname(h)) return null;
  const derived = deriveNaiveVendorApexFromHost(h);
  if (derived) return derived;
  if (isBarePlatformApexHost(h)) return stripWwwHost(h);
  return null;
}

/**
 * Active apex for vendor wildcard subdomains on the current request.
 * Host-derived apex wins over env so `gogo.bash2.online` works even when env still says `walwal.online`.
 */
export function resolveActiveVendorSubdomainBase(hostname?: string): string {
  const host = normalizeHostname(
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")
  );
  const fromHost = resolveVendorSubdomainApexFromHost(host);
  if (fromHost) return fromHost;
  return stripWwwHost(
    String(import.meta.env.VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN || "").trim()
  );
}

/** Build vendor subdomain hostname, e.g. `gogo` + `bash2.online` → `gogo.bash2.online`. */
export function buildVendorSubdomainHostname(
  storeLabel: string,
  hostname?: string
): string | null {
  const label = storeLabel.trim().toLowerCase();
  const apex = resolveActiveVendorSubdomainBase(hostname);
  if (!label || !apex) return null;
  return `${label}.${apex}`;
}

function parseReservedApexList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => stripWwwHost(s.trim()))
    .filter(Boolean);
}

/** Domains that always serve the marketplace and cannot be vendor custom domains. */
export function getReservedPlatformApexDomains(): Set<string> {
  const reserved = new Set<string>();
  for (const d of parseReservedApexList(
    String(import.meta.env.VITE_PLATFORM_RESERVED_APEX_DOMAINS || "")
  )) {
    reserved.add(d);
  }
  const primary = stripWwwHost(
    String(import.meta.env.VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN || "").trim()
  );
  if (primary) reserved.add(primary);
  return reserved;
}

export function isReservedPlatformApexHost(host: string): boolean {
  const bare = stripWwwHost(host);
  if (!bare) return false;
  return getReservedPlatformApexDomains().has(bare);
}

/**
 * True when the host should show marketplace landing at `/` (sync heuristic).
 * Claimable bare apex hosts may still resolve to a vendor store after `/vendor/by-domain`.
 */
export function isMarketplaceApexHost(hostname?: string): boolean {
  const host = normalizeHostname(
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")
  );
  if (!host) return false;
  if (isReservedPlatformApexHost(host)) return true;
  if (isBarePlatformApexHost(host)) return true;
  return false;
}

/** Primary platform apex for KPay unified return and subdomain URLs (current host, then env). */
export function resolvePrimaryPlatformApexHost(hostname?: string): string {
  return resolveActiveVendorSubdomainBase(hostname);
}

/** Storefront-only paths that must not exist on marketplace apex hosts. */
export const MARKETPLACE_APEX_BLOCKED_PATH_PREFIXES = [
  "/product/",
  "/profile",
  "/saved",
  "/checkout",
  "/order-confirmation",
] as const;

export function isStorefrontPathBlockedOnMarketplaceApex(pathname: string): boolean {
  const path = (pathname.split("?")[0] || "").replace(/\/+$/, "") || "/";
  if (path === "/checkout" || path === "/order-confirmation" || path === "/saved") {
    return true;
  }
  return MARKETPLACE_APEX_BLOCKED_PATH_PREFIXES.some(
    (prefix) => prefix.endsWith("/") && path.startsWith(prefix)
  );
}
