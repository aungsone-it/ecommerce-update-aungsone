// Routes Configuration - Cache bust: 20260307181500
import { createBrowserRouter } from "react-router";
import { RootLayout } from "./components/RootLayout";
import { ProtectedLayout } from "./components/ProtectedLayout";
import { VendorProtectedLayout } from "./components/VendorProtectedLayout";
import { AnimatedOutlet } from "./components/AnimatedOutlet";
import { ScrollController } from "./components/ScrollController";
import { LandingPage } from "./pages/LandingPage";
import { StorefrontPage } from "./pages/StorefrontPage";
import { AdminPage } from "./pages/AdminPage";
import { AddCustomerPage } from "./pages/AddCustomerPage";
import { VendorApplicationPage } from "./pages/VendorApplicationPage";
import { VendorSetupPage } from "./pages/VendorSetupPage";
import { VendorStorefrontPage } from "./pages/VendorStorefrontPage";
import { VendorAdminPage } from "./pages/VendorAdminPage";
import { VendorAdminProductViewPage } from "./pages/VendorAdminProductViewPage";
import { AdminSlugFixer } from "./components/AdminSlugFixer";
import { NotFound } from "./pages/NotFound";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SetupPage } from "./pages/SetupPage";
import { VendorAuthPage } from "./pages/VendorAuthPage";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider } from "./contexts/AuthContext";
import { VendorAuthProvider } from "./contexts/VendorAuthContext";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Wrapper component for all providers
function ProvidersWrapper({ children }: { children: React.ReactNode }) {
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
    errorElement: <NotFound />, // Handle errors at root level
    children: [
      {
        element: <AnimatedOutlet />,
        errorElement: <NotFound />, // Handle errors in child routes
        children: [
          {
            index: true,
            element: <LandingPage />,
          },
          // Main Storefront - moved to /store
          {
            path: "store",
            element: <StorefrontPage />,
          },
          {
            path: "store/reset-password",
            element: <ResetPasswordPage />,
          },
          // Storefront sub-routes - All handled by the SAME component instance
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
          // Clean vendor storefront URLs - use /store/{slug} instead of /vendor/{id}
          {
            path: "store/:storeName",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />, // Handle vendor storefront errors
          },
          {
            path: "store/:storeName/product/:productSlug",
            element: <VendorStorefrontPage />,
            errorElement: <NotFound />, // Handle product detail errors
          },
          // Legacy support for old /vendor/{id} URLs - redirect to new structure
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
        <ProtectedLayout />
      </ProvidersWrapper>
    ),
    errorElement: <NotFound />, // Handle super admin errors
    children: [
      {
        element: <AnimatedOutlet />,
        errorElement: <NotFound />,
        children: [
          {
            path: "admin",
            element: <AdminPage />,
          },
          {
            path: "admin/:section",
            element: <AdminPage />,
          },
          {
            path: "admin/customers/add",
            element: <AddCustomerPage />,
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
    errorElement: <NotFound />, // Handle vendor admin errors
    children: [
      {
        element: <AnimatedOutlet />,
        errorElement: <NotFound />,
        children: [
          {
            path: "vendor/:storeName/admin",
            element: <VendorAdminPage />,
            errorElement: <NotFound />, // Handle missing vendor admin
          },
          {
            path: "vendor/:storeName/admin/:section",
            element: <VendorAdminPage />,
            errorElement: <NotFound />, // Handle invalid vendor admin sections
          },
          {
            path: "vendor/:storeName/admin/products/:productId/view",
            element: <VendorAdminProductViewPage />,
            errorElement: <NotFound />, // Handle invalid product view
          },
        ],
      },
    ],
  },
]);