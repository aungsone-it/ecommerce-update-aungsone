/**
 * Guess apex domain from hostname for vendor subdomains: `gogo.example.com` → `example.com`.
 * Set `VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN` (or Vercel `VENDOR_SUBDOMAIN_BASE_DOMAIN`) when this
 * heuristic is wrong (e.g. `example.co.uk` — use env instead).
 *
 * Hosts like `*.netlify.app` / `*.vercel.app` must **not** yield `netlify.app` / `vercel.app` here —
 * that would make every deploy URL look like a vendor subdomain of a shared platform apex and
 * break catalog (wrong store slug from the deploy name).
 */
const MULTI_TENANT_PLATFORM_APEX = new Set([
  "amplifyapp.com",
  "cloudflarepages.dev",
  "firebaseapp.com",
  "github.io",
  "netlify.app",
  "pages.dev",
  "vercel.app",
  "web.app",
]);

export function deriveNaiveVendorApexFromHost(host: string): string | null {
  const h = host.split(":")[0].toLowerCase();
  if (h === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return null;
  const parts = h.split(".").filter(Boolean);
  if (parts.length < 3) return null;
  const naive = parts.slice(-2).join(".");
  if (MULTI_TENANT_PLATFORM_APEX.has(naive)) return null;
  return naive;
}
