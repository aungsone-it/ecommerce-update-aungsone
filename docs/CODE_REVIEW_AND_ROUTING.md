    # SECURE E‑commerce — Code Review & Routing Reference

*Shareable overview of architecture, routing, and notable edge cases. Last updated to reflect the current React + Vite + Supabase codebase.*

---

## 1. Executive summary

| Area | Notes |
|------|--------|
| **Stack** | React 18, React Router 7, Vite 6, TypeScript, Tailwind 4, Supabase (Auth + Edge Functions + KV/Postgres) |
| **Strengths** | Route-level code splitting, shared API client with timeouts, module-level caches for storefront data, explicit auth gates for admin vs vendor |
| **Risks** | Heavy route components (`Storefront`, `AdminPage`), reliance on Edge Function availability, production must whitelist app URLs in Supabase Auth |

---

## 2. High-level architecture

```
main.tsx
  └─ App.tsx → RouterProvider(router)
       └─ routes.tsx (createBrowserRouter)
```

**Global providers** (`ProvidersWrapper` in `routes.tsx`):

- `ThemeProvider` → `LanguageProvider` → `AuthProvider` → `VendorAuthProvider` → `ErrorBoundary` → `ScrollController` → layout child

**Data & API**

- `utils/api-client.ts` — central `fetch` to `https://<projectRef>.supabase.co/functions/v1/make-server-16010b6f/...`
- `utils/supabase/info.tsx` — `projectId` + `publicAnonKey` (treat as sensitive in public builds; rotate if leaked)

---

## 3. Routing system (`src/app/routes.tsx`)

React Router’s `createBrowserRouter` defines **three separate route trees**, each mounted at path **`/`**. React Router **merges** child routes by path; order matters for specificity.

### 3.1 Tree A — Public app (`RootLayout`)

| Path pattern | Page / role |
|--------------|-------------|
| `/` | Landing |
| `/store`, `/products`, `/product/:sku`, `/checkout`, `/profile/**`, `/saved`, `/blog/**` | Main marketplace (`StorefrontPage`) |
| `/setup` | Super-admin setup (`SetupPage`) |
| `/vendor/application`, `/vendor/setup`, `/vendor/login` | Vendor onboarding / auth |
| `/store/:storeName/admin/**` | Vendor admin (nested under **VendorProtectedLayout**) |
| `/store/:storeName/**`, `/vendor/:storeName/**` | Public vendor storefront (`VendorStorefrontPage`) — **specific routes before `:storeName`** |
| `*` | `NotFound` |

**Wrappers**

- `LazyBoundary` = `Suspense` + `RouteLoadingFallback` (lazy chunks).
- `AnimatedOutlet` — see §4.

### 3.2 Tree B — Super admin (`ProtectedLayout`)

| Path | Page |
|------|------|
| `/admin` | `AdminPage` |
| `/admin/:section` | `AdminPage` (section driven internally) |
| `/admin/customers/add` | `AddCustomerPage` |

**Important:** `ProtectedLayout` renders `AppRouter` **around** the outlet. `AppRouter`:

1. Calls Edge Function `auth/check-setup`.
2. If setup incomplete → renders embedded `<Setup />` (blocks admin shell).
3. Else → `<AuthGate>`: no session → `<Login />`; session + temp password → `<ChangePassword />`; else → admin `Outlet`.

So **super-admin login UI is not a separate route** — it is **AuthGate inside AppRouter** when unauthenticated.

### 3.3 Tree C — Legacy vendor admin URL (`VendorProtectedLayout`)

| Path | Page |
|------|------|
| `/vendor/:storeName/admin` | `VendorAdminPage` |
| `/vendor/:storeName/admin/:section` | `VendorAdminPage` |
| `/vendor/:storeName/admin/products/:productId/view` | `VendorAdminProductViewPage` |

Same vendor admin UI as `/store/:storeName/admin/**`, different URL prefix for backwards compatibility.

### 3.4 Route matching tips

- **More specific paths first** in the config (e.g. `.../product/:productSlug` before `.../:storeName`).
- **`/admin`** is only the **super admin** tree; **`/store/foo/admin`** is **vendor** admin under Tree A.
- **`errorElement: <NotFound />`** on several branches — user-facing 404 for bad slugs.

---

## 4. `AnimatedOutlet` (`src/app/components/AnimatedOutlet.tsx`)

Not used for heavy animation today; it computes a **`routeGroup`** string from `location.pathname` and sets **`key={routeGroup}`** on a wrapper `div` so React **remounts** less often when navigating within the same “logical app” (e.g. all main storefront URLs share group `storefront`).

**Groups (simplified)**

- `landing` — `/`
- `storefront` — `/store`, `/products`, `/product/*`, checkout, profile, saved, blog
- `admin` — `/admin...` but not `/vendor/...`
- `vendor-admin-<slug>` — vendor admin under `/store/.../admin` or `/vendor/.../admin`
- `vendor-store-<slug>` — vendor **storefront** under `/store/:name` or `/vendor/:name`

**Edge case:** Changing only query strings without pathname change does not change `routeGroup` (by design).

---

## 5. Authentication flows

### 5.1 Marketplace customer (`AuthProvider` + optional `AuthModal` in storefront)

Session via Supabase JS (`AuthContext`). Cart sync uses `CartContext` + Edge API for logged-in users.

### 5.2 Super admin (`AppRouter` + `AuthGate`)

- Session required to see `/admin/**` content.
- **Setup** can short-circuit to full-page `<Setup />` before `AuthGate` if `check-setup` says incomplete.

### 5.3 Vendor (`VendorAuthProvider` + `VendorAuthGate`)

- Used under `VendorProtectedLayout` for `/store/:storeName/admin/**` and Tree C.
- Unauthenticated → `VendorLogin` with `storeName` from URL.

---

## 6. Notable edge cases & failure modes

### 6.1 Product navigation / URL vs React state (main storefront)

- **Issue:** User opens product → navigates away before async `fetchProductDetails` finishes → stale `setSelectedProduct` could reopen detail.
- **Mitigation (implemented):** Clear product state when URL is not `/product/...`; after fetch, verify path + SKU before `setSelectedProduct`; retry effect bails if not on product path.

### 6.2 Vendor storefront product URL

- **Issue:** Catalog loads after user hits “back”; effect could sync product from URL + `products` array late.
- **Mitigation:** Derive slug from **`location.pathname`** (`matchPath`) and clear selection when no product segment; only `setSelectedProduct` if still on a product route.

### 6.3 Three route trees at `/`

- **Issue:** Confusion if two trees define conflicting child paths (rare after careful ordering).
- **Practice:** Keep admin-only paths in Tree B; public and vendor storefront in Tree A; legacy vendor admin in Tree C.

### 6.4 `AppRouter` setup check fails

- **Behavior:** On non-OK or network error, **`needsSetup` is false** (fail open) so admin is not permanently blocked.

### 6.5 API timeouts & retries

- Default timeouts and retry counts live in `src/constants/index.ts`.
- List reads (e.g. products admin) may use **shorter** `LIST` timeout and **no** multi-retry where appropriate — avoids long skeleton states.
- **504 / gateway timeout** from Supabase often surfaces in the browser as **CORS errors** on Auth or API because error responses may omit `Access-Control-Allow-Origin`. Root cause is usually **timeout / outage**, not primary CORS config.

### 6.6 Production deployment (e.g. Vercel)

- Add **`https://<your-domain>/**`** to Supabase **Authentication → URL configuration** (Site URL + Redirect URLs).
- Ensure `utils/supabase/info.tsx` **project ref** matches the Supabase project (typo → wrong host, confusing errors).

### 6.7 Lazy routes

- First navigation to a chunk shows **`RouteLoadingFallback`** until the JS chunk loads — normal on slow networks.

---

## 7. Code review — strengths

1. **Separation of concerns** — API client, contexts, and large UI surfaces are split.
2. **Defensive auth** — `AuthGate` / `VendorAuthGate` / setup check reduce accidental exposure.
3. **Performance work** — lazy routes, `manualChunks` in Vite, storage bucket helper on Edge, cart/throttle optimizations.
4. **i18n** — `LanguageContext` keys for auth/setup copy.

---

## 8. Code review — recommendations (for maintainers)

| Priority | Item |
|----------|------|
| **Medium** | Split `Storefront.tsx` / `AdminPage` / Edge `index.tsx` into feature modules — current files are very large and hard to review. |
| **Medium** | Run `tsc --noEmit` in CI and fix errors incrementally — many projects ship with Vite-only builds. |
| **Low** | Document required Supabase Auth URLs and Edge deploy steps in onboarding for new developers. |
| **Low** | Consider React Query (or similar) for server state to unify caching, retries, and loading UI. |

---

## 9. File index (routing-related)

| File | Role |
|------|------|
| `src/app/routes.tsx` | `createBrowserRouter` definition, lazy pages, `LazyBoundary` |
| `src/app/App.tsx` | `RouterProvider` |
| `src/app/components/RootLayout.tsx` | Public shell + `Outlet` |
| `src/app/components/ProtectedLayout.tsx` | Admin shell + `AppRouter` + `Outlet` |
| `src/app/components/AppRouter.tsx` | Setup check + `AuthGate` |
| `src/app/components/AuthGate.tsx` | Super-admin session gate |
| `src/app/components/VendorProtectedLayout.tsx` | Vendor admin shell |
| `src/app/components/VendorAuthGate.tsx` | Vendor session gate |
| `src/app/components/AnimatedOutlet.tsx` | Route group `key` for outlet |
| `src/pages/StorefrontPage.tsx` | Wraps `Storefront` with providers |
| `src/pages/VendorStorefrontPage.tsx` | Passes `storeName`, `productSlug`, etc. |

---

## 10. Changelog reference (conversation-derived)

- Race fixes for product detail vs navigation (storefront + vendor).
- API: reduced overly long default timeouts / retries; product list uses bounded `LIST` timeout.
- Edge: shared storage bucket caching to reduce Storage API churn.
- Routes: lazy-loaded route chunks + Vite `manualChunks` for vendor libraries.

---

*This document is intended for engineers and stakeholders reviewing deployment, routing behavior, and operational edge cases. For Supabase project settings, always verify against the live project dashboard.*
