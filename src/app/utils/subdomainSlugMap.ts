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
