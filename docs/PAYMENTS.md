# Payments Integration (Current State)

This is the canonical payment reference for this repo.

## Active payment flows

- KBZPay QR checkout flow
- KBZPay mobile browser (PWA) flow
- KBZPay return-page handling
- KBZPay webhook processing and status syncing

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

## Non-goals for this doc

- Historical payment experiments
- Temporary migration notes
- One-off troubleshooting logs
