# Vendor Add to Home Screen

Customers can add a vendor storefront shortcut to their phone or desktop home screen from an in-app **Add to Home** button on every vendor storefront.

This is **not** a native app install from the Play Store or App Store. It uses the browser’s web install / Add to Home Screen flow (PWA-style), triggered from your storefront UI.

## Where it appears

- Floating button above the **FloatingChat** bubble (bottom-right FAB stack)
- Label: **Add to Home** with a download icon
- Rendered by `VendorInstallFab` from `VendorStoreView` (main catalog and product-detail layouts)
- Hidden when the page is already opened in standalone / installed mode

CSS anchor classes live in `src/styles/theme.css` (`vendor-install-fab-anchor`, `vendor-install-fab-anchor--above-sticky`).

## User flow

### Android Chrome (best experience)

1. Customer opens a vendor storefront over **HTTPS** (production domain or subdomain).
2. Customer taps **Add to Home**.
3. If Chrome has fired `beforeinstallprompt`, the native install dialog opens immediately.
4. Customer taps **Install** / **Add**.
5. A home-screen icon is created using the vendor **store name** and **logo** from settings.
6. Tapping the icon reopens that vendor’s storefront URL in standalone mode.

### When the native prompt is unavailable

If Chrome has not yet exposed the install event (or it was already consumed this session), the button opens an in-app dialog with manual steps:

1. Keep the page open in Chrome.
2. Tap Chrome menu (⋮).
3. Choose **Add to Home screen** or **Install app**.
4. Confirm **Add**.

The dialog also shows the storefront URL and a **Copy Store URL** action.

### iPhone / iPad (Safari)

Safari does **not** support `beforeinstallprompt`. The in-app button cannot trigger a one-tap install on iOS.

Customers must use Safari manually:

1. Open the vendor storefront in **Safari** (not in-app browsers like Facebook/Instagram).
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Tap **Add**.

The shortcut uses the page title and apple-touch icon; vendor favicon/logo is applied via existing storefront head branding where supported.

## Platform behavior summary

| Platform | In-app button | Native one-tap install |
|----------|---------------|-------------------------|
| Android Chrome | Yes | Yes, when `beforeinstallprompt` is available |
| Android (other browsers) | Yes | Varies; often manual menu only |
| iPhone Safari | Yes (shows manual steps) | No — Share → Add to Home Screen only |
| Desktop Chrome / Edge | Yes | Sometimes (Install app in menu or address bar) |

## Technical implementation

| Piece | Location | Role |
|-------|----------|------|
| UI button + dialog | `src/app/components/VendorInstallFab.tsx` | Tap handler, toasts, fallback instructions |
| Mount point | `src/app/components/VendorStoreView.tsx` | Passes `storeName`, `storeLogo`, `pathSlug`, `hostRootStorePaths` |
| Storefront URL | `buildVendorStoreHomePath()` in `src/app/utils/vendorStorePaths.ts` | Correct start URL for path-based vs host-root stores |
| Runtime manifest | Injected in `VendorInstallFab` via blob URL | `name`, `short_name`, `start_url`, `icons` from current vendor |
| Service worker | `public/sw.js` | Minimal passthrough SW so Chrome considers the site installable |
| FAB positioning | `src/styles/theme.css` | Stacks install button above chat FAB |

### Manifest fields (per vendor)

When the storefront loads, the component injects a web manifest with:

- **name** / **short_name** — current vendor display name
- **start_url** — full storefront home URL (`origin` + path from `buildVendorStoreHomePath`)
- **icons** — vendor `storeLogo` when set; otherwise `/favicon.svg`
- **display** — `standalone`

### Install prompt lifecycle (Android)

Chrome’s `beforeinstallprompt` event is **one-time per page session**:

- First successful tap calls `prompt()` and consumes the deferred event.
- Second tap in the same session without reload shows: *“Install prompt already used — reload this page and tap Add to Home again, or use Chrome menu (⋮).”*
- After successful install, the button hides (`appinstalled` event + standalone display-mode check).

This is normal browser behavior, not a storefront bug.

## Requirements for reliable install

1. **HTTPS** in production (localhost works for dev testing but is less reliable).
2. **Service worker** served at `/sw.js` (included in `public/`).
3. **Valid manifest** with name, start URL, and icons (injected at runtime).
4. User has **not** already installed the shortcut.
5. User has **not** permanently dismissed install prompts for this site (Chrome heuristics).

## Logo quality tips for vendors

For the best home-screen icon:

- Upload a **square** logo in vendor settings (Settings → branding).
- Prefer at least **192×192 px** (512×512 is ideal).
- Avoid very wide or tiny logos; Android may crop or fall back to a generic icon.

## Testing checklist

### Android Chrome

1. Open vendor storefront on HTTPS (e.g. `https://migoo.store/` or `https://www.migoo.store/vendor/migoo`).
2. Hard refresh once; wait a few seconds for SW registration.
3. Tap **Add to Home** — expect native install dialog on first eligible tap.
4. Accept install — verify home-screen icon appears with vendor branding.
5. Open from home screen — storefront loads in standalone mode; button should be hidden.
6. Without installing, tap **Add to Home** again after prompt was used — expect reload/menu toast, not silent re-prompt.

### iPhone Safari

1. Open storefront in Safari.
2. Tap **Add to Home** — expect manual instruction dialog (no native prompt).
3. Follow Share → Add to Home Screen — verify icon on home screen.

### Regression

- Button still visible above chat FAB on product detail pages (sticky purchase bar layout).
- Button hidden when cart drawer is open (same as BackToTop).
- Correct URL for subdomain stores (`/` start) vs path-based (`/vendor/:slug` start).

## Limitations (set client expectations)

- Websites **cannot** create home-screen shortcuts silently without browser confirmation.
- **One tap + Allow** is the best achievable web UX on Android Chrome when the install event is available.
- iOS always requires manual Safari steps.
- Firefox and some OEM browsers have limited or no install support.
- Install prompt availability is controlled by the browser, not the storefront code.

## Related docs

- [CODE_REVIEW_AND_ROUTING.md](./CODE_REVIEW_AND_ROUTING.md) — storefront component map
- [DEPLOYMENT.md](./DEPLOYMENT.md) — HTTPS and SPA hosting
- [NEXA_SIMPLE_UI_INSTRUCTIONS.md](./NEXA_SIMPLE_UI_INSTRUCTIONS.md) — non-technical customer note
