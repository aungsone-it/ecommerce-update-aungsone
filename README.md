# SECURE OS E-Commerce Platform

SECURE OS is a multi-tenant e-commerce system built for marketplace + vendor operations in one codebase.

It includes:

- main marketplace storefront
- vendor storefronts (path-based and subdomain/custom-domain hosts)
- super-admin portal
- vendor-admin portal
- Supabase Edge backend (auth, orders, products, payments, notifications)

## Recent Updates (May 2026)

| Area | What shipped |
|------|----------------|
| **Legal pages** | Storefront Terms of Service and Privacy Policy pages; per-vendor content from vendor settings; works on marketplace paths, `/vendor/:slug/*`, and vendor subdomain/custom-domain hosts |
| **Languages** | English + Simplified Chinese via `LanguageContext` across storefront, vendor login/setup, and admin surfaces |
| **KBZPay returns** | Flexible `/summary` route for PWA return flows; multi-vendor return param handling; vendor-scoped `/vendor/:storeName/summary` |
| **Vendor domains** | Subdomain tenancy (`slug.base-domain`), optional custom domain, slug map env; vendor login redirects to correct host |
| **Vendor lifecycle** | Application form updates, social links on vendor profile, stock policy rules, slug display and domain-mapping fixes |
| **Routing & UX** | Continue-shopping URL resolution, vendor auth URL alignment, category slug routes on vendor-only hosts, product listing and footer polish |
| **Reliability** | Cart/wishlist race-condition fixes, auth token refresh limits, throttled badge/profile refresh, typed API timeout errors |
| **Payments** | KBZPay QR + PWA checkout, webhook sync, refund/cancel flow (production refunds need gateway mTLS/certs) |

## Current Product Surface

### Customer / Storefront

- Browse products, categories, product detail, saved items, cart, checkout.
- Customer profile, addresses, order history, order detail.
- Marketplace storefront and vendor storefront variants (path + subdomain/custom domain).
- Terms and privacy pages: `/terms`, `/privacy` (and vendor-scoped aliases).
- Bilingual UI: English / 简体中文 with instant switching on supported screens.

### Payments

- **KBZPay QR** and **KBZPay PWA** at checkout.
- Return landing: `/kpay/return`, `/summary`, `/checkout/success`, `/order-confirmation`.
- KBZPay webhook + realtime order status sync.
- Refund/cancel logic in code; production refund success depends on gateway mTLS/client certificate setup.

### Super Admin

- Dashboard, products, categories, inventory, orders, customers, chat, marketing, finances, settings.
- Vendor management, applications, promotions, collaborator flows.
- Realtime order pulse bridge and inventory cache sync paths.

### Vendor

- Onboarding: `/vendor/application`, `/vendor/setup`, `/vendor/login`.
- Public storefront: `/vendor/:storeName/*` and `/store/:storeName/*` (plus subdomain/custom domain).
- Admin portal: `/vendor/:storeName/admin/*` and `/store/:storeName/admin/*`.
- Settings: branding, subdomain URL preview, custom domain, terms/privacy content, social links, stock policy.
- Analytics, products, categories, orders, customers, finances.

## Key Routes (quick reference)

| Purpose | Marketplace | Vendor storefront |
|---------|-------------|-------------------|
| Home / catalog | `/`, `/products` | `/vendor/:slug` or subdomain root |
| Checkout | `/checkout` | `/vendor/:slug/checkout` |
| KBZPay return | `/kpay/return`, `/summary` | `/vendor/:slug/kpay/return`, `/vendor/:slug/summary` |
| Terms / privacy | `/terms`, `/privacy` | `/vendor/:slug/terms`, `/vendor/:slug/privacy` |
| Vendor admin | — | `/vendor/:slug/admin` |
| Super admin | `/admin`, `/admin/:section` | — |

On a vendor subdomain or custom domain, policy links resolve to `/terms` and `/privacy` at the host root (no `/vendor/:slug` prefix).

## Vendor Subdomains & Domains

Configure in `.env` (see `.env.example`):

```bash
# Apex only, no protocol
VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN=example.com

# Optional: DNS label → store slug
VITE_VENDOR_SUBDOMAIN_SLUG_MAP={"gogo":"go-go-online-store"}
```

Each vendor gets `https://{storeSlug}.{baseDomain}` when subdomains are enabled. Custom domains override the default subdomain URL in vendor settings.

## Architecture

- **Frontend:** React 18 + TypeScript + Vite + Tailwind + Radix.
- **Backend:** Supabase Edge Functions (`make-server-16010b6f`, `kpay-webhook`) + Supabase Auth + Storage + Postgres/KV.
- **Routing:** React Router — public, super-admin, vendor-admin, and vendor-host-specific trees.

## Local Development

```bash
npm install
npm run dev
```

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

- **Frontend:** any static host with SPA fallback (`index.html` rewrite) — Vercel, Netlify, Cloudflare Pages, Railway, AWS S3+CloudFront, etc.
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

## Important Caveats

- Some internal identifiers still use `kpay` for backwards compatibility; user-facing copy uses **KBZPay**.
- Legacy markdown files in the repo root may be outdated — **this README** and the **`docs/`** folder are the source of truth.
- Subdomain tenancy and custom domains require correct DNS + host env on both Vite and edge middleware (see `docs/DEPLOYMENT.md`).

## License

Proprietary — all rights reserved.

---

**Built for the Burmese market** — MMK/CNY/USD, Myanmar phone formats, bilingual storefront support.
