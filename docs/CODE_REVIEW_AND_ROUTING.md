# Architecture and Routing Reference

This file is the evergreen technical reference for current app structure.

## 1) Stack

- React + TypeScript + Vite frontend
- React Router route trees for public/admin/vendor paths
- Supabase Auth + Edge Functions + Storage + database tables
- Shared API client in `src/utils/api-client.ts`

## 2) Runtime layout

- App bootstraps in `src/app/main.tsx` and `src/app/App.tsx`.
- Main routing lives in `src/app/routes.tsx`.
- Global providers wrap routes (theme, language, auth, vendor auth, error handling).
- Heavy feature surfaces include:
  - `src/app/components/Storefront.tsx`
  - `src/app/pages/AdminPage.tsx`
  - `src/app/components/VendorStoreView.tsx`

## 3) Route trees

### Public tree

- `/` landing/storefront entry
- marketplace/customer routes (`/store`, `/products`, `/product/:sku`, `/checkout`, profile/account routes)
- vendor onboarding/auth routes (`/vendor/application`, `/vendor/setup`, `/vendor/login`)
- vendor storefront routes under `/store/:storeName/*` and `/vendor/:storeName/*`

### Super-admin tree

- `/admin`
- `/admin/:section`
- additional admin child routes as defined in router

Super-admin access is protected by auth/setup checks in admin wrappers.

### Vendor-admin tree

- `/store/:storeName/admin/*`
- legacy compatibility paths under `/vendor/:storeName/admin/*`

## 4) Auth model

- Customer auth is handled by the main auth context.
- Super-admin flow is guarded by admin auth and setup checks.
- Vendor flow is guarded by vendor auth context and vendor route guards.

## 5) Data/API model

- Frontend calls Supabase Edge endpoints through the shared API client.
- Current primary server function namespace: `make-server-16010b6f`.
- Payment webhook endpoint is implemented in `kpay-webhook`.
- Critical destructive admin operations require explicit guard validation on the backend.

## 6) Reliability/performance behaviors

- Request caching and coalescing is used in client data helpers.
- Recent updates optimize cart/wishlist immediate persistence and cross-device syncing paths.
- Badge/profile refreshes and certain background refresh actions are throttled to reduce duplicate API usage.
- API client now throws typed timeout/network errors instead of silently returning empty payloads.

## 7) Routing pitfalls to watch

- Keep specific routes above generic dynamic segments.
- Avoid route collisions between `/admin/*` and vendor-admin paths.
- Preserve SPA fallback at hosting layer for all deep links.
- For vendor slug changes, ensure redirect/normalization behavior remains consistent.

## 8) Maintainer checklist for route/API changes

1. Update route declarations and guard wrappers together.
2. Verify deep-link behavior with hard refresh in production-like host.
3. Verify auth states (logged out, logged in, role-restricted).
4. Verify Edge endpoints and frontend calls stay contract-compatible.
5. Update this document and `README.md` when behavior changes.
