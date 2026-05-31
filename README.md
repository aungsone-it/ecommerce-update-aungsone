# SECURE OS E-Commerce Platform

SECURE OS is a **multi-tenant, vendor-first** e-commerce system: each vendor runs an independent branded storefront, while a single platform apex hosts onboarding, super-admin, and shared payment return flows.

There is **no multi-vendor marketplace catalog** (no shared `/products` shopping surface). Customer shopping happens on **vendor storefronts only**.

## What the platform includes

- **Platform landing page** on the marketplace apex (`walwal.online/`) — branding, vendor discovery, links to apply/login (not a product catalog)
- **Vendor storefronts** — path-based (`/vendor/:slug/*`), vendor subdomains (`{label}.walwal.online`), and custom domains
- **Super-admin portal** — `/admin/*`
- **Vendor-admin portal** — `/vendor/:slug/admin/*` (and legacy `/store/:slug/admin/*` redirects where configured)
- **Supabase Edge backend** — auth, orders, products, payments, notifications

## Recent Updates (May 2026)

| Area | What shipped |
|------|----------------|
| **Legal pages** | Per-vendor Terms and Privacy from vendor settings; `/terms` and `/privacy` on vendor hosts; `/vendor/:slug/terms` and `/vendor/:slug/privacy` on path-based dev URLs |
| **Languages** | English + Simplified Chinese via `LanguageContext` on vendor storefront, vendor login/setup, and admin surfaces |
| **KBZPay returns** | Unified post-payment summary on the platform apex (`walwal.online/summary`); vendor-scoped checkout paths; redirect from vendor hosts when KBZ returns with order params |
| **Vendor domains** | Subdomain tenancy (`label.base-domain`), optional custom domain, slug map env; vendor login redirects to the correct host |
| **Vendor catalog** | Server-side category filtering on category routes (`/cosmetic`, `/bag`, etc.) on vendor hosts |
| **Vendor lifecycle** | Application form, social links, stock policy, slug display and domain-mapping fixes |
| **Routing & UX** | Legacy `/store/*` and `/products/*` redirects; category slug routes on vendor-only hosts; checkout and footer polish |
| **Reliability** | Cart/wishlist race-condition fixes, auth token refresh limits, throttled badge/profile refresh, typed API timeout errors |
| **Payments** | KBZPay QR + PWA checkout, webhook sync, refund/cancel flow (production refunds need gateway mTLS/certs) |

## Current Product Surface

### Customer (vendor storefront)

Implemented in `VendorStorefrontPage` → `VendorStoreView` (not a shared marketplace `Storefront` route).

- Browse products, categories, product detail, saved items, cart, checkout
- Customer profile, addresses, order history, order detail
- Host modes:
  - **Vendor subdomain / custom domain** — clean URLs at host root (`/`, `/product/:sku`, `/checkout`, `/:categorySlug`, `/saved`, `/profile/*`)
  - **Path-based (local dev / apex)** — `/vendor/:storeSlug/*`
- Terms and privacy: `/terms`, `/privacy` on vendor hosts; `/vendor/:slug/terms` on path-based URLs
- Bilingual UI: English / 简体中文

### Platform apex (non-shopping)

- `/` on `walwal.online` (and similar apex hosts) — **LandingPage** (platform marketing / vendor directory)
- `/summary` — unified KBZPay order summary after mobile app payment
- `/vendor/application`, `/vendor/login`, `/vendor/setup` — vendor onboarding and auth
- `/admin/*` — super-admin portal

### Payments

- **KBZPay QR** and **KBZPay PWA** at vendor checkout
- Return landing: `/kpay/return`, `/summary`, `/checkout/success`, `/order-confirmation` (vendor-host or path-based)
- Post-PWA summary consolidates on **`https://walwal.online/summary`** (Continue Shopping returns to the vendor where checkout started)
- KBZPay webhook + realtime order status sync
- Refund/cancel logic in code; production refund success depends on gateway mTLS/client certificate setup

### Super Admin

- Dashboard, products, categories, inventory, orders, customers, chat, marketing, finances, settings
- Vendor management, applications, promotions, collaborator flows
- Realtime order pulse bridge and inventory cache sync paths

### Vendor

- Onboarding: `/vendor/application`, `/vendor/setup`, `/vendor/login`
- Public storefront: subdomain/custom domain host root, or `/vendor/:storeName/*`
- Admin portal: `/vendor/:storeName/admin/*`
- Settings: branding, subdomain URL preview, custom domain, terms/privacy content, social links, stock policy
- Analytics, products, categories, orders, customers, finances

## Key Routes (quick reference)

### Vendor subdomain or custom domain (production)

| Purpose | URL on vendor host |
|---------|-------------------|
| Store home | `/` |
| Category | `/:categorySlug` (e.g. `/cosmetic`) |
| Product detail | `/product/:sku` |
| Checkout | `/checkout` |
| KBZPay return | `/kpay/return` |
| Order summary (in-flow) | `/summary` on vendor host; unified PWA return → apex `/summary` |
| Saved / wishlist | `/saved` |
| Account | `/profile/*` |
| Terms / privacy | `/terms`, `/privacy` |
| Vendor admin | `/admin` on vendor host (where configured) or path-based `/vendor/:slug/admin` |

### Path-based (localhost / apex dev)

| Purpose | URL |
|---------|-----|
| Store home | `/vendor/:slug` |
| Category | `/vendor/:slug/:categorySlug` |
| Product detail | `/vendor/:slug/product/:sku` |
| Checkout | `/vendor/:slug/checkout` |
| Vendor admin | `/vendor/:slug/admin` |

### Platform apex

| Purpose | URL |
|---------|-----|
| Platform landing | `/` |
| Unified KBZPay summary | `/summary` |
| Super admin | `/admin`, `/admin/:section` |
| Vendor apply / login | `/vendor/application`, `/vendor/login` |

### Removed / legacy (redirect or 404)

| Old URL | Current behavior |
|---------|------------------|
| `/products`, `/products/*` | Redirect via `LegacyStoreRedirect` (typically to `/`) |
| `/store/:slug/*` (legacy) | Redirect to `/vendor/:slug/*` where mapped |
| Apex `/checkout`, `/product/*`, `/saved`, `/profile` without vendor host | Not supported — use a vendor storefront URL |

## Vendor Subdomains & Domains

Configure in `.env` (see `.env.example`):

```bash
# Apex only, no protocol
VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN=walwal.online

# Optional: DNS label → store slug
VITE_VENDOR_SUBDOMAIN_SLUG_MAP={"gogo":"go-go"}
```

Each vendor gets `https://{label}.{baseDomain}` when subdomains are enabled. Custom domains override the default subdomain URL in vendor settings.

Edge middleware (`middleware.ts`) maps vendor subdomains to the SPA; KBZ return query params on vendor hosts can redirect to the unified apex `/summary`.

## Architecture

- **Frontend:** React 18 + TypeScript + Vite + Tailwind + Radix
- **Customer storefront UI:** `VendorStorefrontPage`, `VendorStoreView`, `Checkout`
- **Platform landing:** `LandingPage` (apex only)
- **Backend:** Supabase Edge Functions (`make-server-16010b6f`, `kpay-webhook`) + Supabase Auth + Storage + Postgres/KV
- **Routing:** React Router — public vendor tree, super-admin, vendor-admin, vendor-host-specific routes
- **Legacy note:** `Storefront.tsx` remains in the repo for reference but is **not mounted** in the current router

## Local Development

```bash
npm install
npm run dev
```

Open a vendor storefront at `http://localhost:5173/vendor/{store-slug}` or configure a local subdomain host.

Build check:

```bash
npm run build
```

Tests:

```bash
npm test
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm test` | Run Vitest |
| `npm run deploy:edge` | Deploy Supabase Edge Functions only |
| `npm run db:push` | Push Supabase DB migrations |
| `npm run deploy:supabase` | DB push + functions deploy |

## Environment

Use `.env.example` as the source of truth.

**Required (typical):**

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**Optional / feature-dependent:**

- `VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN`, `VITE_VENDOR_SUBDOMAIN_SLUG_MAP`
- KBZPay credentials (server + client)
- `VITE_STRIPE_PUBLISHABLE_KEY` (if Stripe enabled)
- Admin operation secret headers for destructive backend actions

## Deployment

Static SPA frontend + Supabase backend services.

- **Frontend:** any static host with SPA fallback (`index.html` rewrite) — Vercel, Netlify, Cloudflare Pages, etc.
- **Backend:** deploy Supabase Edge Functions separately after schema changes.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md).

## Documentation Index

| Doc | Contents |
|-----|----------|
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hosting and env setup |
| [docs/SECURE_ADMIN_AND_VENDOR_GUIDE.md](docs/SECURE_ADMIN_AND_VENDOR_GUIDE.md) | Operator workflows |
| [docs/CODE_REVIEW_AND_ROUTING.md](docs/CODE_REVIEW_AND_ROUTING.md) | Routing and architecture |
| [docs/PAYMENTS.md](docs/PAYMENTS.md) | KBZPay integration status |
| [docs/PERFORMANCE_AND_CACHING.md](docs/PERFORMANCE_AND_CACHING.md) | Caching and API usage |
| [docs/UI_ANIMATIONS.md](docs/UI_ANIMATIONS.md) | Animation reference |
| [docs/SECURE_SIMPLE_UI_INSTRUCTIONS.md](docs/SECURE_SIMPLE_UI_INSTRUCTIONS.md) | Short non-technical guide |
| [ATTRIBUTIONS.md](ATTRIBUTIONS.md) | Third-party attributions |

## Performance (PageSpeed / LCP)

Target vendor hosts (e.g. `https://gogo.walwal.online`) should enable **Supabase Storage image transformations** so resized product images ship by default.

| Optimization | Effect |
|--------------|--------|
| Auto image thumbs (480px grid, 128px logos, 960px banners) | Cuts mobile LCP from multi‑MB originals |
| Priority load on first 4 product cards + store logo | Faster above-the-fold paint |
| Non-blocking fonts + no global Quill CSS on storefront | Better FCP |
| Supabase preconnect | Faster catalog/API fetch |

After deploy, re-run [PageSpeed Insights](https://pagespeed.web.dev/) on mobile and desktop. See [docs/PERFORMANCE_AND_CACHING.md](docs/PERFORMANCE_AND_CACHING.md).

## Important Caveats

- Some internal identifiers still use `kpay` for backwards compatibility; user-facing copy uses **KBZPay**.
- Legacy markdown files in the repo root may be outdated — **this README** and the **`docs/`** folder are the source of truth.
- Subdomain tenancy and custom domains require correct DNS + host env on both Vite and edge middleware (see `docs/DEPLOYMENT.md`).
- Do not expect a shared marketplace product catalog at `/` or `/products`; customers shop on individual vendor storefront URLs.

## License

Proprietary — all rights reserved.

---

**Built for the Burmese market** — MMK/CNY/USD, Myanmar phone formats, bilingual vendor storefront support.
