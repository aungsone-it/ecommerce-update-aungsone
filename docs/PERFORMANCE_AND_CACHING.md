# Performance and Caching

This document summarizes active performance and cache behavior that should be maintained.

## Goals

- Keep UI interactions near-instant for cart/wishlist/order surfaces.
- Minimize duplicate Supabase API calls.
- Preserve correctness under refresh, tab switching, and multi-device use.
- Keep storefront **LCP** low on mobile (vendor subdomains and custom domains).

## Image delivery (LCP)

- Supabase Storage public URLs are rewritten to the **render/image** endpoint with sensible defaults:
  - Grid/product cards: **480px** (`gridDisplayImageUrl`)
  - Header logos: **128px** (`logoDisplayImageUrl`)
  - Hero banners: **960px** (`bannerDisplayImageUrl`)
- Override all sizes with `VITE_SUPABASE_THUMB_MAX` in env (requires Storage image transformations on your Supabase plan).
- First four product cards per grid use `priority` on `LazyImage` / `ProductCard` for faster above-the-fold paint.
- Banner slides use `<img fetchPriority="high">` instead of CSS `background-image`.

## Vendor catalog caching

- Vendor product pages are fetched with server pagination and optional **category** filter (`VendorStoreView` → `fetchVendorProducts`).
- Cache keys include vendor id, page, search query, category, and page size — category tab changes must refetch, not only filter the first loaded page in memory.
- Persisted localStorage slices are keyed per vendor + category where applicable.

## Frontend load

- Google Fonts load **non-blocking** from `index.html` (reduced weight families).
- `react-quill` CSS is imported only inside `RichTextEditor` (admin), not on every storefront route.
- `index.html` preconnects to Supabase for faster API and image fetches.

## Current implemented patterns

### Cart and wishlist persistence

- Immediate local state + localStorage updates on mutation.
- Immediate server sync for critical mutations (including destructive actions).
- Keepalive usage for reliability during page transitions.
- Realtime/event-based refresh paths for cross-tab/device consistency.

### API usage controls

- Cache freshness checks before forced refetch.
- Session-based throttling for expensive maintenance calls.
- Ambient throttles for profile and background refresh operations.
- Shared fetch/caching helpers to reduce repeated calls.

### Error handling

- Network and timeout failures surface as explicit typed API errors.
- Fail-closed behavior for sensitive validations (example: SKU uniqueness checks).

## Engineering guardrails

When changing data-fetching behavior:
1. Avoid introducing aggressive polling loops.
2. Prefer event-driven invalidation over periodic hard refetch.
3. Keep cache invalidation scoped to affected entities.
4. Confirm behavior with immediate refresh and multi-tab checks.

## Verification checklist

- Add/remove/clear cart, then hard refresh immediately.
- Add/remove wishlist, then hard refresh immediately.
- Confirm changes appear across two logged-in sessions.
- Confirm admin/order badge updates do not trigger redundant bursts.
- Review Supabase usage dashboard after repetitive workflow testing.
