/** Base domain for vendor subdomains (e.g. walwal.online → gogo.walwal.online). */
export function getVendorSubdomainBase(): string {
  const fromEnv = (import.meta.env.VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN || "").trim().toLowerCase();
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && /\.walwal\.online$/i.test(window.location.hostname)) {
    return "walwal.online";
  }
  return "";
}
