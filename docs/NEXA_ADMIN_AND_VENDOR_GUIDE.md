# NEXA Platform — Super Admin and Vendor Guide

This guide documents operator workflows for the current **NEXA Platform** app (**vendor storefronts** — there is no shared marketplace shopping catalog).

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
- Vendors (**Review applications** — new sellers are approved here; there is no “Add vendor” button)
- Customers
- Marketing
- Chat
- Finances and settings (role dependent)

### Settings tabs

| Tab | Who sees it | Purpose |
|-----|-------------|---------|
| **General** | All roles with Settings access | Platform name, logo, support phone/email, banners |
| **Users** | Store owner only | Create/edit/delete staff accounts |
| **Activities** | All roles with Settings access | Global audit timeline — every admin action across the platform |

The **Appearance** tab is hidden in the UI; branding fields live under **General**.

**Activities feed behavior:**

- Shows actions such as **User created/updated/deleted**, **Product created/updated/deleted**, **Vendor Approved**, **Vendor Deleted**
- Vendor rows display as: `Vendor Approved > StoreName | email | phone` and **By Name · Role**
- Feed is stored in KV `staff:activity:global-feed` (max 500 entries)
- While the Activities tab is open, the client polls incrementally every **30 seconds** (`?since=` timestamp) — no full reload on every visit
- Approve/reject/delete actions require the acting staff member’s Supabase Auth UUID (`performedByUserId`) from the browser session

### Typical daily flow

1. Open `/admin`.
2. Review order/customer/vendor alerts.
3. Manage catalog and inventory updates.
4. Process order lifecycle transitions.
5. Review vendor applications via **Vendor → Review applications**; approve or reject (logged in Activities).
6. Use **Settings → Users** for staff management (store owner only).
7. Check **Settings → Activities** for a cross-platform audit trail when needed.

Platform branding (name, logo) is editable under **Settings → General** and appears on the apex landing page, admin shell, and default tab titles.

### Security and destructive actions

Destructive admin operations are guarded by backend checks. Production usage should pass admin-operation secret headers from authorized clients only.

## 3) Vendor workflows

### Vendor application (public form)

Applicants use `/vendor/application`:

| Field | Rule |
|-------|------|
| Phone | Myanmar format: `+959XXXXXXXXX` (12 digits) or `09XXXXXXXXX` (11 digits) |
| Store description | At least **10 characters** (max 5,000) |
| Email | Live availability check while typing (debounced; 8s timeout — submit still validated server-side) |

After approval, the vendor completes setup at `/vendor/setup` and signs in at `/vendor/login`.

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
- checkout readiness: Cash on Delivery, KBZPay QR, and KBZPay PWA
- storefront contact: phone menu offers native Dial and Viber chat
- **Add to Home** button (floating, above chat) — test on Android Chrome over HTTPS; verify home-screen icon uses store name/logo

Share the **vendor URL** (subdomain or custom domain), not a generic marketplace `/products` link.

Full Add to Home behavior (Android vs iOS, testing, limitations): [VENDOR_ADD_TO_HOME.md](./VENDOR_ADD_TO_HOME.md).

### Platform landing page (apex `/`)

Customers and prospects visiting the marketplace apex see:

- Platform hero, stats (active vendors, products, customers)
- **Vendor partner carousel** — active vendors with **store logos**, sorted by **total revenue** (best selling first)
- Clicking a vendor card opens their storefront: **verified custom domain** → **subdomain** → path `/vendor/:slug`
- **FloatingChat** bubble for customer support (same component as vendor storefronts)

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
- **Settings → Activities** updates after vendor approve/delete and staff user changes
- **Landing page** carousel logos load; cards link to correct vendor store URL
- **Vendor application** form accepts `+959…` / `09…` phones and rejects duplicate emails
- Storefront language menu shows English/Burmese; admin language controls stay English/Chinese
- after backend deploy: run read-model validation (`docs/READ_MODEL_ROLLOUT.md`)

## 6) Related docs

- Backend / scaling: `docs/ARCHITECTURE_AND_BACKEND.md`
- Routing/architecture: `docs/CODE_REVIEW_AND_ROUTING.md`
- Deployment: `docs/DEPLOYMENT.md`
- Read-model rollout: `docs/READ_MODEL_ROLLOUT.md`
- Payments: `docs/PAYMENTS.md`
- Simplified non-technical instructions: `docs/NEXA_SIMPLE_UI_INSTRUCTIONS.md`
- Outdated root markdown: `docs/LEGACY_DOCS.md`
