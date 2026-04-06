# SECURE — Simple UI instructions (for everyone)

This guide uses **plain language** and **numbered steps**. No technical background needed.

---

## How to turn this into a PDF

1. Open the file **`SECURE_SIMPLE_UI_INSTRUCTIONS.html`** in **Google Chrome** or **Microsoft Edge** (double‑click the file).
2. Press **Ctrl+P** (Windows/Linux) or **Cmd+P** (Mac).
3. Choose **Save as PDF** or **Microsoft Print to PDF** as the printer.
4. Click **Save** and pick a folder.

You can also print the **.md** file from any editor that exports PDF, but the **.html** version looks nicest on paper.

---

## Words you will see in this app

| Word | What it means |
|------|----------------|
| **Super Admin / Admin** | The main control room for the **whole** shopping site. Staff use it to manage products, orders, vendors, and settings. |
| **Vendor** | A **seller** who has their own mini‑shop inside SECURE. |
| **Storefront** | The **customer‑facing website** where shoppers browse and buy (your vendor’s public shop). |
| **Vendor admin** | The **private dashboard** where one vendor manages **their** products and orders. |

---

# Part A — Super Admin (running the whole platform)

## A1. Open the admin website

1. Open your web browser (Chrome, Edge, Firefox, or Safari).
2. Go to your SECURE address and add **`/admin`** at the end.  
   - Example: if the site is `https://yoursite.com`, you open `https://yoursite.com/admin`
3. **Sign in** with the email and password your owner gave you.

If you cannot sign in, ask whoever manages accounts to check your email and role.

---

## A2. The screen layout (what is where)

After you sign in you usually see:

- **Left side:** A **menu** (sometimes called sidebar). This is how you move between areas.
- **Top:** Search, notifications, and your **profile / name**.
- **Middle:** The main work area — it changes depending on what you clicked in the menu.

---

## A3. Main menu items (what they are for)

Click the name on the **left** to open that section.

| Menu name | Plain explanation |
|-----------|-------------------|
| **Home** | Summary / dashboard. |
| **Product** | Opens a small submenu: **Product** (all products), **Categories**, **Inventory**. Use these to manage what is sold and stock. |
| **Orders** | All customer orders across the marketplace. |
| **Vendor** | List of **seller partners**. Here you add vendors, see status, and open **Review applications** for new seller signups. |
| **Promo Setting** | Discounts and promotions. |
| **Chat** | Messages with customers. |
| **Customers** | Customer list and details. |
| **Finances** | Money / reports (only if your login is allowed to see it). |
| **Logistics** | Delivery / shipping **partners** (carriers), not warehouse shelves. |
| **Settings** | Store name, logo, and **team accounts** (only if your role allows). |

> **Note:** If you do **not** see **Finances** or **Settings**, your account is limited on purpose. Ask an owner if you need access.

---

## A4. Working with vendors (Super Admin)

1. In the left menu, click **Vendor**.
2. You see a **list of vendors** and numbers at the top (totals).
3. Use the **search box** to find a vendor by name or email.
4. Use the **status filter** (dropdown) to narrow the list if needed.
5. Buttons you may see:
   - **Review applications** — check people who applied to become vendors.
   - **Add vendor** — create a vendor manually (if your process allows).
6. On a vendor row, the **⋮** (three dots) menu often has **view**, **edit**, or **open storefront** so you can check their public shop.

---

## A5. Settings and team users (owners only)

1. Click **Settings** in the left menu.
2. Tabs may include **General** (store name, logo) and **Users** (invite staff).
3. To **add a staff member:** open the **Users** tab → use **Add user** (or similar) → fill name, email, role → save.

---

# Part B — Vendors (sellers)

## B1. Vendor login

1. Open: **`yoursite.com/vendor/login`** (put your real site name instead of `yoursite.com`).
2. Enter the **email and password** created for the vendor account.
3. After login, the app may send you to the **vendor dashboard** or ask you to finish setup.

---

## B2. Vendor admin address (bookmark this)

Vendors manage their shop from an address like one of these:

- `yoursite.com/vendor/YOUR-STORE-SLUG/admin`
- `yoursite.com/store/YOUR-STORE-SLUG/admin`

**YOUR-STORE-SLUG** is the short name of the shop (often set during setup). If you are not sure, ask Super Admin or check the welcome email.

---

## B3. Vendor admin — menu on the left

| Menu name | What you do here |
|-----------|-------------------|
| **Analytics** (or Dashboard) | Overview: sales‑style summary; often shortcuts to other pages. |
| **Products** → **All products** | Add, edit, or remove **your** products. |
| **Products** → **Categories** | Organize products into categories. |
| **Orders** | Orders for **your** store. |
| **Customers** | People who bought from you (as shown in the system). |
| **Finances** | Earnings / payouts (what your build shows). |
| **Settings** | Store name, **logo**, **store link (slug)**, and how your **public storefront** looks. |

---

## B4. See your shop as customers see it

1. In vendor admin, look for a button like **Preview store**, **View storefront**, or **Open store** (exact wording may vary).
2. Click it — a **new tab** opens with your **public** shop.
3. Use this to check photos, prices, and spelling before sharing the link with buyers.

---

## B5. Public link you give to customers

Customers usually shop at:

- `yoursite.com/vendor/YOUR-SLUG` **or**
- `yoursite.com/store/YOUR-SLUG`

Share the link your team confirms is correct for your deployment.

---

# Quick help

| Problem | What to try |
|---------|----------------|
| Blank page or error | Refresh the page (F5). Try another browser. |
| “Access denied” or missing menu | Your **role** does not include that area — ask Super Admin. |
| Forgot password | Use **Forgot password** on the login screen if available, or ask support. |

---

*SECURE — simple UI instructions. For more technical detail, see `SECURE_ADMIN_AND_VENDOR_GUIDE.md`.*
