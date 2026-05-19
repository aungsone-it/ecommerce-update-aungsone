import { storeSlugFromBusinessName } from "../../utils/storeSlug";
import {
  getStoreSlugFromSubdomainLabel,
  hyphenSlugFromDisplayName,
  parseSubdomainSlugMap,
} from "./subdomainSlugMap";

/**
 * Canonical `/vendor/:slug` segment (e.g. `go-go`), not display name (`Go Go`) or host label (`gogo`).
 */
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
