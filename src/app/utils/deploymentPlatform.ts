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

export function isEdgeOnePlatformValue(platform?: string): boolean {
  const normalized = String(platform || "").trim().toLowerCase();
  return normalized === "edgeone" || normalized === "tencent";
}

/** CNAME shown in vendor custom-domain instructions (API value wins when explicit). */
export function resolveCustomDomainCnameTarget(
  apiValue?: string,
  hostname?: string,
  forceEdgeOne = false
): string {
  const edgeOne = forceEdgeOne || isEdgeOneDeployment(hostname);
  const fromApi = String(apiValue || "").trim();
  if (fromApi && (!edgeOne || fromApi !== "cname.vercel-dns.com")) {
    return fromApi;
  }

  const envHint = String(import.meta.env.VITE_CUSTOM_DOMAIN_CNAME_TARGET || "").trim();
  if (envHint) return envHint;

  if (edgeOne) return "";

  return "cname.vercel-dns.com";
}
