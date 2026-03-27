/**
 * Guess apex domain from hostname for vendor subdomains: `gogo.example.com` → `example.com`.
 * Set `VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN` (or Vercel `VENDOR_SUBDOMAIN_BASE_DOMAIN`) when this
 * heuristic is wrong (e.g. `example.co.uk` — use env instead).
 */
export function deriveNaiveVendorApexFromHost(host: string): string | null {
  const h = host.split(":")[0].toLowerCase();
  if (h === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return null;
  const parts = h.split(".").filter(Boolean);
  if (parts.length < 3) return null;
  return parts.slice(-2).join(".");
}
