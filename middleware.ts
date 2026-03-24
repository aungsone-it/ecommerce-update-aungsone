/**
 * Vercel Edge Middleware: map vendor subdomains to existing store routes.
 *
 * Subdomain = same string as the vendor’s store slug (`storeName` in /store/:storeName).
 * Example: https://abcstore.walwal.online → /store/abc-store when VENDOR_SUBDOMAIN_SLUG_MAP maps them.
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

function storeSlugFromSubdomainLabel(label: string): string {
  const raw = (process.env.VENDOR_SUBDOMAIN_SLUG_MAP || "").trim();
  if (!raw) return label;
  try {
    const map = JSON.parse(raw) as Record<string, unknown>;
    const lower = label.toLowerCase();
    for (const [k, v] of Object.entries(map)) {
      if (k.toLowerCase() === lower && typeof v === "string" && v.length) return v;
    }
    return label;
  } catch {
    return label;
  }
}

export const config = {
  matcher: ["/((?!assets/|favicon\\.ico|robots\\.txt|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};

export default function middleware(request: Request): Response {
  const url = new URL(request.url);
  const host = normalizeHost(request.headers.get("host") || "");

  if (host === "localhost" || host.startsWith("127.0.0.1")) {
    return next();
  }

  const baseDomain = (process.env.VENDOR_SUBDOMAIN_BASE_DOMAIN || "").trim().toLowerCase();
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

  let pathname = url.pathname;
  if (pathname.startsWith("/store/")) {
    return next();
  }

  const storeSlug = storeSlugFromSubdomainLabel(sub);
  if (pathname === "/" || pathname === "") {
    url.pathname = `/store/${storeSlug}`;
  } else {
    url.pathname = `/store/${storeSlug}${pathname}`;
  }

  // Use redirect (not rewrite) so the browser URL path is /store/... — the SPA reads pathname and React Router must match /store/:storeName.
  return Response.redirect(url, 307);
}
