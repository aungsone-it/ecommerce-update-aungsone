/** Optional map: short subdomain label → real store slug (URL segment). Example: gogo → go-go */
export function parseSubdomainSlugMap(): Record<string, string> {
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
