let adminStylesPromise: Promise<unknown> | null = null;

/** Lazy-load admin-only Tailwind utilities (kept out of the storefront CSS bundle). */
export function loadAdminStyles(): Promise<unknown> {
  if (!adminStylesPromise) {
    adminStylesPromise = import("../../styles/admin-tailwind.css");
  }
  return adminStylesPromise;
}
