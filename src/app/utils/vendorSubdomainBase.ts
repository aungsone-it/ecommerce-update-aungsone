/** Base domain for vendor subdomains (e.g. walwal.online → gogo.walwal.online). */
export function getVendorSubdomainBase(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    // Prefer the live hostname over build-time env so Vercel misconfiguration
    // (wrong VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN) cannot blank vendor subdomains.
    if (host.endsWith(".walwal.online")) {
      return "walwal.online";
    }
  }
  const fromEnv = (import.meta.env.VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN || "").trim().toLowerCase();
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && /\.walwal\.online$/i.test(window.location.hostname)) {
    return "walwal.online";
  }
  return "";
}
