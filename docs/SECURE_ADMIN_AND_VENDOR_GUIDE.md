# Super Admin and Vendor Guide

This guide documents operator workflows for the current SECURE OS app (**vendor storefronts** — there is no shared marketplace shopping catalog).

## 1) Access and route model

### Super admin

- Portal: `/admin` and `/admin/:section`
- Host: platform apex (e.g. `https://walwal.online/admin`)

### Vendor public storefront

Customers shop on **one vendor at a time**:

| Deployment | Public store URL |
|------------|------------------|
| Subdomain (production) | `https://{label}.{baseDomain}/` (e.g. `https://gogo.walwal.online/`) |
| Custom domain | `https://your-domain.com/` |
| Path-based (dev) | `https://your-domain/vendor/{store-slug}/` |

### Vendor admin

- Primary: `/vendor/{store-slug}/admin/*`
- On some vendor hosts: `/admin` at the vendor host root
- Legacy path alias: `/store/{store-slug}/admin/*` may redirect to `/vendor/...`

### Vendor onboarding / auth

- `/vendor/application` — apply to sell
- `/vendor/setup` — complete setup after approval
- `/vendor/login` — vendor sign-in (redirects to correct admin host when configured)

## 2) Super-admin workflows

### Core areas

- Dashboard/home
- Products, categories, inventory (platform-wide catalog management for admins)
- Orders
- Vendors and vendor applications
- Customers
- Marketing
- Chat
- Finances and settings (role dependent)

### Typical daily flow

1. Open `/admin`.
2. Review order/customer/vendor alerts.
3. Manage catalog and inventory updates.
4. Process order lifecycle transitions.
5. Review vendor applications and vendor status.
6. Use settings/users for staff management (if authorized role).

### Security and destructive actions

Destructive admin operations are guarded by backend checks. Production usage should pass admin-operation secret headers from authorized clients only.

## 3) Vendor workflows

### Vendor login and setup

1. Vendor signs in at `/vendor/login`.
2. If setup is incomplete, complete vendor setup flow.
3. Vendor lands in admin portal routes under `/vendor/{store-slug}/admin/*` (or vendor-host `/admin`).

### Vendor admin areas

- Analytics
- Products and categories (this vendor’s catalog only)
- Orders
- Customers
- Finances
- Settings/branding (logo, subdomain preview, custom domain, terms/privacy, social links)

### Public storefront verification

Use **preview / open store** from vendor admin to verify:

- catalog visibility and category tabs (`/`, `/{category-slug}`)
- pricing and stock
- checkout and KBZPay readiness

Share the **vendor URL** (subdomain or custom domain), not a generic marketplace `/products` link.

## 4) Role and permission notes

- Super-admin/staff roles control sidebar visibility and privileged actions.
- Unknown or unsupported role mappings should be corrected in user management to restore expected navigation.
- Owner-level roles are required for full finance/settings administration in most deployments.

## 5) Operational checks

Before release windows, confirm:

- admin login and section navigation
- vendor login and vendor-admin navigation
- vendor storefront on **subdomain** and **path-based** URLs
- category routes (e.g. `/cosmetic`) show full category catalog without requiring “Load more” on home first
- order updates sync correctly across admin/vendor/customer views
- KBZPay return lands on apex `/summary` and Continue Shopping returns to the vendor storefront
- chat and notification flows are healthy

## 6) Related docs

- Backend / scaling: `docs/ARCHITECTURE_AND_BACKEND.md`
- Routing/architecture: `docs/CODE_REVIEW_AND_ROUTING.md`
- Deployment: `docs/DEPLOYMENT.md`
- Payments: `docs/PAYMENTS.md`
- Simplified non-technical instructions: `docs/SECURE_SIMPLE_UI_INSTRUCTIONS.md`
- Outdated root markdown: `docs/LEGACY_DOCS.md`
