/**
 * Resolve vendor store slug from the current browser host: vendor subdomain (*.apex)
 * or verified custom domain (DNS TXT + KV). Used for / and /admin on custom hosts.
 */
import { useState, useEffect } from "react";
import { resolveVendorSubdomainStoreSlug } from "./vendorSubdomainHooks";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";

const CACHE_PREFIX = "migoo-vendor-slug:";

function normalizeHostForLookup(host: string): string {
  return host.split(":")[0].toLowerCase();
}

/** True when we should call by-domain API (not marketplace apex, not platform subdomain, not preview). */
export function shouldResolveCustomDomainHost(host: string): boolean {
  const h = normalizeHostForLookup(host);
  if (!h || h === "localhost" || h.startsWith("127.")) return false;
  if (h.endsWith(".vercel.app") || h.endsWith(".netlify.app")) return false;

  // Important: only use explicit env-configured platform apex for exclusion.
  // Using runtime-derived apex here can misclassify a true custom domain
  // (e.g. "migoo.store") as the platform host and skip by-domain resolution.
  const base = String(import.meta.env.VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN || "")
    .trim()
    .toLowerCase();
  if (base) {
    if (h === base || h === `www.${base}`) return false;
    if (h.endsWith(`.${base}`)) return false;
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

export async function fetchVendorSlugByCustomDomain(hostname: string): Promise<string | null> {
  const h = normalizeHostForLookup(hostname);
  if (!shouldResolveCustomDomainHost(h)) return null;

  const cached = readCachedSlug(h);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-16010b6f/vendor/by-domain?domain=${encodeURIComponent(
        h
      )}`,
      { headers: { Authorization: `Bearer ${publicAnonKey}` } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { storeSlug?: string };
    const slug = typeof data.storeSlug === "string" && data.storeSlug.trim() ? data.storeSlug.trim() : null;
    if (slug) writeCachedSlug(h, slug);
    return slug;
  } catch {
    return null;
  }
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
      setCustomSlug(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const slug = await fetchVendorSlugByCustomDomain(h);
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
