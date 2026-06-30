# Payments Integration (Current State)

This is the canonical payment reference for this repo.

## Active payment flows (production)

- **Cash on Delivery (COD)** order creation on vendor storefront checkout
- **KBZPay QR** checkout on vendor storefront (`Checkout.tsx`)
- **KBZPay PWA** (mobile browser / app return)
- KBZPay return-page handling (`/kpay/return`)
- **Unified post-payment summary** on platform apex: `https://nexa-mm.com/summary`
- KBZPay webhook (`kpay-webhook` Edge Function) + Realtime on `kpay_txn:{merchantOrderId}`

## Not active in vendor checkout

- **Stripe** — `stripe_routes.tsx`, `StripePayment.tsx`, and admin `PaymentSettings.tsx` exist but Stripe is **not integrated** into `Checkout.tsx`. Do not enable Stripe in customer-facing docs until wired end-to-end.

## Return URL model

| Stage | Where |
|-------|--------|
| Customer checks out | Vendor storefront host (subdomain, custom domain, or `/vendor/:slug/checkout`) |
| Customer chooses COD | Order is created immediately; customer pays cash on delivery |
| KBZ app completes payment | Browser opens with `merch_order_id` / `prepay_id` query params |
| Order summary UI | **Platform apex** `/summary` (redirect from vendor hosts when needed) |
| Continue Shopping | Back to `storefrontOrigin` stored on the checkout draft (the vendor where payment started) |

Implementation: `kpayUnifiedSummaryRedirect.ts`, `index.html` inline redirect, `middleware.ts` edge redirect, `vendorCheckoutPaths.ts`.

## Main implementation locations

- Frontend checkout UI: `src/app/components/Checkout.tsx`
- Frontend KBZPay client helpers: `src/app/utils/kpayClient.ts`
- Return landing page: `src/app/pages/KPayReturnPage.tsx`
- Server KBZPay routes: `supabase/functions/make-server-16010b6f/kpay_routes.tsx`
- Webhook function: `supabase/functions/kpay-webhook/index.ts`

## Branding and naming

- User-facing copy should use `KBZPay`.
- Some internal identifiers still use `kpay` for backwards compatibility (route names, file names, helper names).

## Refund/cancel caveat

Refund/cancellation logic exists in code, but successful production refunds depend on payment provider infrastructure setup (mTLS/client certificate requirements). Do not present refunds as universally ready until gateway-side certificate requirements are fully satisfied in the target environment.

## Operational checks

1. Verify QR session creation from checkout.
2. Verify mobile browser payment launch.
3. Verify return page updates order status.
4. Verify webhook signature handling in target environment.
5. Verify failed payment states show clear user-facing guidance.

## PWA draft reconciliation (orphaned orders)

KBZ PWA checkouts store a server draft (`kpay_pwa_draft:ORD-…`) before payment. A real storefront order must also exist (`order_num:ORD-…` → `order:*`). If finalize fails, admin panels stay empty while the customer may still see a summary from the draft.

### Automatic recovery (recommended)

1. Set Supabase Edge secret **`KPAY_PWA_RECONCILE_SECRET`** (or reuse `EDGE_ADMIN_OPERATION_SECRET`).
2. Schedule **`POST /make-server-16010b6f/kpay/pwa/reconcile`** every 10–15 minutes with header `x-kpay-reconcile-secret`.
3. Use the helper script:

```bash
SUPABASE_PROJECT_REF=your-project-ref \
KPAY_PWA_RECONCILE_SECRET=your-secret \
./scripts/kpay-pwa-reconcile.sh
```

The job syncs KBZ payment status, finalizes paid drafts, and logs `{ scanned, finalized, failed }`.

### Manual recovery (admin UI)

- **Super admin** → Orders tab → amber **KBZPay drafts missing orders** panel → **Recover order**
- **Vendor admin** → Orders → same panel (filtered to that vendor)
- Searching `ORD-…` when no order exists surfaces the matching draft when present.

### API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/kpay/pwa/orphaned-drafts` | List drafts without orders |
| GET | `/kpay/pwa/draft-status/:merchantOrderId` | Draft vs order status |
| POST | `/kpay/pwa/finalize/:merchantOrderId` | Retry finalize (admin UI) |
| POST | `/kpay/pwa/reconcile` | Batch reconcile (cron, secret header) |

## Non-goals for this doc

- Historical payment experiments
- Temporary migration notes
- One-off troubleshooting logs
