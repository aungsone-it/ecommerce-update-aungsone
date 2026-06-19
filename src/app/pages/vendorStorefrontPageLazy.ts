import { lazy } from "react";

type VendorStorefrontPageModule = typeof import("./VendorStorefrontPage");

let vendorStorefrontPageImport: Promise<VendorStorefrontPageModule> | null = null;

function getVendorStorefrontPageImport(): Promise<VendorStorefrontPageModule> {
  if (!vendorStorefrontPageImport) {
    vendorStorefrontPageImport = import("./VendorStorefrontPage");
  }
  return vendorStorefrontPageImport;
}

/** Warm the storefront route chunk (non-blocking). */
export function prefetchVendorStorefrontPage(): void {
  void getVendorStorefrontPageImport();
}

export const VendorStorefrontPage = lazy(() =>
  getVendorStorefrontPageImport().then((m) => ({ default: m.VendorStorefrontPage })),
);
