# Super Admin and Vendor Guide

This guide documents operator workflows for the current SECURE OS app.

## 1) Access and route model

- Super-admin portal: `/admin` and `/admin/:section`
- Vendor public storefront: `/store/:storeName/*` and `/vendor/:storeName/*`
- Vendor admin portal: `/store/:storeName/admin/*` and legacy `/vendor/:storeName/admin/*`
- Vendor onboarding/auth: `/vendor/application`, `/vendor/setup`, `/vendor/login`

## 2) Super-admin workflows

### Core areas

- Dashboard/home
- Products, categories, inventory
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
3. Vendor lands in admin portal routes under `/store/:storeName/admin/*` (or legacy `/vendor/:storeName/admin/*`).

### Vendor admin areas

- Analytics
- Products and categories
- Orders
- Customers
- Finances
- Settings/branding

### Public storefront verification

Use vendor preview/open-store action from vendor admin to verify:
- catalog visibility
- pricing and stock
- checkout readiness

## 4) Role and permission notes

- Super-admin/staff roles control sidebar visibility and privileged actions.
- Unknown or unsupported role mappings should be corrected in user management to restore expected navigation.
- Owner-level roles are required for full finance/settings administration in most deployments.

## 5) Operational checks

Before release windows, confirm:
- admin login and section navigation
- vendor login and vendor-admin navigation
- vendor storefront route resolution
- order updates sync correctly across admin/vendor/customer views
- chat and notification flows are healthy

## 6) Related docs

- Routing/architecture: `docs/CODE_REVIEW_AND_ROUTING.md`
- Deployment: `docs/DEPLOYMENT.md`
- Payments: `docs/PAYMENTS.md`
- Simplified non-technical instructions: `docs/SECURE_SIMPLE_UI_INSTRUCTIONS.md`
