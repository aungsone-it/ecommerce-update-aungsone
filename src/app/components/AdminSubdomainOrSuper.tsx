import { Outlet, useLocation } from "react-router";
import { Suspense, lazy } from "react";
import { ProtectedLayout } from "./ProtectedLayout";
import { VendorProtectedLayout } from "./VendorProtectedLayout";
import { RouteLoadingFallback } from "./RouteLoadingFallback";
import {
  resolveVendorSubdomainStoreSlug,
  parseVendorSubdomainAdminPath,
} from "../utils/vendorSubdomainHooks";
import { useResolvedVendorHostSlug } from "../utils/vendorHostResolution";

/** Real vendor hosts (subdomain / custom domain). Local dev uses `/vendor/:slug/admin` for vendor panel. */
function isLocalDevHostname(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return h === "localhost" || h === "[::1]" || h.startsWith("127.");
}

const AdminPage = lazy(() =>
  import("../pages/AdminPage").then((m) => ({ default: m.AdminPage }))
);
const AddCustomerPage = lazy(() =>
  import("../pages/AddCustomerPage").then((m) => ({ default: m.AddCustomerPage }))
);
const VendorAdminPage = lazy(() =>
  import("../pages/VendorAdminPage").then((m) => ({ default: m.VendorAdminPage }))
);
const VendorAdminProductViewPage = lazy(() =>
  import("../pages/VendorAdminProductViewPage").then((m) => ({
    default: m.VendorAdminProductViewPage,
  }))
);
const NotFound = lazy(() =>
  import("../pages/NotFound").then((m) => ({ default: m.NotFound }))
);

/**
 * Layout for `/admin`: vendor subdomain → VendorProtectedLayout + `/admin/*` URLs (no `/store/.../admin` redirect).
 * Apex → super-admin ProtectedLayout + same path.
 */
export function AdminEntryLayout() {
  const subSlug = resolveVendorSubdomainStoreSlug();
  const { slug: hostSlug, loading } = useResolvedVendorHostSlug();
  const slug = subSlug ?? hostSlug;
  if (loading && !subSlug) {
    return <RouteLoadingFallback />;
  }
  const useVendorLayoutForAdmin = Boolean(slug) && !isLocalDevHostname();
  if (useVendorLayoutForAdmin) {
    return (
      <VendorProtectedLayout>
        <Outlet />
      </VendorProtectedLayout>
    );
  }
  return (
    <ProtectedLayout>
      <Outlet />
    </ProtectedLayout>
  );
}

/**
 * Leaf routes under `/admin`: super-admin pages on apex, vendor admin on vendor host.
 */
export function AdminSubdomainLeaf() {
  const subSlug = resolveVendorSubdomainStoreSlug();
  const { slug: hostSlug, loading } = useResolvedVendorHostSlug();
  const slug = subSlug ?? hostSlug;
  const location = useLocation();
  const vendorHostResolvedSlug = Boolean(slug) && !isLocalDevHostname();

  if (loading && !subSlug) {
    return <RouteLoadingFallback />;
  }

  if (!vendorHostResolvedSlug) {
    const path = location.pathname;
    const inner =
      path === "/admin/customers/add" ? (
        <AddCustomerPage />
      ) : (
        <AdminPage />
      );
    return <Suspense fallback={<RouteLoadingFallback />}>{inner}</Suspense>;
  }

  const parsed = parseVendorSubdomainAdminPath(location.pathname, slug);
  if (parsed === null) {
    return (
      <Suspense fallback={<RouteLoadingFallback />}>
        <NotFound />
      </Suspense>
    );
  }

  if (parsed.productId) {
    return (
      <Suspense fallback={<RouteLoadingFallback />}>
        <VendorAdminProductViewPage />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <VendorAdminPage />
    </Suspense>
  );
}
