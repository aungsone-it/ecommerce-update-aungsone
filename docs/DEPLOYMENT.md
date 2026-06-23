# Deployment Guide

This project deploys as:
- static frontend bundle (`dist/`)
- Supabase backend services (Edge Functions + DB/Auth/Storage)

Use this document as the single deployment reference.

## 1) Prerequisites

- Node.js and npm for frontend build.
- Supabase CLI for backend deployment.
- Access to the target Supabase project.

## 2) Frontend deployment

Build:

```bash
npm install
npm run build
```

Publish the `dist/` folder to your host.

### SPA fallback is mandatory

All unknown routes must rewrite to `index.html` (for example `/admin/orders`, `/vendor/vendor-slug/cosmetic`, `gogo.example.com/product/sku`).

Examples:
- Vercel: use existing `vercel.json` rewrite rules.
- Netlify: `/* /index.html 200`
- Nginx: `try_files $uri $uri/ /index.html;`

If deep links return 404, SPA fallback is misconfigured.

## 3) Backend deployment (Supabase)

Deploy Edge Functions:

```bash
npm run deploy:edge
```

Or full Supabase rollout (DB + functions):

```bash
npm run deploy:supabase
```

Current active function paths include:
- `supabase/functions/make-server-16010b6f`
- `supabase/functions/kpay-webhook`

## 4) Environment variables

Use `.env.example` for optional `VITE_*` overrides.

### Supabase project binding (required)

Most of the app reads Supabase URL and anon key from **`utils/supabase/info.tsx`**, not from `VITE_SUPABASE_URL`. When deploying to a new Supabase project, update `projectId` and `publicAnonKey` in that file (or refactor to env-based config).

### Frontend envs (`VITE_*`, optional)

- `VITE_VENDOR_SUBDOMAIN_BASE_DOMAIN`
- `VITE_VENDOR_SUBDOMAIN_SLUG_MAP`
- `VITE_ADMIN_OPERATION_SECRET` (must match server secret for destructive admin routes and diagnostics)
- `VITE_SUPABASE_THUMB_MAX` (image transform width)
- `VITE_STRIPE_PUBLISHABLE_KEY` (Stripe UI only — not used in vendor checkout)

Vercel Edge middleware uses **server** env (no `VITE_` prefix): `VENDOR_SUBDOMAIN_BASE_DOMAIN`, `VENDOR_SUBDOMAIN_SLUG_MAP` — see `middleware.ts`.

### Supabase function secrets (server side)

Set these in Supabase project secrets when required by your enabled flows:
- auth/email provider secrets (for reset email)
- KBZPay gateway secrets and webhook verification values
- `EDGE_ADMIN_OPERATION_SECRET` (required for protected admin operations and monitoring endpoints)
- optional debug flags only in non-production environments

## 5) Domain and vendor host notes

- **Customer shopping** runs on vendor storefront hosts (subdomain, custom domain, or path-based `/vendor/:slug` in dev) — not on a shared marketplace `/products` route.
- **Platform apex** (`walwal.online`) serves landing, super-admin, vendor onboarding, and unified KBZPay `/summary`.
- For subdomain routing, set domain mapping env vars consistently across frontend and edge/middleware configuration (`middleware.ts`).
- If using a proxy/CDN, keep TLS from CDN to origin in strict mode.

## 6) Rollout checklist

1. Deploy backend changes first when API contracts changed.
2. Deploy frontend build with matching env values.
3. Verify auth + admin login + vendor login.
4. Verify vendor storefront product list/detail, category tabs, cart, checkout, and order creation (on a **vendor URL**, not apex `/products`).
5. Verify **Add to Home** on a vendor storefront over HTTPS (Android Chrome install prompt + home-screen icon). Ensure `public/sw.js` is deployed with the static build. See [VENDOR_ADD_TO_HOME.md](./VENDOR_ADD_TO_HOME.md).
6. Verify KBZPay webhook processing in the target environment.
7. Verify destructive admin actions require authorized secret headers.
8. Follow `docs/READ_MODEL_ROLLOUT.md` for SQL read-model validation and monitoring checks.
9. Monitor Supabase logs and frontend errors for at least one traffic cycle.

## 7) Troubleshooting

- **404 on refresh/deep-link**: fix SPA rewrite.
- **Auth redirect/login mismatch**: validate Supabase Auth allowed URLs.
- **Webhook issues**: verify function secret values and signature settings.
- **Admin destructive routes blocked**: set and pass admin operation secret headers correctly.
- **Monitoring endpoints blocked**: set `EDGE_ADMIN_OPERATION_SECRET`; if using the diagnostics UI, set matching `VITE_ADMIN_OPERATION_SECRET`.










