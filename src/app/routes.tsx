// Routes Configuration - Cache bust: 20260307181500
import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter } from "react-router";
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
import { AdminSubdomainOrSuper } from "./components/AdminSubdomainOrSuper";

// —— Lazy route chunks: marketplace, admin, and vendor panels load on demand ——
const LandingPage = lazy(() =>
  import("./pages/LandingPage").then((m) => ({ default: m.LandingPage }))
);
const StorefrontPage = lazy(() =>
  import("./pages/StorefrontPage").then((m) => ({ default: m.StorefrontPage }))
);
const VendorApplicationPage = lazy(() =>
  import("./pages/VendorApplicationPage").then((m) => ({ default: m.VendorApplicationPage }))
);
const VendorSetupPage = lazy(() =>
  import("./pages/VendorSetupPage").then((m) => ({ default: m.VendorSetupPage }))
);
const VendorStorefrontPage = lazy(() =>
  import("./pages/VendorStorefrontPage").then((m) => ({ default: m.VendorStorefrontPage }))
);
const VendorAdminPage = lazy(() =>
  import("./pages/VendorAdminPage").then((m) => ({ default: m.VendorAdminPage }))
);
const VendorAdminProductViewPage = lazy(() =>
  import("./pages/VendorAdminProductViewPage").then((m) => ({
    default: m.VendorAdminProductViewPage,
  }))
);
const AdminSlugFixer = lazy(() =>
  import("./components/AdminSlugFixer").then((m) => ({ default: m.AdminSlugFixer }))
);
const ResetPasswordPage = lazy(() =>
  import("./pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage }))
);
const SetupPage = lazy(() =>
  import("./pages/SetupPage").then((m) => ({ default: m.SetupPage }))
);
const VendorAuthPage = lazy(() =>
  import("./pages/VendorAuthPage").then((m) => ({ default: m.VendorAuthPage }))
);

function VendorSubdomainIndexOrLanding() {
  if (resolveVendorSubdomainStoreSlug()) {
    return <VendorStorefrontPage />;
  }
  return <LandingPage />;
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
              {children}
            </ErrorBoundary>
          </VendorAuthProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export const router = createBrowserRouter([
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
        errorElement: <NotFound />,
        children: [
          {
            index: true,
            element: <VendorSubdomainIndexOrLanding />,
          },
          {
            path: "store",
            element: <StorefrontPage />,
          },
          {
            path: "store/reset-password",
            element: <ResetPasswordPage />,
          },
          {
            path: "products",
            element: <StorefrontPage />,
          },
          {
            path: "product/:sku",
            element: <StorefrontPage />,
          },
          {
            path: "checkout",
            element: <StorefrontPage />,
          },
          {
            path: "order-confirmation",
            element: <StorefrontPage />,
          },
          {
            path: "profile",
            element: <StorefrontPage />,
          },
          {
            path: "profile/edit",
            element: <StorefrontPage />,
          },
          {
            path: "profile/orders",
            element: <StorefrontPage />,
          },
          {
            path: "profile/orders/:orderId",
            element: <StorefrontPage />,
          },
          {
            path: "profile/addresses",
            element: <StorefrontPage />,
          },
          {
            path: "profile/security",
            element: <StorefrontPage />,
          },
          {
            path: "saved",
            element: <StorefrontPage />,
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
            path: "admin/*",
            element: <AdminSubdomainOrSuper />,
          },
          {
            path: "store/:storeName/admin",
            element: <VendorProtectedLayout />,
            children: [
              {
                element: (
                  <LazyBoundary>
                    <AnimatedOutlet />
                  </LazyBoundary>
                ),
                children: [
                  { index: true, element: <VendorAdminPage /> },
                  {
                    path: "products/:productId/view",
                    element: <VendorAdminProductViewPage />,
                  },
                  { path: ":section", element: <VendorAdminPage /> },
                ],
              },
            ],
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
            path: "store/:storeName",
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
            path: "vendor/:storeName",
            element: <VendorStorefrontPage />,
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
  {
    path: "/",
    element: (
      <ProvidersWrapper>
        <VendorProtectedLayout />
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
        errorElement: <NotFound />,
        children: [
          {
            path: "vendor/:storeName/admin",
            element: <VendorAdminPage />,
            errorElement: <NotFound />,
          },
          {
            path: "vendor/:storeName/admin/:section",
            element: <VendorAdminPage />,
            errorElement: <NotFound />,
          },
          {
            path: "vendor/:storeName/admin/products/:productId/view",
            element: <VendorAdminProductViewPage />,
            errorElement: <NotFound />,
          },
        ],
      },
    ],
  },
]);
