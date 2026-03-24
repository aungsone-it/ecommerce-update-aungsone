import { Navigate, useLocation } from "react-router";
import { Suspense, lazy } from "react";
import { ProtectedLayout } from "./ProtectedLayout";
import { RouteLoadingFallback } from "./RouteLoadingFallback";
import { resolveVendorSubdomainStoreSlug } from "../utils/vendorSubdomainHooks";

const AdminPage = lazy(() =>
  import("../pages/AdminPage").then((m) => ({ default: m.AdminPage }))
);
const AddCustomerPage = lazy(() =>
  import("../pages/AddCustomerPage").then((m) => ({ default: m.AddCustomerPage }))
);

/**
 * /admin on a vendor host (e.g. gogo.walwal.online/admin) → /store/{slug}/admin (vendor panel).
 * On apex, same paths → platform super-admin (ProtectedLayout + AuthGate via AppRouter).
 */
export function AdminSubdomainOrSuper() {
  const slug = resolveVendorSubdomainStoreSlug();
  const location = useLocation();

  if (slug) {
    const rest = location.pathname.replace(/^\/admin/, "") || "";
    return <Navigate to={`/store/${slug}/admin${rest}`} replace />;
  }

  const path = location.pathname;
  const inner =
    path === "/admin/customers/add" ? (
      <AddCustomerPage />
    ) : (
      <AdminPage />
    );

  return (
    <ProtectedLayout>
      <Suspense fallback={<RouteLoadingFallback />}>{inner}</Suspense>
    </ProtectedLayout>
  );
}
