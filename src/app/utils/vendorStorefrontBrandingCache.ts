import {
  lsVendorCatalogPage1Key,
  PERSISTED_CATALOG_TTL_MS,
  readPersistedJson,
} from "./persistedLocalCache";
import { applyDocumentFavicon } from "./documentFavicon";
import {
  buildVendorStorefrontDocumentTitle,
  vendorCompactBrandFromSlug,
} from "./vendorStorefrontDocumentTitle";
import { resolveVendorSubdomainStoreSlug } from "./vendorSubdomainHooks";

/** Must match `VendorStoreView` browse page size for LS key alignment. */
export const VENDOR_STOREFRONT_BROWSE_PAGE_SIZE = 12;

export type VendorStorefrontBranding = {
  storeName: string;
  storeLogo: string;
};

export function isGenericVendorStoreLabel(name: string | null | undefined): boolean {
  const raw = String(name || "").trim();
  return !raw || /^vendor\s+store$/i.test(raw);
}

/** Prefer cached store name; never flash generic "Vendor Store" when a slug is known. */
export function resolveVendorStoreDisplayName(
  slug: string | undefined | null,
  cachedName?: string | null,
): string {
  const cached = String(cachedName || "").trim();
  if (!isGenericVendorStoreLabel(cached)) return cached;
  const fromSlug = vendorCompactBrandFromSlug(slug);
  if (fromSlug) return fromSlug;
  return cached || "Store";
}

function cleanAsciiUrlSegment(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function legacyNameUrlSegment(product: { name?: string }): string {
  return String(product.name || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function buildVendorProductUrlSegment(product: {
  name?: string;
  sku?: string;
  id: string;
}): string {
  const sku = cleanAsciiUrlSegment(product.sku);
  if (sku.length > 0) return sku;
  const id = cleanAsciiUrlSegment(product.id);
  if (id.length > 0) return id;
  const fromName = legacyNameUrlSegment(product);
  if (fromName.length > 0) return fromName;
  return product.id;
}

function safeDecodePathSegment(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

function resolveProductFromSlug(
  products: Array<{ name?: string; sku?: string; id: string; variants?: Array<{ sku?: string }> }>,
  decoded: string,
): { name?: string } | undefined {
  const dec = decoded.trim();
  const norm = cleanAsciiUrlSegment(dec);
  const direct =
    products.find((p) => buildVendorProductUrlSegment(p) === norm) ||
    products.find((p) => legacyNameUrlSegment(p) === norm) ||
    products.find((p) => String(p.sku || "").trim().toLowerCase() === dec.toLowerCase()) ||
    products.find((p) => String(p.id || "").trim().toLowerCase() === dec.toLowerCase());
  if (direct) return direct;
  return products.find(
    (p) =>
      Array.isArray(p.variants) &&
      p.variants.some((v) => String(v?.sku || "").trim().toLowerCase() === dec.toLowerCase()),
  );
}

export function readCachedVendorCatalogPayload(
  slug: string,
): Record<string, unknown> | null {
  const keySlug = String(slug || "").trim();
  if (!keySlug) return null;

  const directKey = lsVendorCatalogPage1Key(
    keySlug,
    "",
    "all",
    VENDOR_STOREFRONT_BROWSE_PAGE_SIZE,
  );
  const direct = readPersistedJson<Record<string, unknown>>(
    directKey,
    PERSISTED_CATALOG_TTL_MS,
  );
  if (direct && typeof direct === "object") return direct;

  if (typeof localStorage === "undefined") return null;
  const needle = keySlug.toLowerCase();
  const prefix = "migoo-ls-vendor-p1-";
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      if (!key.includes(encodeURIComponent(keySlug))) continue;
      const payload = readPersistedJson<Record<string, unknown>>(
        key,
        PERSISTED_CATALOG_TTL_MS,
      );
      if (!payload || typeof payload !== "object") continue;
      const payloadSlug = String(
        (payload.storeSlug as string) || (payload.slug as string) || "",
      )
        .trim()
        .toLowerCase();
      const resolvedSlug = String(
        (payload.resolvedVendorId as string) || "",
      )
        .trim()
        .toLowerCase();
      if (payloadSlug === needle || resolvedSlug === needle || key.includes(encodeURIComponent(keySlug))) {
        return payload;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function readCachedVendorBrandingBySlug(
  slug: string | undefined | null,
): VendorStorefrontBranding {
  const keySlug = String(slug || "").trim();
  if (!keySlug) {
    return { storeName: "Store", storeLogo: "" };
  }

  const payload = readCachedVendorCatalogPayload(keySlug);
  if (payload) {
    return {
      storeName: resolveVendorStoreDisplayName(
        keySlug,
        typeof payload.storeName === "string" ? payload.storeName : null,
      ),
      storeLogo:
        typeof payload.logo === "string" && payload.logo.trim()
          ? payload.logo.trim()
          : "",
    };
  }

  let storeLogo = "";
  if (typeof localStorage !== "undefined") {
    const needle = keySlug.toLowerCase();
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const raw = localStorage.getItem(key);
        if (!raw || (raw[0] !== "{" && raw[0] !== "[")) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue;
        }
        const candidates = Array.isArray(parsed) ? parsed : [parsed];
        for (const c of candidates) {
          if (!c || typeof c !== "object") continue;
          const row = c as Record<string, unknown>;
          const cSlug = String(row.storeSlug || row.slug || "")
            .trim()
            .toLowerCase();
          if (cSlug !== needle) continue;
          const logo =
            typeof row.logo === "string"
              ? row.logo
              : typeof row.storeLogo === "string"
                ? row.storeLogo
                : "";
          if (logo.trim()) storeLogo = logo.trim();
          const name =
            typeof row.storeName === "string" ? row.storeName.trim() : "";
          if (!isGenericVendorStoreLabel(name)) {
            return {
              storeName: resolveVendorStoreDisplayName(keySlug, name),
              storeLogo,
            };
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  return {
    storeName: resolveVendorStoreDisplayName(keySlug, null),
    storeLogo,
  };
}

export function readCachedVendorProductName(
  vendorSlug: string | undefined | null,
  productSlug: string | undefined | null,
): string | null {
  const slug = String(vendorSlug || "").trim();
  const productSeg = String(productSlug || "").trim();
  if (!slug || !productSeg) return null;

  const payload = readCachedVendorCatalogPayload(slug);
  if (!payload) return null;
  const products = Array.isArray(payload.products) ? payload.products : [];
  const decoded = safeDecodePathSegment(productSeg);
  if (!decoded) return null;
  const match = resolveProductFromSlug(products, decoded);
  const name = typeof match?.name === "string" ? match.name.trim() : "";
  return name || null;
}

export function parseVendorStoreSlugFromPathname(pathname: string): string | null {
  const path = (pathname || "/").replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const first = parts[0] || "";
  if (first.startsWith("vendor-")) {
    const slug = first.slice("vendor-".length).trim();
    return slug ? safeDecodePathSegment(slug) : null;
  }
  if (first === "vendor" && parts[1]) {
    return safeDecodePathSegment(parts[1]);
  }
  return null;
}

export function parseVendorProductSlugFromPathname(pathname: string): string | null {
  const path = (pathname || "/").replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const first = parts[0] || "";
  if (first.startsWith("vendor-")) {
    if (parts[1] === "product" && parts[2]) return safeDecodePathSegment(parts[2]);
    return null;
  }
  if (first === "vendor" && parts.length >= 4 && parts[2] === "product") {
    return safeDecodePathSegment(parts[3]);
  }
  if (first === "product" && parts[1]) {
    return safeDecodePathSegment(parts[1]);
  }
  return null;
}

function vendorStoreBaseFromPath(pathname: string, slug: string): string {
  const path = (pathname || "/").replace(/\/+$/, "") || "/";
  if (path.startsWith("/vendor-")) return `/vendor-${encodeURIComponent(slug)}`;
  if (path.startsWith("/vendor/")) return `/vendor/${encodeURIComponent(slug)}`;
  return "";
}

/** Runs synchronously before React — avoids SECURE / Vendor Store tab flash on vendor routes. */
export function primeVendorStorefrontHeadFromCache(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;

  const { pathname } = window.location;
  let slug = parseVendorStoreSlugFromPathname(pathname);
  if (!slug) {
    slug = resolveVendorSubdomainStoreSlug();
  }
  if (!slug) return false;

  const branding = readCachedVendorBrandingBySlug(slug);
  const productSlug = parseVendorProductSlugFromPathname(pathname);
  const productName = readCachedVendorProductName(slug, productSlug);
  const storeBase = vendorStoreBaseFromPath(pathname, slug);

  document.title = buildVendorStorefrontDocumentTitle({
    vendorSlug: slug,
    pathname,
    storeBase,
    savedPage: /\/saved$/i.test(pathname),
    vendorViewMode: "storefront",
    profileOrderId: null,
    selectedProductName: productName,
    storeDisplayNameFallback: branding.storeName,
  });

  if (branding.storeLogo) {
    applyDocumentFavicon(branding.storeLogo);
  }

  return true;
}
