# Simple UI Instructions

This version is intentionally short and non-technical.

For detailed operations, use `SECURE_ADMIN_AND_VENDOR_GUIDE.md`.

## Super Admin

1. Open `https://your-domain/admin`.
2. Sign in with your staff account.
3. Use left menu for Products, Orders, Vendors, Customers, Marketing, Chat, and Settings.
4. If you cannot see a section, your role likely does not have permission.

## Vendor

1. Open `https://your-domain/vendor/login`.
2. Sign in with your vendor account.
3. Manage your store in:
   - `https://your-domain/store/<your-store-slug>/admin`
   - or `https://your-domain/vendor/<your-store-slug>/admin`
4. Use preview/open-store to verify your public storefront before sharing.

## Quick troubleshooting

- Blank page on refresh: report host/deep-link issue (SPA fallback).
- Missing menu items: ask admin to confirm your role.
- Login issues: use reset flow or contact your system admin.
