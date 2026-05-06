// Routes Configuration - Cache bust: 20260307181500
import { lazy, Suspense, type ReactNode } from "react";
import { type RouteObject } from "react-router";
import { RootLayout } from "./components/RootLayout";
import { VendorProtectedLayout } from "./components/VendorProtectedLayout";
import { AnimatedOutlet } from "./components/AnimatedOutlet";
import { ScrollController } from "./components/ScrollController";
import { RouteLoadingFallback } from "./components/RouteLoadingFallback";
import { NotFound } from "./pages/NotFound";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider } from "./contexts/AuthContext";
import { VendorAuthProvider } from "./contexts/VendorAuthContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { resolveVendorSubdomainStoreSlug } from "./utils/vendorSubdomainHooks";
import { useResolvedVendorHostSlug } from "./utils/vendorHostResolution";
import {
  AdminEntryLayout,
  AdminSubdomainLeaf,
} from "./components/AdminSubdomainOrSuper";
import { OrderRealtimeBridge } from "./components/OrderRealtimeBridge";
import {
  VendorHostOrMarketplaceSaved,
  VendorHostOrMarketplaceProduct,
  VendorHostOrMarketplaceProfile,
  VendorHostCategoryRoute,
} from "./components/VendorHostOrMarketplaceRoutes";

// —— Lazy route chunks: marketplace, admin, and vendor panels load on demand ——
const LandingPage = lazy(() =>
  import("./pages/LandingPage").then((m) => ({ default: m.LandingPage })),
);
const StorefrontPage = lazy(() =>
  import("./pages/StorefrontPage").then((m) => ({ default: m.StorefrontPage })),
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
const VendorStorefrontPage = lazy(() =>
  import("./pages/VendorStorefrontPage").then((m) => ({
    default: m.VendorStorefrontPage,
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

function VendorSubdomainIndexOrLanding() {
  const sub = resolveVendorSubdomainStoreSlug();
  const { slug: customSlug, loading } = useResolvedVendorHostSlug();
  if (loading && !sub) {
    return <RouteLoadingFallback />;
  }
  if (sub || customSlug) {
    return <VendorStorefrontPage />;
  }
  return <LandingPage />;
}

/** `/store` is the marketplace catalog — not valid on vendor-only hosts (subdomain / custom domain). */
function MarketplaceStoreRoute() {
  const sub = resolveVendorSubdomainStoreSlug();
  const { slug: customSlug, loading } = useResolvedVendorHostSlug();
  if (loading && !sub) {
    return <RouteLoadingFallback />;
  }
  if (sub || customSlug) {
    return <NotFound />;
  }
  return <StorefrontPage />;
}

/** `/checkout` resolves by host: vendor hosts use vendor storefront checkout, marketplace uses `/store` checkout. */
function HostAwareCheckoutRoute() {
  const sub = resolveVendorSubdomainStoreSlug();
  const { slug: customSlug, loading } = useResolvedVendorHostSlug();
  if (loading && !sub) {
    return <RouteLoadingFallback />;
  }
  if (sub || customSlug) {
    return <VendorStorefrontPage />;
  }
  return <StorefrontPage />;
}

/** `/checkout/success` resolves by host: vendor hosts use vendor storefront, marketplace uses `/store` checkout success. */
function HostAwareCheckoutSuccessRoute() {
  const sub = resolveVendorSubdomainStoreSlug();
  const { slug: customSlug, loading } = useResolvedVendorHostSlug();
  if (loading && !sub) {
    return <RouteLoadingFallback />;
  }
  if (sub || customSlug) {
    return <VendorStorefrontPage />;
  }
  return <StorefrontPage />;
}

function LazyBoundary({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteLoadingFallback />}>{children}</Suspense>;
}

// Wrapper component for all providers
function ProvidersWrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <VendorAuthProvider>
            <ErrorBoundary>
              <ScrollController />
              <OrderRealtimeBridge />
              {children}
            </ErrorBoundary>
          </VendorAuthProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
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
    errorElement: <NotFound />,
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
            element: <MarketplaceStoreRoute />,
          },
          {
            path: "store/reset-password",
            element: <ResetPasswordPage />,
          },
          {
            path: "store/:storeName/reset-password",
            element: <ResetPasswordPage />,
          },
          {
            path: "vendor/:storeName/reset-password",
            element: <ResetPasswordPage />,
          },
          {
            path: "products",
            element: <StorefrontPage />,
          },
          {
            path: "product/:productSlug",
            element: <VendorHostOrMarketplaceProduct />,
          },
          {
            path: "checkout",
            element: <HostAwareCheckoutRoute />,
          },
          {
            // Customer landing page after KBZ PWA payment.
            // KBZ redirects here with `?prepay_id=...&merch_order_id=...`.
            path: "kpay/return",
            element: <KPayReturnPage />,
          },
          {
            path: "checkout/success",
            element: <HostAwareCheckoutSuccessRoute />,
          },
          {
            path: "summary",
            element: <HostAwareCheckoutSuccessRoute />,
          },
          {
            path: "store/checkout",
            element: <StorefrontPage />,
          },
          {
            path: "order-confirmation",
            element: <HostAwareCheckoutSuccessRoute />,
          },
          {
            path: "store/checkout/success",
            element: <StorefrontPage />,
          },
          {
            path: "store/summary",
            element: <StorefrontPage />,
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
            path: "blog",
            element: <StorefrontPage />,
          },
          {
            path: "blog/:id",
            element: <StorefrontPage />,
          },
          {
            path: "setup",
            element: <SetupPage />,
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
            path: "store/:storeName/admin",
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
            path: "store/:storeName/profile/orders/:orderId",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: "store/:storeName/profile/:profileSection",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: "store/:storeName/profile",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: "store/:storeName/product/:productSlug",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: "store/:storeName/saved",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: "store/:storeName/checkout",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: "store/:storeName/checkout/success",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: "store/:storeName/summary",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: "store/:storeName",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: "vendor/:storeName/profile/orders/:orderId",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: "vendor/:storeName/profile/:profileSection",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: "vendor/:storeName/profile",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: "vendor/:storeName/product/:productSlug",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: "vendor/:storeName/saved",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: "store/:storeName/:categorySlug",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: "vendor/:storeName/checkout",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: "vendor/:storeName/checkout/success",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: "vendor/:storeName/summary",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: "vendor/:storeName/:categorySlug",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: "vendor/:storeName",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />,
          },
          {
            path: ":categorySlug",
            element: <VendorHostCategoryRoute />,
            errorElement: <NotFound />,
          },
          {
            path: "*",
            element: <NotFound />,
          },
        ],
      },
    ],
  },
];
