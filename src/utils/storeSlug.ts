/**
 * Same rules as Edge function: lowercase a-z0-9 only (no spaces/hyphens).
 * Keeps public store URL + subdomain in sync: city mart → citymart, long name → citymartonlinestore
 */
export function storeSlugFromBusinessName(name: string): string {
  const raw = String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const s = raw.replace(/[^a-z0-9]+/g, "");
  const trimmed = s.slice(0, 63);
  return trimmed.length > 0 ? trimmed : "store";
}
