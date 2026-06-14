/** Detect whether the storefront/admin UI is running on Tencent EdgeOne Makers. */
export function isEdgeOneDeployment(hostname?: string): boolean {
  const host = (hostname ?? (typeof window !== "undefined" ? window.location.hostname : ""))
    .split(":")[0]
    .toLowerCase();
  if (host.endsWith(".edgeone.dev")) return true;

  const platform = String(import.meta.env.VITE_DEPLOYMENT_PLATFORM || "")
    .trim()
    .toLowerCase();
  return platform === "edgeone" || platform === "tencent";
}

/** CNAME shown in vendor custom-domain instructions (API value wins when explicit). */
export function resolveCustomDomainCnameTarget(apiValue?: string, hostname?: string): string {
  const fromApi = String(apiValue || "").trim();
  if (fromApi && (!isEdgeOneDeployment(hostname) || fromApi !== "cname.vercel-dns.com")) {
    return fromApi;
  }

  const envHint = String(import.meta.env.VITE_CUSTOM_DOMAIN_CNAME_TARGET || "").trim();
  if (envHint) return envHint;

  if (isEdgeOneDeployment(hostname)) return "";

  return "cname.vercel-dns.com";
}
