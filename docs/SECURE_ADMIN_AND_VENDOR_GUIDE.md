# SECURE — Super Admin & Vendor Guide

This document explains how the **platform (Super Admin)** console and **vendor** experiences fit together: URLs, main screens, and typical workflows. It matches the current SECURE web app structure.

**Easier, step-by-step UI instructions (printable PDF):** see **`SECURE_SIMPLE_UI_INSTRUCTIONS.md`** and **`SECURE_SIMPLE_UI_INSTRUCTIONS.html`** in this folder — open the HTML file in a browser and use **Print → Save as PDF**.

---

## 1. Concepts

| Term | Meaning |
|------|--------|
| **Super Admin / platform admin** | Staff who sign in to the **main admin shell** (`/admin`) to run the whole marketplace: catalog, orders, vendors, finances (by role), settings, etc. |
| **Vendor** | A business partner with their own **branded storefront** and a **vendor admin panel** to manage their slice of catalog, orders, and storefront settings. |
| **Storefront** | The **public shop** customers see for a vendor — product listing, product detail, cart, checkout, and customer account areas under that vendor’s URL. |
| **Vendor admin panel** | The **back office** for one vendor: analytics, products, categories, orders, customers, finances, and storefront-related settings. |

---

## 2. Super Admin (platform admin)

### 2.1 Signing in and URL

- Admin home: **`/admin`**
- Deep links use **`/admin/<section>`** (examples below). The sidebar and URL stay in sync.

### 2.2 Main navigation (what you can open)

Typical top-level areas (exact labels may follow your language pack):

| Area | Example URL | Purpose |
|------|-------------|---------|
| Home | `/admin` | Dashboard / overview |
| Product → Product, Categories, Inventory | `/admin/products`, `/admin/categories`, `/admin/inventory` | Global catalog and stock |
| Orders | `/admin/orders` | All marketplace orders |
| Vendor | `/admin/vendors` | Vendor list, status, applications entry |
| Promo Setting | `/admin/marketing` | Promotions / marketing tools |
| Chat | `/admin/chat` | Customer messaging |
| Customers | `/admin/customers` | Customer records and actions |
| Finances | `/admin/finances` | Financial views (role-dependent) |
| Logistics | `/admin/logistics` | Delivery partners / carriers (platform view) |
| Settings | `/admin/settings` | Store-wide settings, staff users (role-dependent) |

Additional vendor-related routes (often reached from lists or search):

| Page | Example URL | Purpose |
|------|-------------|---------|
| Vendor applications | `/admin/vendor-applications` | Review new vendor signups |
| Vendor promotions | `/admin/vendor-promotions` | Vendor-scoped promos (when used) |
| Global search | `/admin/search` | Cross-entity search |

### 2.3 Staff roles (what each role usually sees)

Roles are enforced in the app so the sidebar only shows allowed pages.

| Role | Typical access |
|------|----------------|
| **store-owner** / **super-admin** | Full platform areas including **Finances** and **Settings** (including staff accounts). |
| **administrator** (and similar legacy admin roles) | Broad operations; usually **no Finances** and **no Settings** (or restricted settings). |
| **data-entry** | Catalog-focused: Home, Product, Categories, Inventory, and limited **Settings** (e.g. general/appearance — **Users** tab hidden). |
| **warehouse** | Operations: Home, **Orders**, **Inventory**, **Logistics**. |
| Unknown / legacy | Safely limited (often **Home** only) until the account role is corrected. |

> **Invite rules:** Owners can assign any standard staff role. Administrators can usually invite **warehouse** and **data-entry** only. Exact rules live in `superAdminRolePermissions` in the codebase.

### 2.4 Vendor management (Super Admin)

**Vendor list** (`/admin/vendors`):

- Search and filter vendors (e.g. by region/status).
- Add vendors, edit, change status, bulk actions — per your deployed API.
- **Review applications** opens the application workflow when there are pending signups.
- From a vendor row, actions often include opening the **vendor profile** and **viewing the public storefront**.

**Opening a vendor’s public storefront from admin:**

- The app may navigate to a URL like **`/vendor/<vendorId>`** so you preview that vendor’s live storefront (ID-based route is used for consistency).

Use this to verify branding, products, and checkout without logging in as the vendor.

### 2.5 Settings (Super Admin)

Under **`/admin/settings`**, platform owners typically manage:

- General store identity (name, logo, etc.).
- **Users** tab: invite staff, assign roles, edit profiles (when your role allows).
- Appearance / banners and other global options depending on build.

### 2.6 Logistics (Super Admin)

**`/admin/logistics`** is oriented toward **delivery partners / shipping carriers** (multiple companies, regions, COD flags, etc.), not warehouse floor operations.

---

## 3. Vendor experience

### 3.1 Becoming a vendor

- Public **vendor application** flow (path like **`/vendor/application`**) submits an application.
- Super Admin reviews applications under **`/admin/vendor-applications`** (or via **Review applications** from the vendor area).
- After approval, vendors complete any **setup** steps your deployment requires (e.g. **`/vendor/setup`**).

### 3.2 Vendor login

- **`/vendor/login`** — vendor staff sign in with vendor credentials (separate from Super Admin staff login).

### 3.3 Public storefront URLs (customers)

Customers shop on the vendor’s **storefront**. Supported patterns include:

| Pattern | Example | Notes |
|---------|---------|--------|
| Legacy path | **`/vendor/<storeSlugOrId>`** | Common; admin preview may use vendor id. |
| Store path | **`/store/<storeSlug>`** | Alternative prefix for the same storefront experience. |

Nested routes (typical):

- **`/vendor/<slug>/product/<productSlug>`** — product page  
- **`/vendor/<slug>/profile`** — customer account area for that storefront  
- **`/vendor/<slug>/checkout`** — checkout (when routed through storefront)

If you use a **vendor subdomain**, the root of that subdomain may resolve directly to the storefront (see app routing).

### 3.4 Vendor admin panel (vendor back office)

Vendors manage their business from the **vendor admin** UI.

**URLs:**

| Pattern | Example |
|---------|---------|
| Under store path | **`/store/<storeSlug>/admin`** |
| Under vendor path | **`/vendor/<storeSlug>/admin`** |
| With section | **`.../admin/<section>`** e.g. `.../admin/products`, `.../admin/orders` |

On a **dedicated vendor subdomain** with admin, paths may appear as **`/admin`** and **`/admin/<section>`** (same sections, shorter prefix).

**Main sections (sidebar):**

| Section | Typical use |
|---------|-------------|
| **Analytics** (dashboard) | Sales / activity summary; shortcuts to other areas |
| **Products** → All Products | Create, edit, publish products; search in header may filter the list locally |
| **Products** → **Categories** | Vendor-scoped categories |
| **Orders** | Orders assigned to this vendor / fulfillment |
| **Customers** | Vendor’s customer list / CRM-style actions |
| **Finances** | Revenue / payouts views (as implemented) |
| **Settings** | Storefront name, slug, logo, branding, and related options |

**Preview storefront:**

- From the vendor admin, **preview** opens the **public** vendor storefront (same as customers see), e.g. navigating to **`/store/<slug>`** for a quick visual check.

**Product deep link:**

- **`/vendor/<storeSlug>/admin/products/<productId>/view`** (or the equivalent under `/store/...`) — focused product view in admin.

> **Slug changes:** If the storefront **slug** is renamed in Settings, the app tries to **normalize the URL** to the new slug so bookmarks keep working.

---

## 4. How Super Admin and vendors relate

1. **Super Admin** onboards vendors, monitors **all** orders/customers at platform level, and configures **global** policies, promos, and logistics partners.
2. Each **vendor** operates an independent **storefront** and **vendor admin** for their catalog and orders touching their store.
3. **Catalog** may be linked across marketplace and vendors depending on your product–vendor assignment rules (see **Product** admin and vendor product screens).
4. Use **Logistics** in Super Admin for **which carriers** exist platform-wide; individual checkout shipping lines may still reflect vendor or global rules per integration.

---

## 5. Quick reference — URLs

| Audience | URL |
|----------|-----|
| Platform admin home | `/admin` |
| Vendors list | `/admin/vendors` |
| Vendor applications | `/admin/vendor-applications` |
| Vendor login | `/vendor/login` |
| Vendor application (public) | `/vendor/application` |
| Vendor storefront (example) | `/vendor/<slug-or-id>` or `/store/<slug>` |
| Vendor admin (example) | `/vendor/<slug>/admin` or `/store/<slug>/admin` |

---

## 6. Support and customization

- Behavior of **APIs**, **webhooks**, and **payments** may vary by environment; this guide describes **navigation and roles** in the SECURE app shell.
- For payment or cache specifics, see other README files in the repository root.

*Last updated to reflect the SECURE admin shell, vendor routing, and role model in the codebase.*
