/**
 * Resolve vendor store slug from the current browser host: vendor subdomain (*.apex)
 * or verified custom domain (DNS TXT + KV). Used for / and /admin on custom hosts.
 */
import { useState, useEffect } from "react";
import { resolveVendorSubdomainStoreSlug } from "./vendorSubdomainHooks";
import { publicAnonKey } from "../../../utils/supabase/info";
import { API_BASE_URL } from "../../utils/api-client";
import {
  isBarePlatformApexHost,
  isPlatformPreviewHostname,
  isReservedPlatformApexHost,
  isLocalDevHostname,
  normalizeHostname,
  resolveVendorSubdomainApexFromHost,
} from "./platformApexHost";

const CACHE_PREFIX = "migoo-vendor-slug:";
const inflightByDomainRequests = new Map<string, Promise<string | null>>();

function normalizeHostForLookup(host: string): string {
  return normalizeHostname(host);
}

/** True when we should call by-domain API (claimable apex + verified custom domains). */
export function shouldResolveCustomDomainHost(host: string): boolean {
  const h = normalizeHostForLookup(host);
  if (!h || isLocalDevHostname(h) || isPlatformPreviewHostname(h)) return false;

  // Reserved primary apex is always marketplace — never a vendor custom domain.
  if (isReservedPlatformApexHost(h)) return false;

  const apex = resolveVendorSubdomainApexFromHost(h);
  if (apex && h !== apex && h !== `www.${apex}` && h.endsWith(`.${apex}`)) {
    const label = h.slice(0, -(apex.length + 1));
    // Single-label subdomains on a platform apex use subdomain slug routing.
    if (label && !label.includes(".") && (isReservedPlatformApexHost(apex) || isBarePlatformApexHost(apex))) {
      return false;
    }
  }

  return true;
}

function readCachedSlug(host: string): string | null {
  try {
    return sessionStorage.getItem(CACHE_PREFIX + host);
  } catch {
    return null;
  }
}

function writeCachedSlug(host: string, slug: string) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + host, slug);
  } catch {
    /* ignore */
  }
}

/** Sync read (e.g. route guards) — only returns a slug if already cached for this host. */
export function getCachedVendorHostSlug(hostname?: string): string | null {
  if (typeof window === "undefined") return null;
  const h = normalizeHostForLookup(hostname ?? window.location.hostname);
  if (!shouldResolveCustomDomainHost(h)) return null;
  return readCachedSlug(h);
}

export function clearCachedVendorHostSlug(host?: string): void {
  try {
    if (host) sessionStorage.removeItem(CACHE_PREFIX + normalizeHostForLookup(host));
    else {
      const keys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k?.startsWith(CACHE_PREFIX)) keys.push(k);
      }
      keys.forEach((k) => sessionStorage.removeItem(k));
    }
  } catch {
    /* ignore */
  }
}

export async function fetchVendorSlugByCustomDomain(
  hostname: string,
  options?: { force?: boolean }
): Promise<string | null> {
  const h = normalizeHostForLookup(hostname);
  if (!shouldResolveCustomDomainHost(h)) return null;

  if (!options?.force) {
    const cached = readCachedSlug(h);
    if (cached) return cached;
  }

  const inflight = inflightByDomainRequests.get(h);
  if (inflight) return inflight;

  const req = (async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/vendor/by-domain?domain=${encodeURIComponent(
          h
        )}`,
        { headers: { Authorization: `Bearer ${publicAnonKey}` } }
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { storeSlug?: string };
      const slug =
        typeof data.storeSlug === "string" && data.storeSlug.trim()
          ? data.storeSlug.trim()
          : null;
      if (slug) writeCachedSlug(h, slug);
      return slug;
    } catch {
      return null;
    } finally {
      inflightByDomainRequests.delete(h);
    }
  })();
  inflightByDomainRequests.set(h, req);
  return req;
}

/** Mirrors AnimatedOutlet grouping for vendor-only hosts (subdomain/custom domain). */
function isVendorOnlyHostCustomerPath(pathname: string): boolean {
  const vendorRootReserved = new Set(["admin", "setup", "vendor", "store", "blog", "auth"]);
  const first = pathname.split("/").filter(Boolean)[0] || "";
  const p = pathname.replace(/\/+$/, "") || "/";
  const isVendorStorefrontRootPath =
    p === "/" ||
    p.startsWith("/product/") ||
    p === "/saved" ||
    p.startsWith("/profile") ||
    p === "/checkout" ||
    p.startsWith("/checkout/") ||
    p === "/order-confirmation" ||
    p === "/summary";
  return isVendorStorefrontRootPath || (!!first && !vendorRootReserved.has(first));
}

/**
 * Called when `VendorStorefrontPage` unmounts: keep the vendor tab icon if navigation stayed inside the
 * customer storefront shell (avoids resetting during sibling route swaps or vendor-host path changes).
 */
export function shouldPreserveVendorStorefrontFaviconOnUnload(pathname: string): boolean {
  const p = (pathname.replace(/\/+$/, "") || "/").split("#")[0] ?? "/";

  if (p.startsWith("/vendor/") && !p.includes("/admin")) return true;

  if (resolveVendorSubdomainStoreSlug() != null) {
    return isVendorOnlyHostCustomerPath(p);
  }

  if (typeof window !== "undefined") {
    const h = normalizeHostForLookup(window.location.hostname);
    if (shouldResolveCustomDomainHost(h) && readCachedSlug(h)) {
      return isVendorOnlyHostCustomerPath(p);
    }
  }

  return false;
}

/**
 * Subdomain slug (e.g. gogo.walwal.online) or verified custom domain slug, or null.
 */
export function useResolvedVendorHostSlug(): {
  slug: string | null;
  loading: boolean;
} {
  const sub = typeof window !== "undefined" ? resolveVendorSubdomainStoreSlug() : null;
  const [customSlug, setCustomSlug] = useState<string | null>(() => {
    if (typeof window === "undefined" || sub) return null;
    const h = normalizeHostForLookup(window.location.hostname);
    if (!shouldResolveCustomDomainHost(h)) return null;
    return readCachedSlug(h);
  });
  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") return false;
    if (sub) return false;
    const h = normalizeHostForLookup(window.location.hostname);
    if (!shouldResolveCustomDomainHost(h)) return false;
    return readCachedSlug(h) === null;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sub) return;
    const h = normalizeHostForLookup(window.location.hostname);
    if (!shouldResolveCustomDomainHost(h)) {
      setLoading(false);
      return;
    }
    const cached = readCachedSlug(h);
    if (cached) {
      // Use cached value for instant routing, then revalidate in background.
      setCustomSlug(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    let cancelled = false;
    void (async () => {
      const slug = await fetchVendorSlugByCustomDomain(h, { force: !cached });
      if (cancelled) return;
      setCustomSlug(slug);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sub]);

  return { slug: sub ?? customSlug, loading: sub ? false : loading };
}
