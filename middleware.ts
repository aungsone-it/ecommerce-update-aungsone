/**
 * Vercel Edge Middleware: map vendor subdomains to existing store routes.
 *
 * Subdomain = same string as the vendor’s store slug (`storeName` in /store/:storeName).
 * Vendor subdomains serve the SPA at / (clean URL). No redirect to /store/... — routing uses hostname + optional VENDOR_SUBDOMAIN_SLUG_MAP.
 *
 * Optional env VENDOR_SUBDOMAIN_SLUG_MAP: JSON object, short subdomain label → real store slug.
 * Example: {"gogo":"go-go","abcstore":"abc-store"} so gogo.nexa-mm.com → /store/go-go
 *
 * Apex / www (https://nexa-mm.com, https://www.nexa-mm.com) → no redirect (branding + marketplace paths).
 *
 * Set Vercel env: VENDOR_SUBDOMAIN_BASE_DOMAIN=your-primary.com (fallback only — host-derived apex wins)
 * DNS: for each marketplace apex, add apex + wildcard in Vercel Domains (e.g. bash2.online and *.bash2.online)
 */
import { next } from "@vercel/edge";

/** Same heuristic as `src/app/utils/deriveVendorApex.ts` (edge bundle cannot import app tree). */
const MULTI_TENANT_PLATFORM_APEX = new Set([
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

function deriveNaiveVendorApexFromHost(host: string): string | null {
  const h = host.split(":")[0].toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return null;
  const parts = h.split(".").filter(Boolean);
  if (parts.length >= 2 && parts[parts.length - 1] === "localhost") {
    return "localhost";
  }
  if (h === "localhost" || parts.length < 3) return null;
  const naive = parts.slice(-2).join(".");
  if (MULTI_TENANT_PLATFORM_APEX.has(naive)) return null;
  return naive;
}

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

type EdgeOneMiddlewareContext = {
  request?: Request;
  next?: () => Response | Promise<Response>;
};

function readRuntimeEnv(name: string): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return String(env?.[name] || "").trim();
}

function resolveSupabaseProjectRef(): string {
  return (
    readRuntimeEnv("SUPABASE_PROJECT_REF") ||
    readRuntimeEnv("VITE_SUPABASE_PROJECT_REF") ||
    "lmkthofnydxxgowryjcz"
  );
}

function resolveSupabaseAnonKey(): string {
  return (
    readRuntimeEnv("SUPABASE_ANON_KEY") ||
    readRuntimeEnv("VITE_SUPABASE_ANON_KEY") ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6Imxta3Rob2ZueWR4eGdvd3J5amN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNTQyMDUsImV4cCI6MjA4NTkzMDIwNX0.MpID6QuedE9KPzMXbWMGYPpbm98tOhUWxE7Kk7iaV_Q"
  );
}

function publicHostnameFromRequest(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host") || "";
  const host = forwardedHost || request.headers.get("host") || "";
  return host.split(",")[0].trim().split(":")[0].toLowerCase();
}

/**
 * Tencent EdgeOne Makers also detects root `middleware.ts`, but its middleware
 * receives a context object instead of Vercel's Request. This test deployment
 * remains a static Vite deployment on EdgeOne, except for the vendor custom
 * domain verification file that Vercel serves via `api/migoo-challenge.ts`.
 */
export async function middleware(context: EdgeOneMiddlewareContext): Promise<Response> {
  const request = context?.request;
  if (request) {
    const url = new URL(request.url);
    if (url.pathname === "/.well-known/migoo-verify.txt") {
      const hostname = publicHostnameFromRequest(request);
      if (!hostname) {
        return new Response("", { status: 400 });
      }

      const endpoint =
        `https://${resolveSupabaseProjectRef()}.supabase.co/functions/v1/make-server-16010b6f/vendor/custom-domain/challenge-text?hostname=${
          encodeURIComponent(hostname)
        }`;
      try {
        const res = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${resolveSupabaseAnonKey()}`,
            Accept: "text/plain",
          },
        });
        if (!res.ok) {
          return new Response("", { status: 404 });
        }
        return new Response(await res.text(), {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      } catch {
        return new Response("", { status: 502 });
      }
    }
  }

  if (typeof context?.next === "function") {
    return await context.next();
  }
  return new Response(null, { status: 204 });
}

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

function hasKpayReturnQuery(search: string): boolean {
  return /(?:^|[?&])(?:merch_order_id|merchOrderId|prepay_id|prepayId|callback_info)=/i.test(
    search || "",
  );
}

function shouldEdgeRedirectVendorKpayToUnifiedSummary(path: string, search: string): boolean {
  if (!hasKpayReturnQuery(search)) return false;
  return path === "/summary" || path === "/kpay/return" || path === "/";
}

function isBarePlatformApexHost(host: string): boolean {
  const h = normalizeHost(host);
  if (h === "localhost" || h.startsWith("127.0.0.1")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false;
  const bare = h.startsWith("www.") ? h.slice(4) : h;
  const parts = bare.split(".").filter(Boolean);
  if (parts.length !== 2) return false;
  if (MULTI_TENANT_PLATFORM_APEX.has(bare)) return false;
  if (
    h.endsWith(".vercel.app") ||
    h.endsWith(".netlify.app") ||
    h.endsWith(".railway.app") ||
    h.endsWith(".edgeone.dev")
  ) {
    return false;
  }
  return h === bare || h === `www.${bare}`;
}

export default function vercelMiddleware(request: Request): Response {
  const host = normalizeHost(request.headers.get("host") || "");

  if (host === "localhost" || host.startsWith("127.0.0.1")) {
    return next();
  }

  let baseDomain = deriveNaiveVendorApexFromHost(host) || "";
  if (!baseDomain && isBarePlatformApexHost(host)) {
    baseDomain = host.startsWith("www.") ? host.slice(4) : host;
  }
  if (!baseDomain) {
    baseDomain = (process.env.VENDOR_SUBDOMAIN_BASE_DOMAIN || "").trim().toLowerCase();
  }

  const requestUrl = new URL(request.url);
  const path = requestUrl.pathname.replace(/\/+$/, "") || "/";
  const search = requestUrl.search || "";

  // Do NOT redirect /product/* (or other storefront paths) on bare apex here.
  // Vendor custom domains (nexa-mm.shop, migoo.store) are bare apex too — blocking here
  // breaks shared product URLs. Marketplace hosts are handled in vercel.json (host-specific).

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

  if (shouldEdgeRedirectVendorKpayToUnifiedSummary(path, search) || path === "/kpay/return") {
    const unified = new URL(`https://${baseDomain}/summary${search}`);
    return Response.redirect(unified.toString(), 302);
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
