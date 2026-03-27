# Deploying this app (any platform)

The repo ships a **static SPA** (`npm run build` → `dist/`). Behavior stays stable if you:

1. Serve `index.html` for all non-file routes (**SPA fallback**).
2. Set **Supabase** (and optional **VITE_** vars) in your host’s environment.

## Build

```bash
npm ci
npm run build
```

Publish the **`dist/`** folder.

## Single Page App (required everywhere)

The browser must receive `index.html` for paths like `/store/foo` or `/` on a subdomain — not a 404 HTML page.

| Platform | How |
|----------|-----|
| **Vercel** | `vercel.json` in this repo already has a rewrite `/*` → `/index.html`. |
| **Netlify** | Add `public/_redirects`: `/* /index.html 200` (or use `netlify.toml` `[[redirects]]`). |
| **Cloudflare Pages** | `_redirects` or **Pages** → **Redirects** → SPA fallback. |
| **Nginx** | `try_files $uri $uri/ /index.html;` |
| **Apache** | `FallbackResource /index.html` or equivalent `mod_rewrite`. |

## Environment variables

See **`.env.example`**. At minimum your deployment needs the same Supabase connection your app uses (`utils/supabase/info.tsx` or `VITE_SUPABASE_*`).

### Vendor subdomains (`gogo.example.com` → storefront)

- **Client**: optional `VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN` and `VITE_VENDOR_SUBDOMAIN_SLUG_MAP`.
- **Heuristic**: if the hostname looks like `label.apex.tld`, the app derives `apex.tld` automatically (two-part TLDs only). For **`.co.uk`** and similar, set `VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN` explicitly.
- **Vercel only**: `middleware.ts` uses `@vercel/edge` for optional canonical redirects. Set `VENDOR_SUBDOMAIN_BASE_DOMAIN` / `VENDOR_SUBDOMAIN_SLUG_MAP` in the Vercel project. Other hosts ignore this file unless they add an equivalent edge worker.

## TLS and CDN

If you put a **CDN / proxy** (Cloudflare, EdgeOne, etc.) in front of the origin:

- Use **Full (strict)** SSL to the origin, or **DNS-only** to avoid double-proxy TLS issues.
- **HTTP 525** usually means the proxy cannot complete TLS to your host — fix DNS/SSL, not the React bundle.

## Optional: don’t change defaults

To keep your fork stable:

- Prefer **documentation + `.env.example`** over new runtime defaults.
- Avoid hardcoding production domains in code; use env + the shared derivation in `src/app/utils/deriveVendorApex.ts`.

---

## Supabase usage & keeping API / storage costs down

Supabase bills (plan-dependent) on things like **Edge Function invocations**, **database** usage, **Storage egress**, and **Auth** MAU — not on “number of React components.” A few principles:

### What this codebase already does (no extra work for you)

- **`src/app/utils/module-cache.ts`** — Session-level cache + **request coalescing** (parallel navigations wait on one in-flight fetch). Big reduction in duplicate **Edge Function** calls for products, vendors, orders, etc.
- **`withNetworkRetry`** — Fewer failed-then-user-retries that would double-bill the same read.
- **`getCachedImageUrl()`** — Use this when you must **mint signed URLs** in the client so the same path isn’t resolved repeatedly in one session.
- **`LazyImage`** — Images load when near the viewport; fewer parallel Storage/CDN downloads on first paint.

### Practical ways to spend less

1. **Prefer stable, cacheable image URLs** — If product images can live in a **public** bucket with long-cache headers, you avoid per-view **signed URL** Edge work (your backend policy permitting).
2. **Pagination / slim payloads** — Catalog flows that use **bootstrap + paged** APIs (see `fetchCatalogBootstrap` / `fetchCatalogPage`) beat “download everything once” for large catalogs.
3. **Don’t poll the API** — Avoid `setInterval` / rapid `useEffect` refetches; debounce search; refresh only on user action or focus (cart sync already throttles ambient refetch in `CartContext`).
4. **Monitor** — Supabase Dashboard → **Reports** / **API** to see what actually burns quota; set **spend caps** / alerts if your plan allows.
5. **CDN in front of Storage (optional)** — A CDN (e.g. Cloudflare) caching **GETs** to public image URLs cuts **Storage egress** from origin; configure cache rules and HTTPS once.

### What *not* to worry about

- **Browser HTTP cache** for static `GET` images does not multiply Supabase **DB** queries; it mainly helps **bandwidth** and perceived speed.
- **One** Edge Function call that returns **many** products is usually cheaper than **many** tiny calls — your cached list endpoints align with that.
