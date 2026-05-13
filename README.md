# SECURE OS E-Commerce Platform

SECURE OS is a multi-tenant e-commerce system built for marketplace + vendor operations in one codebase.

It includes:
- main marketplace storefront
- vendor storefronts
- super-admin portal
- vendor-admin portal
- Supabase Edge backend (auth, orders, products, payments, notifications)

## Current Product Surface

### Customer / Storefront
- Browse products, categories, product detail, saved items, cart, checkout.
- Customer profile, addresses, order history, order detail.
- Marketplace storefront and vendor storefront variants are both active.

### Payments
- KBZPay QR and KBZPay PWA are implemented in checkout.
- KBZPay webhook + realtime status sync is implemented.
- Refund cancellation flow is coded, but production refund success depends on gateway-side mTLS/client certificate setup.

### Super Admin
- Dashboard, products, categories, inventory, orders, customers, chat, marketing, finances, settings, vendor and application management.
- Realtime order pulse bridge and inventory cache sync paths are in place.

### Vendor
- Vendor onboarding/application/setup/login paths.
- Vendor storefront with branded route/domain handling.
- Vendor admin with analytics, products, categories, orders, customers, finances, settings.

## Architecture

- Frontend: React 18 + TypeScript + Vite + Tailwind + Radix.
- Backend: Supabase Edge Functions (`make-server-16010b6f`, `kpay-webhook`) + Supabase Auth + Storage + Postgres/KV table usage.
- Routing: React Router with dedicated trees for public, super-admin, and vendor-admin flows.

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

- `npm run dev` - start Vite dev server
- `npm run build` - production build
- `npm test` - run Vitest
- `npm run deploy:edge` - deploy Supabase functions only
- `npm run db:push` - push Supabase DB changes
- `npm run deploy:supabase` - db push + functions deploy

## Environment

Use `.env.example` as the source of truth for local/environment variables.

At minimum you typically need:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Feature-dependent variables include KBZPay, Stripe, vendor domain mapping, and admin operation secret headers.

## Deployment

This is a static SPA frontend with Supabase backend services.

- Frontend: any static host with SPA fallback (`index.html` rewrite).
- Backend changes: deploy Supabase Edge Functions separately.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation Index

- Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Admin + vendor operations: [docs/SECURE_ADMIN_AND_VENDOR_GUIDE.md](docs/SECURE_ADMIN_AND_VENDOR_GUIDE.md)
- Routing and architecture notes: [docs/CODE_REVIEW_AND_ROUTING.md](docs/CODE_REVIEW_AND_ROUTING.md)
- Payment integration status: [docs/PAYMENTS.md](docs/PAYMENTS.md)
- Performance and caching: [docs/PERFORMANCE_AND_CACHING.md](docs/PERFORMANCE_AND_CACHING.md)
- UI animation references: [docs/UI_ANIMATIONS.md](docs/UI_ANIMATIONS.md)
- Attributions: [ATTRIBUTIONS.md](ATTRIBUTIONS.md)

## Important Caveats

- Some legacy labels/routes still use `kpay` in identifiers for compatibility, while user-facing copy is migrating to `KBZPay`.
- Do not assume all historical markdown files reflect the current system state; this README and the `docs/` set above are the source of truth.

## 🤝 Contributing

This is a private project for demonstration purposes. Not accepting contributions at this time.

## 📄 License

Proprietary - All rights reserved

## 🙏 Acknowledgments

- Built with React and TypeScript
- Styled with Tailwind CSS v4
- UI components from Radix UI
- Icons from Lucide React
- Backend powered by Supabase
- Deployed on Vercel

---

**Built with ❤️ for the Burmese Market**

For deployment help, see:
- 📘 [VERCEL_DEPLOYMENT_READY_FINAL.md](./VERCEL_DEPLOYMENT_READY_FINAL.md)
- ✅ [DEPLOY_CHECKLIST.md](./DEPLOY_CHECKLIST.md)