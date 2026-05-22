import { displayPlatformBrandName } from "./platformBranding";

export function buildSuperAdminDocumentTitle(input: {
  pageName: string;
  storeName?: string | null;
  viewingOrderId?: string | null;
  viewingUserName?: string | null;
}): string {
  const brand = displayPlatformBrandName(input.storeName);
  if (input.viewingUserName?.trim()) {
    return `${brand} - ${input.viewingUserName.trim()} | Super Admin`;
  }
  if (input.viewingOrderId?.trim()) {
    return `${brand} - Order #${input.viewingOrderId.trim()} | Super Admin`;
  }
  const page =
    input.pageName.trim().toLowerCase() === "home" ? "Dashboard" : input.pageName.trim();
  return `${brand} - ${page} | Super Admin`;
}

/** Marketplace landing / apex home — compact brand like vendor storefront tab. */
export function buildPlatformLandingDocumentTitle(storeName?: string | null): string {
  return displayPlatformBrandName(storeName);
}
