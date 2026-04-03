/**
 * Avoid showing internal vendor ids (e.g. vendor_123…, vendor-vendor_…) in admin UI.
 * Build a multi-key lookup from the vendors list, then resolve labels for display.
 */

export function looksLikeTechnicalVendorRef(s: string): boolean {
  const t = String(s || "").trim();
  if (!t) return false;
  if (/^vendor[_-]vendor_/i.test(t)) return true;
  if (/^vendor-vendor_/i.test(t)) return true;
  if (/^vendor_\d/i.test(t)) return true;
  return false;
}

/** Preferred display name for a vendor row. */
function vendorRowLabel(v: Record<string, unknown>): string {
  const business = String(v.businessName || "").trim();
  const name = String(v.name || "").trim();
  const slug = String(v.storeSlug || "").trim();
  const id = String(v.id || "").trim();
  return (business || name || slug || id || "Vendor store").trim();
}

/**
 * Map id, slug, names, and `vendor-{id}` → display label (for selectedVendors + chat).
 */
export function buildVendorDisplayLookup(vendorsList: unknown[]): Record<string, string> {
  const map: Record<string, string> = {};
  if (!Array.isArray(vendorsList)) return map;

  for (const row of vendorsList) {
    if (!row || typeof row !== "object") continue;
    const v = row as Record<string, unknown>;
    const label = vendorRowLabel(v);
    const id = String(v.id || "").trim();
    const slug = String(v.storeSlug || "").trim();
    const name = String(v.name || "").trim();
    const business = String(v.businessName || "").trim();

    const keys = new Set<string>();
    for (const k of [id, slug, name, business]) {
      const t = k.trim();
      if (t) {
        keys.add(t);
        keys.add(t.toLowerCase());
      }
    }
    if (id) {
      keys.add(`vendor-${id}`);
      keys.add(`vendor-${id}`.toLowerCase());
    }

    for (const k of keys) {
      map[k] = label;
    }
  }
  return map;
}

/**
 * Resolve a single stored vendor reference (id, slug, or name) to a user-facing label.
 * Never returns raw technical ids — uses "Vendor store" until lookup can name them.
 */
export function resolveVendorDisplayLabel(
  raw: string | undefined | null,
  lookup: Record<string, string>
): string {
  const s = String(raw ?? "").trim();
  if (!s) return "\u2014";

  const tryOrder = [s, s.toLowerCase()];
  let rest = s.replace(/^vendor-/i, "");
  if (rest !== s) {
    tryOrder.push(rest, rest.toLowerCase());
    const rest2 = rest.replace(/^vendor-/i, "");
    if (rest2 !== rest) {
      tryOrder.push(rest2, rest2.toLowerCase());
    }
  }

  for (const k of tryOrder) {
    const hit = lookup[k];
    if (hit) return hit;
  }

  if (looksLikeTechnicalVendorRef(s)) return "Vendor store";
  return s;
}

/** Admin chat: combine vendorId + vendorSource so we never flash a technical id. */
export function resolveChatVendorLabel(
  vendorSource: string | undefined | null,
  vendorId: string | undefined | null,
  lookup: Record<string, string>
): string | null {
  const src = String(vendorSource ?? "").trim();
  const vid = String(vendorId ?? "").trim();
  if (!src && !vid) return null;
  if (src.toUpperCase() === "SECURE" && !vid) return "SECURE";

  for (const key of [vid, src]) {
    if (!key) continue;
    const label = resolveVendorDisplayLabel(key, lookup);
    if (label === "\u2014") continue;
    if (label !== "Vendor store") return label;
    if (!looksLikeTechnicalVendorRef(key)) return label;
  }
  return "Vendor store";
}
