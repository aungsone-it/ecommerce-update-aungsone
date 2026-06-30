// Routes Configuration - Cache bust: 20260307181500
import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, useLocation, type RouteObject } from "react-router";
import { RootLayout } from "./components/RootLayout";
import { AnimatedOutlet } from "./components/AnimatedOutlet";
import { ScrollController } from "./components/ScrollController";
import { KPayVendorReturnRedirect } from "./components/KPayVendorReturnRedirect";
import { RouteSuspenseFallback } from "./components/RouteLoadingFallback";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider } from "./contexts/AuthContext";
import { VendorAuthProvider } from "./contexts/VendorAuthContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
  isAdminPortalRoute,
  resolveVendorSubdomainStoreSlug,
  isOnVendorSubdomainHost,
} from "./utils/vendorSubdomainHooks";
import {
  shouldResolveCustomDomainHost,
  useResolvedVendorHostSlug,
} from "./utils/vendorHostResolution";
const OrderRealtimeBridge = lazy(() =>
  import("./components/OrderRealtimeBridge").then((m) => ({
    default: m.OrderRealtimeBridge,
  }))
);
import {
  VendorHostOnlyStorefront,
  VendorHostOrMarketplaceSaved,
  VendorHostOrMarketplaceProduct,
  VendorHostOrMarketplaceProfile,
  VendorHostCategoryRoute,
} from "./components/VendorHostOrMarketplaceRoutes";
import { LegacyStoreRedirect } from "./components/LegacyStoreRedirect";
import { isBarePlatformApexHost, isMarketplaceApexHost } from "./utils/platformApexHost";
import { VendorStorefrontPage } from "./pages/vendorStorefrontPageLazy";

// —— Lazy route chunks: marketplace, admin, and vendor panels load on demand ——
const LandingPage = lazy(() =>
  import("./pages/LandingPage").then((m) => ({ default: m.LandingPage })),
);
const VendorApplicationPage = lazy(() =>
  import("./pages/VendorApplicationPage").then((m) => ({
    default: m.VendorApplicationPage,
  })),
);
const VendorSetupPage = lazy(() =>
  import("./pages/VendorSetupPage").then((m) => ({
    default: m.VendorSetupPage,
  })),
);
const VendorAdminPage = lazy(() =>
  import("./pages/VendorAdminPage").then((m) => ({
    default: m.VendorAdminPage,
  })),
);
const VendorAdminProductViewPage = lazy(() =>
  import("./pages/VendorAdminProductViewPage").then((m) => ({
    default: m.VendorAdminProductViewPage,
  })),
);
const AdminSlugFixer = lazy(() =>
  import("./components/AdminSlugFixer").then((m) => ({
    default: m.AdminSlugFixer,
  })),
);
const ResetPasswordPage = lazy(() =>
  import("./pages/ResetPasswordPage").then((m) => ({
    default: m.ResetPasswordPage,
  })),
);
const SetupPage = lazy(() =>
  import("./pages/SetupPage").then((m) => ({ default: m.SetupPage })),
);
const VendorAuthPage = lazy(() =>
  import("./pages/VendorAuthPage").then((m) => ({ default: m.VendorAuthPage })),
);
const KPayReturnPage = lazy(() =>
  import("./pages/KPayReturnPage").then((m) => ({ default: m.KPayReturnPage })),
);
const StorefrontPolicyPage = lazy(() =>
  import("./pages/StorefrontPolicyPage").then((m) => ({ default: m.StorefrontPolicyPage })),
);
const NotFound = lazy(() =>
  import("./pages/NotFound").then((m) => ({ default: m.NotFound })),
);
const AdminEntryLayout = lazy(() =>
  import("./components/AdminSubdomainOrSuper").then((m) => ({ default: m.AdminEntryLayout })),
);
const AdminSubdomainLeaf = lazy(() =>
  import("./components/AdminSubdomainOrSuper").then((m) => ({ default: m.AdminSubdomainLeaf })),
);
const VendorProtectedLayout = lazy(() =>
  import("./components/VendorProtectedLayout").then((m) => ({ default: m.VendorProtectedLayout })),
);

function VendorSubdomainIndexOrLanding() {
  const onVendorSubdomainHost = isOnVendorSubdomainHost();
  const sub = resolveVendorSubdomainStoreSlug();
  const { slug: customSlug, loading } = useResolvedVendorHostSlug();
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const bareApex = isBarePlatformApexHost(host);
  const customLookup =
    typeof window !== "undefined" && shouldResolveCustomDomainHost(host);

  if (isMarketplaceApexHost(host) && !customLookup) {
    return <LandingPage />;
  }

  if (onVendorSubdomainHost || sub) {
    return <VendorStorefrontPage />;
  }

  if (customLookup) {
    if (loading) {
      // Claimable bare apex (e.g. migoo.store) must not flash marketplace landing while by-domain resolves.
      return <RouteSuspenseFallback />;
    }
    if (customSlug) return <VendorStorefrontPage />;
    if (bareApex || isMarketplaceApexHost(host)) return <LandingPage />;
    return <LandingPage />;
  }

  if (bareApex || isMarketplaceApexHost(host)) {
    return <LandingPage />;
  }

  return <LandingPage />;
}

function LazyBoundary({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteSuspenseFallback />}>{children}</Suspense>;
}

function AdminRealtimeBridge() {
  const location = useLocation();
  if (!isAdminPortalRoute(location.pathname)) return null;
  return (
    <Suspense fallback={null}>
      <OrderRealtimeBridge />
    </Suspense>
  );
}

function NotFoundBoundary() {
  return (
    <LazyBoundary>
      <NotFound />
    </LazyBoundary>
  );
}

// Wrapper component for all providers
function ProvidersWrapper({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <AuthProvider>
        <VendorAuthProvider>
          <ErrorBoundary>
            <ScrollController />
            <KPayVendorReturnRedirect />
            <AdminRealtimeBridge />
            {children}
          </ErrorBoundary>
        </VendorAuthProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

export const appRouteObjects: RouteObject[] = [
  {
    path: "/",
    element: (
      <ProvidersWrapper>
        <RootLayout />
      </ProvidersWrapper>
    ),
    errorElement: <NotFoundBoundary />,
    children: [
      {
        element: (
          <LazyBoundary>
            <AnimatedOutlet />
          </LazyBoundary>
        ),
        children: [
          {
            index: true,
            element: <VendorSubdomainIndexOrLanding />,
          },
          {
            path: "store",
            element: <LegacyStoreRedirect />,
          },
          {
            path: "store/*",
            element: <LegacyStoreRedirect />,
          },
          {
            path: "products",
            element: <LegacyStoreRedirect />,
          },
          {
            path: "products/*",
            element: <LegacyStoreRedirect />,
          },
          {
            path: "reset-password",
            element: <ResetPasswordPage />,
          },
          {
            path: "vendor/:storeName/reset-password",
            element: <ResetPasswordPage />,
          },
          {
            path: "product/:productSlug",
            element: <VendorHostOrMarketplaceProduct />,
          },
          {
            path: "checkout",
            element: <VendorHostOnlyStorefront />,
          },
          {
            // Customer landing page after KBZ PWA payment.
            // KBZ redirects here with `?prepay_id=...&merch_order_id=...`.
            path: "kpay/return",
            element: <KPayReturnPage />,
          },
          {
            path: "checkout/success",
            element: <VendorHostOnlyStorefront />,
          },
          {
            path: "summary",
            element: <VendorHostOnlyStorefront />,
          },
          {
            path: "order-confirmation",
            element: <VendorHostOnlyStorefront />,
          },
          {
            path: "profile/*",
            element: <VendorHostOrMarketplaceProfile />,
          },
          {
            path: "saved",
            element: <VendorHostOrMarketplaceSaved />,
          },
          {
            path: "terms",
            element: <StorefrontPolicyPage type="terms" />,
          },
          {
            path: "terms-of-service",
            element: <StorefrontPolicyPage type="terms" />,
          },
          {
            path: "privacy",
            element: <StorefrontPolicyPage type="privacy" />,
          },
          {
            path: "privacy-policy",
            element: <StorefrontPolicyPage type="privacy" />,
          },
          {
            path: "blog",
            element: <LegacyStoreRedirect />,
          },
          {
            path: "blog/*",
            element: <LegacyStoreRedirect />,
          },
          {
            path: "setup",
            element: <Navigate to="/admin/setup" replace />,
          },
          {
            path: "vendor/application",
            element: <VendorApplicationPage />,
          },
          {
            path: "vendor/setup",
            element: <VendorSetupPage />,
          },
          {
            path: "vendor/login",
            element: <VendorAuthPage />,
          },
          {
            path: "admin/fix-slugs",
            element: <AdminSlugFixer />,
          },
          {
            path: "admin",
            element: <AdminEntryLayout />,
            children: [
              { path: "setup", element: <SetupPage /> },
              { index: true, element: <AdminSubdomainLeaf /> },
              { path: "customers/add", element: <AdminSubdomainLeaf /> },
              { path: "orders", element: <AdminSubdomainLeaf /> },
              { path: "products", element: <AdminSubdomainLeaf /> },
              { path: "categories", element: <AdminSubdomainLeaf /> },
              { path: "inventory", element: <AdminSubdomainLeaf /> },
              { path: "customers", element: <AdminSubdomainLeaf /> },
              { path: "chat", element: <AdminSubdomainLeaf /> },
              { path: "marketing", element: <AdminSubdomainLeaf /> },
              { path: "livestream", element: <AdminSubdomainLeaf /> },
              { path: "blog", element: <AdminSubdomainLeaf /> },
              { path: "vendors", element: <AdminSubdomainLeaf /> },
              { path: "vendor-profile", element: <AdminSubdomainLeaf /> },
              { path: "vendor-applications", element: <AdminSubdomainLeaf /> },
              { path: "vendor-promotions", element: <AdminSubdomainLeaf /> },
              { path: "vendor-store", element: <AdminSubdomainLeaf /> },
              { path: "collaborators", element: <AdminSubdomainLeaf /> },
              { path: "collaborator-profile", element: <AdminSubdomainLeaf /> },
              { path: "collaborator-applications", element: <AdminSubdomainLeaf /> },
              { path: "finances", element: <AdminSubdomainLeaf /> },
              { path: "logistics", element: <AdminSubdomainLeaf /> },
              { path: "settings", element: <AdminSubdomainLeaf /> },
              { path: "search", element: <AdminSubdomainLeaf /> },
              { path: "*", element: <AdminSubdomainLeaf /> },
            ],
          },
          {
            path: "vendor/:storeName/admin",
            element: <VendorProtectedLayout />,
            children: [
              {
                index: true,
                element: (
                  <LazyBoundary>
                    <VendorAdminPage />
                  </LazyBoundary>
                ),
              },
              {
                path: "products/:productId/view",
                element: (
                  <LazyBoundary>
                    <VendorAdminProductViewPage />
                  </LazyBoundary>
                ),
              },
              {
                path: ":section",
                element: (
                  <LazyBoundary>
                    <VendorAdminPage />
                  </LazyBoundary>
                ),
              },
              {
                path: ":section/*",
                element: (
                  <LazyBoundary>
                    <VendorAdminPage />
                  </LazyBoundary>
                ),
              },
            ],
          },
          {
            path: "vendor/:storeName/profile/orders/:orderId",
            element: <VendorStorefrontPage />,
            errorElement: <NotFoundBoundary />,
          },
          {
            path: "vendor/:storeName/profile/:profileSection",
            element: <VendorStorefrontPage />,
            errorElement: <NotFoundBoundary />,
          },
          {
            path: "vendor/:storeName/profile",
            element: <VendorStorefrontPage />,
            errorElement: <NotFoundBoundary />,
          },
          {
            path: "vendor/:storeName/product/:productSlug",
            element: <VendorStorefrontPage />,
            errorElement: <NotFoundBoundary />,
          },
          {
            path: "vendor/:storeName/saved",
            element: <VendorStorefrontPage />,
            errorElement: <NotFoundBoundary />,
          },
          {
            path: "vendor/:storeName/checkout",
            element: <VendorStorefrontPage />,
            errorElement: <NotFoundBoundary />,
          },
          {
            path: "vendor/:storeName/checkout/success",
            element: <VendorStorefrontPage />,
            errorElement: <NotFoundBoundary />,
          },
          {
            path: "vendor/:storeName/summary",
            element: <VendorStorefrontPage />,
            errorElement: <NotFoundBoundary />,
          },
          {
            path: "vendor/:storeName/kpay/return",
            element: <KPayReturnPage />,
          },
          {
            path: "vendor/:storeName/terms",
            element: <StorefrontPolicyPage type="terms" />,
          },
          {
            path: "vendor/:storeName/terms-of-service",
            element: <StorefrontPolicyPage type="terms" />,
          },
          {
            path: "vendor/:storeName/privacy",
            element: <StorefrontPolicyPage type="privacy" />,
          },
          {
            path: "vendor/:storeName/privacy-policy",
            element: <StorefrontPolicyPage type="privacy" />,
          },
          {
            path: "vendor/:storeName/:categorySlug",
            element: <VendorStorefrontPage />,
            errorElement: <NotFoundBoundary />,
          },
          {
            path: "vendor/:storeName",
            element: <VendorStorefrontPage />,
            errorElement: <NotFoundBoundary />,
          },
          {
            path: ":categorySlug",
            element: <VendorHostCategoryRoute />,
            errorElement: <NotFoundBoundary />,
          },
          {
            path: "*",
            element: <NotFoundBoundary />,
          },
        ],
      },
    ],
  },
];
