# NEXA Platform — Simple UI Instructions

This version is intentionally short and non-technical.

For detailed operations, use `NEXA_ADMIN_AND_VENDOR_GUIDE.md`.

**Note:** There is no shared marketplace product catalog. Each vendor has their own storefront URL.

## Super Admin

1. Open `https://walwal.online/admin` (or your platform apex + `/admin`).
2. Sign in with your staff account.
3. Use the left menu for Products, Orders, Vendors, Customers, Marketing, Chat, and Settings.
4. If you cannot see a section, your role likely does not have permission.

## Vendor

1. Open `https://walwal.online/vendor/login` (or your platform apex + `/vendor/login`).
2. Sign in with your vendor account.
3. Manage your store in the vendor admin:
   - `https://{your-subdomain}.{platform-domain}/admin`, or
   - `https://your-domain/vendor/{store-slug}/admin` (dev / path-based)
4. Your **customer-facing shop** is at your subdomain or custom domain (e.g. `https://gogo.walwal.online/`), not at `/products` on the main site.
5. Use preview/open-store in admin to verify catalog, categories, and checkout before sharing your link.

## Customers

- Shop at a **vendor’s store URL** (subdomain or custom domain), not on a central marketplace catalog.
- After KBZPay app payment, order summary may open on `walwal.online/summary`; use Continue Shopping to return to the vendor store.

## Quick troubleshooting

- Blank page on refresh: report host/deep-link issue (SPA fallback).
- Category page empty but products exist: hard refresh; if it persists, report a catalog filter issue.
- Missing menu items: ask admin to confirm your role.
- Login issues: use reset flow or contact your system admin.
