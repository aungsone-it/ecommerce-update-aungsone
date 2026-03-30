// Root Layout Component - Public layout wrapper
import { Outlet, useLocation } from "react-router";
import { CanonicalSubdomainRedirect } from "./CanonicalSubdomainRedirect";
import { SubdomainVendorRedirect } from "./SubdomainVendorRedirect";
import {
  resolveVendorSubdomainStoreSlug,
  isAdminPortalRoute,
} from "../utils/vendorSubdomainHooks";
import { FloatingChat } from "./FloatingChat";
import { BackToTop } from "./BackToTop";
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useCartVisibility } from "../contexts/CartVisibilityContext";
import { CartVisibilityProvider } from "../contexts/CartVisibilityContext";
import { LoadingProvider, useLoading } from "../contexts/LoadingContext";

// Public layout without authentication
export function RootLayout() {
  return (
    <LoadingProvider>
      <CartVisibilityProvider>
        <RootLayoutContent />
      </CartVisibilityProvider>
    </LoadingProvider>
  );
}

function RootLayoutContent() {
  const { user } = useAuth();
  const location = useLocation();
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [showFloatingChat, setShowFloatingChat] = useState(false);
  const { isCartOpen } = useCartVisibility();
  const { isLoading } = useLoading();

  const subdomainStoreSlug = resolveVendorSubdomainStoreSlug();
  const isPathVendorStorefront =
    (location.pathname.startsWith("/store/") || location.pathname.startsWith("/vendor/")) &&
    !location.pathname.includes("/admin");
  const isSubdomainStorefrontHome = subdomainStoreSlug != null && location.pathname === "/";
  const isVendorStorefront = isPathVendorStorefront || isSubdomainStorefrontHome;
  const vendorId =
    subdomainStoreSlug ??
    (isPathVendorStorefront ? location.pathname.split("/")[2] : undefined);

  // Hide chat button and back to top on vendor application page, landing page, and reset password page
  const isVendorApplicationPage = location.pathname === '/vendor/application';
  const isLandingPage = location.pathname === '/' && subdomainStoreSlug == null;
  const isResetPasswordPage = location.pathname === '/store/reset-password';
  const isAdminPortal = isAdminPortalRoute(location.pathname);

  return (
    <>
      <CanonicalSubdomainRedirect />
      <SubdomainVendorRedirect />
      <Outlet />
      {/* Global Floating Chat — storefront only; hidden on all admin panels (incl. /store|vendor/.../admin) */}
      {!isCartOpen && !isLoading && !isVendorApplicationPage && !isLandingPage && !isResetPasswordPage && !isAdminPortal && (
        <FloatingChat 
          customerName={user?.fullName || user?.firstName || "Guest"}
          customerEmail={user?.email || ""}
          onUnreadCountChange={(count) => setChatUnreadCount(count)}
          forceOpen={showFloatingChat}
          onOpen={() => setShowFloatingChat(false)}
          vendorId={vendorId}
          isAuthenticated={!!user}
        />
      )}
      {/* Global Back to Top - Hidden when cart is open OR when app is loading OR on vendor application page OR on landing page */}
      {/* Vendor storefront scrolls an inner div — BackToTop is rendered inside VendorStoreView */}
      {!isCartOpen &&
        !isLoading &&
        !isVendorApplicationPage &&
        !isLandingPage &&
        !isResetPasswordPage &&
        !isVendorStorefront && <BackToTop />}
    </>
  );
}