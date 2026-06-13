/**
 * Guess apex domain from hostname for vendor subdomains: `gogo.example.com` → `example.com`.
 * Set `VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN` (or Vercel `VENDOR_SUBDOMAIN_BASE_DOMAIN`) when this
 * heuristic is wrong (e.g. `example.co.uk` — use env instead).
 *
 * Hosts like `*.netlify.app` / `*.vercel.app` / `*.up.railway.app` must **not** yield those shared
 * platform apexes here — that would make every deploy URL look like a vendor subdomain and break
 * catalog (wrong store slug from the deploy name).
 */
export const MULTI_TENANT_PLATFORM_APEX = new Set([
  "amplifyapp.com",
  "cloudflarepages.dev",
  "firebaseapp.com",
  "github.io",
  "netlify.app",
  "pages.dev",
  "railway.app",
  "edgeone.dev",
  "vercel.app",
  "web.app",
]);

export function deriveNaiveVendorApexFromHost(host: string): string | null {
  const h = host.split(":")[0].toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return null;
  const parts = h.split(".").filter(Boolean);
  // Local dev: gogo.localhost → apex "localhost" (matches VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN=localhost).
  if (parts.length >= 2 && parts[parts.length - 1] === "localhost") {
    return "localhost";
  }
  if (h === "localhost" || parts.length < 3) return null;
  const naive = parts.slice(-2).join(".");
  if (MULTI_TENANT_PLATFORM_APEX.has(naive)) return null;
  return naive;
}
