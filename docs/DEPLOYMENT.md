# Deploying this app (any platform)

The repo ships a **static SPA** (`npm run build` -> `dist/`). Behavior stays stable if you:

1. Serve `index.html` for all non-file routes (**SPA fallback**).
2. Set **Supabase** (and optional **VITE_** vars) before build, then publish fresh assets.

## Quick start: Railway (recommended if you already use it)

This project works on Railway as a single web service.

1. Push the repo to GitHub.
2. Railway dashboard -> **New** -> **Deploy from GitHub repo**.
3. Select this repository.
4. Configure the service:
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npx vite preview --host 0.0.0.0 --port $PORT`
5. Add variables from `.env.example` (at minimum Supabase keys your app uses):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - optional `VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN`
   - optional `VITE_VENDOR_SUBDOMAIN_SLUG_MAP`
   - optional `VITE_STRIPE_PUBLISHABLE_KEY`
6. Deploy and test core flows before custom domain cutover.

### Railway go-live checklist

- Keep the same Supabase project to preserve current data/features.
- Confirm SPA routes work directly (for example `/store/<slug>` opens without 404).
- Verify auth, product list/detail, cart, checkout, and image loading.
- Add custom domain only after the Railway URL passes full smoke tests.
- Keep old host active during DNS propagation for fast rollback.

## Quick start: Tencent Cloud (COS + CDN)

For this repo, the easiest Tencent setup is:

- **COS** as static origin (host `dist/`)
- **CDN** for domain + HTTPS + caching
- **SPA fallback** to `index.html`

1. Build locally:
   ```bash
   npm ci
   npm run build
   ```
2. Tencent Cloud Console -> **COS** -> create bucket in your target region.
3. In bucket settings, enable **Static Website** hosting.
4. Upload all files inside `dist/` to COS.
5. Configure CDN with COS bucket as origin.
6. Add your custom domain to CDN and enable HTTPS certificate.
7. Configure SPA fallback in COS website rules and/or CDN rewrite rules so unknown routes return `/index.html` with `200`.
8. Verify core flows on CDN domain, then switch production DNS.

### Tencent Cloud notes (important)

- Build-time env: set your `VITE_*` values **before** `npm run build`, then upload fresh `dist/`.
- Required keys usually include:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Optional keys (if used by your features):
  - `VITE_STRIPE_PUBLISHABLE_KEY`
  - `VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN`
  - `VITE_VENDOR_SUBDOMAIN_SLUG_MAP`
- Keep using the same Supabase project to avoid data or auth regressions.
- If deep links like `/store/<slug>` return 404, your SPA fallback rule is missing or misconfigured.
- During DNS cutover, keep your current host live until Tencent CDN is healthy globally.
    
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
| **Tencent Cloud (COS/CDN)** | Configure website/CDN rule so unknown paths rewrite/return to `/index.html`. |
| **Nginx** | `try_files $uri $uri/ /index.html;` |
| **Apache** | `FallbackResource /index.html` or equivalent `mod_rewrite`. |

## Environment variables

See **`.env.example`**. At minimum your deployment needs the same Supabase connection your app uses (`utils/supabase/info.tsx` or `VITE_SUPABASE_*`).

### Supabase Edge Function secrets (server-side)

For password reset email via Resend, set these in Supabase project secrets:

- `RESEND_API_KEY` (required)
- `RESEND_FROM_EMAIL` (required, must be an allowed/verified sender in Resend)
- `RESEND_FROM_NAME` (optional, default: `Migoo Marketplace`)
- `ALLOW_DEBUG_OTP` (optional; keep `false`/unset in production)

Quick check endpoint after deploy:

- `https://<project-ref>.supabase.co/functions/v1/make-server-16010b6f/auth/email-health`
- Expected production response: `ok: true` and `debugOtpEnabled: false`

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










