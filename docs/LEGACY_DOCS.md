# Legacy Documentation Index

The following markdown files live in the **repository root** and are **historical** — written during development sprints (caching experiments, animation work, Stripe setup, verification passes). They may contradict the running app.

## Source of truth (keep these updated)

| Document | Purpose |
|----------|---------|
| [README.md](../README.md) | NEXA Platform overview, routes, quick start |
| [docs/ARCHITECTURE_AND_BACKEND.md](./ARCHITECTURE_AND_BACKEND.md) | Backend, KV model, SQL read model, Realtime pulses, scaling, Supabase binding |
| [docs/CODE_REVIEW_AND_ROUTING.md](./CODE_REVIEW_AND_ROUTING.md) | Routes, hosts, component map |
| [docs/DEPLOYMENT.md](./DEPLOYMENT.md) | Deploy checklist |
| [docs/READ_MODEL_ROLLOUT.md](./READ_MODEL_ROLLOUT.md) | Read-model validation and monitoring |
| [docs/PAYMENTS.md](./PAYMENTS.md) | KBZPay (production payment path) |
| [docs/PERFORMANCE_AND_CACHING.md](./PERFORMANCE_AND_CACHING.md) | LCP, caching |
| [docs/NEXA_ADMIN_AND_VENDOR_GUIDE.md](./NEXA_ADMIN_AND_VENDOR_GUIDE.md) | Operator workflows |
| [docs/NEXA_SIMPLE_UI_INSTRUCTIONS.md](./NEXA_SIMPLE_UI_INSTRUCTIONS.md) | Non-technical guide |
| [docs/VENDOR_ADD_TO_HOME.md](./VENDOR_ADD_TO_HOME.md) | Vendor storefront Add to Home / install shortcut |
| [.env.example](../.env.example) | Environment variable reference |

## Superseded doc filenames

These older filenames are replaced by the NEXA-branded guides above:

| Old file | Replacement |
|----------|-------------|
| `docs/SECURE_ADMIN_AND_VENDOR_GUIDE.md` | `docs/NEXA_ADMIN_AND_VENDOR_GUIDE.md` |
| `docs/SECURE_SIMPLE_UI_INSTRUCTIONS.md` | `docs/NEXA_SIMPLE_UI_INSTRUCTIONS.md` |

## Outdated root files (do not trust without verifying code)

These files are kept for history but **should not** be used for deployment or architecture decisions:

| File | Why outdated |
|------|----------------|
| `ANIMATION_*.md`, `ANIMATIONS_README.md` | Animation sprint notes; see `docs/UI_ANIMATIONS.md` |
| `CACHE_*.md`, `CACHING_*.md`, `HOW_TO_SEE_CACHE_SAVINGS.md` | Cache debug sprints; see `docs/PERFORMANCE_AND_CACHING.md` |
| `DEPLOYMENT_CHECKLIST.md`, `DEPLOYMENT_READY_SUMMARY.md` | Pre-vendor-first routing era; see `docs/DEPLOYMENT.md` |
| `FINAL_VERIFICATION.md`, `VERIFICATION_*.md`, `TESTING_CHECKLIST.md` | Point-in-time QA snapshots |
| `PAYMENT_FLOW_EXPLAINED.md`, `PAYMENT_QUICK_REFERENCE.md`, `README_PAYMENT_INTEGRATION.md` | Superseded by `docs/PAYMENTS.md` |
| `QUICK_START_STRIPE.md`, `STRIPE_SETUP_GUIDE.md`, `STRIPE_INTEGRATION_EXAMPLE.tsx` | Stripe not wired to vendor `Checkout.tsx` |
| `README_CACHE_PROOF.md`, `REQUEST_ANALYZER_GUIDE.md`, `COST_IMPACT_GUIDE.md` | Internal tooling notes |
| `SUPER_ADMIN_ISSUES_REPORT.md`, `VENDOR_STATUS_TESTING_CHECKLIST.md` | Issue snapshots |
| `LOADING_STATE_FIX.md`, `OPTIMIZATION_COMPLETE.md` | Fixed and merged; not maintained |

## Legacy code (not routed / not production path)

| Path | Status |
|------|--------|
| `src/app/components/Storefront.tsx` | Former marketplace UI — removed from the repo |
| `src/app/pages/StorefrontPage.tsx` | Legacy wrapper — removed from the repo |
| `src/app/components/StorefrontCached.tsx` | Legacy storefront helper — removed from the repo |
| `src/app/components/StripePayment.tsx` | Exists; **not used** in vendor checkout |

When in doubt, verify against `src/app/routes.tsx` and `docs/ARCHITECTURE_AND_BACKEND.md`.
