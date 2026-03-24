/**
 * Vercel Edge Middleware: map vendor subdomains to existing store routes.
 *
 * Subdomain = same string as the vendor’s store slug (`storeName` in /store/:storeName).
 * Vendor subdomains serve the SPA at / (clean URL). No redirect to /store/... — routing uses hostname + optional VENDOR_SUBDOMAIN_SLUG_MAP.
 *
 * Optional env VENDOR_SUBDOMAIN_SLUG_MAP: JSON object, short subdomain label → real store slug.
 * Example: {"gogo":"go-go","abcstore":"abc-store"} so gogo.walwal.online → /store/go-go
 *
 * Apex / www (https://walwal.online, https://www.walwal.online) → no redirect (branding + marketplace paths).
 *
 * Set Vercel env: VENDOR_SUBDOMAIN_BASE_DOMAIN=walwal.online (apex only, no protocol)
 * DNS: add *.walwal.online → Vercel (see Vercel Domains)
 */
import { next } from "@vercel/edge";

/** Same as src/app/utils/subdomainSlugMap.ts BUILT_IN — edge bundle cannot rely on env alone. */
const BUILT_IN_SUBDOMAIN_SLUG_MAP: Record<string, string> = {
  gogo: "go-go",
  abcstore: "abc-store",
};

const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "admin",
  "app",
  "cdn",
  "mail",
  "ftp",
  "staging",
  "preview",
]);

function normalizeHost(host: string): string {
  return host.split(":")[0].toLowerCase();
}

function mergeSlugMapFromEnv(envRaw: string): Record<string, string> {
  let fromEnv: Record<string, string> = {};
  try {
    if (envRaw.trim()) {
      const p = JSON.parse(envRaw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(p)) {
        if (typeof v === "string" && v.length) fromEnv[k.toLowerCase()] = v;
      }
    }
  } catch {
    /* ignore */
  }
  return { ...BUILT_IN_SUBDOMAIN_SLUG_MAP, ...fromEnv };
}

/** If label matches a map *value* (real slug), return the map *key* (short host). go-go → gogo */
function canonicalSubdomainLabelFromMergedMap(
  merged: Record<string, string>,
  label: string
): string | null {
  const lower = label.toLowerCase();
  for (const [k, v] of Object.entries(merged)) {
    if (v.toLowerCase() === lower) return k.toLowerCase();
  }
  return null;
}

export const config = {
  matcher: ["/((?!assets/|favicon\\.ico|robots\\.txt|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};

export default function middleware(request: Request): Response {
  const host = normalizeHost(request.headers.get("host") || "");

  if (host === "localhost" || host.startsWith("127.0.0.1")) {
    return next();
  }

  let baseDomain = (process.env.VENDOR_SUBDOMAIN_BASE_DOMAIN || "").trim().toLowerCase();
  if (!baseDomain && host.endsWith(".walwal.online")) {
    baseDomain = "walwal.online";
  }
  if (!baseDomain) {
    return next();
  }

  if (host === baseDomain || host === `www.${baseDomain}`) {
    return next();
  }

  const escaped = baseDomain.replace(/\./g, "\\.");
  const subdomainMatch = host.match(new RegExp(`^([a-z0-9-]+)\\.${escaped}$`, "i"));
  if (!subdomainMatch) {
    return next();
  }

  const sub = subdomainMatch[1].toLowerCase();
  if (RESERVED_SUBDOMAINS.has(sub)) {
    return next();
  }

  const mergedMap = mergeSlugMapFromEnv((process.env.VENDOR_SUBDOMAIN_SLUG_MAP || "").trim());
  const preferred = canonicalSubdomainLabelFromMergedMap(mergedMap, sub);
  if (preferred && preferred !== sub) {
    const url = new URL(request.url);
    url.hostname = `${preferred}.${baseDomain}`;
    return Response.redirect(url, 307);
  }

  // Keep browser on / (or any path) — SPA resolves vendor from Host + slug map.
  return next();
}
