# NEXA Platform

**NEXA Platform** is a **multi-tenant, vendor-first** e-commerce system: each vendor runs an independent branded storefront, while a single platform apex hosts onboarding, super-admin, and shared payment return flows.

There is **no multi-vendor marketplace catalog** (no shared `/products` shopping surface). Customer shopping happens on **vendor storefronts only**.

## What the platform includes

- **Platform landing page** on the marketplace apex (`walwal.online/`) — branding, vendor discovery, links to apply/login (not a product catalog)
- **Vendor storefronts** — path-based (`/vendor/:slug/*`), vendor subdomains (`{label}.walwal.online`), and custom domains
- **Super-admin portal** — `/admin/*`
- **Vendor-admin portal** — `/vendor/:slug/admin/*` (and legacy `/store/:slug/admin/*` redirects where configured)
- **Supabase Edge backend** — auth, orders, products, payments, notifications

## Recent Updates (June 2026)

| Area | What shipped |
|------|----------------|
| **Platform branding** | Rebrand to **NEXA Platform** — configurable name/logo in admin General settings; early head script avoids tab-title flash on vendor hosts |
| **SQL read model** | KV writes sync to `app_*` tables (products, orders, vendors, customers); admin list endpoints prefer SQL RPCs with KV fallback |
| **Realtime efficiency** | Replaced always-on global KV fanout with **pulse tables** (`app_order_pulse`, `app_kv_domain_pulse`, `app_vendor_application_pulse`); legacy KV channel used only as fallback |
| **DB migrations** | Schema split into focused migration files under `supabase/migrations/` (catalog RPCs, read-model tables, pulse triggers, backfill) |
| **Frontend performance** | Smaller route bundles, debounced admin search, `vendor-storefront-head.js` for sync branding before React paint |
| **Cart & catalog** | Cart sync hardening, product listing and order section fixes, caching/reload race fixes |
| **i18n / URLs** | Burmese text in URL segments handled correctly on category and product routes |
| **Deployment** | Tencent Cloud custom-domain middleware adjustments; read-model validation script (`npm run validate:read-model`) |
| **Legal pages** | Per-vendor Terms and Privacy from vendor settings; `/terms` and `/privacy` on vendor hosts |
| **Languages** | English + Simplified Chinese via `LanguageContext` on vendor storefront, vendor login/setup, and admin surfaces |
| **KBZPay returns** | Unified post-payment summary on the platform apex (`walwal.online/summary`); vendor-scoped checkout paths |
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

- **KBZPay QR** and **KBZPay PWA** at vendor checkout — **this is the production payment path**
- Return landing: `/kpay/return`, `/summary`, `/checkout/success`, `/order-confirmation` (vendor-host or path-based)
- Post-PWA summary consolidates on **`https://walwal.online/summary`** (Continue Shopping returns to the vendor where checkout started)
- KBZPay webhook + Realtime on `kpay_txn:{orderId}` (+ HTTP polling fallback during checkout)
- Refund/cancel logic in code; production refund success depends on gateway mTLS/client certificate setup
- **Stripe:** helper code exists (`stripe_routes.tsx`, `StripePayment.tsx`) but is **not wired** to vendor `Checkout.tsx` — do not treat as live

### Super Admin

- Dashboard, products, categories, inventory, orders, customers, chat, marketing, finances, settings
- Vendor management, applications, promotions, collaborator flows
- SQL-backed admin lists where read-model migrations are applied; Realtime via pulse tables

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
BASE_DOMAIN=walwal.online

# Optional: DNS label → store slug
VITE_VENDOR_SUBDOMAIN_SLUG_MAP={"gogo":"go-go"}
```

Each vendor gets `https://{label}.{baseDomain}` when subdomains are enabled. Custom domains override the default subdomain URL in vendor settings.

Edge middleware (`middleware.ts`) maps vendor subdomains to the SPA; KBZ return query params on vendor hosts can redirect to the unified apex `/summary`.

## Architecture

- **Frontend:** React 18 + TypeScript + Vite + Tailwind + Radix
- **Customer storefront UI:** `VendorStorefrontPage`, `VendorStoreView`, `Checkout`
- **Platform landing:** `LandingPage` (apex only)
- **Backend:** Supabase Edge Functions (`make-server-16010b6f`, `kpay-webhook`) + Supabase Auth + Storage
- **Primary datastore:** Postgres KV table `kv_store_16010b6f` (JSON documents) + **SQL read-model tables** (`app_products`, `app_orders`, etc.) synced on write
- **Supabase binding:** `utils/supabase/info.tsx` (`projectId`, `publicAnonKey`) — not `VITE_SUPABASE_*` for most API calls
- **Routing:** React Router — public vendor tree, super-admin, vendor-admin, vendor-host-specific routes
- **Legacy note:** `Storefront.tsx` remains in the repo for reference but is **not mounted** in the current router

Full backend reference: [docs/ARCHITECTURE_AND_BACKEND.md](docs/ARCHITECTURE_AND_BACKEND.md)

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
| `npm run validate:read-model` | Validate KV ↔ SQL read-model counts (requires env secrets) |

## Environment

Use `.env.example` for optional overrides. **Most API and Auth traffic uses `utils/supabase/info.tsx`**, not `VITE_SUPABASE_*`.

**Supabase project (required for API):**

- Set `projectId` and `publicAnonKey` in `utils/supabase/info.tsx` for your Supabase project (autogenerated in Figma Make exports; update when forking)

**Optional frontend (`VITE_*` in `.env`):**

- `VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN`, `VITE_VENDOR_SUBDOMAIN_SLUG_MAP`
- `VITE_SUPABASE_THUMB_MAX` — image transform width override
- `VITE_ADMIN_OPERATION_SECRET` — must match server `EDGE_ADMIN_OPERATION_SECRET` for destructive admin actions
- `VITE_STRIPE_PUBLISHABLE_KEY` — only if experimenting with Stripe UI (not used in vendor checkout today)

**Supabase Edge Function secrets (server, set in Supabase dashboard):**

- KBZPay gateway credentials and webhook signing key
- `EDGE_ADMIN_OPERATION_SECRET`
- `STRIPE_SECRET_KEY` (optional; not used in live checkout)

## Deployment

Static SPA frontend + Supabase backend services.

- **Frontend:** any static host with SPA fallback (`index.html` rewrite) — Vercel, Netlify, Cloudflare Pages, Tencent Cloud, etc.
- **Backend:** deploy Supabase Edge Functions separately after schema changes.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). After deploy, follow [docs/READ_MODEL_ROLLOUT.md](docs/READ_MODEL_ROLLOUT.md). (Root `DEPLOYMENT_CHECKLIST.md` is legacy — see [docs/LEGACY_DOCS.md](docs/LEGACY_DOCS.md).)

## Documentation Index

| Doc | Contents |
|-----|----------|
| [docs/ARCHITECTURE_AND_BACKEND.md](docs/ARCHITECTURE_AND_BACKEND.md) | **Backend truth:** KV model, SQL read model, Realtime pulses, auth, Supabase Pro limits, scaling |
| [docs/CODE_REVIEW_AND_ROUTING.md](docs/CODE_REVIEW_AND_ROUTING.md) | Routes, hosts, component map |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hosting and env setup |
| [docs/READ_MODEL_ROLLOUT.md](docs/READ_MODEL_ROLLOUT.md) | Read-model deploy validation and monitoring |
| [docs/PAYMENTS.md](docs/PAYMENTS.md) | KBZPay (production path) |
| [docs/PERFORMANCE_AND_CACHING.md](docs/PERFORMANCE_AND_CACHING.md) | LCP, client cache, Realtime scale notes |
| [docs/NEXA_ADMIN_AND_VENDOR_GUIDE.md](docs/NEXA_ADMIN_AND_VENDOR_GUIDE.md) | Operator workflows |
| [docs/NEXA_SIMPLE_UI_INSTRUCTIONS.md](docs/NEXA_SIMPLE_UI_INSTRUCTIONS.md) | Short non-technical guide |
| [docs/UI_ANIMATIONS.md](docs/UI_ANIMATIONS.md) | Animation reference |
| [docs/LEGACY_DOCS.md](docs/LEGACY_DOCS.md) | Outdated root markdown files — do not use |
| [ATTRIBUTIONS.md](ATTRIBUTIONS.md) | Third-party attributions |

## Performance (PageSpeed / LCP)

Target vendor hosts (e.g. `https://gogo.walwal.online`) should enable **Supabase Storage image transformations** so resized product images ship by default.

| Optimization | Effect |
|--------------|--------|
| Auto image thumbs (480px grid, 128px logos, 960px banners) | Cuts mobile LCP from multi‑MB originals |
| Priority load on first 4 product cards + store logo | Faster above-the-fold paint |
| `vendor-storefront-head.js` before React | Avoids wrong tab title / favicon flash on vendor refresh |
| Non-blocking fonts + no global Quill CSS on storefront | Better FCP |
| Supabase preconnect | Faster catalog/API fetch |

After deploy, re-run [PageSpeed Insights](https://pagespeed.web.dev/) on mobile and desktop. See [docs/PERFORMANCE_AND_CACHING.md](docs/PERFORMANCE_AND_CACHING.md).

## Scaling (Supabase Pro)

| Metric | Pro included | Notes for this app |
|--------|--------------|-------------------|
| Auth MAU | 100,000 | One login account = 1 MAU/month; **guests do not count** |
| Realtime connections | 500 peak | Pulse-based bridge uses fewer messages than global KV fanout; checkout still uses filtered `kpay_txn` channels |
| Realtime messages | 5M/month | Domain pulses debounced (~400ms); legacy KV fallback only if pulse channel fails |
| Edge Function calls | 2M/month | Client cache + SQL read paths reduce repeat scans |

See [docs/ARCHITECTURE_AND_BACKEND.md](docs/ARCHITECTURE_AND_BACKEND.md) §9 for tier guidance (~1k / 10k / 100k / 1M users).

## Important Caveats

- Some internal identifiers still use `kpay` or `sec-` channel prefixes for backwards compatibility; user-facing copy uses **KBZPay** and **NEXA Platform**.
- Legacy markdown in the repo root is outdated — see [docs/LEGACY_DOCS.md](docs/LEGACY_DOCS.md). **This README** and **`docs/`** are the source of truth.
- Supabase URL/key for most calls come from **`utils/supabase/info.tsx`**, not `.env` alone.
- Subdomain tenancy and custom domains require correct DNS + host env on both Vite and edge middleware (see `docs/DEPLOYMENT.md`).
- Do not expect a shared marketplace product catalog at `/` or `/products`; customers shop on individual vendor storefront URLs.
- Admin SQL read paths require migrations deployed; API keeps KV fallbacks if read models are empty or unavailable.

## License

Proprietary — all rights reserved.

---

**Built for the Burmese market** — MMK/CNY/USD, Myanmar phone formats, bilingual vendor storefront support.
