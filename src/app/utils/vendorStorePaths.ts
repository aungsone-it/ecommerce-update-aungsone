import { storeSlugFromBusinessName } from "../../utils/storeSlug";
import {
  getStoreSlugFromSubdomainLabel,
  hyphenSlugFromDisplayName,
  parseSubdomainSlugMap,
} from "./subdomainSlugMap";

/**
 * Canonical `/vendor/:slug` segment (e.g. `go-go`), not display name (`Go Go`) or host label (`gogo`).
 */
/** True when URL segment and resolved store slug refer to the same vendor (e.g. `go-go` vs `gogo`). */
export function vendorPathStoreSlugsMatch(
  pathStoreSegment: string | null | undefined,
  resolvedStoreSlug: string | null | undefined
): boolean {
  const a = resolveVendorPathSlug(pathStoreSegment);
  const b = resolveVendorPathSlug(resolvedStoreSlug);
  return Boolean(a && b && a === b);
}

export function resolveVendorPathSlug(
  segment: string | null | undefined,
  apiStoreSlug?: string | null | undefined,
): string {
  const fromApi = String(apiStoreSlug || "").trim();
  if (fromApi && !/\s/.test(fromApi) && !/^vendor-vendor_/i.test(fromApi)) {
    return fromApi;
  }

  const raw = String(segment || "").trim();
  if (!raw) return "";

  const lower = raw.toLowerCase();
  const map = parseSubdomainSlugMap();
  if (map[lower]) return map[lower];

  for (const slug of Object.values(map)) {
    if (slug.toLowerCase() === lower) return slug;
  }

  if (!/\s/.test(raw) && raw === lower && /^[a-z0-9-]+$/.test(raw)) {
    return raw;
  }

  const hyphen = hyphenSlugFromDisplayName(raw);
  if (hyphen) {
    for (const slug of Object.values(map)) {
      if (slug.toLowerCase() === hyphen.toLowerCase()) return slug;
    }
    const compactKey = hyphen.replace(/-/g, "");
    if (map[compactKey]) return map[compactKey];
    return hyphen;
  }

  const compact = storeSlugFromBusinessName(raw);
  const mapped = getStoreSlugFromSubdomainLabel(compact);
  return mapped || compact || "store";
}

/** KV default like `vendor-vendor_*` — not suitable for `/vendor/:slug` links on localhost. */
export function isDefaultTechnicalVendorStoreSlug(slug: string | null | undefined): boolean {
  const s = String(slug || "").trim();
  return /^vendor-vendor_/i.test(s);
}

/**
 * Store segment from a path-based vendor URL (`/vendor/go-go/...` or `/vendor-go-go/...`).
 * Returns null on vendor-only hosts (`/`, `/product/...`) and non-vendor paths.
 */
export function pathVendorStoreSlugFromPathname(pathname: string): string | null {
  const parts = String(pathname || "")
    .split("/")
    .filter(Boolean);
  if (parts.length === 0) return null;

  const first = parts[0] || "";
  if (first === "vendor") {
    const seg = parts[1] || "";
    if (!seg) return null;
    const reserved = new Set(["application", "setup", "login"]);
    if (reserved.has(seg.toLowerCase())) return null;
    try {
      return decodeURIComponent(seg).trim() || null;
    } catch {
      return seg.trim() || null;
    }
  }

  if (first.startsWith("vendor-")) {
    const seg = first.slice("vendor-".length).trim();
    if (!seg) return null;
    try {
      return decodeURIComponent(seg).trim() || null;
    } catch {
      return seg;
    }
  }

  return null;
}

/** Prefer friendly `/vendor/:slug` segment for links — never a bare `vendor-vendor_*` id when a path slug exists. */
export function resolveVendorStoreLinkSlug(
  pathname: string,
  storeSlug: string | null | undefined,
  vendorId: string | null | undefined,
  apiStoreSlug?: string | null | undefined,
): string {
  const fromPath = pathVendorStoreSlugFromPathname(pathname);
  if (fromPath && !isDefaultTechnicalVendorStoreSlug(fromPath)) {
    return resolveVendorPathSlug(fromPath);
  }

  const fromProp = String(storeSlug || "").trim();
  if (fromProp && !isDefaultTechnicalVendorStoreSlug(fromProp)) {
    return resolveVendorPathSlug(fromProp, apiStoreSlug);
  }

  const fromVendor = String(vendorId || "").trim();
  if (fromVendor && !isDefaultTechnicalVendorStoreSlug(fromVendor)) {
    return resolveVendorPathSlug(fromVendor, apiStoreSlug);
  }

  if (fromPath) return resolveVendorPathSlug(fromPath);
  if (fromProp) return resolveVendorPathSlug(fromProp, apiStoreSlug);
  return resolveVendorPathSlug(fromVendor, apiStoreSlug);
}

/** Storefront home: `/` on vendor subdomain, `/vendor/:slug` on apex/localhost. */
export function buildVendorStoreHomePath(params: {
  pathSlug: string;
  hostRootStorePaths?: boolean;
  useVendorDashPrefix?: boolean;
}): string {
  if (params.hostRootStorePaths) return "/";
  const slug = resolveVendorPathSlug(params.pathSlug);
  if (!slug) return "/";
  const enc = encodeURIComponent(slug);
  return params.useVendorDashPrefix ? `/vendor-${enc}` : `/vendor/${enc}`;
}

/** Join storefront paths without producing `//segment` when base is `/`. */
export function joinStorefrontPath(base: string, ...parts: string[]): string {
  const segments = [
    ...String(base || "")
      .split("/")
      .filter(Boolean),
    ...parts.flatMap((part) =>
      String(part || "")
        .split("/")
        .filter(Boolean)
    ),
  ];
  return segments.length ? `/${segments.join("/")}` : "/";
}

export function buildVendorStoreCheckoutPath(params: {
  pathSlug: string;
  hostRootStorePaths?: boolean;
  useVendorDashPrefix?: boolean;
}): string {
  return joinStorefrontPath(buildVendorStoreHomePath(params), "checkout");
}

export function buildVendorStoreSummaryPath(params: {
  pathSlug: string;
  hostRootStorePaths?: boolean;
  useVendorDashPrefix?: boolean;
}): string {
  return joinStorefrontPath(buildVendorStoreHomePath(params), "summary");
}

/** Normalize pathname for checkout localStorage keys (handles legacy `//checkout`). */
export function normalizeCheckoutStoragePath(pathname: string): string {
  const raw = String(pathname || "/checkout").split("?")[0]?.split("#")[0] || "/checkout";
  const collapsed = raw.replace(/\/{2,}/g, "/");
  return collapsed.startsWith("/") ? collapsed : `/${collapsed}`;
}
