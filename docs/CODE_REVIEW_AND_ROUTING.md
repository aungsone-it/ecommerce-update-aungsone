# Architecture and Routing Reference

This file is the evergreen technical reference for the **current** app structure (vendor-first storefronts; no shared marketplace catalog route).

## 1) Stack

- React + TypeScript + Vite frontend
- React Router route trees for public / admin / vendor paths
- Supabase Auth + Edge Functions + Storage
- **Primary datastore:** Postgres KV table `kv_store_16010b6f` (key + JSONB value) — see [ARCHITECTURE_AND_BACKEND.md](./ARCHITECTURE_AND_BACKEND.md)
- Supabase project binding: `utils/supabase/info.tsx` (`projectId`, `publicAnonKey`)
- Shared API client in `src/utils/api-client.ts`

## 2) Runtime layout

- App bootstraps in `src/main.tsx` and `src/app/App.tsx`.
- Main routing lives in `src/app/routes.tsx`.
- Global providers wrap routes (language, auth, vendor auth, error handling, KPay return redirect).
- Primary feature surfaces:
  - **Customer shopping:** `src/app/pages/VendorStorefrontPage.tsx` → `src/app/components/VendorStoreView.tsx`
  - **Checkout / summary:** `src/app/components/Checkout.tsx`
  - **Platform landing (apex):** `src/app/pages/LandingPage.tsx`
  - **Super admin:** `src/app/pages/AdminPage.tsx`
  - **Vendor admin:** `src/app/pages/VendorAdminPage.tsx`

### Removed legacy storefront

- The old shared marketplace storefront files (`Storefront.tsx`, `StorefrontPage.tsx`, and related cached helper) have been removed.
- Do not add customer-shopping features to a shared marketplace page. Current customer shopping lives only in `VendorStorefrontPage` / `VendorStoreView`.

## 3) Host model

| Host type | Example | `/` behavior |
|-----------|---------|--------------|
| Platform apex | `walwal.online` | `LandingPage` — stats, vendor carousel (logos, revenue-sorted), FloatingChat |
| Vendor subdomain | `gogo.walwal.online` | `VendorStorefrontPage` (that vendor’s catalog) |
| Custom domain | `migoo.store` | `VendorStorefrontPage` (resolved slug) |
| Localhost path dev | `localhost:5173` | `LandingPage` or `/vendor/:slug` |

Vendor identity is resolved from **hostname** (subdomain map, custom domain lookup) and/or **path** (`/vendor/:storeName/...`).

## 4) Route trees

### Platform apex (public)

| Path | Component / behavior |
|------|----------------------|
| `/` | Apex: `LandingPage` (vendor carousel, stats, FloatingChat). Vendor host: `VendorStorefrontPage`. Carousel cards use `resolveLandingVendorStoreUrl()` (custom domain → subdomain → `/vendor/:slug`). |
| `/admin/*` | Super-admin portal |
| `/vendor/application`, `/vendor/setup`, `/vendor/login` | Vendor onboarding / auth |
| `/summary` | Unified KBZPay post-payment summary (`VendorHostOnlyStorefront` on apex) |
| `/kpay/return` | `KPayReturnPage` |
| `/terms`, `/privacy` | Policy pages (vendor content when on vendor host) |

### Vendor storefront — path-based

Under `/vendor/:storeName/`:

- Store home: `/vendor/:storeName`
- Category: `/vendor/:storeName/:categorySlug`
- Product: `/vendor/:storeName/product/:productSlug`
- Checkout flow: `/checkout`, `/checkout/success`, `/summary`, `/kpay/return`
- Account: `/profile/*`, `/saved`
- Policies: `/terms`, `/privacy`
- Admin: `/vendor/:storeName/admin/*`

### Vendor storefront — host-root (subdomain / custom domain)

Same features without the `/vendor/:slug` prefix:

- `/`, `/:categorySlug`, `/product/:slug`, `/checkout`, `/saved`, `/profile/*`, `/terms`, `/privacy`

Guarded by `VendorHostOrMarketplaceRoutes.tsx` — routes return **404** on the platform apex unless the host resolves to a vendor.

### Legacy redirects

`LegacyStoreRedirect` handles old bookmarks:

- `/store/*` → `/vendor/*` (where mappable)
- `/products`, `/products/*` → `/` (marketplace catalog removed)
- `/blog/*` → redirect or 404 per `legacyStorePath.ts`

### Super-admin tree

- `/admin`, `/admin/:section`, `/admin/setup`
- Protected by admin auth and setup checks

### Vendor-admin tree

- `/vendor/:storeName/admin/*` (primary)
- Legacy `/store/:storeName/admin/*` may redirect depending on deployment

## 5) Customer catalog implementation

- Product grid, categories, search, and pagination live in **`VendorStoreView`**.
- Category tabs use **server-side category filtering** (`fetchVendorProducts` with `category` param) — not client-only filtering of the first loaded page.
- Module cache keys include vendor id, page, query, and category (`CACHE_KEYS.vendorProductsPage`).
- Storefront language menu exposes **English + Burmese** only; admin/vendor-admin language controls expose **English + Simplified Chinese**.
- Storefront phone contact supports both native dial (`tel:`) and Viber chat (`viber://chat?number=...`).

## 6) Auth model

- Customer auth: main `AuthContext` (used on vendor storefront checkout/profile).
- Super-admin: admin auth + setup checks in admin wrappers.
- Vendor: `VendorAuthContext` + `VendorProtectedLayout` on admin routes.

## 7) Payments / KBZPay routing

- Checkout starts on the **vendor storefront** host where the customer is shopping.
- Active payment choices are **Cash on Delivery**, **KBZPay QR**, and **KBZPay PWA**. Card/bank/Stripe helpers are not production checkout paths.
- PWA return URL targets unified apex summary: `walwal.online/summary` (see `vendorCheckoutPaths.ts`, `kpayUnifiedSummaryRedirect.ts`, `index.html` inline redirect, edge `middleware.ts`).
- `storefrontOrigin` on the checkout draft drives **Continue Shopping** back to the vendor host.

## 8) Data/API model

- Frontend calls Supabase Edge endpoints through the shared API client (`api-client.ts` → `utils/supabase/info.tsx`).
- Primary server function namespace: `make-server-16010b6f`.
- Payment webhook: `kpay-webhook`.
- Public vendor catalog: `GET .../vendor/products/:vendorId?page=&pageSize=&category=&q=` (SQL RPC when migrations applied).
- Most entities live in KV keys (`product:`, `order:`, `customer:`, etc.); admin list endpoints often use prefix scans.

## 9) Realtime (summary)

- **Pulse bridge:** `OrderRealtimeBridge` listens to `app_order_pulse`, `app_vendor_application_pulse`, and `app_kv_domain_pulse` — debounced domain invalidation instead of global KV fanout.
- **KV fallback:** If domain pulse channel fails, temporary subscription on `kv_store_16010b6f` maps keys → domains client-side.
- **Vendor storefront:** `VendorStoreView` + `storefrontPolicyRealtime.ts` for catalog/policy updates; `public/vendor-storefront-head.js` sets tab title before React.
- **Checkout:** filtered `kpay-txn-{orderId}` channel + polling fallback.

Details and scale limits: [ARCHITECTURE_AND_BACKEND.md](./ARCHITECTURE_AND_BACKEND.md) §6–§9.

## 10) Reliability / performance behaviors

- Request caching and coalescing in client data helpers (`module-cache.ts`).
- SQL read-model RPCs for admin orders/products/customers where migrations are applied; KV fallback when SQL unavailable.
- Cart/wishlist immediate persistence + server sync (cart sync hardened June 2026).
- Debounced admin search (`useAdminPortalDebouncedSearch`, `adminProductSearch.ts`).
- Throttled badge/profile refresh.
- Typed timeout/network errors from API client.
- Early vendor branding: `vendorStorefrontBrandingCache.ts` + `vendor-storefront-head.js`.
- **RootLayout:** `FloatingChat` lazy-loaded globally — shown on apex landing and storefronts; hidden on admin portals, `/vendor/application`, reset-password, and vendor login routes.
- **Add to Home:** `VendorInstallFab` (portal to `document.body`) mounted from `VendorStoreView` above the chat FAB stack; injects per-vendor web manifest + registers `public/sw.js` for Chrome install eligibility. See [VENDOR_ADD_TO_HOME.md](./VENDOR_ADD_TO_HOME.md).
- **Settings (`Settings.tsx`):** Activities tab with global feed; Appearance tab filtered out; `scrollbar-thin` on nav and main pane.
- **Vendor admin list (`Vendor.tsx`):** no Add Vendor button; horizontal table scroll uses `scrollbar-thin-x` (4px, inset track).
- **Landing vendors:** `fetchLandingVendorsCached()` → `GET /vendors`; active vendors sorted client-side by `totalRevenue` descending.

## 11) Routing pitfalls to watch

- Keep specific routes above generic dynamic segments (`:categorySlug` is last among public siblings).
- Do not re-introduce apex `/products` or a shared marketplace cart without revisiting host guards.
- Preserve SPA fallback at the hosting layer for all deep links (`/vendor/go-go/cosmetic`, `/admin/orders`, etc.).
- Vendor slug changes: keep redirect/normalization consistent (`LegacyStoreRedirect`, subdomain slug map).
- KPay: vendor-host `/summary` with return query params should redirect to apex before painting vendor chrome.

## 12) Maintainer checklist for route/API changes

1. Update route declarations and guard wrappers together.
2. Verify deep-link behavior with hard refresh on **vendor subdomain** and **path-based** URLs.
3. Verify auth states (logged out, logged in, role-restricted).
4. Verify Edge endpoints and frontend calls stay contract-compatible.
5. Update this document and `README.md` when behavior changes.
