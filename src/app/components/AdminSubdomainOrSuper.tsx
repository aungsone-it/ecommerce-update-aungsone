import { Outlet, useLocation } from "react-router";
import { Suspense, lazy } from "react";
import { ProtectedLayout } from "./ProtectedLayout";
import { VendorProtectedLayout } from "./VendorProtectedLayout";
import { RouteLoadingFallback } from "./RouteLoadingFallback";
import { NotFound } from "../pages/NotFound";
import {
  resolveVendorSubdomainStoreSlug,
  parseVendorSubdomainAdminPath,
} from "../utils/vendorSubdomainHooks";

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

/**
 * Layout for `/admin`: vendor subdomain → VendorProtectedLayout + `/admin/*` URLs (no `/store/.../admin` redirect).
 * Apex → super-admin ProtectedLayout + same path.
 */
export function AdminEntryLayout() {
  const slug = resolveVendorSubdomainStoreSlug();
  if (slug) {
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
  const slug = resolveVendorSubdomainStoreSlug();
  const location = useLocation();

  if (!slug) {
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
    return <NotFound />;
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
