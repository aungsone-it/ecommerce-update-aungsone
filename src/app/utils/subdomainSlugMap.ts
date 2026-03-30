import { storeSlugFromBusinessName } from "../../utils/storeSlug";

/**
 * Short subdomain host label → real `storeSlug` in /store/:slug.
 * Shipped defaults so gogo.walwal.online / abcstore.walwal.online work without Vercel env.
 * Env VENDOR_SUBDOMAIN_SLUG_MAP overrides these keys when set.
 */
export const BUILT_IN_SUBDOMAIN_SLUG_MAP: Record<string, string> = {
  gogo: "go-go",
  abcstore: "abc-store",
};

function parseEnvSlugMapOnly(): Record<string, string> {
  const raw = import.meta.env.VITE_VENDOR_SUBDOMAIN_SLUG_MAP;
  if (!raw || typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.length) out[k.toLowerCase()] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Merged built-ins + env (env wins on same key). */
export function parseSubdomainSlugMap(): Record<string, string> {
  return { ...BUILT_IN_SUBDOMAIN_SLUG_MAP, ...parseEnvSlugMapOnly() };
}

export function getStoreSlugFromSubdomainLabel(label: string): string {
  const map = parseSubdomainSlugMap();
  return map[label.toLowerCase()] ?? label;
}

/**
 * If the hostname label equals a *slug* in the map (e.g. go-go), return the preferred short label (gogo).
 * Used to redirect go-go.walwal.online → gogo.walwal.online.
 */
export function getCanonicalSubdomainLabelIfSlugForm(label: string): string | null {
  const map = parseSubdomainSlugMap();
  const lower = label.toLowerCase();
  for (const [shortLabel, slug] of Object.entries(map)) {
    if (slug.toLowerCase() === lower) return shortLabel.toLowerCase();
  }
  return null;
}

/**
 * Host label for `https://{label}.{apex}/admin` from a path store slug (e.g. go-go → gogo).
 * Returns null if the slug is not mapped (caller falls back to `/store/:slug/admin`).
 */
export function subdomainHostLabelForStoreSlug(storeSlug: string): string | null {
  const trimmed = String(storeSlug || "").trim();
  if (!trimmed) return null;
  const fromMappedValue = getCanonicalSubdomainLabelIfSlugForm(trimmed);
  if (fromMappedValue) return fromMappedValue;
  const map = parseSubdomainSlugMap();
  const lower = trimmed.toLowerCase();
  if (map[lower] != null) return lower;
  return null;
}

function isDefaultTechnicalStoreSlug(slug: string, vendorId?: string): boolean {
  const s = String(slug || "").trim();
  if (/^vendor-vendor_/i.test(s)) return true;
  if (vendorId && s === `vendor-${vendorId}`) return true;
  return false;
}

/** e.g. "Go Go" → "go-go" so map value `go-go` resolves to host `gogo`. */
export function hyphenSlugFromDisplayName(name: string): string {
  const raw = String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const s = raw
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length > 0 ? s : "";
}

function hostLabelFromDisplayString(display: string): string | null {
  const d = String(display || "").trim();
  if (!d) return null;
  const hyp = hyphenSlugFromDisplayName(d);
  if (hyp) {
    const h = subdomainHostLabelForStoreSlug(hyp);
    if (h) return h;
  }
  const compact = storeSlugFromBusinessName(d);
  if (compact && compact !== "store") {
    return subdomainHostLabelForStoreSlug(compact);
  }
  return null;
}

/**
 * Resolves `gogo` from `go-go`, map keys, or — when slug is still `vendor-vendor_*` from KV defaults —
 * from store / business / account name and email local-part (`Go Go` → `go-go` → `gogo`).
 */
export function subdomainHostLabelForVendorProfile(input: {
  storeSlug: string;
  vendorId?: string;
  storeName?: string;
  businessName?: string;
  name?: string;
  email?: string;
}): string | null {
  const slug = String(input.storeSlug || "").trim();
  const direct = subdomainHostLabelForStoreSlug(slug);
  if (direct) return direct;

  if (!isDefaultTechnicalStoreSlug(slug, input.vendorId)) return null;

  const emailLocal =
    input.email && input.email.includes("@")
      ? input.email.split("@")[0]?.replace(/[.+_]/g, " ").trim() || ""
      : "";

  const candidates = [
    input.storeName,
    input.businessName,
    input.name,
    emailLocal,
  ].filter((x): x is string => !!String(x || "").trim());

  for (const display of candidates) {
    const label = hostLabelFromDisplayString(display);
    if (label) return label;
  }
  return null;
}
