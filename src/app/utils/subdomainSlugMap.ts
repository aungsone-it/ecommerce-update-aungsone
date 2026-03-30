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
